const {
  getRestrictionDuration,
  updateRestrictionDuration,
  getAllSettings,
} = require("../services/settingsService");

/**
 * Get current restriction duration
 */
const getRestrictionSettings = async (req, res) => {
  try {
    const duration = await getRestrictionDuration();

    return res.json({
      restrictionDurationMinutes: duration,
      message: "Current restriction duration retrieved",
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      message: "Failed to fetch restriction settings",
    });
  }
};

/**
 * Update restriction duration (Admin only)
 */
const updateRestrictionSettings = async (req, res) => {
  try {
    const { durationMinutes } = req.body;

    if (!durationMinutes) {
      return res.status(400).json({
        message: "durationMinutes is required",
      });
    }

    const setting = await updateRestrictionDuration(durationMinutes);

    return res.json({
      message: "Restriction duration updated successfully",
      restrictionDurationMinutes: setting.settingValue,
    });
  } catch (err) {
    return res.status(400).json({
      error: err.message,
      message: "Failed to update restriction settings",
    });
  }
};

/**
 * Get all system settings (Admin only)
 */
const getSystemSettings = async (req, res) => {
  try {
    const settings = await getAllSettings();

    return res.json({
      settings,
      count: settings.length,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      message: "Failed to fetch system settings",
    });
  }
};

module.exports = {
  getRestrictionSettings,
  updateRestrictionSettings,
  getSystemSettings,
};
