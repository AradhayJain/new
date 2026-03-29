const mongoose = require("mongoose");

const scanLogSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      required: true,
    },
    tokenId: {
      type: String,
      required: true,
    },
    passType: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },
    gateId: {
      type: String,
      required: true,
    },
    result: {
      type: String,
      enum: ["ALLOW", "DENY"],
      required: true,
    },
    reason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ScanLog", scanLogSchema);
