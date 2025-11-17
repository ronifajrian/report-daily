// src/lib/protectedFetch.ts
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect, shouldBlockAuthOperations, incrementAuthError } from "@/lib/auth";

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * IMPROVED: Protected fetch dengan circuit breaker dan better error handling
 */

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Track 401 errors per URL to prevent infinite loops
const failureCount = new Map<string, number>();
const MAX_FAILURES = 2;

async function waitForAccessToken(timeoutMs = 2000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // 1. Coba cara modern (v2) - ini cara terbaik
      if (typeof (supabase.auth as any)?.getSession === "function") {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) return token;
      }

      // 2. Coba fallback ke localStorage dengan logika baru yang lebih pintar
      let raw: string | null = null;
      
      // Coba dulu key statis yang umum (v1)
      const staticKeys = ["supabase.auth.token", "supabase.auth", "sb:token"];
      for (const key of staticKeys) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }

      // Jika tidak ketemu, cari key dinamis v2 (sb-<project-ref>-auth-token)
      if (!raw) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
            raw = localStorage.getItem(key);
            break; // Berhasil menemukan key v2
          }
        }
      }

      // Jika kita berhasil mendapatkan data (baik dari v1 atau v2), parse datanya
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Cek berbagai kemungkinan struktur data session
          const maybe = parsed?.currentSession?.access_token || 
                        parsed?.access_token ||
                        parsed?.session?.access_token;
          if (maybe) return maybe;
        } catch {}
      }
    } catch (e) {
      // abaikan dan coba lagi
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

export async function fetchProtectedAsObjectUrl(srcUrl: string): Promise<string> {
  if (!srcUrl) throw new Error("No srcUrl provided");

  // Check circuit breaker
  if (shouldBlockAuthOperations()) {
    throw new Error("Auth operations blocked - please refresh the page");
  }

  // Check failure count for this URL
  const failures = failureCount.get(srcUrl) || 0;
  if (failures >= MAX_FAILURES) {
    console.warn(`[FETCH] Max failures reached for ${srcUrl}, blocking further attempts`);
    throw new Error("Too many authentication failures");
  }

  // Return cached if exists
  if (cache.has(srcUrl)) {
    return cache.get(srcUrl)!;
  }

  // Reuse in-flight request
  if (inflight.has(srcUrl)) {
    return inflight.get(srcUrl)!;
  }

  const p = (async () => {
    try {
      // Wait for token with shorter timeout
      const token = await waitForAccessToken(1500, 150);
      
      if (!token) {
        console.warn('[FETCH] No token available after wait');
        incrementAuthError();
        
        // Increment failure count
        failureCount.set(srcUrl, (failureCount.get(srcUrl) || 0) + 1);
        
        // // Only trigger sign out if not already in progress
        // if (!shouldBlockAuthOperations()) {
        //   setTimeout(() => signOutAndRedirect(), 100);
        // }
        
        throw new AuthenticationError("Authentication required");
      }

      const resp = await fetch(srcUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          console.warn(`[FETCH] Auth failed (${resp.status}) for ${srcUrl}`);
          incrementAuthError();
          
          // Increment failure count
          failureCount.set(srcUrl, (failureCount.get(srcUrl) || 0) + 1);
          
          // Only trigger sign out if not already in progress and not circuit broken
          // if (!shouldBlockAuthOperations()) {
          //   setTimeout(() => signOutAndRedirect(), 100);
          // }
          
          throw new AuthenticationError("Authentication failed");
        }
        
        const text = await resp.text().catch(() => null);
        throw new Error(`Fetch failed: ${resp.status} ${text || resp.statusText}`);
      }

      // Success - reset failure count for this URL
      failureCount.delete(srcUrl);

      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      cache.set(srcUrl, objectUrl);
      return objectUrl;
    } catch (error) {
      // Remove from cache on error
      cache.delete(srcUrl);
      throw error;
    }
  })();

  inflight.set(srcUrl, p);
  try {
    const result = await p;
    return result;
  } finally {
    inflight.delete(srcUrl);
  }
}

export function revokeCachedObjectUrl(srcUrl: string) {
  const obj = cache.get(srcUrl);
  if (obj) {
    try { URL.revokeObjectURL(obj); } catch (e) {}
    cache.delete(srcUrl);
  }
  // Also clear failure count
  failureCount.delete(srcUrl);
}

export function revokeAllCachedObjectUrls() {
  for (const v of cache.values()) {
    try { URL.revokeObjectURL(v); } catch (e) {}
  }
  cache.clear();
  failureCount.clear();
}

// Export for cleanup on logout
(window as any).revokeAllCachedObjectUrls = revokeAllCachedObjectUrls;