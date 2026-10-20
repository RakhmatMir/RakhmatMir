#!/usr/bin/env python3
"""Выгрузка сдач Foundation School с живого портала в submissions.json."""

import json
import ssl
import urllib.request
import http.cookiejar
from pathlib import Path

BASE = "https://average-runner-sweet-cancer.trycloudflare.com"
OUT = Path(__file__).resolve().parents[1] / "data/schools/foundation/submissions.json"


def main():
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    ctx = ssl.create_default_context()

    def req(method, path, data=None):
        body = None
        headers = {}
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        r = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
        with opener.open(r, timeout=120, context=ctx) as resp:
            return json.loads(resp.read().decode())

    req("POST", "/api/login", {"login": "admin", "password": "admin123"})
    staff = req("GET", "/api/portal/staff/tests")
    exam_ids = [t["id"] for t in staff.get("tests", [])]

    submissions = {}
    student_ids = set()

    for exam_id in exam_ids:
        admin = req("GET", f"/api/portal/exams/{exam_id}/admin")
        for st in admin.get("students", []):
            sid = st["id"]
            if st.get("status") != "submitted" and st.get("score_percent") is None:
                continue
            detail = req("GET", f"/api/portal/exams/{exam_id}/students/{sid}/submission")
            if not detail.get("submitted"):
                continue
            key = f"{exam_id}:{sid}"
            fb = detail.get("feedback") or []
            answers = {}
            q_times, q_away, q_exit = [], [], []
            for i, row in enumerate(fb):
                if not isinstance(row, dict):
                    continue
                answers[str(i)] = row.get("selected_index", 0)
                q_times.append(int(row.get("time_seconds") or 0))
                q_away.append(int(row.get("away_seconds") or 0))
                q_exit.append(int(row.get("exit_count") or 0))
            submissions[key] = {
                "score_percent": detail.get("score_percent"),
                "correct_count": detail.get("correct_count"),
                "question_total": detail.get("question_total"),
                "answers": answers,
                "question_times": q_times,
                "question_away_seconds": q_away,
                "question_exit_counts": q_exit,
                "exit_intent_count": detail.get("exit_intent_count") or 0,
                "duration_label": detail.get("duration_label") or "",
                "feedback": [
                    {"selected_index": a.get("selected_index"), "is_correct": a.get("is_correct")}
                    for a in fb
                    if isinstance(a, dict)
                ],
            }
            student_ids.add(sid)

    doc = {
        "updated_at": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "meta": {
            "student_count": len(student_ids),
            "all_submitted_at": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "source": "exported from live portal API",
        },
        "submissions": submissions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(submissions)} submissions to {OUT}")


if __name__ == "__main__":
    main()
