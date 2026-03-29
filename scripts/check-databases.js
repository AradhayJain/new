/**
 * Script to show all databases
 * Run with: node scripts/check-databases.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");

async function checkDatabases() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    console.log(`📊 Current database: ${process.env.DB_NAME}`);
    console.log(`   Host: ${process.env.DB_HOST}`);
    console.log(`   User: ${process.env.DB_USER}\n`);

    // Get all databases
    const [databases] = await sequelize.query("SHOW DATABASES");
    
    console.log(`📋 Available databases:`);
    databases.forEach(db => {
      const dbName = Object.values(db)[0];
      const isCurrent = dbName === process.env.DB_NAME;
      console.log(`   ${isCurrent ? '👉' : '  '} ${dbName}${isCurrent ? ' (CURRENT)' : ''}`);
    });

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await sequelize.close();
    console.log("\n✅ Database connection closed");
  }
}

checkDatabases();
