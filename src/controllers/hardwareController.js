const { v4: uuidv4 } = require("uuid");
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
      // Hardware can now send an array of objects to explicitly declare the scanned state
      const tokenId = typeof entry === "string" ? entry : entry.tokenId;
      const scannedState = typeof entry === "object" && entry.state ? entry.state : null;

      // 1. Mark token as USED and record exact backend time (ignore hardware timestamps)
      const token = await MachineToken.findOneAndUpdate(
        { tokenId, machineId },
        { 
          status: "USED", 
          usedAt: new Date() 
        },
        { new: true }
      );

      if (!token) {
        console.warn(`[HW] Sync: unknown token ${tokenId} for machine ${machineId}`);
        return null;
      }

      // 2. Safely map back to whom it was allocated
      if (!token.allocatedTo) {
        console.warn(`[HW] Sync: token ${tokenId} has no allocated user`);
        return null;
      }

      const user = await AccessRequest.findById(token.allocatedTo).lean();

      // 3. Generate correct logs. We prioritize the state the hardware physically scanned.
      if (user) {
        const finalPassType = scannedState || token.allocatedState || "IN";
        
        // Insert the immutable ledger
        await ScanLog.create({
          requestId: user._id,
          tokenId,
          passType: finalPassType,
          gateId: machineId,
          machineId,
          result: "ALLOW",
          reason: `Instant/Batch sync from ${machineId}`,
          createdAt: new Date(), // Strictly use backend timestamp
        });

        // 4. Update the user's live database state (INSIDE / OUTSIDE)
        // This flawlessly triggers the Frontend's 3-second smart polling to succeed!
        await AccessRequest.findByIdAndUpdate(user._id, {
          currentState: finalPassType === "IN" ? "INSIDE" : "OUTSIDE"
        });
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

    // Format expected from frontend QR payload: "<tokenId>|<state>|<idNumber>"
    const parts = qrData.split("|");
    if (parts.length < 3) {
      return res.status(400).json({ access: false, message: "Invalid QR format" });
    }
    const [tokenId, state, idNumber] = parts;

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
    user.currentState = state === "IN" ? "INSIDE" : "OUTSIDE";
    await user.save();

    // Mark token used immediately on online validation
    token.status = "USED";
    token.usedAt = now;
    await token.save();

    // Log the scan
    await ScanLog.create({
      requestId: user._id,
      tokenId,
      passType: state,
      gateId: token.machineId || "UNKNOWN",
      machineId: token.machineId,
      result: "ALLOW",
      reason: "Online real-time validation",
    });

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