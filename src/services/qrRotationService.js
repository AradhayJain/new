const QRRotation = require("../models/QRRotation");
const AccessRequest = require("../models/AccessRequest");
const { getRestrictionDuration } = require("./settingsService");

/**
 * Get active QR type based on user's current state (NOT time-based)
 */
const getActiveQRType = async (requestId) => {
  try {
    const request = await AccessRequest.findById(requestId);
    if (!request) {
      throw new Error("User not found");
    }

    // ✅ QR type is based on current state, not time
    // If user is OUTSIDE, show IN QR
    // If user is INSIDE, show OUT QR
    const activeQRType = request.currentState === "OUTSIDE" ? "IN" : "OUT";

    let rotation = await QRRotation.findOne({ requestId });

    if (!rotation) {
      // Create initial rotation
      rotation = await QRRotation.create({
        requestId,
        activeQRType: activeQRType,
        rotationTimestamp: new Date(),
      });
    } else {
      // Update active QR type based on current state
      rotation.activeQRType = activeQRType;
      rotation.rotationTimestamp = new Date();
      await rotation.save();
    }

    return rotation;
  } catch (err) {
    console.error("QR rotation error:", err.message);
    throw err;
  }
};

/**
 * Check if user is restricted due to abuse
 */
const checkRestriction = async (requestId) => {
  try {
    const rotation = await QRRotation.findOne({ requestId });

    if (!rotation) {
      return { isRestricted: false };
    }

    if (rotation.isRestricted && rotation.restrictionUntil) {
      if (new Date() < new Date(rotation.restrictionUntil)) {
        return {
          isRestricted: true,
          until: rotation.restrictionUntil,
        };
      } else {
        // Restriction expired, clear it
        rotation.isRestricted = false;
        rotation.restrictionUntil = null;
        rotation.scanAttempts = 0;
        await rotation.save();
      }
    }

    return { isRestricted: false };
  } catch (err) {
    console.error("Restriction check error:", err.message);
    return { isRestricted: false };
  }
};

/**
 * Apply restriction for abuse
 * Duration is fetched from system settings (no hardcoded value)
 */
const applyRestriction = async (requestId) => {
  try {
    // Fetch dynamic restriction duration from settings
    const durationMinutes = await getRestrictionDuration();

    let rotation = await QRRotation.findOne({ requestId });

    if (!rotation) {
      rotation = await QRRotation.create({
        requestId,
        activeQRType: "IN",
      });
    }

    rotation.isRestricted = true;
    rotation.restrictionUntil = new Date(Date.now() + durationMinutes * 60000);
    await rotation.save();

    return rotation;
  } catch (err) {
    console.error("Apply restriction error:", err.message);
    throw err;
  }
};

/**
 * Record scan attempt
 */
const recordScanAttempt = async (requestId) => {
  try {
    let rotation = await QRRotation.findOne({ requestId });

    if (!rotation) {
      rotation = await QRRotation.create({
        requestId,
        activeQRType: "IN",
      });
    }

    const now = new Date();
    const lastScan = rotation.lastScanTime ? new Date(rotation.lastScanTime) : null;

    // Reset counter if last scan was more than 1 minute ago
    if (!lastScan || (now - lastScan) > 60000) {
      rotation.scanAttempts = 1;
    } else {
      rotation.scanAttempts += 1;
    }

    rotation.lastScanTime = now;
    await rotation.save();

    // Apply restriction if too many attempts
    if (rotation.scanAttempts > 3) {
      await applyRestriction(requestId);
      return { shouldRestrict: true, attempts: rotation.scanAttempts };
    }

    return { shouldRestrict: false, attempts: rotation.scanAttempts };
  } catch (err) {
    console.error("Record scan attempt error:", err.message);
    throw err;
  }
};

module.exports = {
  getActiveQRType,
  checkRestriction,
  applyRestriction,
  recordScanAttempt,
};
