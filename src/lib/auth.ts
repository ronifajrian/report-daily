// src/lib/auth.ts
import { supabase } from "@/integrations/supabase/client";

/**
 * Central auth helpers: single-flight sign-out + client cleanup + redirect,
 * plus attaching an auth state change listener.
 */

export const SIGNOUT_FLAG = "app:signout_in_progress"; // export so other modules can reference if needed

let signOutInProgressPromise: Promise<void> | null = null;

/** Remove supabase keys from localStorage (best-effort). */
export function clearSupabaseLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    const len = (() => { try { return localStorage.length; } catch { return 0; } })();
    for (let i = 0; i < len; i++) {
      let k: string | null = null;
      try { k = localStorage.key(i); } catch { k = null; }
      if (!k) continue;
      if (/^sb-[a-z0-9-]+-auth-token$/i.test(k)) { toRemove.push(k); continue; }
      if (k.includes("supabase") || k.includes("sb:token") || k.includes("sb-refresh-token")
          || k.includes("sb-access-token") || k.includes("supabase.auth") || k.startsWith("sb-")) {
        toRemove.push(k); continue;
      }
      if (k === SIGNOUT_FLAG) toRemove.push(k);
    }
    toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    // console.debug("[auth] cleared keys:", toRemove);
  } catch (e) {
    // ignore localStorage access errors
  }
}

/** Promise.all with timeout that always resolves. */
function promiseAllWithTimeout(promises: Promise<void>[], timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    Promise.all(promises.map(p => p.catch(() => {}))).then(() => {
      if (settled) return; settled = true; resolve();
    }).catch(() => {
      if (settled) return; settled = true; resolve();
    });
    setTimeout(() => { if (settled) return; settled = true; resolve(); }, timeoutMs);
  });
}

/** Best-effort client cleanup (localStorage, cached object URLs, indexedDB, SW). */
async function ensureClientCleanup(): Promise<void> {
  if (typeof window === "undefined") return;
  const tasks: Promise<void>[] = [];

  // localStorage clear
  tasks.push(new Promise((resolve) => { try { clearSupabaseLocalStorage(); } catch {} setTimeout(resolve, 0); }));

  // revoke cached object URLs if helper exists (protectedFetch exports such function)
  tasks.push(new Promise((resolve) => {
    try {
      const maybeFn = (globalThis as any).revokeAllCachedObjectUrls || (typeof (window as any).revokeAllCachedObjectUrls === "function" ? (window as any).revokeAllCachedObjectUrls : null);
      if (typeof maybeFn === "function") {
        try { (maybeFn as any)(); } catch {}
      }
    } catch {}
    setTimeout(resolve, 0);
  }));

  // delete IndexedDB names (adjust if your app uses different names)
  tasks.push(new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve();
      const dbNamesToDelete = ["my-app-db", "firebaseLocalStorageDb"];
      if (!dbNamesToDelete.length) return resolve();
      let pending = dbNamesToDelete.length;
      dbNamesToDelete.forEach((name) => {
        try {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => { pending--; if (pending <= 0) resolve(); };
          req.onerror = () => { pending--; if (pending <= 0) resolve(); };
          req.onblocked = () => { pending--; if (pending <= 0) resolve(); };
        } catch {
          pending--; if (pending <= 0) resolve();
        }
      });
      setTimeout(() => resolve(), 700);
    } catch {
      resolve();
    }
  }));

  // unregister service workers
  tasks.push(new Promise((resolve) => {
    try {
      if (!("serviceWorker" in navigator) || !navigator.serviceWorker.getRegistrations) return resolve();
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister().catch(()=>{}))))
        .then(() => resolve()).catch(() => resolve());
    } catch {
      resolve();
    }
  }));

  // cloudflare/temp object url cleanup hook (if you store refs)
  tasks.push(new Promise((resolve) => {
    try {
      const maybeList = (window as any).CF_TEMP_OBJECT_URLS;
      if (Array.isArray(maybeList)) {
        try { maybeList.forEach((u: string) => { try { URL.revokeObjectURL(u); } catch {} }); } catch {}
      }
    } catch {}
    setTimeout(resolve, 0);
  }));

  await promiseAllWithTimeout(tasks, 3500);
}

/**
 * Idempotent sign-out: single-flight Promise ensures multiple callers wait
 * for the same in-progress flow and do not cause duplicate redirects.
 */
export async function signOutAndRedirect(redirectTo = "/"): Promise<void> {
  if (typeof window === "undefined") return;

  // if an in-memory signout flow already running, await it
  if (signOutInProgressPromise) {
    try { await signOutInProgressPromise; } catch {}
    return;
  }

  // create single-flight promise
  signOutInProgressPromise = (async () => {
    try {
      try { localStorage.setItem(SIGNOUT_FLAG, "1"); } catch {}
      // server sign-out (best-effort)
      try {
        if (supabase && supabase.auth && typeof (supabase.auth as any).signOut === "function") {
          await (supabase.auth as any).signOut();
        }
      } catch {
        // ignore server-side error
      }

      // client cleanup
      await ensureClientCleanup();
    } finally {
      // redirect once (owner of this flow)
      try { window.location.replace(redirectTo); } catch { try { window.location.href = redirectTo; } catch {} }
    }
  })();

  try {
    await signOutInProgressPromise;
  } finally {
    signOutInProgressPromise = null;
    // We intentionally leave SIGNOUT_FLAG for the app init to remove when unauthenticated is confirmed.
  }
}

/**
 * Attach a single auth state change listener (Supabase v1/v2 compatible).
 * Returns an unsubscribe function.
 */
export function setAuthStateChangeListener(handler: (event: string, session: any) => void): () => void {
  try {
    if (!supabase || !supabase.auth) return () => {};

    // Supabase onAuthStateChange v1/v2 compatibility
    const maybe = (supabase.auth as any).onAuthStateChange
      ? (supabase.auth as any).onAuthStateChange((event: string, session: any) => {
          try { handler(event, session); } catch (e) { console.warn("auth handler error", e); }
        })
      : null;

    if (!maybe) return () => {};

    // shape differences
    if ((maybe as any)?.data?.subscription) {
      return () => { try { (maybe as any).data.subscription.unsubscribe(); } catch {} };
    }
    if ((maybe as any)?.unsubscribe) {
      return () => { try { (maybe as any).unsubscribe(); } catch {} };
    }
  } catch (e) {
    console.warn("Failed to attach auth listener", e);
  }
  return () => {};
}
