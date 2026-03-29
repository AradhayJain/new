// Express route handler for user activity calendar
const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const Activity = require("../models/Activity"); // Example model

// GET /api/users/:userId/activity?year=YYYY
router.get("/users/:userId/activity", requireAuth, async (req, res) => {
  const { userId } = req.params;
  const { year } = req.query;
  const requester = req.user; // Populated by requireAuth

  // Only allow self unless admin
  if (requester.role !== "admin" && requester.id !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Get all days in year
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${Number(year) + 1}-01-01`);

  // Query activity for user in year
  // Should be indexed on (user_id, date)
  const raw = await Activity.find({
    userId,
    date: { $gte: start, $lt: end },
  }).lean();

  // Map by date
  const map = {};
  raw.forEach(a => { map[a.date.toISOString().slice(0, 10)] = a.count; });

  // Fill all days
  const days = [];
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: map[dateStr] || 0 });
  }

  res.json({ activity: days });
});

module.exports = router;
