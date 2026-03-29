// Mongoose model for user_qr_requests
const mongoose = require("mongoose");
const QRRequestSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  valid_from: { type: Date, required: true },
  valid_until: { type: Date, required: true },
  created_at: { type: Date, default: Date.now },
});
// Optional: Add unique index to prevent overlapping ACTIVE per user
QRRequestSchema.index({ user_id: 1, valid_from: 1, valid_until: 1 });
module.exports = mongoose.model("QRRequest", QRRequestSchema);
