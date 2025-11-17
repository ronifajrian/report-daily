// src/lib/auth.ts
import { supabase } from "@/integrations/supabase/client";

/**
 * IMPROVED: Cross-device auth dengan circuit breaker pattern
 */

export const SIGNOUT_FLAG = "app:signout_in_progress";
const SIGNOUT_COMPLETE_FLAG = "app:signout_complete";
const AUTH_ERROR_FLAG = "app:auth_error";

// Circuit breaker untuk prevent infinite loops
let authErrorCount = 0;
const MAX_AUTH_ERRORS = 3;
const AUTH_ERROR_RESET_MS = 5000;
let authErrorTimer: NodeJS.Timeout | null = null;

let signOutInProgressPromise: Promise<void> | null = null;

/** Reset auth error counter after timeout */
function resetAuthErrorCounter() {
  if (authErrorTimer) clearTimeout(authErrorTimer);
  authErrorTimer = setTimeout(() => {
    authErrorCount = 0;
  }, AUTH_ERROR_RESET_MS);
}

/** Check if too many auth errors (circuit breaker) */
export function shouldBlockAuthOperations(): boolean {
  return authErrorCount >= MAX_AUTH_ERRORS;
}

/** Increment auth error with circuit breaker */
export function incrementAuthError() {
  authErrorCount++;
  resetAuthErrorCounter();
  
  if (authErrorCount >= MAX_AUTH_ERRORS) {
    console.warn('[AUTH] Circuit breaker activated - too many auth errors');
    try {
      localStorage.setItem(AUTH_ERROR_FLAG, Date.now().toString());
    } catch {}
  }
}

/** Clear all auth flags and state */
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
      if (k === SIGNOUT_FLAG || k === SIGNOUT_COMPLETE_FLAG || k === AUTH_ERROR_FLAG) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
  } catch (e) {
    // ignore localStorage access errors
  }
}

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

async function ensureClientCleanup(): Promise<void> {
  if (typeof window === "undefined") return;
  const tasks: Promise<void>[] = [];

  // localStorage clear
  tasks.push(new Promise((resolve) => { 
    try { clearSupabaseLocalStorage(); } catch {} 
    setTimeout(resolve, 0); 
  }));

  // revoke cached object URLs
  tasks.push(new Promise((resolve) => {
    try {
      const maybeFn = (globalThis as any).revokeAllCachedObjectUrls || 
                      (typeof (window as any).revokeAllCachedObjectUrls === "function" ? 
                       (window as any).revokeAllCachedObjectUrls : null);
      if (typeof maybeFn === "function") {
        try { (maybeFn as any)(); } catch {}
      }
    } catch {}
    setTimeout(resolve, 0);
  }));

  // delete IndexedDB
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

  await promiseAllWithTimeout(tasks, 3500);
}

/**
 * IMPROVED: Single-flight sign out with cross-tab coordination
 */
export async function signOutAndRedirect(redirectTo = "/"): Promise<void> {
  if (typeof window === "undefined") return;

  // Check circuit breaker
  if (shouldBlockAuthOperations()) {
    console.warn('[AUTH] Blocked by circuit breaker, forcing redirect');
    try { window.location.replace(redirectTo); } catch { window.location.href = redirectTo; }
    return;
  }

  // Check if already complete in another tab
  try {
    const completeFlag = localStorage.getItem(SIGNOUT_COMPLETE_FLAG);
    if (completeFlag) {
      const timestamp = parseInt(completeFlag);
      if (Date.now() - timestamp < 5000) { // 5 second window
        console.log('[AUTH] Sign out already completed in another tab');
        try { window.location.replace(redirectTo); } catch { window.location.href = redirectTo; }
        return;
      }
    }
  } catch {}

  // If already in progress, wait for it
  if (signOutInProgressPromise) {
    try { await signOutInProgressPromise; } catch {}
    return;
  }

  // Create single-flight promise
  signOutInProgressPromise = (async () => {
    try {
      // Set in-progress flag
      try { localStorage.setItem(SIGNOUT_FLAG, "1"); } catch {}
      
      // Server sign-out with timeout
      try {
        if (supabase && supabase.auth && typeof (supabase.auth as any).signOut === "function") {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Sign out timeout')), 3000)
          );
          await Promise.race([
            (supabase.auth as any).signOut(),
            timeoutPromise
          ]).catch(err => {
            console.warn('[AUTH] Sign out error (continuing cleanup):', err);
          });
        }
      } catch (err) {
        console.warn('[AUTH] Sign out exception (continuing cleanup):', err);
      }

      // Client cleanup
      await ensureClientCleanup();

      // Mark as complete for other tabs
      try {
        localStorage.removeItem(SIGNOUT_FLAG);
        localStorage.setItem(SIGNOUT_COMPLETE_FLAG, Date.now().toString());
      } catch {}

      // Reset circuit breaker
      authErrorCount = 0;
      
    } finally {
      // Redirect once
      try { window.location.replace(redirectTo); } catch { try { window.location.href = redirectTo; } catch {} }
    }
  })();

  try {
    await signOutInProgressPromise;
  } finally {
    signOutInProgressPromise = null;
  }
}

/**
 * IMPROVED: Auth state listener with better error handling
 */
export function setAuthStateChangeListener(handler: (event: string, session: any) => void): () => void {
  try {
    if (!supabase || !supabase.auth) return () => {};

    // const wrappedHandler = (event: string, session: any) => {
    //   try {
    //     // Detect cross-tab sign out
    //     if (event === "SIGNED_OUT") {
    //       try {
    //         const completeFlag = localStorage.getItem(SIGNOUT_COMPLETE_FLAG);
    //         if (completeFlag) {
    //           const timestamp = parseInt(completeFlag);
    //           if (Date.now() - timestamp < 5000) {
    //             console.log('[AUTH] Detected cross-tab sign out');
    //             try { window.location.replace("/"); } catch { window.location.href = "/"; }
    //             return;
    //           }
    //         }
    //       } catch {}
    //     }
        
    //     handler(event, session);
    //   } catch (e) {
    //     console.warn('[AUTH] Handler error:', e);
    //   }
    // };

    const maybe = (supabase.auth as any).onAuthStateChange
      ? (supabase.auth as any).onAuthStateChange(handler)
      : null;

    if (!maybe) return () => {};

    if ((maybe as any)?.data?.subscription) {
      return () => { try { (maybe as any).data.subscription.unsubscribe(); } catch {} };
    }
    if ((maybe as any)?.unsubscribe) {
      return () => { try { (maybe as any).unsubscribe(); } catch {} };
    }
  } catch (e) {
    console.warn('[AUTH] Failed to attach listener', e);
  }
  return () => {};
}

/**
 * IMPROVED: Check if user is authenticated (with circuit breaker)
 */
export async function isAuthenticated(): Promise<boolean> {
  if (shouldBlockAuthOperations()) {
    return false;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session?.access_token;
  } catch {
    incrementAuthError();
    return false;
  }
}