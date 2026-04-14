const {
  getRestrictionDuration,
  updateRestrictionDuration,
  getFlaggingWindow,
  updateFlaggingWindow,
  getAllSettings,
} = require("../services/settingsService");

/**
 * Get current restriction duration
 */
const getRestrictionSettings = async (req, res) => {
  try {
    const duration = await getRestrictionDuration();
    const window = await getFlaggingWindow();

    return res.json({
      restrictionDurationMinutes: duration,
      flaggingWindowMinutes: window,
      message: "Current restriction settings retrieved",
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
    const { durationMinutes, flaggingWindowMinutes } = req.body;

    let restrictionDuration = null;
    let flaggingWindow = null;

    if (durationMinutes) {
      const setting = await updateRestrictionDuration(durationMinutes);
      restrictionDuration = setting.settingValue;
    }

    if (flaggingWindowMinutes) {
      const setting = await updateFlaggingWindow(flaggingWindowMinutes);
      flaggingWindow = setting.settingValue;
    }

    return res.json({
      message: "Restriction settings updated successfully",
      restrictionDurationMinutes: restrictionDuration,
      flaggingWindowMinutes: flaggingWindow,
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
