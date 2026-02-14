const express = require('express');
const { createBill, listBills, getBillById } = require('../controllers/billController');
const { authenticate } = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/', authenticate, asyncHandler(createBill));
router.get('/', authenticate, asyncHandler(listBills));
router.get('/:billId', authenticate, asyncHandler(getBillById));

module.exports = router;
