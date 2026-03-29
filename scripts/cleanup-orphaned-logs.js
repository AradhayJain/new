/**
 * Script to clean up orphaned scan logs (logs without matching users)
 * Run with: node scripts/cleanup-orphaned-logs.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");
const ScanLog = require("../src/models/ScanLog");
const AccessRequest = require("../src/models/AccessRequest");

async function cleanupOrphanedLogs() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    // Get all scan logs
    const allLogs = await ScanLog.findAll();
    console.log(`📊 Total scan logs: ${allLogs.length}`);

    // Get all valid request IDs
    const allUsers = await AccessRequest.findAll({ attributes: ['id'] });
    const validRequestIds = new Set(allUsers.map(u => u.id));
    console.log(`📊 Valid user IDs: ${validRequestIds.size}\n`);

    // Find orphaned logs
    const orphanedLogs = allLogs.filter(log => !validRequestIds.has(log.requestId));
    
    console.log(`🔍 Found ${orphanedLogs.length} orphaned scan logs:`);
    
    if (orphanedLogs.length > 0) {
      // Group by request ID
      const groupedOrphans = {};
      orphanedLogs.forEach(log => {
        if (!groupedOrphans[log.requestId]) {
          groupedOrphans[log.requestId] = [];
        }
        groupedOrphans[log.requestId].push(log);
      });

      console.log(`   Orphaned logs by Request ID:`);
      Object.entries(groupedOrphans).forEach(([requestId, logs]) => {
        console.log(`      Request ID ${requestId}: ${logs.length} logs`);
      });

      console.log(`\n❓ Do you want to delete these orphaned logs?`);
      console.log(`   To delete, run this query manually in MySQL:`);
      console.log(`   
      DELETE FROM scanlogs 
      WHERE requestId NOT IN (SELECT id FROM accessrequests);
      `);
      
      console.log(`\n   Or uncomment the deletion code in this script.`);
      
      // Uncomment the lines below to actually delete orphaned logs
      // console.log("\n🗑️  Deleting orphaned logs...");
      // const orphanedIds = orphanedLogs.map(log => log.id);
      // await ScanLog.destroy({ where: { id: orphanedIds } });
      // console.log(`✅ Deleted ${orphanedIds.length} orphaned logs`);
      
    } else {
      console.log(`   ✅ No orphaned logs found!`);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("\n✅ Database connection closed");
  }
}

cleanupOrphanedLogs();
