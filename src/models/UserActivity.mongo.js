const mongoose = require("mongoose");

const userActivitySchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AccessRequest",
      required: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    totalDuration: {
      type: Number, // in minutes
      default: 0,
    },
    scanCount: {
      type: Number,
      default: 0,
    },
    isFlagged: {
      type: Boolean,
      default: false,
    },
    flagReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index for requestId and date
userActivitySchema.index({ requestId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("UserActivity", userActivitySchema);
