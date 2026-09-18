import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import {
  fetchCurrentUser,
  getSession,
  onAuthStateChange,
  signOut as apiSignOut,
} from "../services/auth";

const AuthContext = createContext(null);

const normalizeRole = (role) =>
  typeof role === "string" && role.trim() ? role.toLowerCase().trim() : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

  // The API returns the profile (id, name, email, role, ...) with the session,
  // so "user" and "profile" are the same MongoDB document.
  const applyUser = useCallback(
    (nextUser) => {
      const normalizedRole = normalizeRole(nextUser?.role);
      if (!nextUser || !normalizedRole) {
        // Default-deny: do not set an unverified role
        clearState();
        return null;
      }
      const verified = { ...nextUser, role: normalizedRole };
      setUser(verified);
      setProfile(verified);
      setRole(normalizedRole);
      return verified;
    },
    [clearState]
  );

  // Re-fetch the profile from the API and verify the role
  const fetchUserProfile = useCallback(async () => {
    try {
      const latest = await fetchCurrentUser();
      if (!latest) {
        clearState();
        return null;
      }
      return applyUser(latest);
    } catch (err) {
      console.error("Failed to load user profile:", err);
      // A network error should not sign the user out; keep the cached profile.
      const cached = getSession()?.user;
      return cached ? applyUser(cached) : (clearState(), null);
    }
  }, [applyUser, clearState]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const session = getSession();

        if (!session?.access_token) {
          if (isMounted) {
            clearState();
            setLoading(false);
          }
          return;
        }

        // Show the cached profile immediately, then confirm it with the API.
        if (isMounted) applyUser(session.user);
        await fetchUserProfile();
      } catch (err) {
        console.error("Auth initialization error:", err);
        if (isMounted) clearState();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    // Listen for session changes (login, refresh, logout, other tabs)
    const unsubscribe = onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT" || !session?.access_token) {
        clearState();
        setLoading(false);
      } else {
        applyUser(session.user);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applyUser, clearState, fetchUserProfile]);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
    } catch (err) {
      console.error("signOut error:", err);
    } finally {
      clearState();
    }
  }, [clearState]);

  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      loading,
      fetchUserProfile,
      signOut,
    }),
    [user, profile, role, loading, fetchUserProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
