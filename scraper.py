"""
scraper.py
Sync Playwright wrapped in a thread, called from async code.

Why: async Playwright launches its browser via asyncio's own subprocess
machinery, which hits a known NotImplementedError on Windows when the
event loop isn't the Proactor implementation -- and as of Python 3.14,
the event-loop-policy fix for that is deprecated and unreliable. Sync
Playwright launches its browser subprocess through its own driver process
instead, sidestepping that asyncio codepath entirely. Running it via
asyncio.to_thread() keeps FastAPI's event loop from blocking while the
sync call runs.

The public function `scrape(url, depth)` is still async, so nothing in
pipeline.py needs to change.
"""

import asyncio
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
import trafilatura
from guardrails import validate_target_url

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

DEPTH1_LINK_HINTS = ["about", "team", "leadership", "contact", "company", "story", "people", "privacy"]


def _clean(html: str, url: str) -> str:
    cleaned = trafilatura.extract(html, url=url, output_format="markdown") or ""
    try:
        meta = trafilatura.extract_metadata(html)
        headers = []
        if meta and meta.title:
            headers.append(f"# {meta.title}")
        if meta and meta.description:
            headers.append(f"Official Site Meta Description: {meta.description}")
        if headers:
            return "\n\n".join(headers) + "\n\n" + cleaned
    except Exception:
        pass
    return cleaned


def _pick_depth1_links(links: list[str], base_url: str) -> list[str]:
    picked = []
    domain = urlparse(base_url).hostname
    for link in links:
        if urlparse(link).hostname != domain:
            continue
        if any(hint in link.lower() for hint in DEPTH1_LINK_HINTS):
            try:
                picked.append(validate_target_url(link))
            except ValueError:
                continue
    return list(dict.fromkeys(picked))[:2]


def _scrape_sync(url: str, depth: int) -> dict:
    """Blocking function -- this runs inside a worker thread, not the event loop."""
    out = {"url": url, "depth_used": 0, "pages": {}, "error": None}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page(user_agent=USER_AGENT)

                # Validate every browser navigation before it starts. This covers
                # redirect hops in addition to the initially supplied URL.
                def block_unsafe_navigation(route, request):
                    if request.is_navigation_request():
                        try:
                            validate_target_url(request.url)
                        except ValueError:
                            route.abort()
                            return
                    route.continue_()

                page.route("**/*", block_unsafe_navigation)

                page.goto(url, timeout=15000, wait_until="domcontentloaded")
                validate_target_url(page.url)
                html = page.content()
                links = page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
                links = list(dict.fromkeys(links))

                out["pages"][url] = _clean(html, url)
                out["depth_used"] = 0

                if depth >= 1:
                    for link in _pick_depth1_links(links, url):
                        try:
                            page.goto(link, timeout=15000, wait_until="domcontentloaded")
                            validate_target_url(page.url)
                            html2 = page.content()
                            out["pages"][link] = _clean(html2, link)
                            out["depth_used"] = 1
                        except Exception:
                            continue  # skip a broken internal link, don't fail the whole scrape
            finally:
                browser.close()

    except Exception as e:
        out["error"] = str(e)

    return out


async def scrape(url: str, depth: int = 0) -> dict:
    """
    depth=0 -> homepage only
    depth=1 -> homepage + up to 2 relevant internal pages (about/team/contact)
    Runs the blocking sync-Playwright call in a thread so it doesn't
    block FastAPI's event loop.
    """
    return await asyncio.to_thread(_scrape_sync, url, depth)
