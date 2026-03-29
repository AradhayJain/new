const jwt = require("jsonwebtoken");

const QRPass = require("../models/QRPass");
const AccessRequest = require("../models/AccessRequest");
const ScanLog = require("../models/ScanLog");

/**
 * ✅ Hardware Compatible Endpoint
 * POST /validate
 * Body: { qrData: "..." }
 * Response: { access: true/false }
 */
const validateHardwareQR = async (req, res) => {
    try {
        const qrData = req.body?.qrData;

        if (!qrData) {
            return res.status(400).json({
                access: false,
                message: "Missing QR Data",
                state: null,
            });
        }

        // ✅ Verify JWT Token
        let decoded;
        try {
            decoded = jwt.verify(qrData, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({
                access: false,
                message: "Invalid QR",
                state: null,
            });
        }

        // Map minified keys back to original variables (with fallback for legacy tokens)
        const { tId, rId, pTy, vU } = decoded;
        const tokenId = tId || decoded.tokenId;
        const requestId = rId || decoded.requestId;
        const passType = pTy !== undefined ? (pTy === 1 ? "IN" : "OUT") : decoded.passType;
        const validUntil = vU ? new Date(vU * 1000) : decoded.validUntil;

        // ✅ Expiry Check
        if (new Date() > new Date(validUntil)) {
            return res.status(401).json({
                access: false,
                message: "QR Expired",
                state: null,
            });
        }

        // ✅ QR must exist
        const qrPass = await QRPass.findOne({ where: { tokenId } });
        if (!qrPass) {
            return res.status(401).json({
                access: false,
                message: "QR Not Found",
                state: null,
            });
        }

        // ✅ Get User
        const user = await AccessRequest.findById(requestId);
        if (!user) {
            return res.status(401).json({
                access: false,
                message: "User Not Found",
                state: null,
            });
        }

        /**
         * ✅ STATE MACHINE SECURITY
         */
        if (passType === "IN") {
            if (user.currentState !== "OUTSIDE") {
                return res.status(401).json({
                    access: false,
                    message: "Already Inside",
                    state: user.currentState,
                });
            }

            user.currentState = "INSIDE";
            await user.save();

            await ScanLog.create({
                tokenId,
                gateId: "ROOM_ENTRY",
                result: "ALLOW",
                reason: "ENTRY_ALLOWED",
            });

            return res.status(200).json({
                access: true,
                message: "Welcome (Entry)",
                state: user.currentState,
            });
        }

        if (passType === "OUT") {
            if (user.currentState !== "INSIDE") {
                return res.status(401).json({
                    access: false,
                    message: "Already Outside",
                    state: user.currentState,
                });
            }

            user.currentState = "OUTSIDE";
            await user.save();

            await ScanLog.create({
                tokenId,
                gateId: "ROOM_EXIT",
                result: "ALLOW",
                reason: "EXIT_ALLOWED",
            });

            return res.status(200).json({
                access: true,
                message: "Goodbye (Exit)",
                state: user.currentState,
            });
        }

        return res.status(401).json({
            access: false,
            message: "Invalid Pass Type",
            state: user.currentState,
        });
    } catch (err) {
        console.log("VALIDATE ERROR:", err);

        return res.status(500).json({
            access: false,
            message: "Server Error",
            error: err.message,
            state: null,
        });

    }
};

module.exports = { validateHardwareQR };
