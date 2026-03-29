const express = require("express");
const router = express.Router();

const {
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getQRPass,
  getQRImage, // ✅ MUST BE HERE
  getApprovedUsers,
  updateUserValidity,
  getUserScanLogs,
  getUserProfile,
  getUserContributionCalendar,
  getFlaggedActivities,
  getUserDailyLogs,
  streamNotifications,
} = require("../controllers/adminController");

const { getAttendance } = require("../controllers/attendanceController");

const {
  getRestrictionSettings,
  updateRestrictionSettings,
  getSystemSettings,
} = require("../controllers/settingsController");

// Requests
router.get("/requests", getPendingRequests);
router.get("/approved", getApprovedUsers);

// Notifications Stream (SSE)
router.get("/notifications/stream", streamNotifications);

// Approval
router.post("/approve/:id", approveRequest);
router.post("/reject/:id", rejectRequest);

// Update validity dates for approved user
router.patch("/update-validity/:id", updateUserValidity);

// View scan logs for a user
router.get("/scanlogs/:id", getUserScanLogs);

// Fetch tokens
router.get("/qrpass/:id", getQRPass);

// ✅ QR IMAGE ROUTE (IN/OUT)
router.get("/qrimage/:id/:type", getQRImage);

// ✅ ATTENDANCE TRACKING
router.get("/attendance", getAttendance);

// ✅ USER PROFILE & ACTIVITY MONITORING
// Frontend must use encodeURIComponent(id) so slashes in roll numbers (e.g. 23/SE/009) become %2F
router.get("/user-profile/:id", getUserProfile);
router.get("/user-calendar/:id", getUserContributionCalendar);
router.get("/user-daily-logs/:id", getUserDailyLogs);
router.get("/flagged-activities", getFlaggedActivities);

// ✅ SYSTEM SETTINGS (Admin Configuration)
router.get("/settings/restriction", getRestrictionSettings);
router.put("/settings/restriction", updateRestrictionSettings);
router.get("/settings", getSystemSettings);

module.exports = router;
