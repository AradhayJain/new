const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * ✅ UNIVERSAL FIX: Hard-binds JWT Expiry to Database validUntil
 */
const generateQRToken = (request, passType) => {
  // Use a tiny 8-character base64url string instead of 16-character hex
  const tokenId = crypto.randomBytes(6).toString("base64url");

  if (!request.validUntil) {
    throw new Error("CRITICAL: Cannot generate QR without validUntil timestamp.");
  }

  const expiryDate = new Date(request.validUntil);
  const now = new Date();

  // Calculate exact seconds from right now until the user-selected end time
  const secondsRemaining = Math.floor((expiryDate.getTime() - now.getTime()) / 1000);

  // If the time has already passed, we give it a 1-second expiry (instantly invalid)
  // This prevents the 'expiresIn' from being negative or null
  const expiresInSeconds = secondsRemaining > 0 ? secondsRemaining : 1;

  // Use minified keys and epoch timestamps to significantly reduce token size
  const payload = {
    tId: tokenId,
    rId: request.id,
    // idn: request.idNumber,
    pTy: passType === "IN" ? 1 : 0,
    vF: request.validFrom ? Math.floor(new Date(request.validFrom).getTime() / 1000) : null,
    vU: Math.floor(expiryDate.getTime() / 1000),
  };

  // ✅ FORCED TTL: This overrides any global defaults
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: expiresInSeconds,
  });

  return { tokenId, token };
};

module.exports = { generateQRToken };
