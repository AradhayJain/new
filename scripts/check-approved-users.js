/**
 * Script to check approved users in the database
 * Run with: node scripts/check-approved-users.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");
const AccessRequest = require("../src/models/AccessRequest");

async function checkApprovedUsers() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    console.log("📊 Checking AccessRequest table...");
    console.log(`   Table name: ${AccessRequest.tableName}`);
    
    // Get total count
    const totalCount = await AccessRequest.count();
    console.log(`   Total records: ${totalCount}\n`);

    // Get approved users
    const approvedUsers = await AccessRequest.findAll({
      where: { status: "APPROVED" },
      order: [["updatedAt", "DESC"]],
    });

    console.log(`✅ Found ${approvedUsers.length} approved users:`);
    
    if (approvedUsers.length > 0) {
      console.log("\n📋 Approved Users:");
      approvedUsers.forEach((user, index) => {
        console.log(`\n   ${index + 1}. ${user.fullName}`);
        console.log(`      ID: ${user.id}`);
        console.log(`      ID Number: ${user.idNumber}`);
        console.log(`      Organisation: ${user.organisation}`);
        console.log(`      Status: ${user.status}`);
        console.log(`      Valid From: ${user.validFrom}`);
        console.log(`      Valid Until: ${user.validUntil}`);
        console.log(`      Created: ${user.createdAt}`);
      });
    } else {
      console.log("\n⚠️ No approved users found in database");
    }

    // Get all users by status
    const pendingCount = await AccessRequest.count({ where: { status: "PENDING" } });
    const rejectedCount = await AccessRequest.count({ where: { status: "REJECTED" } });

    console.log(`\n📊 Summary:`);
    console.log(`   Total: ${totalCount}`);
    console.log(`   Approved: ${approvedUsers.length}`);
    console.log(`   Pending: ${pendingCount}`);
    console.log(`   Rejected: ${rejectedCount}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("\n✅ Database connection closed");
  }
}

checkApprovedUsers();
