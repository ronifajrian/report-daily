// src/hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext, ReactNode, useRef, useCallback, useMemo } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  SIGNOUT_FLAG, 
  signOutAndRedirect, 
  setAuthStateChangeListener,
  shouldBlockAuthOperations 
} from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userRole: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isInitialized = useRef(false);
  const isRedirecting = useRef(false);
  const lastSessionCheck = useRef<number>(0);

  const clearAuthState = useCallback(() => {
    setUser(null);
    setSession(null);
    setUserRole(null);
  }, []); // Dependency kosong = fungsi ini SANGAT stabil

  const signOut = useCallback(async () => {
    if (isRedirecting.current || shouldBlockAuthOperations()) return;
    isRedirecting.current = true;
    clearAuthState(); // Panggil versi yang stabil
    try {
      await signOutAndRedirect("/");
    } catch (e) {
      console.error("signOut failed", e);
      try { window.location.replace("/"); } catch { window.location.href = "/"; }
    }
  }, [clearAuthState]); // Tambahkan dependency stabil

  // Listen for storage events (cross-tab sign out)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Sign out complete in another tab
      if (e.key === 'app:signout_complete') {
        console.log('[AUTH] Detected sign out in another tab');
        clearAuthState();
        if (!isRedirecting.current) {
          isRedirecting.current = true;
          try { window.location.replace("/"); } catch { window.location.href = "/"; }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [clearAuthState]);

  useEffect(() => {
    const isSignoutInProgress = () => {
      try { return localStorage.getItem(SIGNOUT_FLAG) === "1"; } catch { return false; }
    };

    const unsubscribe = setAuthStateChangeListener((event, s) => {
      try {
        // Handle signed out event
        if (event === "SIGNED_OUT") {
          if (isSignoutInProgress()) {
            clearAuthState();
            return;
          }
          try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
          clearAuthState();
          if (!isRedirecting.current && !shouldBlockAuthOperations()) {
            isRedirecting.current = true;
            try { window.location.replace("/"); } catch { window.location.href = "/"; }
          }
          return;
        }

        // Handle session loss after initialization
        if (!s && isInitialized.current) {
          // Debounce session checks to prevent rapid redirects
          const now = Date.now();
          if (now - lastSessionCheck.current < 1000) {
            return; // Skip if checked less than 1 second ago
          }
          lastSessionCheck.current = now;

          if (isSignoutInProgress()) {
            clearAuthState();
            return;
          }
          try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
          clearAuthState();
          if (!isRedirecting.current && !shouldBlockAuthOperations()) {
            isRedirecting.current = true;
            try { window.location.replace("/"); } catch { window.location.href = "/"; }
          }
          return;
        }

        // Handle sign in or token refresh
        if (s?.user) {
          isRedirecting.current = false;
          setSession(s);
          setUser(s.user);

          (async () => {
            try {
              const { data, error } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", s.user.id)
                .single();
              if (!error && data) setUserRole(data.role);
            } catch (e) {
              console.warn("failed to fetch user role", e);
            } finally {
              setLoading(false);
            }
          })();
        }
      } catch (e) {
        console.warn("auth state change handler error", e);
      }
    });

    // Initial session restore
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        isInitialized.current = true;
        lastSessionCheck.current = Date.now();
        
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          (async () => {
            try {
              const { data, error } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", session.user.id)
                .single();
              if (!error && data) setUserRole(data.role);
            } catch (e) {
              console.warn("failed to fetch user role", e);
            } finally {
              setLoading(false);
            }
          })();
        } else {
          try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
          clearAuthState();
          setLoading(false);
        }
      })
      .catch((e) => {
        console.warn("getSession error", e);
        try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
        clearAuthState();
        setLoading(false);
      });

    return () => {
      try { unsubscribe && unsubscribe(); } catch {}
    };
  }, [clearAuthState]);

  const value = useMemo(() => ({
    user,
    session,
    userRole,
    loading,
    signOut
  }), [user, session, userRole, loading, signOut]); // Dependency adalah nilai-nilai itu sendiri

  return (
    <AuthContext.Provider value={ value }>
      {children}
    </AuthContext.Provider>
  );
};