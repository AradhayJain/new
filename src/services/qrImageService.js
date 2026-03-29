const QRCode = require("qrcode");

const generateQRImage = async (token) => {
  return await QRCode.toDataURL(token);
};

module.exports = { generateQRImage };
