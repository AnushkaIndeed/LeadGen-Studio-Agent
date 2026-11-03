import socket

import pytest

from guardrails import validate_target_url, verify_outreach_safety


def test_outreach_safety_rejects_spam_trigger():
    safe, issues = verify_outreach_safety("Act now or else: reply today.")
    assert not safe
    assert issues


def test_outreach_safety_accepts_short_consultative_draft():
    safe, issues = verify_outreach_safety("Hi team, I saw your API platform and would welcome a short demo.")
    assert safe
    assert issues == []


def test_url_guardrail_rejects_localhost_without_dns_lookup():
    with pytest.raises(ValueError):
        validate_target_url("http://localhost:8000/admin")


def test_url_guardrail_rejects_private_dns_result(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.7", 443))],
    )
    with pytest.raises(ValueError):
        validate_target_url("https://example.test")


def test_url_guardrail_rejects_invalid_or_nonstandard_ports():
    with pytest.raises(ValueError):
        validate_target_url("https://example.com:not-a-port")
    with pytest.raises(ValueError):
        validate_target_url("https://example.com:8080")
