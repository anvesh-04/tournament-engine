require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const tournamentRoutes = require("./routes/tournaments");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/tournaments", tournamentRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/tournament-engine";

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
