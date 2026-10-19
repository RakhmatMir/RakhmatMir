import express from "express";
import cookieSession from "cookie-session";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFileLocalStorage } from "./file-local-storage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);

global.window = { portalState: { session: null } };
global.window.PORTAL_DATA_BASE = `http://127.0.0.1:${PORT}/data`;
global.localStorage = createFileLocalStorage();

const portalData = await import("../static/js/portal-data.js");
const { classBundleFullySubmitted, dataApi, invalidatePortalBundleCache, loadPortalBundle } =
  portalData;
const { buildAdminSyncStatus } = await import("./sync-status.mjs");
const SESSION_SECRET = process.env.PORTAL_SESSION_SECRET || "dev-portal-session-secret-change-me";

const sseClients = new Set();

function broadcastAdminEvent(payload) {
  const data = JSON.stringify(payload);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

function publicUser(row) {
  return {
    id: row.id,
    login: row.login,
    full_name: row.full_name,
    role: row.role,
    class_name: row.class_name ?? null,
    staff_title: row.staff_title ?? null,
  };
}

async function loadUsers() {
  const bundle = await loadPortalBundle({ fresh: true });
  return bundle.demo_users || [];
}

async function findUser(login, password) {
  const users = await loadUsers();
  const l = String(login || "").trim().toLowerCase();
  const p = String(password || "");
  return users.find((u) => u.login.toLowerCase() === l && u.password === p) || null;
}

function userById(id) {
  return loadUsers().then((users) => users.find((u) => u.id === id) || null);
}

function parseBody(req) {
  if (!req.body || typeof req.body !== "object") return {};
  return req.body;
}

function apiError(res, err) {
  const code = String(err?.message || err || "error");
  const map = {
    invalid_credentials: 401,
    not_authenticated: 401,
    forbidden: 403,
    not_found: 404,
    exam_not_found: 404,
    exam_not_published: 403,
    already_submitted: 409,
    bad_request: 400,
    not_all_submitted: 400,
  };
  const status = map[code] || 500;
  if (status >= 500) console.error("[portal-api]", err);
  res.status(status).json({ detail: code });
}

function withPortalContext(req, fn) {
  const localStorage = createFileLocalStorage();
  global.localStorage = localStorage;
  global.window = global.window || {};
  global.window.PORTAL_DATA_BASE = `http://127.0.0.1:${PORT}/data`;
  const uid = req.session?.uid;
  if (!uid) {
    global.window.portalState = { session: null };
  } else {
    return userById(uid).then((row) => {
      if (!row) {
        global.window.portalState = { session: null };
        return fn();
      }
      return loadPortalBundle().then((bundle) => {
        global.window.portalState = {
          session: { user: publicUser(row), school_name: bundle.school_name },
        };
        return fn();
      });
    });
  }
  return fn();
}

function portalApiPath(req) {
  const suffix = req.path.replace(/^\/api\/portal\/?/, "");
  return suffix ? `/api/portal/${suffix}`.replace(/\/+$/, "") : "/api/portal";
}

async function handlePortalApi(req, res) {
  const path = portalApiPath(req);
  const method = req.method.toUpperCase();

  if (path === "/api/portal/admin/sync-status" && method === "GET") {
    try {
      const localStorage = createFileLocalStorage();
      const status = await buildAdminSyncStatus(localStorage);
      return res.json(status);
    } catch (err) {
      return apiError(res, err);
    }
  }

  try {
    const body = method === "GET" || method === "DELETE" ? undefined : JSON.stringify(parseBody(req));
    const result = await withPortalContext(req, () =>
      dataApi(path, { method, body, headers: req.headers })
    );

    if (path.match(/^\/api\/portal\/exams\/\d+\/admin$/) && method === "GET" && result) {
      const bundle = await loadPortalBundle();
      const cls = result.exam?.class_name;
      if (cls) {
        const localStorage = createFileLocalStorage();
        let submissions = {};
        try {
          submissions = JSON.parse(localStorage.getItem("portal_site_submissions_v1") || "{}");
        } catch {
          submissions = {};
        }
        result.class_finalized = classBundleFullySubmitted(bundle, cls, submissions);
      }
    }

    if (path.match(/^\/api\/portal\/exams\/\d+\/submit$/) && method === "POST") {
      const m = path.match(/^\/api\/portal\/exams\/(\d+)\/submit$/);
      const examId = m ? Number(m[1]) : null;
      invalidatePortalBundleCache();
      broadcastAdminEvent({ type: "submission", exam_id: examId });
      const localStorage = createFileLocalStorage();
      const status = await buildAdminSyncStatus(localStorage);
      if (status.finalized) {
        broadcastAdminEvent({ type: "class_finalized" });
      }
    }

    res.json(result);
  } catch (err) {
    apiError(res, err);
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cookieSession({
    name: "exam_session",
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
    httpOnly: true,
  })
);

app.get("/api/public/landing", async (_req, res) => {
  try {
    const bundle = await loadPortalBundle();
    res.json({ has_schools: true, school_name: bundle.school_name });
  } catch (err) {
    apiError(res, err);
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const body = parseBody(req);
    const found = await findUser(body.login, body.password);
    if (!found) throw new Error("invalid_credentials");
    req.session.uid = found.id;
    const bundle = await loadPortalBundle();
    res.json({ user: publicUser(found), school_name: bundle.school_name });
  } catch (err) {
    apiError(res, err);
  }
});

app.post("/api/logout", (req, res) => {
  req.session = null;
  res.json({ status: "ok" });
});

app.get("/api/me", async (req, res) => {
  try {
    if (!req.session?.uid) throw new Error("not_authenticated");
    const row = await userById(req.session.uid);
    if (!row) throw new Error("not_authenticated");
    const bundle = await loadPortalBundle();
    res.json({ user: publicUser(row), school_name: bundle.school_name });
  } catch (err) {
    apiError(res, err);
  }
});

app.get("/api/portal/admin/events", (req, res) => {
  if (!req.session?.uid) {
    res.status(401).json({ detail: "not_authenticated" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(": connected\n\n");
  sseClients.add(res);
  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.get(/^\/api\/portal(\/.*)?$/, handlePortalApi);
app.post(/^\/api\/portal(\/.*)?$/, handlePortalApi);
app.put(/^\/api\/portal(\/.*)?$/, handlePortalApi);
app.patch(/^\/api\/portal(\/.*)?$/, handlePortalApi);
app.delete(/^\/api\/portal(\/.*)?$/, handlePortalApi);

app.use("/data", express.static(path.join(ROOT, "data"), { etag: false, maxAge: 0 }));
app.use("/static", express.static(path.join(ROOT, "static"), { etag: false, maxAge: 0 }));
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.get("/openapi.json", (_req, res) => {
  const specPath = path.join(ROOT, "server", "openapi.json");
  if (fs.existsSync(specPath)) {
    res.sendFile(specPath);
  } else {
    res.status(404).json({ detail: "not_found" });
  }
});

app.listen(PORT, () => {
  console.log(`School portal: http://127.0.0.1:${PORT}`);
});
