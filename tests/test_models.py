import pytest
from pydantic import ValidationError

from models import LeadGenRequest, SingleUrlRequest


def test_request_models_do_not_accept_browser_api_keys():
    with pytest.raises(ValidationError):
        LeadGenRequest(query="fintech startups", groq_api_key="not-accepted")
    with pytest.raises(ValidationError):
        SingleUrlRequest(url="https://example.com", groq_api_key="not-accepted")


def test_completeness_threshold_is_bounded():
    with pytest.raises(ValidationError):
        LeadGenRequest(query="fintech startups", completeness_threshold=0.99)
