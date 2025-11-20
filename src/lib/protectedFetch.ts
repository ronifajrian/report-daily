// src/lib/protectedFetch.ts - OPTIMIZED VERSION
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect, shouldBlockAuthOperations, incrementAuthError } from "@/lib/auth";

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

// ✅ LRU Cache with automatic cleanup
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 50) { // Limit cache to 50 items
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete it first
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, value);

    // Remove oldest if over limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      const oldValue = this.cache.get(firstKey);
      
      // Revoke old object URL before removing
      if (typeof oldValue === 'string' && oldValue.startsWith('blob:')) {
        try { URL.revokeObjectURL(oldValue); } catch {}
      }
      
      this.cache.delete(firstKey);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): void {
    const value = this.cache.get(key);
    if (value && typeof value === 'string' && value.startsWith('blob:')) {
      try { URL.revokeObjectURL(value); } catch {}
    }
    this.cache.delete(key);
  }

  clear(): void {
    for (const value of this.cache.values()) {
      if (typeof value === 'string' && value.startsWith('blob:')) {
        try { URL.revokeObjectURL(value); } catch {}
      }
    }
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// ✅ Replace Map with LRU Cache
const cache = new LRUCache<string, string>(50);
const inflight = new Map<string, Promise<string>>();

// Track failures
const failureCount = new Map<string, number>();
const MAX_FAILURES = 2;

// ✅ Token wait with better error handling
async function waitForAccessToken(timeoutMs = 2000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Modern way (v2)
      if (typeof (supabase.auth as any)?.getSession === "function") {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) return token;
      }

      // Fallback to localStorage
      let raw: string | null = null;
      
      const staticKeys = ["supabase.auth.token", "supabase.auth", "sb:token"];
      for (const key of staticKeys) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }

      if (!raw) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
            raw = localStorage.getItem(key);
            break;
          }
        }
      }

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const maybe = parsed?.currentSession?.access_token || 
                        parsed?.access_token ||
                        parsed?.session?.access_token;
          if (maybe) return maybe;
        } catch {}
      }
    } catch {}
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

export async function fetchProtectedAsObjectUrl(srcUrl: string): Promise<string> {
  if (!srcUrl) throw new Error("No srcUrl provided");

  if (shouldBlockAuthOperations()) {
    throw new Error("Auth operations blocked - please refresh the page");
  }

  const failures = failureCount.get(srcUrl) || 0;
  if (failures >= MAX_FAILURES) {
    console.warn(`[FETCH] Max failures reached for ${srcUrl}`);
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
      const token = await waitForAccessToken(1500, 150);
      
      if (!token) {
        console.warn('[FETCH] No token available');
        incrementAuthError();
        failureCount.set(srcUrl, (failureCount.get(srcUrl) || 0) + 1);
        throw new AuthenticationError("Authentication required");
      }

      const resp = await fetch(srcUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          console.warn(`[FETCH] Auth failed (${resp.status})`);
          incrementAuthError();
          failureCount.set(srcUrl, (failureCount.get(srcUrl) || 0) + 1);
          throw new AuthenticationError("Authentication failed");
        }
        
        const text = await resp.text().catch(() => null);
        throw new Error(`Fetch failed: ${resp.status} ${text || resp.statusText}`);
      }

      // Success - reset failure count
      failureCount.delete(srcUrl);

      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      cache.set(srcUrl, objectUrl); // Will auto-cleanup old URLs
      return objectUrl;
    } catch (error) {
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

// ✅ Manual revoke (optional, cache will auto-cleanup)
export function revokeCachedObjectUrl(srcUrl: string) {
  cache.delete(srcUrl);
  failureCount.delete(srcUrl);
}

// ✅ Clear all (use on logout)
export function revokeAllCachedObjectUrls() {
  cache.clear();
  failureCount.clear();
}

// ✅ Periodic cleanup (run every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    // console.log(`[CACHE] Current size: ${cache.size()}`);
  }, 5 * 60 * 1000);
}

(window as any).revokeAllCachedObjectUrls = revokeAllCachedObjectUrls;