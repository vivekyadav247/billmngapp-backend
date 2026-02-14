const bcrypt = require('bcryptjs');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { roundToTwo } = require('../utils/billUtils');
const SalaryEntry = require('../models/SalaryEntry');

const serializeUser = (userDoc) => ({
  id: userDoc._id,
  name: userDoc.name,
  email: userDoc.email,
  phoneNumber: userDoc.phoneNumber || null,
  role: userDoc.role,
  employeeId: userDoc.employeeId || null,
  shop: userDoc.shop
    ? {
        id: userDoc.shop.shopCode || userDoc.shop._id || userDoc.shop,
        shopCode: userDoc.shop.shopCode || null,
        name: userDoc.shop.name,
        type: userDoc.shop.type,
      }
    : null,
  salaryDue: userDoc.salaryDue || 0,
});

const getMe = async (req, res) => {
  const user = await User.findById(req.user._id).populate('shop');

  return res.status(200).json({
    user: serializeUser(user),
  });
};

const updateMe = async (req, res) => {
  const { name, phoneNumber } = req.body;
  const updates = {};

  if (name !== undefined) {
    const normalizedName = String(name).trim();
    if (!normalizedName) {
      return res.status(400).json({ message: 'Name cannot be empty' });
    }
    updates.name = normalizedName;
  }

  if (phoneNumber !== undefined) {
    const normalizedPhoneNumber = String(phoneNumber || '').trim();
    updates.phoneNumber = normalizedPhoneNumber || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No profile fields provided for update' });
  }

  await User.findByIdAndUpdate(req.user._id, updates, { new: true });
  const updatedUser = await User.findById(req.user._id).populate('shop');

  return res.status(200).json({
    message: 'Profile updated successfully',
    user: serializeUser(updatedUser),
  });
};

const listEmployees = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'User shop is not registered yet' });
  }

  const employees = await User.find({
    shop: req.user.shop,
    role: 'employee',
    isActive: true,
  })
    .select('_id name email phoneNumber employeeId createdAt salaryDue')
    .sort({ createdAt: -1 });

  const serializedEmployees = employees.map((employee) => ({
    id: employee._id,
    name: employee.name,
    email: employee.email || null,
    phoneNumber: employee.phoneNumber || null,
    employeeId: employee.employeeId || null,
    createdAt: employee.createdAt,
    salaryDue: employee.salaryDue || 0,
  }));

  return res.status(200).json({ employees: serializedEmployees });
};

const generateEmployeeId = async () => {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = `EMP${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = await User.findOne({ employeeId: candidate }).select('_id');
    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique employee ID. Please try again.');
};

const upsertEmployee = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'Please register your shop before adding employees' });
  }

  const { email, name, phoneNumber, password } = req.body;
  const normalizedEmailRaw = String(email || '').trim().toLowerCase();
  const normalizedEmail = normalizedEmailRaw || null;
  const normalizedName = String(name || '').trim();
  const normalizedPhone = String(phoneNumber || '').trim();
  const normalizedPassword = String(password || '');

  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Employee email format is invalid' });
  }

  if (!normalizedPhone) {
    return res.status(400).json({ message: 'Employee phone number is required' });
  }

  if (normalizedPassword.length < 6) {
    return res.status(400).json({ message: 'Employee password must be at least 6 characters' });
  }

  const shop = await Shop.findById(req.user.shop).select('_id shopCode');
  if (!shop) {
    return res.status(404).json({ message: 'Shop not found for this account' });
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 12);
  let employee = null;

  if (normalizedEmail) {
    employee = await User.findOne({ email: normalizedEmail });
  }

  if (!employee) {
    const employeeId = await generateEmployeeId();
    const resolvedName = normalizedName || (normalizedEmail ? normalizedEmail.split('@')[0] : `Employee ${employeeId}`);
    employee = await User.create({
      email: normalizedEmail,
      name: resolvedName,
      phoneNumber: normalizedPhone,
      employeeId,
      passwordHash,
      role: 'employee',
      shop: req.user.shop,
      isActive: true,
    });
  } else {
    if (employee.role === 'owner') {
      return res.status(400).json({ message: 'This email already belongs to a shop owner account' });
    }

    if (employee.shop && employee.shop.toString() !== req.user.shop.toString()) {
      return res.status(409).json({ message: 'Employee already belongs to another shop' });
    }

    employee.name = normalizedName || employee.name || `Employee ${employee.employeeId || ''}`.trim();
    if (normalizedEmail) {
      employee.email = normalizedEmail;
    }
    employee.phoneNumber = normalizedPhone;
    employee.passwordHash = passwordHash;
    employee.role = 'employee';
    employee.shop = req.user.shop;
    employee.isActive = true;

    if (!employee.employeeId) {
      employee.employeeId = await generateEmployeeId();
    }

    await employee.save();
  }

  return res.status(200).json({
    message: 'Employee saved successfully',
    employee: {
      id: employee._id,
      name: employee.name,
      email: employee.email || null,
      phoneNumber: employee.phoneNumber,
      employeeId: employee.employeeId,
      role: employee.role,
      shop: employee.shop,
    },
    login: {
      shopId: shop.shopCode,
      employeeId: employee.employeeId,
    },
  });
};

const addSalaryAccrual = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'Please register your shop before adding salary' });
  }

  const { amount, period = 'month' } = req.body;
  const accrual = roundToTwo(Number(amount));
  if (!Number.isFinite(accrual) || accrual <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }
  const normalizedPeriod = String(period).toLowerCase();
  if (!['day', 'month'].includes(normalizedPeriod)) {
    return res.status(400).json({ message: 'period must be day or month' });
  }

  const employee = await User.findOne({ _id: req.params.id, shop: req.user.shop, role: 'employee' });
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  employee.salaryDue = roundToTwo((employee.salaryDue || 0) + accrual);
  await employee.save();

  await SalaryEntry.create({
    shop: req.user.shop,
    employee: employee._id,
    amount: accrual,
    type: 'manual',
    period: normalizedPeriod,
    effectiveDate: new Date(),
    createdBy: req.user._id,
  });

  return res.status(200).json({
    message: 'Salary recorded',
    employee: {
      id: employee._id,
      salaryDue: employee.salaryDue,
    },
  });
};

const payEmployee = async (req, res) => {
  if (!req.user.shop) {
    return res.status(400).json({ message: 'Please register your shop before paying employees' });
  }

  const { amount } = req.body;
  const payAmount = Number(amount);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    return res.status(400).json({ message: 'amount must be greater than 0' });
  }

  const employee = await User.findOne({ _id: req.params.id, shop: req.user.shop, role: 'employee' });
  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  const newDue = Math.max(0, roundToTwo((employee.salaryDue || 0) - roundToTwo(payAmount)));
  employee.salaryDue = newDue;
  await employee.save();

  return res.status(200).json({
    message: 'Salary paid',
    employee: {
      id: employee._id,
      salaryDue: employee.salaryDue,
    },
  });
};

module.exports = {
  getMe,
  updateMe,
  listEmployees,
  upsertEmployee,
  addSalaryAccrual,
  payEmployee,
};
