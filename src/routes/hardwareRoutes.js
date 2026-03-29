const express = require("express");
const router = express.Router();

const { validateHardwareQR } = require("../controllers/hardwareController");

router.post("/validate", validateHardwareQR);

module.exports = router;
