"""Local portal: static files plus saving data/users.json."""

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
USERS = ROOT / "data" / "users.json"
ROLES = {"student", "teacher", "admin"}


def clean_users(data):
    if not isinstance(data, list):
        raise ValueError("users")
    clean = []
    for row in data:
        if not isinstance(row, dict):
            continue
        login = str(row.get("login") or "").strip().lower()
        if len(login) < 3:
            continue
        role = row.get("role") if row.get("role") in ROLES else "student"
        school = str(row.get("school_code") or "").strip().lower() or None
        class_name = str(row.get("class_name") or "").strip() or None
        clean.append(
            {
                "id": int(row.get("id") or 0),
                "school_code": school,
                "login": login,
                "password": str(row.get("password") or ""),
                "full_name": str(row.get("full_name") or login).strip(),
                "telegram": str(row.get("telegram") or "").strip(),
                "role": role,
                "kind": "bot" if row.get("kind") == "bot" else "public",
                "class_name": class_name,
                "created_at": str(row.get("created_at") or ""),
            }
        )
    return clean


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path != "/api/site/users":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 1_000_000:
            self.send_error(400)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            clean = clean_users(payload)
        except (ValueError, json.JSONDecodeError, UnicodeError):
            self.send_error(400)
            return
        USERS.parent.mkdir(parents=True, exist_ok=True)
        USERS.write_text(json.dumps(clean, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        body = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8080), Handler)
    print("LISTENING http://127.0.0.1:8080/", flush=True)
    server.serve_forever()
