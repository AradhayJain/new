const express = require("express");
const cors = require("cors");

const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const gateRoutes = require("./routes/gateRoutes");
const hardwareRoutes = require("./routes/hardwareRoutes");

const app = express();

app.use(cors({
  origin: "*",
}));


// ✅ Parse JSON properly (ESP32 + Postman + Render safe)
app.use(express.json({ limit: "1mb" }));

// ✅ Parse urlencoded (extra safety)
app.use(express.urlencoded({ extended: true }));


// Routes
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/gate", gateRoutes);

// ✅ Hardware endpoint
app.get("/", (req, res) => {
  res.send("✅ FocusDesk Backend Running");
});

app.use("/", hardwareRoutes);

module.exports = app;
