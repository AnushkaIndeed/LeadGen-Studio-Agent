import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from models import LeadGenRequest, LeadGenResponse, SingleUrlRequest, ValuePropsConfig
from pipeline import run_pipeline, process_single_url
from llm import DEFAULT_VALUE_PROPS
from guardrails import validate_target_url
from rate_limit import RateLimiter

app = FastAPI(title="Lead Gen Agent Studio API", version="2.0.0")

# The studio is served by this application. Other origins must be explicitly
# listed in ALLOWED_ORIGINS (comma separated) if a separate frontend is used.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

request_limiter = RateLimiter(max_requests=8, window_seconds=60)

# Current runtime value props (in-memory, defaults to DEFAULT_VALUE_PROPS)
ACTIVE_VALUE_PROPS = list(DEFAULT_VALUE_PROPS)

STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(exist_ok=True)


@app.get("/health")
async def health():
    has_groq = bool(os.environ.get("GROQ_API_KEY", "").strip())
    return {
        "status": "ok",
        "groq_api_key_configured": has_groq,
        "default_model": "llama-3.3-70b-versatile",
        "version": "2.0.0"
    }


@app.get("/config/value-props")
async def get_value_props():
    return {"value_props": ACTIVE_VALUE_PROPS}


@app.post("/config/value-props")
async def set_value_props(config: ValuePropsConfig):
    global ACTIVE_VALUE_PROPS
    if not config.value_props:
        raise HTTPException(status_code=400, detail="Value propositions list cannot be empty")
    ACTIVE_VALUE_PROPS = config.value_props
    return {"status": "updated", "value_props": ACTIVE_VALUE_PROPS}


@app.post("/leads/generate", response_model=LeadGenResponse)
async def generate_leads(req: LeadGenRequest, request: Request):
    request_limiter.check(request)
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    props = req.custom_value_props if req.custom_value_props else ACTIVE_VALUE_PROPS

    results, notes = await run_pipeline(
        query=req.query,
        max_leads=max(1, min(req.max_leads, 10)),
        threshold=req.completeness_threshold,
        custom_value_props=props,
    )

    return LeadGenResponse(query=req.query, results=results, notes=notes)


@app.post("/leads/analyze-url")
async def analyze_single_url(req: SingleUrlRequest, request: Request):
    request_limiter.check(request)
    try:
        url = validate_target_url(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    props = req.custom_value_props if req.custom_value_props else ACTIVE_VALUE_PROPS

    result, notes = await process_single_url(
        url=url,
        threshold=req.completeness_threshold,
        custom_value_props=props,
    )

    return {"url": url, "result": result, "notes": notes}


# Mount static directory and index.html
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "LeadGen Agent API is running. Create static/index.html to view UI."}
