const AccessRequest = require("../models/AccessRequest");
const QRPass = require("../models/QRPass");
const User = require("../models/User");
const { getContributionCalendar } = require("../services/activityService");
const { getActiveQRType, checkRestriction } = require("../services/qrRotationService");
const { broadcast } = require("../services/notificationService");

/**
 * ✅ User submits access request (Firebase Protected)
 * Ensures user-selected dates are stored as proper Date objects
 */
const submitAccessRequest = async (req, res) => {
  try {
    const { fullName, idNumber, organisation, validFrom, validUntil } = req.body;

    // Basic validation
    if (!fullName || !idNumber || !organisation) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Enforce standard roll format
    // if (idNumber.includes("/")) {
    //   return res.status(400).json({ message: "Roll number must not contain '/'" });
    // }

    // Validity dates check
    if (!validFrom || !validUntil) {
      return res.status(400).json({ message: "Valid From and Valid Until are required" });
    }

    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    const now = new Date();

    // Date logic validation
    if (isNaN(fromDate.getTime()) || isNaN(untilDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (fromDate >= untilDate) {
      return res.status(400).json({ message: "Valid Until must be after Valid From" });
    }

    if (untilDate <= now) {
      return res.status(400).json({ message: "Valid Until cannot be in the past" });
    }

    // Prevent duplicate active requests, but allow re-applying if expired or rejected
    let existing = await AccessRequest.findOne({ idNumber });

    if (existing) {
      const isExpired = existing.validUntil && new Date(existing.validUntil) < now;
      const isRejected = existing.status === "REJECTED";

      if (!isExpired && !isRejected) {
        return res.status(409).json({ message: "An active or pending request already exists with this ID number" });
      }

      // If expired or rejected, update the existing request to PENDING with new details
      existing.fullName = fullName;
      existing.organisation = organisation;
      existing.validFrom = fromDate;
      existing.validUntil = untilDate;
      existing.status = "PENDING";
      existing.rejectionReason = null;
      if (req.user?.uid) existing.firebaseUid = req.user.uid;
      if (req.user?.email) existing.firebaseEmail = req.user.email;

      await existing.save();

      // Delete old QR passes associated with this request
      await QRPass.deleteMany({ requestId: existing._id });

      // ✅ Broadcast to admins about the renewed request
      broadcast({ 
        type: 'NEW_REQUEST', 
        user: existing.fullName, 
        rollNo: existing.idNumber 
      });

      return res.status(201).json({
        message: "✅ Access request renewed successfully",
        request: existing,
      });
    }

    // ✅ Create request with stored validity window
    // Firebase auth is optional - users can submit before logging in
    const request = await AccessRequest.create({
      fullName,
      idNumber,
      organisation,
      validFrom: fromDate,
      validUntil: untilDate,
      firebaseUid: req.user?.uid || null,
      firebaseEmail: req.user?.email || null,
      status: "PENDING"
    });

    // ✅ Broadcast to admins about the new request
    broadcast({ 
      type: 'NEW_REQUEST', 
      user: request.fullName, 
      rollNo: request.idNumber 
    });

    return res.status(201).json({
      message: "✅ Access request submitted successfully",
      request,
    });
  } catch (err) {
    console.error("❌ Error submitAccessRequest:", err.message);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/**
 * ✅ User fetches BOTH QRs using ID Number
 */
const getUserQRByIdNumber = async (req, res) => {
  try {
    // Wildcard route: extract the full roll number (may include slashes like 23/SE/009)
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    console.log(`[DEBUG] Fetching QR for ID: ${idNumber}`);

    if (!req.user || !req.user.uid) {
      console.log(`[DEBUG] No req.user or missing uid`);
      return res.status(401).json({ message: "Authentication required" });
    }

    const request = await AccessRequest.findOne({ idNumber });

    if (!request) {
      console.log(`[DEBUG] No AccessRequest found for idNumber: ${idNumber}`);
      return res.status(404).json({ message: "No request found for this ID number" });
    }

    // ✅ Link Firebase UID if not already linked
    if (!request.firebaseUid) {
      request.firebaseUid = req.user.uid;
      request.firebaseEmail = req.user.email;
      await request.save();
    }

    // ✅ Check if Firebase UID matches
    if (request.firebaseUid !== req.user.uid) {
      console.log(`[DEBUG] UID Mismatch! request.firebaseUid=${request.firebaseUid}, req.user.uid=${req.user.uid}`);
      return res.status(403).json({ message: "This ID is registered to another account" });
    }

    if (request.status !== "APPROVED") {
      return res.json({
        status: request.status,
        rejectionReason: request.rejectionReason,
        message: "QR not issued yet. Wait for admin approval.",
      });
    }

    const passes = await QRPass.find({ requestId: request._id });

    // ✅ Return only the active QR based on currentState
    const activeQRType = request.currentState === "OUTSIDE" ? "IN" : "OUT";
    const activePass = passes.find((p) => p.passType === activeQRType);

    return res.json({
      status: "APPROVED",
      fullName: request.fullName,
      idNumber: request.idNumber,
      organisation: request.organisation,
      validFrom: request.validFrom,
      validUntil: request.validUntil,
      currentState: request.currentState,
      activeQRType: activeQRType,
      activeQR: activePass,
      // Still send both for backward compatibility
      entryQR: passes.find((p) => p.passType === "IN"),
      exitQR: passes.find((p) => p.passType === "OUT"),
    });
  } catch (err) {
    console.error("❌ Error getUserQRByIdNumber:", err.message);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/**
 * ✅ Get user's own contribution calendar
 */
const getMyContributionCalendar = async (req, res) => {
  try {
    // Wildcard route: extract the full roll number (may include slashes like 23/SE/009)
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const request = await AccessRequest.findOne({ idNumber });

    if (!request) {
      return res.status(404).json({ message: "No request found" });
    }

    if (request.firebaseUid !== req.user.uid) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Get last 90 days
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const calendar = await getContributionCalendar(request._id.toString(), startDate, endDate);

    const totalDays = calendar.length;
    const totalDuration = calendar.reduce((sum, day) => sum + day.totalDuration, 0);

    return res.json({
      calendar,
      statistics: {
        totalDays,
        totalDuration,
        averageDuration: totalDays > 0 ? Math.round(totalDuration / totalDays) : 0,
      },
    });
  } catch (err) {
    console.error("Calendar fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get active QR type (for dynamic rotation)
 */
const getActiveQR = async (req, res) => {
  try {
    // Wildcard route: extract the full roll number (may include slashes like 23/SE/009)
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const request = await AccessRequest.findOne({ idNumber });

    if (!request) {
      return res.status(404).json({ message: "No request found" });
    }

    if (request.firebaseUid !== req.user.uid) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    if (request.status !== "APPROVED") {
      return res.json({
        status: request.status,
        message: "Not approved yet",
      });
    }

    // Check for restrictions
    const restrictionCheck = await checkRestriction(request._id.toString());
    if (restrictionCheck.isRestricted) {
      return res.json({
        status: "RESTRICTED",
        message: "Temporarily restricted due to abuse detection",
        restrictionUntil: restrictionCheck.until,
      });
    }

    // Get active QR type
    const rotation = await getActiveQRType(request._id.toString());

    // Get the appropriate QR pass
    const passes = await QRPass.find({ requestId: request._id });
    const activePass = passes.find((p) => p.passType === rotation.activeQRType);

    return res.json({
      status: "APPROVED",
      activeQRType: rotation.activeQRType,
      qrToken: activePass?.qrToken,
      rotationTimestamp: rotation.rotationTimestamp,
      currentState: request.currentState,
    });
  } catch (err) {
    console.error("Active QR fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get user's own profile
 */
const getMyProfile = async (req, res) => {
  try {
    // Wildcard route: extract the full roll number (may include slashes like 23/SE/009)
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userProfile = await User.findOne({ rollNo: idNumber });

    if (!userProfile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (userProfile.firebaseUid !== req.user.uid) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Fetch the latest access request to attach validity status
    const request = await AccessRequest.findOne({ idNumber }).sort({ createdAt: -1 });

    return res.json({
      profile: {
        id: userProfile._id,
        fullName: userProfile.fullName,
        idNumber: userProfile.rollNo,
        organisation: userProfile.organisation,
        department: userProfile.designation,
        email: userProfile.firebaseEmail,
        profilePicture: userProfile.profilePicture,
        phoneNumber: userProfile.phoneNumber,
        year: userProfile.year,
        bio: userProfile.bio,
        status: request ? request.status : "NONE",
        validFrom: request ? request.validFrom : null,
        validUntil: request ? request.validUntil : null,
        currentState: request ? request.currentState : "OUTSIDE",
      },
    });
  } catch (err) {
    console.error("Profile fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update user's own profile
 */
const updateMyProfile = async (req, res) => {
  try {
    // Wildcard route: extract the full roll number (may include slashes like 23/SE/009)
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    const { department, organisation, fullName, profilePicture, phoneNumber, email, year, bio } = req.body;

    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userProfile = await User.findOne({ rollNo: idNumber });

    if (!userProfile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (userProfile.firebaseUid !== req.user.uid) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Update allowed fields
    if (department !== undefined) userProfile.designation = department;
    if (organisation !== undefined) userProfile.organisation = organisation;
    if (fullName !== undefined) userProfile.fullName = fullName;
    if (profilePicture !== undefined) userProfile.profilePicture = profilePicture;
    if (phoneNumber !== undefined) userProfile.phoneNumber = phoneNumber;
    if (email !== undefined) userProfile.firebaseEmail = email;
    if (year !== undefined) userProfile.year = year;
    if (bio !== undefined) userProfile.bio = bio;

    await userProfile.save();

    return res.json({
      message: "Profile updated successfully",
      profile: {
        id: userProfile._id,
        fullName: userProfile.fullName,
        idNumber: userProfile.rollNo,
        organisation: userProfile.organisation,
        department: userProfile.designation,
        email: userProfile.firebaseEmail,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Check if user profile exists
 */
const checkUserProfile = async (req, res) => {
  try {
    if (!req.user || (!req.user.email && !req.user.uid)) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const query = [];
    if (req.user.email) query.push({ firebaseEmail: req.user.email });
    if (req.user.uid) query.push({ firebaseUid: req.user.uid });

    const existing = await User.findOne({ $or: query }).sort({ createdAt: -1 });

    if (existing) {
      return res.json({
        exists: true,
        data: {
          fullName: existing.fullName,
          rollNo: existing.rollNo,
          organisation: existing.organisation,
          designation: existing.designation
        }
      });
    }

    return res.json({ exists: false });
  } catch (err) {
    console.error("Check profile error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Setup / Update User Profile
 */
const setupUserProfile = async (req, res) => {
  try {
    if (!req.user || (!req.user.email && !req.user.uid)) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { fullName, organisation, designation, rollNo, email } = req.body;

    if (!fullName || !organisation || !designation || !rollNo) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const firebaseEmail = req.user.email || email;

    if (!firebaseEmail) {
      return res.status(400).json({ message: "Firebase Email could not be resolved" });
    }

    const query = [];
    if (firebaseEmail) query.push({ firebaseEmail: firebaseEmail });
    if (req.user.uid) query.push({ firebaseUid: req.user.uid });

    let user = await User.findOne({ $or: query });

    if (user) {
      user.fullName = fullName;
      user.organisation = organisation;
      user.designation = designation;
      user.rollNo = rollNo;
      await user.save();
    } else {
      user = await User.create({
        firebaseUid: req.user.uid,
        firebaseEmail: firebaseEmail,
        fullName,
        organisation,
        designation,
        rollNo,
      });
    }

    return res.status(200).json({ message: "Profile saved successfully", user });
  } catch (err) {
    console.error("Setup profile error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  submitAccessRequest,
  getUserQRByIdNumber,
  getMyContributionCalendar,
  getActiveQR,
  getMyProfile,
  updateMyProfile,
  checkUserProfile,
  setupUserProfile,
};
