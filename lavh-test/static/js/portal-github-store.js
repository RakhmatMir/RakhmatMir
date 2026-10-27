/** GitHub Contents API — один репозиторий: сайт + platform-store.json. */

/** @type {{ owner: string, repo: string, branch: string }} */
export const PORTAL_DATA_REPO = {
  owner: "RakhmatMir",
  repo: "RakhmatMir",
  branch: "main",
};

export function isGitHubPagesSite() {
  return Boolean(location.hostname.endsWith("github.io") || window.PORTAL_USE_STATIC_DATA);
}

/** Локальный serve.py — данные в data/platform-store.json на диске, без GitHub. */
export function isLocalPortalServer() {
  if (isGitHubPagesSite()) return false;
  const host = location.hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function platformStoreLocalApiUrl() {
  return "/api/site/platform-store";
}

export function platformStorePath() {
  return "lavh-test/data/platform-store.json";
}

export function platformStoreGithubCfg() {
  return { ...PORTAL_DATA_REPO, path: platformStorePath() };
}

export function githubRawUrl(path, repo = PORTAL_DATA_REPO) {
  const { owner, branch } = repo;
  return `https://raw.githubusercontent.com/${owner}/${repo.repo}/${branch}/${path}`;
}

export function platformStoreRawUrl() {
  return githubRawUrl(platformStorePath());
}

export function githubApiHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function encodeGithubFileContent(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** @param {{ owner, repo, branch, path }} cfg */
export async function fetchGithubJsonFile(cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url);
  if (res.status === 404) {
    return { sha: null, json: null, text: "" };
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`github_get_failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  const text = data.content ? atob(data.content.replace(/\n/g, "")) : "";
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { sha: data.sha || null, json, text };
}

/** @param {{ owner, repo, branch, path }} cfg */
export async function putGithubJsonFile(cfg, payload, token, { message, sha = null, maxAttempts = 3 } = {}) {
  if (!token) throw new Error("token_required");
  const content = encodeGithubFileContent(JSON.stringify(payload, null, 2));
  const putUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let useSha = sha;
    if (attempt > 0 || useSha == null) {
      const fresh = await fetchGithubJsonFile(cfg);
      useSha = fresh.sha;
    }
    const body = {
      message: message || `Update ${cfg.path}`,
      content,
      branch: cfg.branch,
    };
    if (useSha) body.sha = useSha;
    const res = await fetch(putUrl, {
      method: "PUT",
      headers: { ...githubApiHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const errText = await res.text();
    lastErr = Object.assign(new Error(`github_put_failed: ${res.status} ${errText}`), {
      conflict: res.status === 409,
    });
    if (!lastErr.conflict || attempt >= maxAttempts - 1) throw lastErr;
  }
  throw lastErr;
}
