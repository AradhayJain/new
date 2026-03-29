const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    const requiredVars = [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY",
    ];
    const missingVars = requiredVars.filter((key) => !process.env[key]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing Firebase env vars: ${missingVars.join(", ")}`
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin Initialized (ENV variables)");
  } catch (err) {
    console.log("❌ Firebase Admin Init Failed:", err.message);
  }
}

module.exports = admin;
