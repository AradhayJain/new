/**
 * Script to test API endpoints directly
 * Run with: node scripts/test-api-endpoints.js
 * Make sure the backend server is running!
 */

const http = require("http");

const BASE_URL = "http://localhost:5000";

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${path}`, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    }).on("error", reject);
  });
}

async function testEndpoints() {
  console.log("🧪 Testing API Endpoints...\n");

  try {
    // Test 1: Get approved users
    console.log("1️⃣ Testing GET /api/admin/approved");
    try {
      const approvedRes = await makeRequest("/api/admin/approved");
      console.log(`   ✅ Status: ${approvedRes.status}`);
      console.log(`   ✅ Data structure:`, {
        count: approvedRes.data.count,
        usersLength: approvedRes.data.users?.length,
        firstUser: approvedRes.data.users?.[0] ? {
          id: approvedRes.data.users[0].id,
          fullName: approvedRes.data.users[0].fullName,
          status: approvedRes.data.users[0].status,
        } : null,
      });
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }

    console.log("\n");

    // Test 2: Get attendance
    console.log("2️⃣ Testing GET /api/admin/attendance");
    try {
      const attendanceRes = await makeRequest("/api/admin/attendance");
      console.log(`   ✅ Status: ${attendanceRes.status}`);
      console.log(`   ✅ Data structure:`, {
        isArray: Array.isArray(attendanceRes.data),
        length: attendanceRes.data?.length,
        firstRecord: attendanceRes.data?.[0] ? {
          requestId: attendanceRes.data[0].requestId,
          fullName: attendanceRes.data[0].fullName,
          firstIn: attendanceRes.data[0].firstIn,
          lastOut: attendanceRes.data[0].lastOut,
        } : null,
      });
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }

    console.log("\n");

    // Test 3: Get pending requests
    console.log("3️⃣ Testing GET /api/admin/requests");
    try {
      const requestsRes = await makeRequest("/api/admin/requests");
      console.log(`   ✅ Status: ${requestsRes.status}`);
      console.log(`   ✅ Data structure:`, {
        count: requestsRes.data.count,
        requestsLength: requestsRes.data.requests?.length,
      });
    } catch (err) {
      console.log(`   ❌ Failed: ${err.message}`);
    }

    console.log("\n✅ Endpoint tests completed");

  } catch (error) {
    console.error("❌ Unexpected error:", error.message);
  }
}

// Check if server is running first
makeRequest("/")
  .then(() => {
    console.log("✅ Backend server is running\n");
    return testEndpoints();
  })
  .catch((err) => {
    console.log("❌ Backend server is not running!");
    console.log("   Please start the server first with: npm start");
    console.log(`   Error: ${err.message}`);
  });
