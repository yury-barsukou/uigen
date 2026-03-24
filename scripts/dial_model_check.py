#!/usr/bin/env python3
"""
Check access to all EPAM DIAL models and write results to a Markdown table.
Usage: python dial_model_check.py
Output: dial_models.md
"""

import urllib.request
import urllib.error
import json
import concurrent.futures
import datetime
import os
import sys

# ── Configuration ────────────────────────────────────────────────────────────

ENDPOINT = os.getenv("DIAL_ENDPOINT", "https://ai-proxy.lab.epam.com/openai")
API_KEY  = os.getenv("DIAL_API_KEY",  "dial-l3f0ivt8qpq4pu1xvxylrjhyu7m")
API_VER  = "2024-02-15-preview"
OUTPUT   = "dial_models.md"
WORKERS  = 20          # parallel requests
TIMEOUT  = 15          # seconds per request
TEST_BODY = json.dumps({
    "messages": [{"role": "user", "content": "hi"}],
    "max_tokens": 5,
}).encode()

# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_json(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


def probe_model(model_id: str) -> dict:
    """Send a minimal chat completion and return status + detail."""
    url = (
        f"{ENDPOINT}/deployments/{urllib.parse.quote(model_id, safe='')}"
        f"/chat/completions?api-version={API_VER}"
    )
    headers = {
        "Content-Type": "application/json",
        "api-key": API_KEY,
    }
    req = urllib.request.Request(url, data=TEST_BODY, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = json.loads(r.read())
            # Extract a tiny sample from the response
            content = ""
            try:
                content = body["choices"][0]["message"]["content"][:40].replace("\n", " ")
            except Exception:
                pass
            return {"status": r.status, "label": "✅ OK", "detail": content}
    except urllib.error.HTTPError as e:
        body_text = ""
        try:
            body_text = e.read().decode()[:80]
            msg = json.loads(body_text).get("error", {}).get("display_message", body_text)
        except Exception:
            msg = body_text
        label = {
            401: "🔒 Unauthorized",
            403: "🚫 Access denied",
            404: "❓ Not found",
            400: "⚠️ Bad request",
        }.get(e.code, f"❌ HTTP {e.code}")
        return {"status": e.code, "label": label, "detail": msg[:60]}
    except Exception as ex:
        return {"status": 0, "label": "💥 Error", "detail": str(ex)[:60]}


# ── Main ──────────────────────────────────────────────────────────────────────

import urllib.parse   # needed by probe_model above


def main():
    print(f"Fetching model list from {ENDPOINT} …")
    try:
        data = fetch_json(f"{ENDPOINT}/models", headers={"api-key": API_KEY})
    except Exception as ex:
        sys.exit(f"Failed to fetch model list: {ex}")

    models = [m["id"] for m in data.get("data", [])]
    print(f"Found {len(models)} models. Probing access ({WORKERS} workers) …")

    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(probe_model, mid): mid for mid in models}
        done = 0
        for future in concurrent.futures.as_completed(futures):
            mid = futures[future]
            results[mid] = future.result()
            done += 1
            ok = "OK" if results[mid]["status"] == 200 else "--"
            print(f"  [{done:>3}/{len(models)}] {ok} {mid}")

    # ── Build Markdown ────────────────────────────────────────────────────────

    accessible = [m for m in models if results[m]["status"] == 200]
    blocked    = [m for m in models if results[m]["status"] != 200]

    lines = [
        f"# EPAM DIAL Model Access Report",
        f"",
        f"**Endpoint:** `{ENDPOINT}`  ",
        f"**Generated:** {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}  ",
        f"**Total models:** {len(models)} | "
        f"**Accessible:** {len(accessible)} | "
        f"**Blocked/Error:** {len(blocked)}",
        f"",
        f"## ✅ Accessible Models ({len(accessible)})",
        f"",
        f"| Model | Response sample |",
        f"|-------|----------------|",
    ]
    for mid in models:
        r = results[mid]
        if r["status"] == 200:
            lines.append(f"| `{mid}` | {r['detail']} |")

    lines += [
        f"",
        f"## 🚫 Blocked / Unavailable Models ({len(blocked)})",
        f"",
        f"| Model | Status | Reason |",
        f"|-------|--------|--------|",
    ]
    for mid in models:
        r = results[mid]
        if r["status"] != 200:
            lines.append(f"| `{mid}` | {r['label']} | {r['detail']} |")

    md = "\n".join(lines) + "\n"

    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(md)

    print(f"\nDone. Results written to '{OUTPUT}'")
    print(f"  Accessible : {len(accessible)}")
    print(f"  Blocked    : {len(blocked)}")


if __name__ == "__main__":
    main()
