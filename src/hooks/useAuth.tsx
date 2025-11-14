// src/hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext, ReactNode, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SIGNOUT_FLAG, signOutAndRedirect, setAuthStateChangeListener } from "@/lib/auth";

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

  const clearAuthState = () => {
    setUser(null);
    setSession(null);
    setUserRole(null);
  };

  const signOut = async () => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    clearAuthState();
    try {
      await signOutAndRedirect("/");
    } catch (e) {
      console.error("signOut failed", e);
      try { window.location.replace("/"); } catch { window.location.href = "/"; }
    }
  };

  useEffect(() => {
    const isSignoutInProgress = () => {
      try { return localStorage.getItem(SIGNOUT_FLAG) === "1"; } catch { return false; }
    };

    const unsubscribe = setAuthStateChangeListener((event, s) => {
      try {
        if (event === "SIGNED_OUT") {
          if (isSignoutInProgress()) {
            // Centralized signout is running — don't redirect here, just clear local state
            clearAuthState();
            return;
          }
          // Not centralized -> clean and redirect
          try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
          clearAuthState();
          if (!isRedirecting.current) {
            isRedirecting.current = true;
            try { window.location.replace("/"); } catch { window.location.href = "/"; }
          }
          return;
        }

        // If session becomes null after init treat as signed out
        if (!s && isInitialized.current) {
          if (isSignoutInProgress()) {
            clearAuthState();
            return;
          }
          try { localStorage.removeItem(SIGNOUT_FLAG); } catch {}
          clearAuthState();
          if (!isRedirecting.current) {
            isRedirecting.current = true;
            try { window.location.replace("/"); } catch { window.location.href = "/"; }
          }
          return;
        }

        // On sign-in or token refresh, set user & session
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

    // initial session restore
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        isInitialized.current = true;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AuthContext.Provider value={{ user, session, userRole, loading, signOut }}>{children}</AuthContext.Provider>;
};
