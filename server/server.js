require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const tournamentRoutes = require("./routes/tournaments");
const authRoutes = require("./routes/auth");
const sportRoutes = require("./routes/sports");
const teamRoutes = require("./routes/teams");
const meRoutes = require("./routes/me");
const userRoutes = require("./routes/users");
const adminCommandRoutes = require("./routes/adminCommand");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/sports", sportRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/me", meRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/admin", adminCommandRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/tournament-engine";

/**
 * Fail fast on missing auth configuration.
 * Every protected route signs or verifies a JWT, so a server started without
 * JWT_SECRET would accept requests and then 500 on the first login. Refusing
 * to boot makes the misconfiguration obvious at deploy time instead.
 */
if (!process.env.JWT_SECRET) {
  console.error(
    "JWT_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and add it to server/.env."
  );
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

module.exports = app;
