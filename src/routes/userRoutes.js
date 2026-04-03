const express = require("express");
const router = express.Router();

const {
  submitAccessRequest,
  getUserRequests,
  getUserQRByIdNumber,
  getMyContributionCalendar,
  getActiveQR,
  getMyProfile,
  updateMyProfile,
  checkUserProfile,
  setupUserProfile,
  allocateQR,
  confirmEntry,
  getAvailableMachines,
} = require("../controllers/userController.js");

const firebaseAuth = require("../middleware/firebaseAuth");

/**
 * ✅ Submit access request (No auth required - users submit before login)
 */
router.post("/request-access", submitAccessRequest);

/**
 * ✅ Fetch BOTH IN + OUT QR using College ID Number (Protected)
 * Note: idNumber may contain slashes (e.g. 23/SE/009) — always encodeURIComponent on client side
 */
router.get("/qrpass-by-id/:idNumber", firebaseAuth, getUserQRByIdNumber);

/**
 * ✅ Get user's contribution calendar
 */
router.get("/calendar/:idNumber", firebaseAuth, getMyContributionCalendar);

/**
 * ✅ Get active QR (dynamic rotation)
 */
router.get("/active-qr/:idNumber", firebaseAuth, getActiveQR);

/**
 * ✅ Get user's own profile
 */
router.get("/profile/:idNumber", firebaseAuth, getMyProfile);

/**
 * ✅ Update user's own profile
 */
router.put("/profile/:idNumber", firebaseAuth, updateMyProfile);

/**
 * ✅ Check user profile (during login)
 */
router.get("/check-profile", firebaseAuth, checkUserProfile);

/**
 * ✅ Setup user profile (after google login)
 */
router.post("/profile-setup", firebaseAuth, setupUserProfile);

/**
 * ✅ NEW: Get available machines (No auth needed)
 */
router.get("/machines", getAvailableMachines);

/**
 * ✅ NEW: List user's own requests (by Firebase UID)
 */
router.get("/requests", firebaseAuth, getUserRequests);

/**
 * ✅ NEW: Allocate a pre-seeded machine token as the user's QR pass
 * Body: { idNumber, machineId }
 */
router.post("/allocate-qr", firebaseAuth, allocateQR);

/**
 * ✅ NEW: Confirm entry/exit after the 20-second post-scan popup
 * Body: { tokenId, idNumber, enteredSuccessfully, machineId }
 */
router.post("/confirm-entry", firebaseAuth, confirmEntry);

module.exports = router;
