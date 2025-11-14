// src/lib/protectedFetch.ts
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect } from "@/lib/auth";

/**
 * Robust protected fetch helper.
 * - Waits briefly for Supabase session if not yet available (useful on SPA nav).
 * - Caches blob object URLs per source URL for session lifetime.
 * - Prevents duplicated in-flight fetches.
 */

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function waitForAccessToken(timeoutMs = 2000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // supabase-js v2
      if (typeof (supabase.auth as any)?.getSession === "function") {
        // @ts-ignore
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) return token;
      }

      // older supabase-js
      // @ts-ignore
      if (typeof supabase.auth?.session === "function") {
        // @ts-ignore
        const s = supabase.auth.session?.();
        if (s?.access_token) return s.access_token;
      }

      // fallback localStorage
      const raw = localStorage.getItem("supabase.auth.token") || localStorage.getItem("sb:token") || localStorage.getItem("supabase.auth");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const maybe = parsed?.currentSession?.access_token || parsed?.access_token;
          if (maybe) return maybe;
        } catch {}
      }
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

export async function fetchProtectedAsObjectUrl(srcUrl: string) {
  if (!srcUrl) throw new Error("No srcUrl provided");

  // return cached if exists
  if (cache.has(srcUrl)) return cache.get(srcUrl)!;

  // if there's already an in-flight fetch, reuse it
  if (inflight.has(srcUrl)) return inflight.get(srcUrl)!;

  const p = (async () => {
    // wait a bit for token to appear (useful on initial SPA nav)
    const token = await waitForAccessToken(2000, 200);
    if (!token) {
      // token not available → perform centralized logout/redirect
      signOutAndRedirect();
      throw new Error("No access token available. Please login.");
    }

    const resp = await fetch(srcUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      // If token invalid/expired, sign out centrally (prevent infinite loops)
      if (resp.status === 401) {
        // best-effort: clear and redirect
        signOutAndRedirect();
        throw new Error("Unauthorized. Signing out.");
      }
      const text = await resp.text().catch(() => null);
      throw new Error(`Protected fetch failed: ${resp.status} ${text || resp.statusText}`);
    }

    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    cache.set(srcUrl, objectUrl);
    return objectUrl;
  })();

  inflight.set(srcUrl, p);
  try {
    const result = await p;
    return result;
  } finally {
    inflight.delete(srcUrl);
  }
}

// Helpers to clear cache (call on logout)
export function revokeCachedObjectUrl(srcUrl: string) {
  const obj = cache.get(srcUrl);
  if (obj) {
    try { URL.revokeObjectURL(obj); } catch (e) {}
    cache.delete(srcUrl);
  }
}

export function revokeAllCachedObjectUrls() {
  for (const v of cache.values()) {
    try { URL.revokeObjectURL(v); } catch (e) {}
  }
  cache.clear();
}
