"""Compute a weighted *data completeness* score for a mapped lead.

This score controls whether the crawler tries a deeper pass. It does not
measure factual accuracy or the probability that a lead will convert.
"""

from models import Lead

# Fields that actually matter for the pain-point/email steps get more
# weight than nice-to-have firmographic fields.
HIGH_WEIGHT_FIELDS = ["product_description", "stated_pain_points_or_goals"]
NORMAL_WEIGHT_FIELDS = [
    "company_name",
    "industry",
    "location",
    "founder_name",
    "contact_email",
]

HIGH_WEIGHT = 2.0
NORMAL_WEIGHT = 1.0


def score_completeness(lead: Lead) -> tuple[float, list[str]]:
    total_weight = 0.0
    earned_weight = 0.0
    missing = []

    for field in HIGH_WEIGHT_FIELDS:
        total_weight += HIGH_WEIGHT
        value = getattr(lead, field)
        filled = bool(value) if not isinstance(value, list) else len(value) > 0
        if filled:
            earned_weight += HIGH_WEIGHT
        else:
            missing.append(field)

    for field in NORMAL_WEIGHT_FIELDS:
        total_weight += NORMAL_WEIGHT
        value = getattr(lead, field)
        if value:
            earned_weight += NORMAL_WEIGHT
        else:
            missing.append(field)

    completeness = round(earned_weight / total_weight, 2) if total_weight else 0.0
    return completeness, missing
