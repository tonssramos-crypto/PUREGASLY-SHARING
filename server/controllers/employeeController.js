const User = require('../models/User');
const { deleteMedia } = require('../utils/media');
const { isValidName, EMAIL_REGEX } = require('../utils/validation');
const { generateTempPassword } = require('../utils/tempPassword');

const VALID_PERMISSIONS = ['manage_inventory', 'manage_orders', 'view_analytics', 'manage_riders', 'manage_coupons'];

function sanitizePermissions(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((p) => VALID_PERMISSIONS.includes(p));
}

function toSafeEmployee(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    permissions: user.permissions,
    avatar: user.avatar ? String(user.avatar) : null,
    mustChangePassword: !!user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

// GET /api/employees - list this owner's employees
exports.list = async (req, res) => {
  try {
    const owner = req.currentUser; // set by requireRole middleware

    if (!owner.storeId) {
      return res.status(400).json({ message: 'You do not have a store set up yet.' });
    }

    const employees = await User.find({ storeId: owner.storeId, role: 'employee' }).sort({
      createdAt: -1,
    });

    return res.json(employees.map(toSafeEmployee));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// POST /api/employees - create a new employee under this owner's store
// The server makes a temporary password and returns it ONCE in the response.
exports.create = async (req, res) => {
  try {
    const owner = req.currentUser;
    const { name, email, permissions } = req.body;

    if (!owner.storeId) {
      return res.status(400).json({ message: 'You do not have a store set up yet.' });
    }

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required.' });
    }

    if (!isValidName(name)) {
      return res.status(400).json({ message: "Please enter the employee's full name (first and last, letters only)." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    // No mail-domain DNS check here: the owner hands over the temporary password
    // themselves and nothing is ever emailed to the address - it's only a login
    // name. (Public sign-up still verifies the domain and the email by OTP.)

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    const tempPassword = generateTempPassword();

    let employee;
    try {
      employee = await User.create({
        name: String(name).trim().slice(0, 80),
        email: normalizedEmail,
        password: tempPassword,
        mustChangePassword: true,
        role: 'employee',
        storeId: owner.storeId,
        permissions: sanitizePermissions(permissions),
      });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: 'An account with that email already exists.' });
      throw err;
    }

    // tempPassword is only sent here, once. It is stored hashed and can't be read again.
    return res.status(201).json({ ...toSafeEmployee(employee), tempPassword });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// PATCH /api/employees/:id - update an employee's permissions
exports.updatePermissions = async (req, res) => {
  try {
    const owner = req.currentUser;
    const { permissions } = req.body;

    const employee = await User.findOne({
      _id: req.params.id,
      storeId: owner.storeId,
      role: 'employee',
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    employee.permissions = sanitizePermissions(permissions);
    await employee.save();

    return res.json(toSafeEmployee(employee));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

// DELETE /api/employees/:id - remove an employee from this owner's store
exports.remove = async (req, res) => {
  try {
    const owner = req.currentUser;

    const employee = await User.findOneAndDelete({
      _id: req.params.id,
      storeId: owner.storeId,
      role: 'employee',
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (employee.avatar) await deleteMedia(employee.avatar);
    return res.json({ message: 'Employee removed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
}

exports.VALID_PERMISSIONS = VALID_PERMISSIONS;
