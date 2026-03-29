const mongoose = require("mongoose");

const qrPassSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      required: true,
    },
    passType: {
      type: String,
      enum: ["IN", "OUT"],
      required: true,
    },
    tokenId: {
      type: String,
      required: true,
      unique: true,
    },
    qrToken: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "USED", "REVOKED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index for requestId and passType
qrPassSchema.index({ requestId: 1, passType: 1 }, { unique: true });

module.exports = mongoose.model("QRPass", qrPassSchema);
