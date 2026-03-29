/**
 * Script to check attendance/scan logs in the database
 * Run with: node scripts/check-attendance.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");
const ScanLog = require("../src/models/ScanLog");
const AccessRequest = require("../src/models/AccessRequest");

async function checkAttendance() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    console.log("📊 Checking ScanLog table...");
    console.log(`   Table name: ${ScanLog.tableName}`);
    
    // Get total scan logs
    const totalLogs = await ScanLog.count();
    console.log(`   Total scan logs: ${totalLogs}\n`);

    if (totalLogs === 0) {
      console.log("⚠️ No scan logs found in database");
      return;
    }

    // Get all scan logs
    const logs = await ScanLog.findAll({
      order: [["createdAt", "DESC"]],
      limit: 20,
    });

    console.log(`✅ Found ${logs.length} recent scan logs:`);
    
    console.log("\n📋 Recent Scan Logs:");
    logs.forEach((log, index) => {
      console.log(`\n   ${index + 1}. Scan Log #${log.id}`);
      console.log(`      Request ID: ${log.requestId}`);
      console.log(`      Pass Type: ${log.passType}`);
      console.log(`      Gate ID: ${log.gateId}`);
      console.log(`      Result: ${log.result}`);
      console.log(`      Reason: ${log.reason || "N/A"}`);
      console.log(`      Created: ${log.createdAt}`);
    });

    // Build attendance map
    const allLogs = await ScanLog.findAll({
      order: [["createdAt", "ASC"]],
    });

    const attendanceMap = {};

    allLogs.forEach((log) => {
      if (!attendanceMap[log.requestId]) {
        attendanceMap[log.requestId] = {
          requestId: log.requestId,
          firstIn: null,
          lastOut: null,
          breaks: 0,
        };
      }

      if (log.passType === "IN") {
        if (!attendanceMap[log.requestId].firstIn) {
          attendanceMap[log.requestId].firstIn = log.createdAt;
        }
      }

      if (log.passType === "OUT") {
        attendanceMap[log.requestId].lastOut = log.createdAt;
        attendanceMap[log.requestId].breaks += 1;
      }
    });

    // Fetch user details
    const requestIds = Object.keys(attendanceMap).map(id => parseInt(id));
    console.log(`\n📋 Fetching user details for ${requestIds.length} request IDs...`);

    const users = await AccessRequest.findAll({
      where: { id: requestIds },
    });

    console.log(`✅ Found ${users.length} users with attendance data:`);

    if (users.length > 0) {
      console.log("\n📊 Attendance Summary:");
      users.forEach((user, index) => {
        const att = attendanceMap[user.id];
        console.log(`\n   ${index + 1}. ${user.fullName}`);
        console.log(`      ID: ${user.id}`);
        console.log(`      ID Number: ${user.idNumber}`);
        console.log(`      Organisation: ${user.organisation}`);
        console.log(`      First IN: ${att.firstIn || "N/A"}`);
        console.log(`      Last OUT: ${att.lastOut || "N/A"}`);
        console.log(`      Breaks: ${att.breaks}`);
      });
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total Scan Logs: ${totalLogs}`);
    console.log(`   Unique Users with Attendance: ${users.length}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("\n✅ Database connection closed");
  }
}

checkAttendance();
