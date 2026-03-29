# 📋 Quick Reference - Scripts & Commands

## Run Diagnostic Scripts

All scripts are located in `QR_Backend/scripts/`

### Check Data in Database
```bash
# Check approved users
node scripts/check-approved-users.js

# Check attendance logs  
node scripts/check-attendance.js

# View all tables and counts
node scripts/check-all-tables.js

# Check available databases
node scripts/check-databases.js

# Find orphaned scan logs
node scripts/cleanup-orphaned-logs.js
```

### Test API Endpoints
```bash
# Make sure backend server is running first!
node scripts/test-api-endpoints.js
```

### Populate Test Data (Development Only)
```bash
# Add 3 test users with scan logs
node scripts/populate-test-data.js
```

---

## Current Status ✅

### Database
- **3 Approved Users** in AccessRequests table
- **2 QR Passes** generated
- **52 Scan Logs** (6 valid + 46 orphaned)

### API Endpoints
- ✅ `GET /api/admin/approved` - Returns 3 users
- ✅ `GET /api/admin/attendance` - Returns 3 records
- ✅ `GET /api/admin/requests` - Working (0 pending)

### Wiring
- ✅ All routes properly configured
- ✅ Controllers working correctly
- ✅ Frontend calling correct endpoints
- ✅ Database connection stable

---

## What Was Fixed

### Root Cause
❌ Database was empty (0 records in AccessRequests table)

### Solution Applied
✅ Added test data to verify system functionality  
✅ Confirmed all API endpoints working  
✅ Verified data structure matches frontend expectations  

### No Code Changes Needed
The system wiring was already correct. The issue was simply empty database.

---

## Next Steps

### View Data in Admin Panel
1. Make sure backend server is running
2. Open frontend admin panel
3. Navigate to "Approved Users" tab
4. Navigate to "Attendance" tab
5. You should now see the test data

### Add Real Production Data
**Option 1**: Users submit requests
1. Users go to website and submit access request
2. Admin approves request
3. Data appears in admin panel

**Option 2**: Import from backup
If you had real data before, restore from database backup

### Clean Up Test Data (Optional)
```sql
DELETE FROM accessrequests WHERE idNumber LIKE 'TEST%';
```

---

## Troubleshooting

### If you still can't see data in frontend:

1. **Check backend is running**
   ```bash
   # Should show: ✅ FocusDesk Backend Running
   curl http://localhost:5000
   ```

2. **Verify API responses**
   ```bash
   node scripts/test-api-endpoints.js
   ```

3. **Check browser console**
   - Open DevTools (F12)
   - Look for any error messages
   - Check Network tab for failed requests

4. **Verify frontend API URL**
   - Check `QR_Frontend/src/api/api.ts`
   - Should be: `baseURL: "http://localhost:5000"`

---

## Database Cleanup (Optional)

### Remove Orphaned Scan Logs
46 scan logs reference users that don't exist (request IDs 5, 11).

To clean them up, run in MySQL:
```sql
DELETE FROM scanlogs 
WHERE requestId NOT IN (SELECT id FROM accessrequests);
```

---

## System Health Check

Run this complete check:
```bash
# 1. Check database tables
node scripts/check-all-tables.js

# 2. Verify approved users
node scripts/check-approved-users.js

# 3. Verify attendance
node scripts/check-attendance.js

# 4. Test API endpoints (server must be running)
node scripts/test-api-endpoints.js
```

All of these should show data and no errors! ✅
