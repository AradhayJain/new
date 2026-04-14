const UserActivity = require("../models/UserActivity");
const ScanLog = require("../models/ScanLog");
const FlaggedActivity = require("../models/FlaggedActivity");
const { getFlaggingWindow } = require("./settingsService");
const { applyRestriction } = require("./qrRotationService");

/**
 * Update user activity after each scan
 */
const updateUserActivity = async (requestId, passType, scanTime = null) => {
  try {
    const timeToUse = scanTime ? new Date(scanTime) : new Date();
    const today = timeToUse.toISOString().split("T")[0]; // YYYY-MM-DD

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
      if (!activity.checkInTime || timeToUse < new Date(activity.checkInTime)) {
        activity.checkInTime = timeToUse;
      }
    } else if (passType === "OUT") {
      if (!activity.checkOutTime || timeToUse > new Date(activity.checkOutTime)) {
        activity.checkOutTime = timeToUse;
      }
      
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
    const windowMinutes = await getFlaggingWindow();
    const windowMs = windowMinutes * 60000;

    // Fetch the last two successful scans for this user
    const lastTwoScans = await ScanLog.find({
      requestId,
      result: "ALLOW",
    })
      .sort({ createdAt: -1 })
      .limit(2);

    if (lastTwoScans.length < 2) {
      return { isAbuse: false };
    }

    const currentScan = lastTwoScans[0];
    const previousScan = lastTwoScans[1];

    // ✅ FLAG CONDITION: OUT followed by IN within the window
    if (previousScan.passType === "OUT" && currentScan.passType === "IN") {
      const timeDiff = new Date(currentScan.createdAt).getTime() - new Date(previousScan.createdAt).getTime();

      if (timeDiff <= windowMs) {
        const reason = `OUT -> IN scan within ${windowMinutes}m (${Math.round(timeDiff / 1000)}s)`;
        
        // 1. Create permanent incident record
        await FlaggedActivity.create({
          requestId,
          reason,
          scanLogId: currentScan._id,
          previousScanLogId: previousScan._id,
        });

        // 2. Ensure flagging is visible on CURRENT date regardless of scan timestamp
        // (Fixes hardware clock mismatch issues)
        const realToday = new Date().toISOString().split("T")[0];
        let todayActivity = await UserActivity.findOne({ requestId, date: realToday });
        if (!todayActivity) {
          todayActivity = await UserActivity.create({
            requestId,
            date: realToday,
            scanCount: 0,
            isFlagged: true,
            flagReason: reason
          });
        } else {
          todayActivity.isFlagged = true;
          todayActivity.flagReason = reason;
          await todayActivity.save();
        }

        // 3. AUTO-BLOCK
        await applyRestriction(requestId);

        console.log(`[ABUSE] User ${requestId} flagged and blocked: ${reason}`);

        return { isAbuse: true, reason };
      }
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
