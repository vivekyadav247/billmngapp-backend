const express = require('express');
const {
  listUdharEntries,
  getUdharByCustomer,
  getTotalPendingUdhar,
  payUdharEntry,
} = require('../controllers/udharController');
const { authenticate } = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.get('/', authenticate, asyncHandler(listUdharEntries));
router.get('/summary/total-pending', authenticate, asyncHandler(getTotalPendingUdhar));
router.get('/customer/:customerMobile', authenticate, asyncHandler(getUdharByCustomer));
router.post('/:id/pay', authenticate, asyncHandler(payUdharEntry));

module.exports = router;
