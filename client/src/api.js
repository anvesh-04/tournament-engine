import axios from "axios";

// In development, this falls back to "/api" which Vite proxies to localhost:5000.
// In production, set VITE_API_URL (e.g. in Vercel's environment variables) to
// your deployed backend's URL, e.g. https://your-backend.onrender.com/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

export const createTournament = (payload) =>
  api.post("/tournaments", payload).then((r) => r.data);

export const listTournaments = () =>
  api.get("/tournaments").then((r) => r.data);

export const getTournament = (id) =>
  api.get(`/tournaments/${id}`).then((r) => r.data);

export const generateFixtures = (id) =>
  api.post(`/tournaments/${id}/generate-fixtures`).then((r) => r.data);

export const updateMatch = (tournamentId, matchRefId, payload) =>
  api.patch(`/tournaments/${tournamentId}/matches/${matchRefId}`, payload).then((r) => r.data);

export default api;
