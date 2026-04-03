const jwt = require("jsonwebtoken");
const QRPass = require("../models/QRPass"); // Adjust extension if needed
const ScanLog = require("../models/ScanLog");
const MachineToken = require("../models/MachineToken");
const AccessRequest = require("../models/AccessRequest");
const { updateUserActivity, checkAbusePattern } = require("../services/activityService");
const { checkRestriction, recordScanAttempt, applyRestriction } = require("../services/qrRotationService");

const verifyQR = async (req, res) => {
  try {
    const body = req.body || {};
    const { qrData, qrToken, gateId } = body;

    if (!gateId) {
      return res.status(400).json({
        status: "DENY",
        message: "gateId required",
        state: null,
      });
    }

    let tokenId, state, idNumber, requestId, passType, validFrom, validUntil;
    let request, token;

    // -------------------------------------------------------------
    // 1. PARSE PAYLOAD (Handle both New Offline & Old JWT formats)
    // -------------------------------------------------------------
    if (qrData) {
      // NEW FORMAT: "tokenId|state|idNumber"
      const parts = qrData.split("|");
      if (parts.length !== 3) {
        return res.status(400).json({
          status: "DENY",
          message: "Invalid QR format",
          state: null,
        });
      }
      [tokenId, state, idNumber] = parts;
      passType = state;
    } else if (qrToken) {
      // OLD FORMAT: JWT
      let decoded;
      try {
        decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
      } catch (err) {
        return res.json({
          status: "DENY",
          message: "INVALID_SIGNATURE",
          state: null,
        });
      }
      const { tId, rId, pTy, vF, vU } = decoded;
      tokenId = tId || decoded.tokenId;
      requestId = rId || decoded.requestId;
      passType = pTy !== undefined ? (pTy === 1 ? "IN" : "OUT") : decoded.passType;
      validFrom = vF ? new Date(vF * 1000) : decoded.validFrom;
      validUntil = vU ? new Date(vU * 1000) : decoded.validUntil;
      
      if (!tokenId || !requestId || !passType) {
        return res.json({
          status: "DENY",
          message: "INVALID_QR_PAYLOAD",
          state: null,
        });
      }
    } else {
      return res.status(400).json({
        status: "DENY",
        message: "qrData or qrToken required",
        state: null,
      });
    }

    const now = new Date();

    // -------------------------------------------------------------
    // 2. VALIDATE TOKEN & FETCH USER
    // -------------------------------------------------------------
    if (qrData) {
      // Validate New Token
      token = await MachineToken.findOne({ tokenId });
      
      // Prevent double scanning or using unassigned tokens
      if (!token || token.status !== "ALLOCATED") {
        await ScanLog.create({
          tokenId,
          passType: state,
          gateId,
          result: "DENY",
          reason: token ? `TOKEN_IS_${token.status}` : "TOKEN_NOT_FOUND",
        });
        return res.json({
          status: "DENY",
          message: "TOKEN_NOT_VALID",
          state: null,
        });
      }
      
      request = await AccessRequest.findOne({ idNumber });
      if (!request) return res.json({ status: "DENY", message: "USER_NOT_FOUND", state: null });
      
      validFrom = request.validFrom;
      validUntil = request.validUntil;
      requestId = request._id;
      
    } else {
      // Validate Old JWT Token
      const qrPass = await QRPass.findOne({ tokenId, passType });
      if (!qrPass) {
        await ScanLog.create({
          requestId,
          tokenId,
          passType,
          gateId,
          result: "DENY",
          reason: "PASS_NOT_FOUND",
        });
        return res.json({ status: "DENY", message: "PASS_NOT_FOUND", state: null });
      }
      
      request = await AccessRequest.findById(requestId);
      if (!request) return res.json({ status: "DENY", message: "USER_NOT_FOUND", state: null });
    }

    // -------------------------------------------------------------
    // 3. ACCESS RULES & TIMING CHECKS
    // -------------------------------------------------------------
    if (request.status !== "APPROVED") {
      return res.json({ status: "DENY", message: "NOT_APPROVED", state: request.currentState });
    }

    if (validFrom && now < new Date(validFrom)) {
      return res.json({ status: "DENY", message: "PASS_NOT_STARTED_YET", state: request.currentState });
    }
    if (validUntil && now > new Date(validUntil)) {
      return res.json({ status: "DENY", message: "PASS_EXPIRED", state: request.currentState });
    }

    // Restriction checks
    const restrictionCheck = await checkRestriction(requestId);
    if (restrictionCheck.isRestricted) {
      await ScanLog.create({
        requestId,
        tokenId,
        passType,
        gateId,
        result: "DENY",
        reason: "USER_RESTRICTED",
      });
      return res.json({
        status: "DENY",
        message: "USER_RESTRICTED",
        restrictionUntil: restrictionCheck.until,
        state: request.currentState,
      });
    }

    // Throttle checks
    const scanAttempt = await recordScanAttempt(requestId);
    if (scanAttempt.shouldRestrict) {
      await ScanLog.create({
        requestId,
        tokenId,
        passType,
        gateId,
        result: "DENY",
        reason: "TOO_MANY_ATTEMPTS",
      });
      return res.json({ status: "DENY", message: "TOO_MANY_ATTEMPTS", state: request.currentState });
    }

    // State machine check
    if (passType === "IN" && request.currentState === "INSIDE") {
      return res.json({ status: "DENY", message: "ALREADY_INSIDE", state: request.currentState });
    }
    if (passType === "OUT" && request.currentState === "OUTSIDE") {
      return res.json({ status: "DENY", message: "ALREADY_OUTSIDE", state: request.currentState });
    }

    // -------------------------------------------------------------
    // 4. EXECUTE ACCESS (Update State, Token, & Logs)
    // -------------------------------------------------------------
    
    // Update Request State
    request.currentState = passType === "IN" ? "INSIDE" : "OUTSIDE";
    await request.save();

    // Mark MachineToken as USED instantly
    if (qrData && token) {
      token.status = "USED";
      token.usedAt = now;
      await token.save();
    }

    // Generate accurate log
    await ScanLog.create({
      requestId,
      tokenId,
      passType,
      gateId,
      machineId: token?.machineId || gateId, 
      result: "ALLOW",
      reason: "Online real-time validation"
    });

    // -------------------------------------------------------------
    // 5. POST-SCAN ANALYTICS
    // -------------------------------------------------------------
    await updateUserActivity(requestId, passType);
    const abuseCheck = await checkAbusePattern(requestId);
    if (abuseCheck.isAbuse) {
      await applyRestriction(requestId);
    }

    return res.json({
      status: "ALLOW",
      message: passType === "IN" ? "ENTRY_GRANTED" : "EXIT_GRANTED",
      state: request.currentState,
      warning: abuseCheck.isAbuse ? "ABUSE_DETECTED" : null,
    });
    
  } catch (err) {
    console.log("VERIFY ERROR:", err.message);
    return res.status(500).json({
      status: "DENY",
      error: err.message,
      state: null,
    });
  }
};

module.exports = { verifyQR };