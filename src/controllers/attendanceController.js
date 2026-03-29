const ScanLog = require("../models/ScanLog");
const AccessRequest = require("../models/AccessRequest");
const UserActivity = require("../models/UserActivity");

const getAttendance = async (req, res) => {
  try {
    console.log("📊 Fetching attendance logs...");
    
    const logs = await ScanLog.find().sort({ createdAt: 1 });

    console.log(`✅ Found ${logs.length} scan logs`);

    if (!logs.length) {
      console.log("⚠️ No scan logs found, returning empty array");
      return res.json([]);
    }

    const attendanceMap = {};

    logs.forEach((log) => {
      const reqId = log.requestId.toString();
      if (!attendanceMap[reqId]) {
        attendanceMap[reqId] = {
          requestId: log.requestId,
          firstIn: null,
          lastOut: null,
          breaks: 0,
        };
      }

      if (log.passType === "IN") {
        if (!attendanceMap[reqId].firstIn) {
          attendanceMap[reqId].firstIn = log.createdAt;
        }
      }

      if (log.passType === "OUT") {
        attendanceMap[reqId].lastOut = log.createdAt;
        attendanceMap[reqId].breaks += 1;
      }
    });

    // ✅ Fetch User Details from AccessRequest table
    const requestIds = Object.keys(attendanceMap).map(id => id);
    console.log(`📋 Fetching user details for request IDs:`, requestIds);

    const users = await AccessRequest.find({ _id: { $in: requestIds } });

    console.log(`✅ Found ${users.length} users`);

    // ✅ Check for flagged activities today
    const today = new Date().toISOString().split("T")[0];
    const flaggedActivities = await UserActivity.find({
      requestId: { $in: requestIds },
      date: today,
      isFlagged: true,
    });

    const flaggedMap = {};
    flaggedActivities.forEach((activity) => {
      flaggedMap[activity.requestId.toString()] = {
        isFlagged: true,
        flagReason: activity.flagReason,
      };
    });

    // ✅ Merge user info into attendance
    const finalData = users.map((user) => {
      const userId = user._id.toString();
      return {
        requestId: user._id,
        fullName: user.fullName,
        idNumber: user.idNumber,
        organisation: user.organisation,

        firstIn: attendanceMap[userId].firstIn,
        lastOut: attendanceMap[userId].lastOut,
        breaks: attendanceMap[userId].breaks,
        
        // ✅ Add flagged status
        isFlagged: flaggedMap[userId]?.isFlagged || false,
        flagReason: flaggedMap[userId]?.flagReason || null,
      };
    });

    console.log(`✅ Returning ${finalData.length} attendance records`);

    return res.json(finalData);
  } catch (err) {
    console.error("❌ Attendance Error:", err);

    return res.status(500).json({
      message: "Attendance fetch failed",
      error: err.message,
    });
  }
};

module.exports = { getAttendance };
