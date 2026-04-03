const mongoose = require("mongoose");

/**
 * MachineToken — pre-seeded pool of tokens per hardware gate.
 *
 * Lifecycle: AVAILABLE → ALLOCATED (when user gets QR) → USED (after batch sync)
 * Machines hold up to 50 tokens locally; after 25 are used they batch-sync
 * and receive 25 fresh replacements.
 */
const machineTokenSchema = new mongoose.Schema(
  {
    machineId: {
      type: String,
      required: true,
      index: true,
    },
    tokenId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "ALLOCATED", "USED"],
      default: "AVAILABLE",
      index: true,
    },
    // Set when token is allocated to a specific user
    allocatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      default: null,
    },
    // State embedded in the QR shown to the user (IN = entering, OUT = exiting)
    allocatedState: {
      type: String,
      enum: ["IN", "OUT", null],
      default: null,
    },
    allocatedAt: {
      type: Date,
      default: null,
    },
    // Timestamp when the machine scanned this token (from batch sync)
    usedAt: {
      type: Date,
      default: null,
    },
    // Batch index so we can track groups of 50/25
    batchIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Fast lookup: fetch available tokens for a given machine
machineTokenSchema.index({ machineId: 1, status: 1 });

module.exports = mongoose.models.MachineToken || mongoose.model("MachineToken", machineTokenSchema);
