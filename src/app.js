const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
require("dotenv").config();

const { connectDB } = require("./config/mongodb");

const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const gateRoutes = require("./routes/gateRoutes");
const hardwareRoutes = require("./routes/hardwareRoutes");

// ✅ Connect DB (will run on cold start)
connectDB();

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/gate", gateRoutes);
app.use("/api/hardware", hardwareRoutes);

// Legacy route
app.post(
  "/validate",
  require("./controllers/hardwareController").validateQR
);

// Health check
app.get("/", (req, res) => {
  res.send("✅ FocusDesk Backend Running on Vercel");
});

app.get("/test", (req, res) => {
  res.send("Test route working");
});

// ✅ Export serverless handler (IMPORTANT)
module.exports = serverless(app);