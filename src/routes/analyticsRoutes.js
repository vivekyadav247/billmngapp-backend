const express = require('express');
const {
  getSalesSummary,
  getRevenueBreakdown,
  getTopSellingItems,
  getSalarySummary,
} = require('../controllers/analyticsController');
const { authenticate } = require('../middlewares/authMiddleware');
const { allowOwner, allowRoles } = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.get('/sales-summary', authenticate, allowOwner, asyncHandler(getSalesSummary));
router.get('/revenue-breakdown', authenticate, allowOwner, asyncHandler(getRevenueBreakdown));
router.get('/top-items', authenticate, allowOwner, asyncHandler(getTopSellingItems));
router.get('/salary-summary', authenticate, allowRoles('owner', 'employee'), asyncHandler(getSalarySummary));

module.exports = router;
