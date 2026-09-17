import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { supabase } from "../services/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch profile and verify role from public.users table
  const fetchUserProfile = async (authUser) => {
    if (!authUser) {
      setUser(null);
      setProfile(null);
      setRole(null);
      return null;
    }

    try {
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", authUser.id)
        .single();

      if (profileError || !profileData || !profileData.role) {
        console.error("Failed to load user profile or missing role:", profileError);
        // Default-deny: do not set an unverified role
        setUser(null);
        setProfile(null);
        setRole(null);
        return null;
      }

      const normalizedRole = profileData.role.toLowerCase().trim();
      setUser(authUser);
      setProfile(profileData);
      setRole(normalizedRole);
      return { ...profileData, role: normalizedRole };
    } catch (err) {
      console.error("Unexpected error fetching profile:", err);
      setUser(null);
      setProfile(null);
      setRole(null);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          if (isMounted) {
            setUser(null);
            setProfile(null);
            setRole(null);
            setLoading(false);
          }
          return;
        }

        if (isMounted) {
          await fetchUserProfile(session.user);
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (isMounted) {
          await fetchUserProfile(session.user);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signOut error:", err);
    } finally {
      // Clear localStorage tokens as safeguard against network failure during signOut
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
          localStorage.removeItem(key);
        }
      }
      setUser(null);
      setProfile(null);
      setRole(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      loading,
      fetchUserProfile,
      signOut,
    }),
    [user, profile, role, loading]
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
