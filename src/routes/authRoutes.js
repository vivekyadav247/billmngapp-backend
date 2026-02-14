const express = require('express');
const { googleAuth, employeeLogin } = require('../controllers/authController');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/google', asyncHandler(googleAuth));
router.post('/employee-login', asyncHandler(employeeLogin));

module.exports = router;
