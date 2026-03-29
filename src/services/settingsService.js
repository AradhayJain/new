const SystemSettings = require("../models/SystemSettings");

/**
 * Get restriction duration in minutes
 * Default: 10 minutes if not set
 */
const getRestrictionDuration = async () => {
  try {
    const setting = await SystemSettings.findOne({
      settingKey: "RESTRICTION_DURATION_MINUTES",
    });

    if (!setting) {
      // Create default setting if not exists
      const defaultSetting = await SystemSettings.create({
        settingKey: "RESTRICTION_DURATION_MINUTES",
        settingValue: 10,
        description: "Duration in minutes for scan abuse restriction",
      });
      return defaultSetting.settingValue;
    }

    return setting.settingValue;
  } catch (err) {
    console.error("Error fetching restriction duration:", err.message);
    return 10; // Fallback to default
  }
};

/**
 * Update restriction duration
 * Validates: 1-120 minutes
 */
const updateRestrictionDuration = async (durationMinutes) => {
  try {
    // Validation
    const duration = parseInt(durationMinutes);
    if (isNaN(duration) || duration < 1 || duration > 120) {
      throw new Error("Duration must be between 1 and 120 minutes");
    }

    const setting = await SystemSettings.findOneAndUpdate(
      { settingKey: "RESTRICTION_DURATION_MINUTES" },
      {
        settingKey: "RESTRICTION_DURATION_MINUTES",
        settingValue: duration,
        description: "Duration in minutes for scan abuse restriction",
      },
      { upsert: true, new: true }
    );

    return setting;
  } catch (err) {
    console.error("Error updating restriction duration:", err.message);
    throw err;
  }
};

/**
 * Get all system settings
 */
const getAllSettings = async () => {
  try {
    const settings = await SystemSettings.find();
    return settings;
  } catch (err) {
    console.error("Error fetching settings:", err.message);
    return [];
  }
};

module.exports = {
  getRestrictionDuration,
  updateRestrictionDuration,
  getAllSettings,
};
