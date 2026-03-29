module.exports = (req, res, next) => {
  const key =
    req.headers["x-gate-key"] ||
    req.headers["x-gate-secret"] ||
    req.body?.gateKey ||
    req.query?.gateKey;

  if (!process.env.GATE_SECRET_KEY) {
    return res.status(500).json({
      status: "DENY",
      message: "GATE_SECRET_KEY_NOT_CONFIGURED",
    });
  }

  if (!key || key !== process.env.GATE_SECRET_KEY) {
    return res.status(401).json({
      status: "DENY",
      message: "UNAUTHORIZED_GATE",
    });
  }

  next();
};
