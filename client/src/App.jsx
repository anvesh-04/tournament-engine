import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import CreateTournamentPage from "./pages/CreateTournamentPage.jsx";
import TournamentDashboard from "./pages/TournamentDashboard.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <div className="top-bar">
        <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand">
            Fixture<span>Engine</span>
          </div>
        </Link>
        <Link to="/new">
          <button className="primary">+ New Tournament</button>
        </Link>
      </div>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<CreateTournamentPage />} />
        <Route path="/tournament/:id" element={<TournamentDashboard />} />
      </Routes>
    </div>
  );
}
