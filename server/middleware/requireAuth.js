import { AUTH_COOKIE_NAME, verifySessionToken } from '../auth.js';

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    req.user = verifySessionToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
};
