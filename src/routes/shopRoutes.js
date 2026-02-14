const express = require('express');
const { registerShop, getMyShop, updateMyShop } = require('../controllers/shopController');
const { authenticate } = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/register', authenticate, asyncHandler(registerShop));
router.get('/me', authenticate, asyncHandler(getMyShop));
router.put('/me', authenticate, asyncHandler(updateMyShop));

module.exports = router;
