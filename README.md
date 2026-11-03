# LeadGen Studio

A FastAPI and Playwright prototype for researching B2B companies from public websites, extracting structured company information, and drafting evidence-based outreach.

> This is a portfolio/demo application. Review every result before using it for outreach. It does not send emails or guarantee factual accuracy.

## What it does

- Searches for candidate company websites and filters configured directory, news, social, and event domains.
- Scrapes a public company website with Playwright and optionally selected internal pages.
- Uses Groq, when configured server-side, to create a structured company profile and a concise company-focus narrative.
- Uses a weighted data-completeness score to decide whether to do one deeper crawl.
- Generates outreach drafts from retrieved information and blocks drafts that fail basic safety checks.

## Architecture

```text
ICP query or company URL
  -> URL validation and source filtering
  -> Playwright + Trafilatura extraction
  -> Groq structured extraction (or limited heuristic fallback)
  -> completeness-based deeper crawl
  -> evidence-based matching and outreach draft
```

## Local setup

Requirements: Python 3.10+ and a Groq API key for the best extraction quality.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Keep this value out of source control and out of browser forms.
export GROQ_API_KEY="your-groq-key"

uvicorn main:app --port 8000
```

Open `http://127.0.0.1:8000` and check `http://127.0.0.1:8000/health`.
`groq_api_key_configured` must be `true` to use Groq; otherwise the app uses a limited heuristic fallback.

For local autoreload, use:

```bash
uvicorn main:app --reload --port 8000 --reload-exclude ".venv*" --reload-exclude "__pycache__"
```

## Security and reliability notes

- `GROQ_API_KEY` is read only from the server environment. The frontend does not store or transmit API keys.
- URL checks reject local/private targets and are applied to direct URLs, search results, crawl links, and browser navigations.
- The in-memory rate limiter and concurrency cap are intended for a small demo deployment.
- The completeness score measures populated weighted fields, not truthfulness or lead quality.

## Deploy to Render

Before deploying, revoke and replace any Groq key that was ever stored in a file or shared accidentally.

1. Create a private GitHub repository and push this project. Do not commit `.env`, `.venv`, browser caches, or API keys.
2. On Render, select **New > Web Service**, connect the GitHub repository, and select **Docker** as the runtime.
3. Set the health-check path to `/health`.
4. In the Render Environment page, add `GROQ_API_KEY` with a newly created key. Do not put that value in `render.yaml`, the Dockerfile, or GitHub.
5. Leave `ALLOWED_ORIGINS` empty because the FastAPI server hosts the dashboard and API together.
6. Deploy, then test `/health`, `/docs`, one direct company URL, and one narrow discovery query.

The included `render.yaml` is optional: it creates the same Docker web-service setup and prompts for `GROQ_API_KEY` during setup.

## Resume wording

**LeadGen Studio — B2B Lead Research & Outreach Drafting Agent**  
Python, FastAPI, Playwright, Trafilatura, Groq, Pydantic

- Built an AI-assisted research workflow that discovers and validates public company websites, extracts structured company information, and drafts evidence-based outreach.
- Implemented SSRF-aware URL validation, prompt-injection boundaries, bounded crawling, completeness-based retry, and server-side secret handling.
- Developed a dashboard for direct-URL research, ICP discovery, configurable value propositions, and CSV/JSON export.

## Limitations

- Search discovery can still find irrelevant public pages; use source filtering and review outputs.
- Founders, locations, and business narratives must be manually verified before use.
- A production system would require authentication, persistent storage, shared rate limiting, observability, and compliance review.
