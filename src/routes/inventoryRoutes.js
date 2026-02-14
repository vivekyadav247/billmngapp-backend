const express = require('express');
const {
  createInventoryItem,
  listInventory,
  updateInventoryItem,
  deleteInventoryItem,
} = require('../controllers/inventoryController');
const { authenticate } = require('../middlewares/authMiddleware');
const { allowOwner, allowRoles } = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

const router = express.Router();

router.post('/', authenticate, allowOwner, asyncHandler(createInventoryItem));
router.get('/', authenticate, allowRoles('owner', 'employee'), asyncHandler(listInventory));
router.put('/:id', authenticate, allowOwner, asyncHandler(updateInventoryItem));
router.delete('/:id', authenticate, allowOwner, asyncHandler(deleteInventoryItem));

module.exports = router;
