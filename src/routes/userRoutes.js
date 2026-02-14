const express = require('express');
const {
  getMe,
  updateMe,
  listEmployees,
  upsertEmployee,
  addSalaryAccrual,
  payEmployee,
} = require('../controllers/userController');
const { authenticate } = require('../middlewares/authMiddleware');
const { allowOwner } = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.get('/me', authenticate, asyncHandler(getMe));
router.put('/me', authenticate, asyncHandler(updateMe));
router.get('/employees', authenticate, allowOwner, asyncHandler(listEmployees));
router.post('/employees', authenticate, allowOwner, asyncHandler(upsertEmployee));
router.post('/employees/:id/pay', authenticate, allowOwner, asyncHandler(payEmployee));
router.post('/employees/:id/salary', authenticate, allowOwner, asyncHandler(addSalaryAccrual));

module.exports = router;
