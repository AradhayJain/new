const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const AccessRequest = sequelize.define("AccessRequest", {
  fullName: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  idNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },

  organisation: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  status: {
    type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
    defaultValue: "PENDING",
  },

  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  validFrom: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  validUntil: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  /**
   * ✅ Security State Machine
   * OUTSIDE → can use IN QR
   * INSIDE  → can use OUT QR
   */
  currentState: {
    type: DataTypes.ENUM("OUTSIDE", "INSIDE"),
    defaultValue: "OUTSIDE",
  },
  // Optional Firebase identity fields (added for auth tracing)
  firebaseUid: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  firebaseEmail: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  
  // User Profile Fields
  profilePicture: {
    type: DataTypes.TEXT, // Base64 encoded image or URL
    allowNull: true,
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  department: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  year: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

module.exports = AccessRequest;
