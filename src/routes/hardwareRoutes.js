const express = require("express");
const router = express.Router();

const { provisionTokens, syncBatch, validateQR } = require("../controllers/hardwareController");

// ✅ Machine boots and requests its token pool (50 tokens)
router.get("/tokens/:machineId", provisionTokens);

// ✅ Machine syncs used tokens and gets 25 fresh ones
router.post("/sync/:machineId", syncBatch);

// ✅ Online QR validation fallback (existing, kept for compat)
router.post("/validate", validateQR);

module.exports = router;
