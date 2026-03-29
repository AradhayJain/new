const mongoose = require("mongoose");

const qrRotationSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      required: true,
      unique: true,
    },
    activeQRType: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },
    rotationTimestamp: {
      type: Date,
      default: Date.now,
    },
    lastScanTime: {
      type: Date,
      default: null,
    },
    scanAttempts: {
      type: Number,
      default: 0,
    },
    isRestricted: {
      type: Boolean,
      default: false,
    },
    restrictionUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("QRRotation", qrRotationSchema);
