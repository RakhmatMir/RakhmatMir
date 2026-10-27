"""Local portal: static files + единый data/platform-store.json (users + submissions)."""

import hashlib
import json
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
USERS = ROOT / "data" / "users.json"
PLATFORM_STORE = ROOT / "data" / "platform-store.json"
SCHOOLS = ROOT / "data" / "schools"
ROLES = {"student", "teacher", "admin"}
MAX_BODY = 5_000_000


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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


def normalize_submissions_block(body):
    if not isinstance(body, dict):
        return {"updated_at": None, "meta": {}, "submissions": {}}
    subs = body.get("submissions")
    if isinstance(subs, dict):
        return {
            "updated_at": body.get("updated_at"),
            "meta": body.get("meta") if isinstance(body.get("meta"), dict) else {},
            "submissions": subs,
        }
    meta = body.get("meta") if isinstance(body.get("meta"), dict) else {}
    rest = {k: v for k, v in body.items() if k not in ("updated_at", "meta")}
    return {"updated_at": body.get("updated_at"), "meta": meta, "submissions": rest}


def build_platform_store_from_legacy():
    store = {"updated_at": None, "users": [], "submissions": {}}
    if USERS.is_file():
        try:
            store["users"] = clean_users(json.loads(USERS.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, ValueError, OSError):
            store["users"] = []
    if SCHOOLS.is_dir():
        for school_dir in sorted(SCHOOLS.iterdir()):
            if not school_dir.is_dir():
                continue
            sub_file = school_dir / "submissions.json"
            if not sub_file.is_file():
                continue
            try:
                body = json.loads(sub_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            store["submissions"][school_dir.name.lower()] = normalize_submissions_block(body)
    store["updated_at"] = utc_now_iso()
    return store


def normalize_platform_store(raw):
    if not isinstance(raw, dict):
        raise ValueError("store_shape")
    users = clean_users(raw.get("users") or [])
    submissions = {}
    raw_subs = raw.get("submissions")
    if isinstance(raw_subs, dict):
        for code, block in raw_subs.items():
            school = str(code or "").strip().lower()
            if not school:
                continue
            submissions[school] = normalize_submissions_block(block if isinstance(block, dict) else {})
    return {
        "updated_at": raw.get("updated_at") or utc_now_iso(),
        "users": users,
        "submissions": submissions,
    }


def load_platform_store():
    if PLATFORM_STORE.is_file():
        try:
            raw = json.loads(PLATFORM_STORE.read_text(encoding="utf-8"))
            return normalize_platform_store(raw)
        except (json.JSONDecodeError, ValueError, OSError):
            pass
    store = build_platform_store_from_legacy()
    save_platform_store(store)
    return store


def store_etag(store):
    text = json.dumps(store, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def mirror_legacy_files(store):
    USERS.parent.mkdir(parents=True, exist_ok=True)
    USERS.write_text(json.dumps(store["users"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for code, block in (store.get("submissions") or {}).items():
        school = str(code).strip().lower()
        if not school:
            continue
        out_dir = SCHOOLS / school
        out_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": block.get("updated_at") or store.get("updated_at"),
            "meta": block.get("meta") or {},
            "submissions": block.get("submissions") or {},
        }
        (out_dir / "submissions.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )


def save_platform_store(store):
    store = normalize_platform_store(store)
    store["updated_at"] = utc_now_iso()
    PLATFORM_STORE.parent.mkdir(parents=True, exist_ok=True)
    PLATFORM_STORE.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    mirror_legacy_files(store)
    return store


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("body_size")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/site/platform-store":
            store = load_platform_store()
            tag = store_etag(store)
            self.send_json(200, store, {"ETag": f'"{tag}"'})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/site/platform-store":
                store = load_platform_store()
                tag = store_etag(store)
                if_match = (self.headers.get("If-Match") or "").strip().strip('"')
                if if_match and if_match != tag:
                    self.send_json(409, {"ok": False, "error": "conflict"})
                    return
                payload = self.read_json_body()
                saved = save_platform_store(payload)
                new_tag = store_etag(saved)
                self.send_json(200, {"ok": True, "updated_at": saved["updated_at"]}, {"ETag": f'"{new_tag}"'})
                return
            if path == "/api/site/users":
                clean = clean_users(self.read_json_body())
                store = load_platform_store()
                store["users"] = clean
                save_platform_store(store)
                self.send_json(200, {"ok": True})
                return
        except (ValueError, json.JSONDecodeError, UnicodeError):
            self.send_error(400)
            return
        self.send_error(404)


if __name__ == "__main__":
    if not PLATFORM_STORE.is_file():
        print("INIT platform-store.json from data/users.json + schools/*/submissions.json", flush=True)
        load_platform_store()
    server = ThreadingHTTPServer(("127.0.0.1", 8080), Handler)
    print("LISTENING http://127.0.0.1:8080/", flush=True)
    print("DATA     data/platform-store.json (users + submissions)", flush=True)
    server.serve_forever()
