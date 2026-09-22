import axios from "axios";

// In development, this falls back to "/api" which Vite proxies to localhost:5000.
// In production, set VITE_API_URL (e.g. in Vercel's environment variables) to
// your deployed backend's URL, e.g. https://your-backend.onrender.com/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

const TOKEN_KEY = "fixture-engine-token";

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing or blocked storage: the session simply won't persist
    // across reloads, which is a degraded experience rather than a broken one.
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* see getStoredToken */
  }
}

// Attach the bearer token to every request rather than threading it through
// each call site, so a new endpoint cannot accidentally be left unauthenticated.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Called when the server rejects our token. Set by the auth provider so an
 * expired or revoked session clears itself instead of leaving the UI showing
 * a signed-in shell that fails every request.
 */
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !isAuthCall && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

/** Pulls the server's error message out of an axios failure. */
export function errorMessage(err) {
  return err?.response?.data?.error || err?.message || "Something went wrong.";
}

// --- Auth ---------------------------------------------------------------

export const register = (payload) =>
  api.post("/auth/register", payload).then((r) => r.data);

export const login = (payload) => api.post("/auth/login", payload).then((r) => r.data);

export const fetchMe = () => api.get("/auth/me").then((r) => r.data);

/** Whether the database has no accounts yet (this sign-up becomes super-admin). */
export const getBootstrapStatus = () =>
  api.get("/auth/bootstrap-status").then((r) => r.data);

export const changePassword = (payload) =>
  api.post("/auth/change-password", payload).then((r) => r.data);

// --- Sports & teams -----------------------------------------------------

export const listSports = () => api.get("/sports").then((r) => r.data);

export const createSport = (payload) => api.post("/sports", payload).then((r) => r.data);

export const updateSport = (id, payload) =>
  api.patch(`/sports/${id}`, payload).then((r) => r.data);

/** Invites someone with no account yet and makes them the sport admin. */
export const inviteSportAdmin = (sportId, payload) =>
  api.post(`/sports/${sportId}/admin`, payload).then((r) => r.data);

/** Super-admin only: the account directory, used by the admin picker. */
export const listUsers = (params) =>
  api.get("/users", { params }).then((r) => r.data);

export const listTeams = () => api.get("/teams").then((r) => r.data);

export const createTeam = (payload) => api.post("/teams", payload).then((r) => r.data);

export const invitePlayer = (teamId, payload) =>
  api.post(`/teams/${teamId}/players`, payload).then((r) => r.data);

export const removePlayer = (teamId, userId) =>
  api.delete(`/teams/${teamId}/players/${userId}`).then((r) => r.data);

// --- Tournaments --------------------------------------------------------

export const createTournament = (payload) =>
  api.post("/tournaments", payload).then((r) => r.data);

export const listTournaments = () => api.get("/tournaments").then((r) => r.data);

export const getTournament = (id) => api.get(`/tournaments/${id}`).then((r) => r.data);

export const generateFixtures = (id) =>
  api.post(`/tournaments/${id}/generate-fixtures`).then((r) => r.data);

export const getStandings = (id) =>
  api.get(`/tournaments/${id}/standings`).then((r) => r.data);

export const deleteTournament = (id) =>
  api.delete(`/tournaments/${id}`).then((r) => r.data);

export const updateMatch = (tournamentId, matchRefId, payload) =>
  api.patch(`/tournaments/${tournamentId}/matches/${matchRefId}`, payload).then((r) => r.data);

// --- Player self-service ------------------------------------------------

export const getMyMatches = () => api.get("/me/matches").then((r) => r.data);

export const getMyNotifications = () => api.get("/me/notifications").then((r) => r.data);

export const markNotificationsRead = (ids) =>
  api.post("/me/notifications/read", { ids }).then((r) => r.data);

// --- AI admin commands --------------------------------------------------

export const getCommandActions = () =>
  api.get("/admin/command/actions").then((r) => r.data);

/** Returns a preview. Applies nothing. */
export const previewCommand = (text) =>
  api.post("/admin/command", { text }).then((r) => r.data);

/** Applies a previously previewed command. */
export const confirmCommand = ({ action, issuedAt, signature }) =>
  api.post("/admin/command/confirm", { action, issuedAt, signature }).then((r) => r.data);

export default api;
