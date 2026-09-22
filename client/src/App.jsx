import React from "react";
import { Routes, Route, Link, NavLink, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import CreateTournamentPage from "./pages/CreateTournamentPage.jsx";
import TournamentDashboard from "./pages/TournamentDashboard.jsx";
import StandingsPage from "./pages/StandingsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import PlayerDashboard from "./pages/PlayerDashboard.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import SportsPage from "./pages/SportsPage.jsx";
import CommandConsolePage from "./pages/CommandConsolePage.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import { useAuth, RequireAuth } from "./auth.jsx";

const ADMIN_ROLES = ["super-admin", "sport-admin"];

const ROLE_LABEL = {
  "super-admin": "Super admin",
  "sport-admin": "Sport admin",
  player: "Player",
};

export default function App() {
  const { user, loading, signOut, isAdmin, isSuperAdmin } = useAuth();

  return (
    <div className="app-shell">
      {/* Keyboard users can jump the nav rather than tabbing it on every page. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="top-bar">
        <Link to="/" className="brand-link">
          <div className="brand">
            Fixture<span>Engine</span>
          </div>
        </Link>

        {isAdmin && (
          <nav className="main-nav" aria-label="Main">
            <NavLink to="/">Tournaments</NavLink>
            {isSuperAdmin && <NavLink to="/sports">Sports</NavLink>}
            <NavLink to="/teams">Teams</NavLink>
            <NavLink to="/console">Console</NavLink>
          </nav>
        )}

        <div className="top-bar-actions">
          {user && <NotificationBell />}
          {isAdmin && (
            <Link to="/new">
              <button className="primary">
                + New<span className="hide-sm"> Tournament</span>
              </button>
            </Link>
          )}
          {user ? (
            <div className="user-chip">
              <span className="user-name">{user.name}</span>
              <span className="role-pill">{ROLE_LABEL[user.role]}</span>
              <button className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            !loading && (
              <Link to="/login">
                <button className="secondary">Sign in</button>
              </Link>
            )
          )}
        </div>
      </header>

      <main id="main">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />

        {/* Home is role-dependent: admins get the tournament list, players get
            their own fixtures. */}
        <Route path="/" element={<Home />} />

        <Route
          path="/new"
          element={
            <RequireAuth roles={ADMIN_ROLES}>
              <CreateTournamentPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sports"
          element={
            <RequireAuth roles={["super-admin"]}>
              <SportsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/teams"
          element={
            <RequireAuth roles={ADMIN_ROLES}>
              <TeamsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/console"
          element={
            <RequireAuth roles={ADMIN_ROLES}>
              <CommandConsolePage />
            </RequireAuth>
          }
        />

        <Route path="/tournament/:id" element={<TournamentDashboard />} />
        <Route path="/tournament/:id/standings" element={<StandingsPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </main>
    </div>
  );
}

/**
 * Signed-out visitors still see the public tournament list, which is how the
 * app worked before accounts existed and remains true: fixtures are public.
 */
function Home() {
  const { user, loading } = useAuth();

  if (loading) return <div className="empty-state">Loading...</div>;
  if (user?.role === "player") return <PlayerDashboard />;
  return <HomePage />;
}
