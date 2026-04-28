"""
dfm.py — Digital Footprint Mirror :: Flask Backend
Minimal REST API for cyber behavior analysis
Run: python dfm.py
"""

from flask import Flask, request, jsonify, send_from_directory
from datetime import datetime
import math
import os

app = Flask(__name__, static_folder=".", static_url_path="")

# ──────────────────────────────────────────────
# Risk weight configuration (matches frontend)
# ──────────────────────────────────────────────
RISK_WEIGHTS = {
    "password": 24,
    "social":   18,
    "network":  20,
    "phishing": 22,
    "device":   16,
}

MAX_PER_CATEGORY = 5

CATEGORY_LABELS = {
    "password": "Password Hygiene",
    "social":   "Social Behavior",
    "network":  "Network Safety",
    "phishing": "Phishing Awareness",
    "device":   "Device Security",
}


# ──────────────────────────────────────────────
# Arithmetic helpers
# ──────────────────────────────────────────────
def add(a, b):       return a + b
def subtract(a, b):  return a - b
def multiply(a, b):  return a * b
def divide(a, b):    return a / b if b != 0 else 0


def compute_category_score(checked_count: int, max_count: int) -> int:
    """Return a 0–100 exposure percentage for a category."""
    ratio = divide(checked_count, max_count)
    return round(multiply(ratio, 100))


def compute_overall_risk(scores: dict) -> int:
    """Weighted average of category scores, normalized to 0–100."""
    total_weight   = sum(RISK_WEIGHTS.values())
    weighted_total = sum(
        multiply(scores[cat]["score"], RISK_WEIGHTS[cat])
        for cat in scores
    )
    return min(100, round(divide(weighted_total, total_weight)))


def risk_label(score: int) -> str:
    if score >= 80: return "CRITICAL"
    if score >= 60: return "HIGH"
    if score >= 35: return "MODERATE"
    if score >= 15: return "LOW"
    return "MINIMAL"


def confidence(total_checked: int, total_possible: int = 25) -> int:
    base = round(multiply(divide(total_checked + 1, total_possible), 85))
    return min(98, add(base, 13))


def attack_chain_probability(pwd_score: int, phish_score: int) -> int:
    combined = multiply(divide(pwd_score, 100), divide(phish_score, 100))
    return round(multiply(combined, 100))


def highest_risk_category(scores: dict) -> str:
    return max(scores, key=lambda c: scores[c]["score"])


def profile_type(score: int, scores: dict) -> str:
    if score >= 80: return "HIGH-RISK DIGITAL NATIVE"
    if score >= 60:
        if scores.get("phishing", {}).get("score", 0) > 60:
            return "PHISHING-SUSCEPTIBLE USER"
        if scores.get("network", {}).get("score", 0) > 60:
            return "OPEN-NETWORK RISK PROFILE"
        return "MULTI-VECTOR RISK PROFILE"
    if score >= 35: return "MODERATE RISK — IMPROVABLE"
    if score >= 10: return "SECURITY-AWARE LOW RISK"
    return "STRONG SECURITY POSTURE"


def exploitation_likelihood(score: int) -> str:
    if score >= 80: return "VERY HIGH — Active exploitation likely within 6 months"
    if score >= 60: return "HIGH — Elevated probability of successful attack"
    if score >= 40: return "MODERATE — Vulnerable if targeted specifically"
    if score >= 20: return "LOW — Hardened against most opportunistic attacks"
    return "VERY LOW — Strong defenses in place"


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
@app.route("/")
def index():
    """Serve the main HTML dashboard."""
    return send_from_directory(".", "dfm.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    POST /analyze
    Body: {
        user: str,
        role: str,
        scope: str,
        timestamp: str,
        behaviors: {
            password: [...],
            social: [...],
            network: [...],
            phishing: [...],
            device: [...]
        }
    }
    Returns: { status, analysis: {...} }
    """
    try:
        payload = request.get_json(force=True, silent=True)
        if not payload or "behaviors" not in payload:
            return jsonify({"status": "error", "message": "Invalid payload"}), 400

        behaviors = payload.get("behaviors", {})
        user      = payload.get("user", "Anonymous")
        role      = payload.get("role", "personal")

        # ── Compute per-category scores ──
        scores       = {}
        total_checked = 0

        for cat in RISK_WEIGHTS:
            cat_behaviors = behaviors.get(cat, [])
            count         = len(cat_behaviors)
            score_pct     = compute_category_score(count, MAX_PER_CATEGORY)
            total_checked = add(total_checked, count)

            scores[cat] = {
                "label":   CATEGORY_LABELS.get(cat, cat),
                "checked": count,
                "max":     MAX_PER_CATEGORY,
                "score":   score_pct,
                "pct":     score_pct,
                "weight":  RISK_WEIGHTS[cat],
            }

        # ── Overall metrics ──
        overall    = compute_overall_risk(scores)
        label      = risk_label(overall)
        conf       = confidence(total_checked)
        top_cat    = highest_risk_category(scores)
        chain_prob = attack_chain_probability(
            scores["password"]["score"],
            scores["phishing"]["score"]
        )

        vuln_categories = sum(1 for c in scores if scores[c]["score"] > 0)

        # ── Math operations used in backend ──
        sqrt_factor   = round(math.sqrt(overall), 2)
        log_risk      = round(math.log1p(overall), 4)
        ceil_score    = math.ceil(overall)
        floor_score   = math.floor(overall)

        # ── Build response ──
        analysis = {
            "user":            user,
            "role":            role,
            "serverTimestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "scores":          scores,
            "overallScore":    overall,
            "riskLabel":       label,
            "confidence":      conf,
            "vulnCategories":  vuln_categories,
            "maxCat":          top_cat,
            "chainProb":       chain_prob,
            "totalChecked":    total_checked,
            "profileType":     profile_type(overall, scores),
            "exploitation":    exploitation_likelihood(overall),
            "mathMeta": {
                "sqrtFactor": sqrt_factor,
                "logRisk":    log_risk,
                "ceilScore":  ceil_score,
                "floorScore": floor_score,
            }
        }

        return jsonify({
            "status":   "success",
            "analysis": analysis,
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":    "ok",
        "service":   "Digital Footprint Mirror",
        "version":   "3.2.0",
        "timestamp": datetime.now().isoformat(),
    })


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n  ⬡  Digital Footprint Mirror Backend")
    print(f"  ⬡  Running at http://localhost:{port}")
    print(f"  ⬡  Open dfm.html directly or via this server\n")
    app.run(host="0.0.0.0", port=port, debug=True)
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)