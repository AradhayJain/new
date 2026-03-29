/**
 * Script to populate test data for testing
 * Run with: node scripts/populate-test-data.js
 */

require("dotenv").config();

const { sequelize } = require("../src/config/db");
const AccessRequest = require("../src/models/AccessRequest");
const QRPass = require("../src/models/QRPass");
const ScanLog = require("../src/models/ScanLog");

async function populateTestData() {
  try {
    console.log("🔍 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connection established\n");

    // Create test users
    console.log("📝 Creating test approved users...");
    
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const user1 = await AccessRequest.create({
      fullName: "Test User One",
      idNumber: "TEST001",
      email: "test1@example.com",
      organisation: "Test Org Alpha",
      purpose: "Testing",
      validFrom: validFrom,
      validUntil: validUntil,
      status: "APPROVED",
      currentState: "OUTSIDE",
      uid: "test-uid-001"
    });

    const user2 = await AccessRequest.create({
      fullName: "Test User Two",
      idNumber: "TEST002",
      email: "test2@example.com",
      organisation: "Test Org Beta",
      purpose: "Development",
      validFrom: validFrom,
      validUntil: validUntil,
      status: "APPROVED",
      currentState: "OUTSIDE",
      uid: "test-uid-002"
    });

    const user3 = await AccessRequest.create({
      fullName: "Test User Three",
      idNumber: "TEST003",
      email: "test3@example.com",
      organisation: "Test Org Gamma",
      purpose: "Quality Assurance",
      validFrom: validFrom,
      validUntil: validUntil,
      status: "APPROVED",
      currentState: "INSIDE",
      uid: "test-uid-003"
    });

    console.log(`✅ Created ${3} test users`);

    // Create QR passes for users
    console.log("\n📝 Creating QR passes...");
    
    await QRPass.create({
      requestId: user1.id,
      passType: "IN",
      tokenId: `test-token-in-${user1.id}`,
      qrToken: "test-qr-token-in-1",
      status: "ACTIVE"
    });

    await QRPass.create({
      requestId: user1.id,
      passType: "OUT",
      tokenId: `test-token-out-${user1.id}`,
      qrToken: "test-qr-token-out-1",
      status: "ACTIVE"
    });

    console.log(`✅ Created QR passes for users`);

    // Create scan logs
    console.log("\n📝 Creating scan logs...");
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();

    await ScanLog.create({
      requestId: user1.id,
      tokenId: `test-token-in-${user1.id}`,
      passType: "IN",
      gateId: "ENTER_GATE",
      result: "ALLOW",
      reason: null,
      createdAt: yesterday
    });

    await ScanLog.create({
      requestId: user1.id,
      tokenId: `test-token-out-${user1.id}`,
      passType: "OUT",
      gateId: "EXIT_GATE",
      result: "ALLOW",
      reason: null,
      createdAt: today
    });

    await ScanLog.create({
      requestId: user2.id,
      tokenId: `test-token-in-${user2.id}`,
      passType: "IN",
      gateId: "ENTER_GATE",
      result: "ALLOW",
      reason: null,
      createdAt: yesterday
    });

    await ScanLog.create({
      requestId: user3.id,
      tokenId: `test-token-in-${user3.id}`,
      passType: "IN",
      gateId: "ENTER_GATE",
      result: "ALLOW",
      reason: null,
      createdAt: yesterday
    });

    console.log(`✅ Created ${4} scan logs`);

    // Verify data
    console.log("\n📊 Verifying data...");
    const approvedCount = await AccessRequest.count({ where: { status: "APPROVED" } });
    const passCount = await QRPass.count();
    const logCount = await ScanLog.count();

    console.log(`   ✅ Approved users: ${approvedCount}`);
    console.log(`   ✅ QR passes: ${passCount}`);
    console.log(`   ✅ Scan logs: ${logCount}`);

    console.log("\n✅ Test data populated successfully!");

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("\n✅ Database connection closed");
  }
}

populateTestData();
