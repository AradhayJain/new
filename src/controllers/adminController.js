const AccessRequest = require("../models/AccessRequest");
const QRPass = require("../models/QRPass");
const ScanLog = require("../models/ScanLog");
const UserActivity = require("../models/UserActivity");

const { generateQRToken } = require("../services/qrService");
const { generateQRImage } = require("../services/qrImageService");
const { getContributionCalendar } = require("../services/activityService");
const { addClient } = require("../services/notificationService");

/**
 * ✅ SSE Stream for Admin Notifications
 */
const streamNotifications = (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Add the client response object to the notification service manager
  addClient(res);

  // Send initial ping to keep connection alive
  res.write("data: {\"type\":\"CONNECTED\", \"message\":\"Admin SSE connected\"}\n\n");
};

/**
 * ✅ View all pending requests
 */
const getPendingRequests = async (req, res) => {
  try {
    const pending = await AccessRequest.find({ status: "PENDING" })
      .sort({ createdAt: -1 });

    return res.json({
      count: pending.length,
      requests: pending,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Approve request
 * FIX: This function now strictly uses the database-stored validity dates.
 */
const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await AccessRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Check if already approved to avoid duplicate DB entries
    if (request.status === "APPROVED") {
      const existingPasses = await QRPass.find({ requestId: request._id });
      if (existingPasses.length === 2) {
        return res.json({ message: "Already Approved", request, passes: existingPasses });
      }
    }

    // ✅ UPDATE STATUS
    request.status = "APPROVED";
    request.rejectionReason = null;
    // ✅ FIX: Preserve currentState on re-approvals (e.g. expired QR renewed).
    // Only reset to OUTSIDE for brand-new first-time approvals where no state
    // has been set yet. If a user is INSIDE when their pass expires and a new
    // request is re-approved, we must keep them as INSIDE so the OUT QR is shown.
    if (!request.currentState) {
      request.currentState = "OUTSIDE";
    }
    await request.save();

    // ✅ IMPORTANT: Clear old passes if regenerating
    await QRPass.deleteMany({ requestId: request._id });

    // ✅ GENERATE TOKENS using the request object 
    // (qrService.js will now read request.validFrom and request.validUntil)
    const inTok = generateQRToken(request, "IN");
    const outTok = generateQRToken(request, "OUT");

    const entryQR = await QRPass.create({
      requestId: request._id,
      passType: "IN",
      tokenId: inTok.tokenId,
      qrToken: inTok.token,
    });

    const exitQR = await QRPass.create({
      requestId: request._id,
      passType: "OUT",
      tokenId: outTok.tokenId,
      qrToken: outTok.token,
    });

    return res.json({
      message: "✅ Request Approved with User-Defined Validity",
      request,
      entryQR,
      exitQR,
    });
  } catch (err) {
    console.error("❌ APPROVE ERROR:", err.message);
    return res.status(500).json({ message: "Approval failed", error: err.message });
  }
};

/**
 * ✅ Reject request
 */
const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        message: "Rejection reason is required",
      });
    }

    const request = await AccessRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    request.status = "REJECTED";
    request.rejectionReason = rejectionReason;
    request.validFrom = null;
    request.validUntil = null;

    await request.save();

    await QRPass.deleteMany({ requestId: request._id });

    return res.json({
      message: "❌ Request Rejected",
      request,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get QR Pass Tokens
 */
const getQRPass = async (req, res) => {
  try {
    const { id } = req.params;

    const passes = await QRPass.find({ requestId: id });

    if (!passes.length) {
      return res.status(404).json({
        message: "QR Pass not found",
      });
    }

    return res.json({
      entryQR: passes.find((p) => p.passType === "IN"),
      exitQR: passes.find((p) => p.passType === "OUT"),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get QR Image
 */
const getQRImage = async (req, res) => {
  try {
    const { id, type } = req.params;

    const qrPass = await QRPass.findOne({
      requestId: id,
      passType: type.toUpperCase(),
    });

    if (!qrPass) {
      return res.status(404).json({
        message: "QR Pass not found",
      });
    }

    const qrImage = await generateQRImage(qrPass.qrToken);

    return res.json({
      passType: qrPass.passType,
      qrImage,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get Approved Users
 */
const getApprovedUsers = async (req, res) => {
  try {
    console.log("📊 Fetching approved users...");

    const approved = await AccessRequest.find({ status: "APPROVED" })
      .sort({ updatedAt: -1 });

    console.log(`✅ Found ${approved.length} approved users`);

    return res.json({
      count: approved.length,
      users: approved,
    });
  } catch (err) {
    console.error("❌ Error in getApprovedUsers:", err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get Scan Logs for a User (Admin View Details)
 */
const getUserScanLogs = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await AccessRequest.findById(id);

    const logs = await ScanLog.find({ requestId: id })
      .sort({ createdAt: -1 });

    return res.json({
      user: request
        ? {
          id: request._id,
          fullName: request.fullName,
          idNumber: request.idNumber,
          organisation: request.organisation,
          validFrom: request.validFrom,
          validUntil: request.validUntil,
          status: request.status,
        }
        : null,
      logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update validity dates for an approved user
 */
const updateUserValidity = async (req, res) => {
  try {
    const { id } = req.params;
    const { validFrom, validUntil } = req.body;

    if (!validFrom || !validUntil) {
      return res.status(400).json({ message: "validFrom and validUntil are required" });
    }

    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);

    if (isNaN(fromDate.getTime()) || isNaN(untilDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (fromDate >= untilDate) {
      return res.status(400).json({ message: "validUntil must be after validFrom" });
    }

    const request = await AccessRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: "User not found" });
    }

    request.validFrom = fromDate;
    request.validUntil = untilDate;
    await request.save();

    // Regenerate QR tokens with new validity
    await QRPass.deleteMany({ requestId: request._id });

    const { generateQRToken } = require("../services/qrService");
    const inTok = generateQRToken(request, "IN");
    const outTok = generateQRToken(request, "OUT");

    const entryQR = await QRPass.create({
      requestId: request._id,
      passType: "IN",
      tokenId: inTok.tokenId,
      qrToken: inTok.token,
    });

    const exitQR = await QRPass.create({
      requestId: request._id,
      passType: "OUT",
      tokenId: outTok.tokenId,
      qrToken: outTok.token,
    });

    return res.json({
      message: "✅ Validity dates updated and QR regenerated",
      request,
      entryQR,
      exitQR,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get user profile with contribution calendar (Admin Read-Only)
 * Works with both MongoDB _id and roll numbers containing slashes (e.g. 23/SE/009)
 */
const getUserProfile = async (req, res) => {
  try {
    // With wildcard route "/user-profile/*", the captured segment is in req.params[0]
    // With named route "/user-profile/:id", it's in req.params.id
    const rawId = (req.params[0] || req.params.id || "").trim();
    const id = decodeURIComponent(rawId);

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // ✅ Dual lookup: try MongoDB _id first, then fall back to idNumber
    let user = null;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await AccessRequest.findById(id);
    }
    if (!user) {
      // Try by roll number (idNumber) — handles slashed roll numbers like "23/SE/009"
      user = await AccessRequest.findOne({ idNumber: id });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Use the resolved MongoDB _id for all subsequent queries
    const userId = user._id.toString();

    // Get last 90 days of activity
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const calendar = await getContributionCalendar(userId, startDate, endDate);

    // Get recent scan logs
    const recentLogs = await ScanLog.find({ requestId: userId })
      .sort({ createdAt: -1 })
      .limit(20);

    // Calculate statistics
    const totalDays = calendar.length;
    const totalDuration = calendar.reduce((sum, day) => sum + day.totalDuration, 0);
    const flaggedDays = calendar.filter((day) => day.isFlagged).length;

    return res.json({
      user: {
        _id: user._id,
        id: user._id,
        fullName: user.fullName,
        idNumber: user.idNumber,
        organisation: user.organisation,
        status: user.status,
        validFrom: user.validFrom,
        validUntil: user.validUntil,
        currentState: user.currentState,
      },
      calendar,
      recentLogs,
      statistics: {
        totalDays,
        totalDuration,
        flaggedDays,
        averageDuration: totalDays > 0 ? Math.round(totalDuration / totalDays) : 0,
      },
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get contribution calendar for specific user (date range)
 */
const getUserContributionCalendar = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate required" });
    }

    const calendar = await getContributionCalendar(id, startDate, endDate);

    return res.json({ calendar });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get all flagged activities (abuse monitoring)
 */
const getFlaggedActivities = async (req, res) => {
  try {
    const flagged = await UserActivity.find({ isFlagged: true })
      .sort({ date: -1 })
      .limit(100);

    // Enrich with user details
    const requestIds = [...new Set(flagged.map((f) => f.requestId.toString()))];
    const users = await AccessRequest.find({ _id: { $in: requestIds } });

    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = {
        fullName: u.fullName,
        idNumber: u.idNumber,
        organisation: u.organisation,
      };
    });

    const enriched = flagged.map((f) => ({
      ...f.toJSON(),
      user: userMap[f.requestId.toString()] || null,
    }));

    return res.json({ flagged: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get detailed daily logs for a user
 */
const getUserDailyLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "date parameter required (YYYY-MM-DD)" });
    }

    const user = await AccessRequest.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get activity for the day
    const activity = await UserActivity.findOne({
      requestId: id,
      date,
    });

    // Get all scans for that day
    const startOfDay = new Date(date);
    const endOfDay = new Date(date);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const logs = await ScanLog.find({
      requestId: id,
      createdAt: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    }).sort({ createdAt: 1 });

    return res.json({
      user: {
        fullName: user.fullName,
        idNumber: user.idNumber,
      },
      date,
      activity: activity || null,
      logs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getPendingRequests,
  approveRequest,
  rejectRequest,
  getQRPass,
  getQRImage,
  getApprovedUsers,
  updateUserValidity,
  getUserScanLogs,
  getUserProfile,
  getUserContributionCalendar,
  getFlaggedActivities,
  getUserDailyLogs,
  streamNotifications,
};
