const UserActivity = require("../models/UserActivity");
const ScanLog = require("../models/ScanLog");

/**
 * Update user activity after each scan
 */
const updateUserActivity = async (requestId, passType) => {
  try {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    let activity = await UserActivity.findOne({
      requestId,
      date: today,
    });

    if (!activity) {
      activity = await UserActivity.create({
        requestId,
        date: today,
        scanCount: 0,
      });
    }

    // Update check-in/check-out times
    if (passType === "IN") {
      if (!activity.checkInTime) {
        activity.checkInTime = new Date();
      }
    } else if (passType === "OUT") {
      activity.checkOutTime = new Date();
      
      // Calculate duration if both times exist
      if (activity.checkInTime && activity.checkOutTime) {
        const duration = Math.floor(
          (new Date(activity.checkOutTime) - new Date(activity.checkInTime)) / 60000
        );
        activity.totalDuration = Math.max(0, duration);
      }
    }

    activity.scanCount += 1;
    await activity.save();

    return activity;
  } catch (err) {
    console.error("Activity update error:", err.message);
    throw err;
  }
};

/**
 * Get contribution calendar data for a user
 */
const getContributionCalendar = async (requestId, startDate, endDate) => {
  try {
    const activities = await UserActivity.find({
      requestId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ date: 1 });

    return activities;
  } catch (err) {
    console.error("Calendar fetch error:", err.message);
    throw err;
  }
};

/**
 * Check for abuse patterns (multiple scans within 1 minute)
 */
const checkAbusePattern = async (requestId) => {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    const recentScans = await ScanLog.countDocuments({
      requestId,
      createdAt: {
        $gte: oneMinuteAgo,
      },
      result: "ALLOW",
    });

    // ✅ Flag if more than 1 successful scan in 1 minute (IN then OUT or OUT then IN)
    if (recentScans > 1) {
      const today = new Date().toISOString().split("T")[0];
      
      const activity = await UserActivity.findOne({
        requestId,
        date: today,
      });

      if (activity) {
        activity.isFlagged = true;
        activity.flagReason = `${recentScans} scans within 1 minute - Possible proxy attendance`;
        await activity.save();
      }

      return {
        isAbuse: true,
        scanCount: recentScans,
      };
    }

    return { isAbuse: false };
  } catch (err) {
    console.error("Abuse check error:", err.message);
    return { isAbuse: false };
  }
};

module.exports = {
  updateUserActivity,
  getContributionCalendar,
  checkAbusePattern,
};
