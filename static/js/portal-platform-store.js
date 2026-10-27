/** Один JSON в репозитории данных: пользователи + сдачи по школам. */

import {
  fetchGithubJsonFile,
  isGitHubPagesSite,
  isLocalPortalServer,
  platformStoreGithubCfg,
  platformStoreLocalApiUrl,
  platformStoreRawUrl,
  putGithubJsonFile,
} from "./portal-github-store.js";

const STORE_FP_KEY = "portal_platform_store_fingerprint";

export function emptyPlatformStore() {
  return { updated_at: null, users: [], submissions: {} };
}

export function normalizePlatformStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyPlatformStore();
  const submissions = {};
  if (raw.submissions && typeof raw.submissions === "object") {
    for (const [school, block] of Object.entries(raw.submissions)) {
      if (!block || typeof block !== "object") continue;
      const map =
        block.submissions && typeof block.submissions === "object"
          ? block.submissions
          : {};
      submissions[school] = {
        updated_at: block.updated_at || null,
        meta: block.meta && typeof block.meta === "object" ? block.meta : {},
        submissions: map,
      };
    }
  }
  return {
    updated_at: raw.updated_at || null,
    users: Array.isArray(raw.users) ? raw.users : [],
    submissions,
  };
}

async function fetchPlatformStoreFromLocalApi() {
  const res = await fetch(platformStoreLocalApiUrl(), { cache: "no-store" });
  if (!res.ok) return null;
  const etag = (res.headers.get("ETag") || "").replace(/^"|"$/g, "");
  const json = await res.json();
  return { sha: etag || null, store: normalizePlatformStore(json) };
}

export async function fetchPlatformStoreLive() {
  if (isLocalPortalServer()) {
    const local = await fetchPlatformStoreFromLocalApi();
    if (local) return local;
  }
  const cfg = platformStoreGithubCfg();
  const live = await fetchGithubJsonFile(cfg);
  return { sha: live.sha, store: normalizePlatformStore(live.json) };
}

export async function fetchPlatformStoreCached() {
  if (isLocalPortalServer()) {
    try {
      const local = await fetchPlatformStoreFromLocalApi();
      if (local?.store) return local.store;
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(`${platformStoreRawUrl()}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return normalizePlatformStore(await res.json());
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(`data/platform-store.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) return normalizePlatformStore(await res.json());
  } catch {
    /* ignore */
  }
  return null;
}

export function schoolSubmissionMap(store, schoolCode) {
  const school = String(schoolCode || "foundation").trim().toLowerCase() || "foundation";
  const block = store?.submissions?.[school];
  if (!block) return {};
  const map = block.submissions;
  return map && typeof map === "object" ? map : {};
}

export function storeFingerprint(store) {
  const users = (store.users || []).length;
  const schools = Object.keys(store.submissions || {}).sort();
  let subKeys = 0;
  for (const code of schools) subKeys += Object.keys(schoolSubmissionMap(store, code)).length;
  return `${users}:${schools.join(",")}:${subKeys}`;
}

async function mutatePlatformStoreLocal(mutator) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const live = await fetchPlatformStoreFromLocalApi();
    const store = live?.store || emptyPlatformStore();
    const sha = live?.sha || null;
    const next = normalizePlatformStore(JSON.parse(JSON.stringify(store)));
    await mutator(next);
    next.updated_at = new Date().toISOString();
    const headers = { "Content-Type": "application/json" };
    if (sha) headers["If-Match"] = sha;
    const res = await fetch(platformStoreLocalApiUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify(next),
    });
    if (res.status === 409) {
      lastErr = Object.assign(new Error("local_store_conflict"), { conflict: true });
      continue;
    }
    if (!res.ok) {
      throw new Error(`local_store_save_failed: ${res.status}`);
    }
    try {
      localStorage.setItem(STORE_FP_KEY, storeFingerprint(next));
    } catch {
      /* ignore */
    }
    return next;
  }
  throw lastErr || new Error("local_store_conflict");
}

export async function mutatePlatformStore(token, mutator, message) {
  if (isLocalPortalServer()) {
    return mutatePlatformStoreLocal(mutator);
  }
  const cfg = platformStoreGithubCfg();
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { sha, store } = await fetchPlatformStoreLive();
    const next = normalizePlatformStore(JSON.parse(JSON.stringify(store)));
    await mutator(next);
    next.updated_at = new Date().toISOString();
    try {
      await putGithubJsonFile(cfg, next, token, { message, sha, maxAttempts: 1 });
      try {
        localStorage.setItem(STORE_FP_KEY, storeFingerprint(next));
      } catch {
        /* ignore */
      }
      return next;
    } catch (err) {
      lastErr = err;
      if (!err?.conflict && attempt >= 4) throw err;
      if (!err?.conflict) throw err;
    }
  }
  throw lastErr;
}

function mergeUsers(remote, local) {
  const byLogin = new Map();
  for (const user of remote) {
    const key = String(user.login || "").trim().toLowerCase();
    if (key) byLogin.set(key, user);
  }
  for (const user of local) {
    const key = String(user.login || "").trim().toLowerCase();
    if (key && !byLogin.has(key)) byLogin.set(key, user);
  }
  return [...byLogin.values()].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
}

function mergeSubmissionMaps(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [key, value] of Object.entries(map)) {
      if (value && typeof value === "object") out[key] = value;
    }
  }
  return out;
}

export async function syncPlatformStoreFromLocal(token, opts = {}) {
  const { readLocalSubmissionMap, mergeSubmissionMaps: mergeMaps } = await import(
    "./portal-submissions-sync.js"
  );
  let localUsers = [];
  try {
    const raw = localStorage.getItem("lavh_public_users_v1");
    localUsers = raw ? JSON.parse(raw) : [];
  } catch {
    localUsers = [];
  }
  if (!Array.isArray(localUsers)) localUsers = [];

  const localSubs = readLocalSubmissionMap();
  let school = opts.schoolCode;
  if (!school) {
    try {
      const mod = await import("./portal-data.js");
      school = mod.getActiveSchoolCode();
    } catch {
      school = "foundation";
    }
  }
  school = String(school || "foundation").trim().toLowerCase() || "foundation";

  if (!localUsers.length && !Object.keys(localSubs).length && !opts.force) {
    return { skipped: "local_empty" };
  }

  const bundle = opts.bundle || null;
  let buildMeta = null;
  if (bundle && Object.keys(localSubs).length) {
    const { classBundleFullySubmitted } = await import("./portal-data.js");
    const className = bundle.classes?.[0]?.class_name || "6Б";
    if (classBundleFullySubmitted(bundle, className, localSubs)) {
      buildMeta = {
        all_submitted_at: new Date().toISOString(),
        class_name: className,
        student_count: (bundle.rosters?.[className] || []).length,
      };
    }
  }

  const schoolKey = school;
  await mutatePlatformStore(
    token,
    (store) => {
      store.users = mergeUsers(store.users, localUsers);
      const prev = schoolSubmissionMap(store, schoolKey);
      const merged = mergeMaps(prev, localSubs);
      const block = store.submissions[schoolKey] || { meta: {}, submissions: {} };
      block.updated_at = new Date().toISOString();
      block.submissions = merged;
      if (buildMeta) block.meta = { ...(block.meta || {}), ...buildMeta };
      store.submissions[schoolKey] = block;
    },
    opts.commitMessage || "Sync LAVH platform store"
  );
  return { synced: true };
}

export async function autoSyncPlatformStoreOnLoad(opts = {}) {
  if (isLocalPortalServer()) {
    return syncPlatformStoreFromLocal(null, opts);
  }
  if (!isGitHubPagesSite()) return { skipped: "not_github_pages" };
  const { resolveSyncToken } = await import("./portal-submissions-sync.js");
  const token = opts.token || (await resolveSyncToken(opts.bundle));
  if (!token) return { skipped: "no_token" };
  return syncPlatformStoreFromLocal(token, opts);
}

export { isGitHubPagesSite };
