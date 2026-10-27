/** Учётки читаются из единого platform-store.json на GitHub. */

import {
  fetchPlatformStoreCached,
  fetchPlatformStoreLive,
  mutatePlatformStore,
  autoSyncPlatformStoreOnLoad,
  isGitHubPagesSite,
} from "./portal-platform-store.js";
import { resolveSyncToken } from "./portal-submissions-sync.js";

const USERS_SYNC_FP_KEY = "portal_users_sync_fingerprint";

function normalizeLogin(login) {
  return String(login || "").trim().toLowerCase();
}

function mergeUserLists(remoteList, localList) {
  const byLogin = new Map();
  for (const user of Array.isArray(remoteList) ? remoteList : []) {
    const key = normalizeLogin(user.login);
    if (key) byLogin.set(key, user);
  }
  for (const user of Array.isArray(localList) ? localList : []) {
    const key = normalizeLogin(user.login);
    if (!key) continue;
    if (!byLogin.has(key)) byLogin.set(key, user);
  }
  return [...byLogin.values()].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
}

export function usersListFingerprint(list) {
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) return "";
  return `${rows.length}#${rows.map((u) => normalizeLogin(u.login)).sort().join(",")}`;
}

export async function fetchRemoteUsersList() {
  try {
    const { store } = await fetchPlatformStoreLive();
    if (store.users?.length) return store.users;
  } catch {
    /* fall through */
  }
  const cached = await fetchPlatformStoreCached();
  if (cached?.users?.length) return cached.users;
  return null;
}

export async function pushUsersToGitHub(token, list, opts = {}) {
  const local = Array.isArray(list) ? list : [];
  await mutatePlatformStore(
    token,
    (store) => {
      store.users = mergeUserLists(store.users, local);
    },
    opts.commitMessage || `Sync portal users (${local.length} local)`
  );
  try {
    localStorage.setItem(USERS_SYNC_FP_KEY, usersListFingerprint(local));
  } catch {
    /* ignore */
  }
  return { mergedCount: local.length };
}

export async function autoSyncUsersOnLoad(opts = {}) {
  return autoSyncPlatformStoreOnLoad(opts);
}

export { isGitHubPagesSite };
