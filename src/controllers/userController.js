const AccessRequest = require("../models/AccessRequest");
const QRPass = require("../models/QRPass");
const User = require("../models/User");
const MachineToken = require("../models/MachineToken");
const ScanLog = require("../models/ScanLog");
const { getContributionCalendar } = require("../services/activityService");
const { getActiveQRType, checkRestriction } = require("../services/qrRotationService");
const { broadcast } = require("../services/notificationService");

/**
 * ✅ User submits access request (Firebase Protected)
 */
const submitAccessRequest = async (req, res) => {
  try {
    const { fullName, idNumber, organisation, validFrom, validUntil } = req.body;

    if (!fullName || !idNumber || !organisation) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!validFrom || !validUntil) {
      return res.status(400).json({ message: "Valid From and Valid Until are required" });
    }

    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    const now = new Date();

    if (isNaN(fromDate.getTime()) || isNaN(untilDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (fromDate >= untilDate) {
      return res.status(400).json({ message: "Valid Until must be after Valid From" });
    }

    if (untilDate <= now) {
      return res.status(400).json({ message: "Valid Until cannot be in the past" });
    }

    let existing = await AccessRequest.findOne({ idNumber });

    if (existing) {
      const isExpired = existing.validUntil && new Date(existing.validUntil) < now;
      const isRejected = existing.status === "REJECTED";

      if (!isExpired && !isRejected) {
        return res.status(409).json({ message: "An active or pending request already exists with this ID number" });
      }

      existing.fullName = fullName;
      existing.organisation = organisation;
      existing.validFrom = fromDate;
      existing.validUntil = untilDate;
      existing.status = "PENDING";
      existing.rejectionReason = null;
      if (req.user?.uid) existing.firebaseUid = req.user.uid;
      if (req.user?.email) existing.firebaseEmail = req.user.email;

      await existing.save();
      await QRPass.deleteMany({ requestId: existing._id });

      broadcast({ type: 'NEW_REQUEST', user: existing.fullName, rollNo: existing.idNumber });

      return res.status(201).json({ message: "✅ Access request renewed successfully", request: existing });
    }

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

    broadcast({ type: 'NEW_REQUEST', user: request.fullName, rollNo: request.idNumber });

    return res.status(201).json({ message: "✅ Access request submitted successfully", request });
  } catch (err) {
    console.error("❌ Error submitAccessRequest:", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * ✅ User fetches BOTH QRs using ID Number (Legacy fallback)
 */
const getUserQRByIdNumber = async (req, res) => {
  try {
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    
    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const request = await AccessRequest.findOne({ idNumber });
    if (!request) return res.status(404).json({ message: "No request found for this ID number" });

    if (!request.firebaseUid) {
      request.firebaseUid = req.user.uid;
      request.firebaseEmail = req.user.email;
      await request.save();
    }

    if (request.firebaseUid !== req.user.uid) {
      return res.status(403).json({ message: "This ID is registered to another account" });
    }

    if (request.status !== "APPROVED") {
      return res.json({ status: request.status, rejectionReason: request.rejectionReason, message: "QR not issued yet. Wait for admin approval." });
    }

    const passes = await QRPass.find({ requestId: request._id });
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
      entryQR: passes.find((p) => p.passType === "IN"),
      exitQR: passes.find((p) => p.passType === "OUT"),
    });
  } catch (err) {
    console.error("❌ Error getUserQRByIdNumber:", err.message);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * ✅ Get user's own contribution calendar
 */
const getMyContributionCalendar = async (req, res) => {
  try {
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const request = await AccessRequest.findOne({ idNumber });
    if (!request) return res.status(404).json({ message: "No request found" });
    if (request.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized access" });

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
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
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get active QR type (for dynamic rotation - Legacy)
 */
const getActiveQR = async (req, res) => {
  try {
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const request = await AccessRequest.findOne({ idNumber });
    if (!request) return res.status(404).json({ message: "No request found" });
    if (request.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized access" });
    if (request.status !== "APPROVED") return res.json({ status: request.status, message: "Not approved yet" });

    const restrictionCheck = await checkRestriction(request._id.toString());
    if (restrictionCheck.isRestricted) {
      return res.json({ status: "RESTRICTED", message: "Temporarily restricted", restrictionUntil: restrictionCheck.until });
    }

    const rotation = await getActiveQRType(request._id.toString());
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
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Get user's own profile
 */
const getMyProfile = async (req, res) => {
  try {
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const userProfile = await User.findOne({ rollNo: idNumber });
    if (!userProfile) return res.status(404).json({ message: "Profile not found" });
    if (userProfile.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized access" });

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
        preferredMachineId: userProfile.preferredMachineId,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Update user's own profile
 */
const updateMyProfile = async (req, res) => {
  try {
    const idNumber = decodeURIComponent((req.params[0] || req.params.idNumber || "").trim());
    const { department, organisation, fullName, profilePicture, phoneNumber, email, year, bio } = req.body;

    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const userProfile = await User.findOne({ rollNo: idNumber });
    if (!userProfile) return res.status(404).json({ message: "Profile not found" });
    if (userProfile.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized access" });

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
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Check if user profile exists
 */
const checkUserProfile = async (req, res) => {
  try {
    if (!req.user || (!req.user.email && !req.user.uid)) return res.status(401).json({ message: "Authentication required" });

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
          designation: existing.designation,
          preferredMachineId: existing.preferredMachineId 
        } 
      });
    }

    return res.json({ exists: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ Setup / Update User Profile
 */
const setupUserProfile = async (req, res) => {
  try {
    if (!req.user || (!req.user.email && !req.user.uid)) return res.status(401).json({ message: "Authentication required" });

    const { fullName, organisation, designation, rollNo, email, preferredMachineId } = req.body;
    if (!fullName || !organisation || !designation || !rollNo) return res.status(400).json({ message: "All fields are required" });

    const firebaseEmail = req.user.email || email;
    if (!firebaseEmail) return res.status(400).json({ message: "Firebase Email could not be resolved" });

    const query = [];
    if (firebaseEmail) query.push({ firebaseEmail: firebaseEmail });
    if (req.user.uid) query.push({ firebaseUid: req.user.uid });

    // 1. Check if the provided rollNo is already taken by another user
    const duplicateRollNo = await User.findOne({ 
      rollNo: { $regex: new RegExp(`^${rollNo}$`, "i") }, // Case-insensitive check
      firebaseUid: { $ne: req.user.uid } 
    });

    if (duplicateRollNo) {
      return res.status(409).json({ 
        message: `The ID Number "${rollNo}" is already registered to another account. Please contact support if you think this is an error.` 
      });
    }

    let user = await User.findOne({ $or: query });

    if (user) {
      user.fullName = fullName;
      user.organisation = organisation;
      user.designation = designation;
      user.rollNo = rollNo;
      if (preferredMachineId) user.preferredMachineId = preferredMachineId;
      await user.save();
    } else {
      user = await User.create({ 
        firebaseUid: req.user.uid, 
        firebaseEmail: firebaseEmail, 
        fullName, 
        organisation, 
        designation, 
        rollNo,
        preferredMachineId 
      });
    }

    return res.status(200).json({ message: "Profile saved successfully", user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ NEW: Check if a Roll Number is already taken
 */
const checkRollNoAvailability = async (req, res) => {
  try {
    const { rollNo } = req.params;
    const { uid } = req.query; // Optional: current user's UID to exclude them from the check

    if (!rollNo) return res.status(400).json({ message: "Roll Number required" });

    const existing = await User.findOne({ 
      rollNo: { $regex: new RegExp(`^${rollNo}$`, "i") },
      firebaseUid: { $ne: uid }
    });

    return res.json({ available: !existing });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ NEW: Get available machines for dropdown
 */
const getAvailableMachines = async (req, res) => {
  try {
    const machines = await MachineToken.distinct("machineId");
    // Provide fallback options if the database has not seen any machines yet
    const available = machines.length > 0 ? machines : ["GATE_A_MAIN", "GATE_B_MAIN"];
    return res.json({ success: true, machines: available });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const getUserRequests = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) return res.status(401).json({ message: "Authentication required" });

    const requests = await AccessRequest.find({ firebaseUid: req.user.uid })
      .sort({ createdAt: -1 })
      .select('fullName idNumber organisation status validFrom validUntil currentState rejectionReason createdAt updatedAt');

    return res.json({ success: true, requests, count: requests.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ==========================================
 * 🔥 NEW: PRE-ALLOCATED TOKEN FLOW METHODS 🔥
 * ==========================================
 */

/**
 * ✅ POST /api/user/allocate-qr
 * Allocates a single AVAILABLE token from the gate's pool to the user.
 */
const allocateQR = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { idNumber, machineId } = req.body;
    
    if (!idNumber || !machineId) {
      return res.status(400).json({ message: "idNumber and machineId are required" });
    }

    // 1. Verify User Access Request
    const request = await AccessRequest.findOne({ idNumber });
    if (!request) return res.status(404).json({ message: "No access request found" });
    if (request.firebaseUid && request.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized" });
    if (request.status !== "APPROVED") return res.status(403).json({ message: "Access not approved yet" });

    // 2. Validate Time Windows
    const now = new Date();
    if (request.validFrom && now < new Date(request.validFrom)) return res.status(403).json({ message: "Access period has not started yet" });
    if (request.validUntil && now > new Date(request.validUntil)) return res.status(403).json({ message: "Access period has expired" });

    // 3. Determine Required Pass Type (Entering or Exiting)
    const qrState = request.currentState === "OUTSIDE" ? "IN" : "OUT";

    // 4. Cleanup: Free any stale tokens this user requested earlier but never scanned
    await MachineToken.updateMany(
      { allocatedTo: request._id, status: "ALLOCATED" },
      { status: "AVAILABLE", allocatedTo: null, allocatedState: null, allocatedAt: null }
    );

    // 5. ATOMIC ALLOCATION: Safely grab 1 available token for this specific machine
    const token = await MachineToken.findOneAndUpdate(
      { machineId, status: "AVAILABLE" },
      { 
        status: "ALLOCATED", 
        allocatedTo: request._id,
        allocatedState: qrState, 
        allocatedAt: now 
      },
      { new: true } // Return the freshly updated document
    );

    if (!token) {
      return res.status(503).json({ message: "Gate is currently out of tokens. Please wait a few seconds for hardware sync." });
    }

    // 6. Format the secure payload for the QR string
    const qrData = `${token.tokenId}|${qrState}|${idNumber}`;

    console.log(`[QR] Allocated token ${token.tokenId} (${qrState}) to user ${idNumber} on machine ${machineId}`);

    return res.json({
      success: true,
      tokenId: token.tokenId,
      qrData,
      passType: qrState, // Kept to match frontend expectation
      currentState: request.currentState,
      machineId,
    });
  } catch (err) {
    console.error("[QR] allocateQR error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * ✅ POST /api/user/confirm-entry
 * Called 20s after QR is shown. Solely updates the user's software state machine.
 * Note: Hardware offline sync generates the actual trusted ScanLog.
 */
const confirmEntry = async (req, res) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { idNumber, enteredSuccessfully } = req.body;
    
    if (!idNumber || enteredSuccessfully === undefined) {
      return res.status(400).json({ message: "idNumber and enteredSuccessfully are required" });
    }

    const request = await AccessRequest.findOne({ idNumber });
    if (!request) return res.status(404).json({ message: "No access request found" });
    if (request.firebaseUid && request.firebaseUid !== req.user.uid) return res.status(403).json({ message: "Unauthorized" });

    // Only change state if they successfully passed through the gate
    if (enteredSuccessfully) {
      request.currentState = request.currentState === "OUTSIDE" ? "INSIDE" : "OUTSIDE";
      await request.save();
      console.log(`[QR] User ${idNumber} confirmed entry. State updated to: ${request.currentState}`);
    }

    return res.json({
      success: true,
      enteredSuccessfully,
      currentState: request.currentState,
      message: enteredSuccessfully 
        ? `Location state updated successfully.` 
        : `Location state unchanged.`
    });
  } catch (err) {
    console.error("[QR] confirmEntry error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  submitAccessRequest,
  getUserRequests,
  getUserQRByIdNumber,
  getMyContributionCalendar,
  getActiveQR,
  getMyProfile,
  updateMyProfile,
  checkUserProfile,
  setupUserProfile,
  allocateQR,
  confirmEntry,
  getAvailableMachines,
  checkRollNoAvailability,
};