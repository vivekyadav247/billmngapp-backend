const express = require('express');
const {
  exportBills,
  exportBillsCurrentMonth,
  exportBillsPreviousMonth,
  exportBillsYear,
  exportInventoryPerformance,
} = require('../controllers/exportController');
const { authenticate } = require('../middlewares/authMiddleware');
const { allowOwner } = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.get('/bills', authenticate, allowOwner, asyncHandler(exportBills));
router.get('/bills/month/current', authenticate, allowOwner, asyncHandler(exportBillsCurrentMonth));
router.get('/bills/month/previous', authenticate, allowOwner, asyncHandler(exportBillsPreviousMonth));
router.get('/bills/year', authenticate, allowOwner, asyncHandler(exportBillsYear));
router.get('/items', authenticate, allowOwner, asyncHandler(exportInventoryPerformance));

module.exports = router;
