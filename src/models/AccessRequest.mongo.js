const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    idNumber: {
      type: String,
      required: true,
      unique: true,
    },
    organisation: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validUntil: {
      type: Date,
      default: null,
    },
    currentState: {
      type: String,
      enum: ["OUTSIDE", "INSIDE"],
      default: "OUTSIDE",
    },
    firebaseUid: {
      type: String,
      default: null,
    },
    firebaseEmail: {
      type: String,
      default: null,
    },
    // User Profile Fields
    profilePicture: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    department: {
      type: String,
      default: null,
    },
    year: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

module.exports = mongoose.model("AccessRequest", accessRequestSchema);
