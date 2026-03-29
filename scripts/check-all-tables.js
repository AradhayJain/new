/**
 * Script to show all tables and their record counts
 * Run with: node scripts/check-all-tables.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");

async function checkAllTables() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    // Get all tables
    const [tables] = await sequelize.query("SHOW TABLES");
    
    console.log(`📊 Found ${tables.length} tables in database '${process.env.DB_NAME}':\n`);
    
    for (const tableObj of tables) {
      const tableName = Object.values(tableObj)[0];
      
      // Get count for each table
      const [[{ count }]] = await sequelize.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      
      console.log(`   📋 ${tableName}: ${count} records`);
      
      // If table has data, show column structure
      if (count > 0) {
        const [columns] = await sequelize.query(`DESCRIBE ${tableName}`);
        console.log(`      Columns: ${columns.map(c => c.Field).join(', ')}`);
        
        // Show first record as sample
        const [sample] = await sequelize.query(`SELECT * FROM ${tableName} LIMIT 1`);
        if (sample.length > 0) {
          console.log(`      Sample ID: ${sample[0].id || 'N/A'}`);
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("✅ Database connection closed");
  }
}

checkAllTables();
