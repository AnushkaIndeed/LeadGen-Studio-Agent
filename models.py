"""
models.py
The Lead template. Every scrape gets mapped into this shape -- this is
the schema discussed in the meeting notes (identity / people / content /
pipeline metadata groups).
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class Lead(BaseModel):
    # --- identity / firmographic ---
    company_name: Optional[str] = None
    website_url: str
    industry: Optional[str] = None
    location: Optional[str] = None
    company_size: Optional[str] = None
    funding_stage: Optional[str] = None

    # --- people ---
    founder_name: Optional[str] = None
    founder_recent_join_signal: Optional[bool] = None
    contact_person_name: Optional[str] = None
    contact_email: Optional[str] = None

    # --- content / reasoning input ---
    product_description: Optional[str] = None
    stated_pain_points_or_goals: list[str] = Field(default_factory=list)
    recent_news_signal: Optional[str] = None
    tech_stack: list[str] = Field(default_factory=list)

    # --- pipeline metadata (not shown to the LLM for drafting) ---
    source_url: str
    scrape_depth_used: int = 0
    completeness_score: float = 0.0
    fields_missing: list[str] = Field(default_factory=list)
    scraped_at: datetime = Field(default_factory=datetime.utcnow)


class LeadGenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=2, max_length=240)
    max_leads: int = Field(default=3, ge=1, le=5)
    completeness_threshold: float = Field(default=0.6, ge=0.3, le=0.9)
    custom_value_props: Optional[list[str]] = None


class SingleUrlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str
    completeness_threshold: float = Field(default=0.6, ge=0.3, le=0.9)
    custom_value_props: Optional[list[str]] = None


class ValuePropsConfig(BaseModel):
    value_props: list[str]


class LeadResult(BaseModel):
    lead: Lead
    matched_pain_points: list[str] = Field(default_factory=list)
    draft_email: Optional[str] = None


class LeadGenResponse(BaseModel):
    query: str
    results: list[LeadResult]
    notes: list[str] = Field(default_factory=list)  # skipped sources and missing-data notes
