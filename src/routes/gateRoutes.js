const express = require("express");
const router = express.Router();

const { verifyQR } = require("../controllers/gateController");
const gateAuth = require("../middleware/gateAuth");

/**
 * ✅ Gate Verification API
 */
router.post("/verify", gateAuth, verifyQR);
router.get("/verify", (req, res) => {
  res.send("✅ Gate Verify Endpoint Live (POST only)");
});

module.exports = router;
