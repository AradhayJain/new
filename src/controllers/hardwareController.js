const { v4: uuidv4 } = require("uuid");
const { 
  updateUserActivity, 
  checkAbusePattern 
} = require("../services/activityService");
const MachineToken = require("../models/MachineToken"); // Ensure this points to your new schema file
const AccessRequest = require("../models/AccessRequest");
const ScanLog = require("../models/ScanLog");

const BATCH_SIZE = 50;       // Maximum offline token pool size

/**
 * Generate N tokens for a machine and persist them.
 * Returns an array of { tokenId } objects to send to the device.
 */
async function generateAndSaveTokens(machineId, count, batchIndex) {
  const tokens = Array.from({ length: count }, () => ({
    machineId,
    tokenId: uuidv4(),
    status: "AVAILABLE",
    batchIndex,
  }));
  await MachineToken.insertMany(tokens);
  return tokens.map((t) => ({ tokenId: t.tokenId }));
}

/**
 * GET /api/hardware/tokens/:machineId
 * Called by hardware device on boot / when token pool is empty.
 */
const provisionTokens = async (req, res) => {
  try {
    const { machineId } = req.params;
    if (!machineId) {
      return res.status(400).json({ success: false, message: "machineId required" });
    }

    // Check existing ACTIVE tokens (AVAILABLE for anyone + ALLOCATED but not yet scanned)
    const existing = await MachineToken.find({ 
      machineId, 
      status: { $in: ["AVAILABLE", "ALLOCATED"] } 
    })
      .select("tokenId status")
      .lean();

    // If we already have more than BATCH_SIZE (50), we must prune extras.
    // BUT we must NEVER delete ALLOCATED tokens (users' active passes).
    if (existing.length > BATCH_SIZE) {
      const allocated = existing.filter(t => t.status === "ALLOCATED");
      const available = existing.filter(t => t.status === "AVAILABLE");

      // Calculate how many AVAILABLE tokens we need to remove to hit 50
      // Pool = Allocated + Available. If Pool > 50, we remove from Available.
      const totalActive = allocated.length + available.length;
      const extraCount = totalActive - BATCH_SIZE;

      if (extraCount > 0 && available.length > 0) {
        // Delete up to extraCount from the AVAILABLE set (oldest first)
        const toDeleteIds = available.slice(0, Math.min(extraCount, available.length)).map(t => t._id);
        await MachineToken.deleteMany({ _id: { $in: toDeleteIds } });
        console.log(`[HW] Safety Cleanup: Pruned ${toDeleteIds.length} extra AVAILABLE tokens, preserved all ${allocated.length} ALLOCATED tokens.`);
        
        // Refresh the list for the final response
        const refreshed = await MachineToken.find({ 
          machineId, 
          status: { $in: ["AVAILABLE", "ALLOCATED"] } 
        }).select("tokenId").lean();
        
        return res.json({
          success: true,
          machineId,
          tokenCount: refreshed.length,
          tokens: refreshed.map(t => ({ tokenId: t.tokenId })),
        });
      }
    }

    // If exactly 50, just return them
    if (existing.length === BATCH_SIZE) {
      console.log(`[HW] Machine ${machineId} has exactly ${existing.length} active tokens. Returning full set.`);
      return res.json({
        success: true,
        machineId,
        tokenCount: existing.length,
        tokens: existing.map((t) => ({ tokenId: t.tokenId })),
      });
    }

    // Figure out the next batch index for tracking
    const lastToken = await MachineToken.findOne({ machineId }).sort({ batchIndex: -1 }).lean();
    const batchIndex = lastToken ? lastToken.batchIndex + 1 : 0;

    // Top up to exactly BATCH_SIZE (50)
    const needed = BATCH_SIZE - existing.length;
    const newTokens = await generateAndSaveTokens(machineId, Math.max(0, needed), batchIndex);
    const allTokens = [...existing.map((t) => ({ tokenId: t.tokenId })), ...newTokens];

    console.log(`[HW] Provisioned ${needed} tokens for machine ${machineId} (batch ${batchIndex})`);

    return res.json({
      success: true,
      machineId,
      tokenCount: allTokens.length,
      tokens: allTokens,
    });
  } catch (err) {
    console.error("[HW] provisionTokens error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/hardware/sync/:machineId
 * Called by hardware every 2 minutes to sync used tokens and replenish its pool.
 */
const syncBatch = async (req, res) => {
  try {
    const { machineId } = req.params;
    const { usedTokens = [] } = req.body;

    if (!machineId) {
      return res.status(400).json({ success: false, message: "machineId required" });
    }

    // Process each used token
    const logPromises = usedTokens.map(async (entry) => {
      // 1. Parse hardware-reported data
      // Hardware can send { tokenId, state, idNumber, timestamp }
      const tokenId = typeof entry === "string" ? entry : entry.tokenId;
      const scannedState = typeof entry === "object" ? entry.state : null;
      const idNumber = typeof entry === "object" ? entry.idNumber : null;
      const timestamp = typeof entry === "object" ? entry.timestamp : null;

      // 2. Mark token as USED locally to track its lifecycle
      const token = await MachineToken.findOneAndUpdate(
        { tokenId, machineId },
        { 
          status: "USED", 
          usedAt: timestamp ? new Date(parseInt(timestamp)) : new Date() 
        },
        { new: true }
      );

      if (!token) {
        console.warn(`[HW] Sync: unknown token ${tokenId} for machine ${machineId}`);
        return null;
      }

      // 3. Resolve user identity (Priority: idNumber from batch > token metadata)
      let user = null;
      if (idNumber) {
        user = await AccessRequest.findOne({ idNumber });
      } 
      
      if (!user && token.allocatedTo) {
        user = await AccessRequest.findById(token.allocatedTo);
      }

      // 4. Generate Audit Log & Update User Location State
      if (user) {
        // Hardware manages state (IN/OUT). We trust its report.
        const finalPassType = scannedState || token.allocatedState || "IN";
        console.log(`[HW] Sync Log: Creating log for user ${user.idNumber}, state: ${finalPassType}`);
        
        try {
          await ScanLog.create({
            requestId: user._id,
            tokenId,
            passType: finalPassType,
            gateId: machineId,
            machineId,
            result: "ALLOW",
            reason: "Hardware sync (state-aware)",
            createdAt: timestamp ? new Date(parseInt(timestamp)) : new Date(), 
          });
          console.log(`[HW] Sync Log: Created successfully for ${tokenId}`);
        } catch (logErr) {
          console.error(`[HW] Sync Log ERROR: ${logErr.message}`);
        }

        // Atomic update of user's current physical location
        await AccessRequest.findByIdAndUpdate(user._id, {
          currentState: finalPassType === "IN" ? "INSIDE" : "OUTSIDE"
        });

        // ✅ NEW: Update attendance activity and check for abuse patterns
        const scanTimestamp = timestamp ? new Date(parseInt(timestamp)) : new Date();
        await updateUserActivity(user._id, finalPassType, scanTimestamp);
        await checkAbusePattern(user._id);
      } else {
        console.warn(`[HW] Sync Log SKIPPED: User not found for token ${tokenId} or idNumber ${idNumber}`);
      }
    });

    await Promise.allSettled(logPromises);
    
    // -----------------------------------------------------------------
    // SMART REPLENISHMENT
    // -----------------------------------------------------------------
    // Instead of blindly adding usedTokens.length, we check the CURRENT total pool
    // (Available + Allocated) to ensure we hit exactly 50 total.
    const currentActiveCount = await MachineToken.countDocuments({ 
        machineId, 
        status: { $in: ["AVAILABLE", "ALLOCATED"] } 
    });

    const neededToMaintainPool = Math.max(0, BATCH_SIZE - currentActiveCount);
    
    let freshTokens = [];
    if (neededToMaintainPool > 0) {
      const lastToken = await MachineToken.findOne({ machineId }).sort({ batchIndex: -1 }).lean();
      const batchIndex = lastToken ? lastToken.batchIndex + 1 : 0;
      freshTokens = await generateAndSaveTokens(machineId, neededToMaintainPool, batchIndex);
    }

    console.log(`[HW] Sync complete for ${machineId}: Used ${usedTokens.length}, Refilled ${freshTokens.length} to maintain total count of 50.`);

    return res.json({
      success: true,
      processedCount: usedTokens.length,
      freshTokens,
    });
  } catch (err) {
    console.error("[HW] syncBatch error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /validate
 * Real-time / Online fallback validation
 */
const validateQR = async (req, res) => {
  try {
    const qrData = req.body?.qrData;
    if (!qrData) {
      return res.status(400).json({ access: false, message: "Missing QR data" });
    }

    // Format expected from frontend QR payload: "<tokenId>|<state>|<idNumber>|<timestamp>"
    const parts = qrData.split("|");
    if (parts.length < 3) {
      return res.status(400).json({ access: false, message: "Invalid QR format" });
    }
    const [tokenId, state, idNumber, timestamp] = parts;

    // Validate token exists and was assigned to a user (ALLOCATED)
    const token = await MachineToken.findOne({ tokenId });
    if (!token) {
      return res.status(401).json({ access: false, message: "Token not found" });
    }
    if (token.status !== "ALLOCATED") {
      return res.status(401).json({ access: false, message: `Token is ${token.status}` });
    }

    // Validate user
    const user = await AccessRequest.findOne({ idNumber });
    if (!user) {
      return res.status(401).json({ access: false, message: "User not found" });
    }
    if (user.status !== "APPROVED") {
      return res.status(401).json({ access: false, message: "User not approved" });
    }

    // Validate access window
    const now = new Date();
    if (user.validFrom && now < user.validFrom) {
      return res.status(401).json({ access: false, message: "Access not yet valid" });
    }
    if (user.validUntil && now > user.validUntil) {
      return res.status(401).json({ access: false, message: "Access expired" });
    }

    // State machine check
    if (state === "IN" && user.currentState !== "OUTSIDE") {
      return res.status(401).json({ access: false, message: "Already inside", state: user.currentState });
    }
    if (state === "OUT" && user.currentState !== "INSIDE") {
      return res.status(401).json({ access: false, message: "Already outside", state: user.currentState });
    }

    // --- All checks passed: execute state change ---
    console.log(`[HW] Online: Validating token ${tokenId} for user ${idNumber}`);
    user.currentState = state === "IN" ? "INSIDE" : "OUTSIDE";
    await user.save();

    // Mark token used immediately on online validation
    token.status = "USED";
    token.usedAt = now;
    await token.save();

    // Log the scan
    try {
      await ScanLog.create({
        requestId: user._id,
        tokenId,
        passType: state,
        gateId: token.machineId || "UNKNOWN",
        machineId: token.machineId,
        result: "ALLOW",
        reason: "Online real-time validation",
        createdAt: timestamp ? new Date(parseInt(timestamp)) : new Date(),
      });
      console.log(`[HW] Online Log: Created successfully for ${tokenId}`);
    } catch (logErr) {
      console.error(`[HW] Online Log ERROR: ${logErr.message}`);
    }

    return res.json({
      access: true,
      message: state === "IN" ? "Welcome — entry allowed" : "Goodbye — exit allowed",
      state: user.currentState,
    });
  } catch (err) {
    console.error("[HW] validateQR error:", err.message);
    return res.status(500).json({ access: false, message: "Server error", error: err.message });
  }
};

module.exports = { provisionTokens, syncBatch, validateQR };