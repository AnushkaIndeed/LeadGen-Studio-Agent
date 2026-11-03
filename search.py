"""
search.py
DuckDuckGo search, same as the standalone version, moved into the
FastAPI app structure.
"""

from ddgs import DDGS


def search_web(query: str, max_results: int = 5) -> list[dict]:
    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(
                    {
                        "title": r.get("title"),
                        "url": r.get("href"),
                        "snippet": r.get("body"),
                    }
                )
    except Exception as e:
        results.append({"error": str(e)})
    return results
