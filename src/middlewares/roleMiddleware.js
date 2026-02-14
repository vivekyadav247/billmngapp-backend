const allowRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You are not allowed to access this resource' });
  }

  return next();
};

const allowOwner = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'owner') {
    return res.status(403).json({ message: 'Only owner can perform this action' });
  }

  return next();
};

module.exports = {
  allowRoles,
  allowOwner,
};
