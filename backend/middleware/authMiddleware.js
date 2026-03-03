const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * ============================================================================
 * AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * These functions act as "gatekeepers" for our routes. They check if a user
 * is logged in and if they have the right permissions (Role-Based Access Control).
 * ============================================================================
 */

/**
 * @desc    Gatekeeper: Blocks unauthenticated users from private routes.
 *          Verifies the JWT stored in the browser cookie.
 */
exports.protect = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Login required to access this feature' });
  }

  try {
    // 1. Verify the 'Stamp' (JWT) using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Attach the User object to the 'req' so controllers can use it
    req.user = await User.findById(decoded.id);

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'User account not found' });
    }

    next(); // Move to the next function (the controller)
  } catch (err) {
    console.error('[AUTH ERROR] Token invalid:', err.message);
    return res.status(401).json({ success: false, error: 'Session expired. Please login again.' });
  }
};

/**
 * @desc    RBAC Gate: Restricts access to HR or Admin roles only.
 *          Must be placed AFTER 'protect'.
 */
exports.authorizeHR = (req, res, next) => {
  if (req.user?.role !== 'hr') {
    return res.status(403).json({
      success: false,
      error: 'Restricted: HR permissions required.'
    });
  }
  next();
};

/**
 * @desc    RBAC Gate: Restricts access to Admin role only.
 */
exports.authorizeAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Restricted: Administrator access only.'
    });
  }
  next();
};

/**
 * @desc    RBAC Gate: Restricts access to specific roles.
 *          Usage: authorize('hr', 'admin')
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        error: `Restricted: ${roles.join(' or ')} permissions required.`
      });
    }
    next();
  };
};

/**
 * @desc    Context Loader: Optionally loads user info without blocking.
 *          Useful for the landing page (showing 'My Profile' vs 'Login').
 */
exports.loadUser = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    next();
  } catch (err) {
    // Carry on as a 'guest' if token is bad
    next();
  }
};
