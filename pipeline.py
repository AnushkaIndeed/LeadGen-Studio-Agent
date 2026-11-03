from __future__ import annotations
from urllib.parse import urlparse

"""
pipeline.py
The actual flow from the meeting notes, wired together:

  query -> search -> for each candidate:
    scrape (depth 0) -> map to Lead -> score data completeness
      completeness >= threshold?  -> proceed
      completeness <  threshold?  -> scrape (depth 1) -> re-map -> re-score
    -> match pain points -> draft email -> critique pass -> done

This is a plain async function chain right now. It's written so each step
is a clean, single-purpose function -- the same shape you'd turn into
LangGraph nodes later (search_node, scrape_node, completeness_node,
conditional edge -> rescrape_node, map_node, draft_node, critique_node).
"""

import asyncio
from typing import Optional
from search import search_web
from scraper import scrape
from confidence import score_completeness
from guardrails import validate_target_url, verify_outreach_safety
from llm import map_to_lead, match_pain_points, draft_email, critique_email, enrich_identity_with_search
from models import Lead, LeadResult

IGNORED_DIRECTORY_DOMAINS = [
    "wikipedia.org",
    "linkedin.com",
    "crunchbase.com",
    "tracxn.com",
    "f6s.com",
    "glassdoor.com",
    "indeed.com",
    "pitchbook.com",
    "g2.com",
    "capterra.com",
    "angel.co",
    "wellfound.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "reddit.com",
    "quora.com",
    "medium.com",
    "news.google.com",
    "startupsindia.in",
    "startupsavant.com",
    "techstory.in",
    "fortune.com",
    "topstartups.io",
    "indiatechdesk.com",
    "dealroom.co",
    "luma.com",
    "yourstory.com",
    "inc42.com",
    "entrackr.com",
    "techcrunch.com",
    "forbes.com",
    "economicstimes.indiatimes.com",
    "timesofindia.indiatimes.com",
]
def get_hostname(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def is_ignored_domain(url: str) -> bool:
    host = get_hostname(url)
    return any(
        host == domain or host.endswith(f".{domain}")
        for domain in IGNORED_DIRECTORY_DOMAINS
    )

def _build_lead(mapped: dict, source_url: str, depth_used: int) -> Lead:
    lead = Lead(
        website_url=source_url,
        source_url=source_url,
        scrape_depth_used=depth_used,
        company_name=mapped.get("company_name"),
        industry=mapped.get("industry"),
        location=mapped.get("location"),
        company_size=mapped.get("company_size"),
        funding_stage=mapped.get("funding_stage"),
        founder_name=mapped.get("founder_name"),
        contact_person_name=mapped.get("contact_person_name"),
        contact_email=mapped.get("contact_email"),
        product_description=mapped.get("product_description"),
        stated_pain_points_or_goals=mapped.get("stated_pain_points_or_goals") or [],
        recent_news_signal=mapped.get("recent_news_signal"),
    )
    completeness, missing = score_completeness(lead)
    lead.completeness_score = completeness
    lead.fields_missing = missing
    return lead


async def process_candidate(
    url: str,
    threshold: float,
    notes: list[str],
    custom_value_props: Optional[list[str]] = None,
) -> LeadResult | None:
    # --- attempt 1: depth 0 ---
    scraped = await scrape(url, depth=0)
    if scraped.get("error"):
        notes.append(f"{url}: scrape failed ({scraped['error']}), skipped")
        return None

    mapped = await asyncio.to_thread(map_to_lead, scraped["pages"], url)
    lead = _build_lead(mapped, url, depth_used=0)

    # --- completeness-threshold retry: attempt 2 at depth 1 if needed ---
    if lead.completeness_score < threshold:
        notes.append(
            f"{url}: depth-0 completeness {lead.completeness_score} below threshold "
            f"{threshold}, retrying at depth 1"
        )
        scraped2 = await scrape(url, depth=1)
        if not scraped2.get("error") and scraped2["pages"]:
            mapped2 = await asyncio.to_thread(map_to_lead, scraped2["pages"], url)
            lead2 = _build_lead(mapped2, url, depth_used=scraped2.get("depth_used", 1))
            # keep whichever attempt scored higher
            if lead2.completeness_score > lead.completeness_score:
                lead = lead2

    # --- targeted public identity search pass if identity fields remain missing ---
    if lead.company_name and (not lead.founder_name or not lead.location or not lead.contact_email):
        try:
            snippets = []
            for q_term in [f"{lead.company_name} founders", f"{lead.company_name} headquarters contact email"]:
                s_res = await asyncio.to_thread(search_web, q_term, 3)
                for r in s_res:
                    if r.get("snippet"):
                        snippets.append(f"- {r.get('title')}: {r.get('snippet')}")
            if snippets:
                enriched = await asyncio.to_thread(enrich_identity_with_search, lead.company_name, "\n".join(snippets))
                if not lead.founder_name and enriched.get("founder_name"):
                    lead.founder_name = enriched["founder_name"]
                if not lead.location and enriched.get("location"):
                    lead.location = enriched["location"]
                if not lead.contact_email and enriched.get("contact_email"):
                    lead.contact_email = enriched["contact_email"]

                # Re-calculate completeness & missing fields
                completeness, missing = score_completeness(lead)
                lead.completeness_score = completeness
                lead.fields_missing = missing
        except Exception:
            pass

    # --- pain points + draft ---
    combined_content = (lead.product_description or "") + " " + " ".join(
        lead.stated_pain_points_or_goals
    )
    matched = await asyncio.to_thread(match_pain_points, combined_content, custom_value_props)

    draft = None
    if lead.company_name and (matched or lead.product_description):
        raw_draft = await asyncio.to_thread(draft_email, lead.company_name, matched, lead.product_description or "")
        _, draft = await asyncio.to_thread(critique_email, raw_draft)
        if draft:
            safe, issues = verify_outreach_safety(draft)
            if not safe:
                notes.append(f"{url}: outreach draft blocked by safety guardrail ({', '.join(issues)})")
                draft = None
    else:
        notes.append(f"{url}: missing company name or description, draft skipped")

    return LeadResult(lead=lead, matched_pain_points=matched, draft_email=draft)


async def process_single_url(
    url: str,
    threshold: float = 0.6,
    custom_value_props: Optional[list[str]] = None,
) -> tuple[LeadResult | None, list[str]]:
    notes: list[str] = []
    result = await process_candidate(
        url=url,
        threshold=threshold,
        notes=notes,
        custom_value_props=custom_value_props,
    )
    return result, notes


async def run_pipeline(
    query: str,
    max_leads: int = 3,
    threshold: float = 0.6,
    custom_value_props: Optional[list[str]] = None,
) -> tuple[list[LeadResult], list[str]]:
    notes: list[str] = []
    # over-fetch candidates because directories or unreachable URLs might be skipped
    search_results = await asyncio.to_thread(search_web, query, min(15, max(8, max_leads * 3)))

    seen_domains = set()
    filtered_urls = []
    for result in search_results:
        raw_url = result.get("url")
        if not raw_url:
            continue

        try:
            url = validate_target_url(raw_url)
        except ValueError:
            notes.append("Skipped an unsafe or unreachable search result.")
            continue

        domain = get_hostname(url)

        if is_ignored_domain(url):
            notes.append(f"Skipped directory or non-official source: {domain}")
            continue

        if domain in seen_domains:
            continue

        seen_domains.add(domain)
        filtered_urls.append(url)

    semaphore = asyncio.Semaphore(2)

    async def bounded_process(url: str) -> LeadResult | None:
        async with semaphore:
            try:
                return await asyncio.wait_for(
                    process_candidate(url, threshold, notes, custom_value_props), timeout=75
                )
            except TimeoutError:
                notes.append(f"{url}: processing timed out, skipped")
                return None

    candidates = filtered_urls[: min(len(filtered_urls), max_leads * 3)]
    processed = await asyncio.gather(*(bounded_process(url) for url in candidates))
    results = [result for result in processed if result is not None][:max_leads]

    if not results:
        notes.append("No leads produced -- check search results and completeness threshold.")

    return results, notes
