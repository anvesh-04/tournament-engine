import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  fetchMe,
  getStoredToken,
  setStoredToken,
  setUnauthorizedHandler,
} from "./api.js";

const AuthContext = createContext(null);

/**
 * Holds the signed-in user for the whole app.
 *
 * The stored token is treated as a hint, not as proof: on boot we always ask
 * the server who we are. That way a token whose account was deleted, demoted
 * or reassigned resolves to the truth rather than to whatever the client
 * happened to cache.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    // Any 401 from a protected endpoint means this session is over.
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!getStoredToken()) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((data) => setUser(data.user))
      .catch(() => setStoredToken(null))
      .finally(() => setLoading(false));
  }, []);

  /** Called by the login and register pages with the server's response. */
  const signIn = useCallback(({ token, user: signedInUser }) => {
    setStoredToken(token);
    setUser(signedInUser);
  }, []);

  const value = {
    user,
    loading,
    signIn,
    signOut,
    setUser,
    isAdmin: !!user && (user.role === "super-admin" || user.role === "sport-admin"),
    isSuperAdmin: user?.role === "super-admin",
    isPlayer: user?.role === "player",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

/**
 * Gates a route.
 *
 * `roles` limits it further to specific roles. A signed-in user who lacks the
 * role is sent to their own home rather than to the login page — they are
 * authenticated, just not authorised, and bouncing them to a login form they
 * have already completed is confusing.
 *
 * This is a usability guard, not a security boundary: every protected
 * endpoint re-checks the role server-side.
 */
export function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="empty-state">Checking your session...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
