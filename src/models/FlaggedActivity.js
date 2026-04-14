const mongoose = require("mongoose");

const flaggedActivitySchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    scanLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScanLog",
      required: true,
    },
    previousScanLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScanLog",
      required: true,
    },
    actionTaken: {
      type: String,
      default: "RESTRICTED",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REVIEWED", "RESOLVED"],
      default: "ACTIVE",
    },
    // The actual system time when this was detected
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FlaggedActivity", flaggedActivitySchema);
