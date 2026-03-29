/**
 * Test script to verify request-access endpoint works without authentication
 * Run with: node scripts/test-request-access.js
 */

const http = require("http");

const BASE_URL = "http://localhost:5000";

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => responseData += chunk);
      res.on("end", () => {
        try {
          resolve({ 
            status: res.statusCode, 
            data: JSON.parse(responseData),
            headers: res.headers
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: responseData,
            headers: res.headers
          });
        }
      });
    });

    req.on("error", reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testRequestAccess() {
  console.log("🧪 Testing /api/user/request-access without authentication\n");

  try {
    // Test 1: Submit request without auth token (should work now)
    console.log("1️⃣ Test: Submit access request WITHOUT Firebase token");
    
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days later

    const testRequest = {
      fullName: "Test User Without Auth",
      idNumber: "TESTNOAUTH001",
      organisation: "Test Organization",
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString()
    };

    const response = await makeRequest("POST", "/api/user/request-access", testRequest);
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.data);
    
    if (response.status === 201) {
      console.log(`   ✅ SUCCESS: Request created without authentication!`);
    } else if (response.status === 401) {
      console.log(`   ❌ FAILED: Still requires authentication (401)`);
    } else if (response.status === 409) {
      console.log(`   ⚠️  Request already exists (this is OK - previous test data)`);
    } else {
      console.log(`   ⚠️  Unexpected status: ${response.status}`);
    }

    console.log("\n");

    // Test 2: Test with invalid data
    console.log("2️⃣ Test: Submit with invalid data (missing fields)");
    const invalidRequest = {
      fullName: "Test",
      // missing idNumber and organisation
    };

    const invalidResponse = await makeRequest("POST", "/api/user/request-access", invalidRequest);
    console.log(`   Status: ${invalidResponse.status}`);
    console.log(`   Response:`, invalidResponse.data);
    
    if (invalidResponse.status === 400) {
      console.log(`   ✅ Validation working correctly`);
    }

    console.log("\n✅ Tests completed!");
    console.log("\n📝 Summary:");
    console.log("   • Endpoint should accept requests without Firebase auth");
    console.log("   • Status 201 = Success");
    console.log("   • Status 409 = Duplicate (already exists)");
    console.log("   • Status 400 = Validation error");
    console.log("   • Status 401 = Auth required (should NOT happen anymore)");

  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Check if server is running first
makeRequest("GET", "/", null)
  .then(() => {
    console.log("✅ Backend server is running\n");
    return testRequestAccess();
  })
  .catch((err) => {
    console.log("❌ Backend server is not running!");
    console.log("   Please start the server first with: npm start");
    console.log(`   Error: ${err.message}`);
  });
