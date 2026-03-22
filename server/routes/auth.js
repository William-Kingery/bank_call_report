import { Router } from 'express';
import bcrypt from 'bcryptjs';

import pool from '../db.js';
import {
  AUTH_COOKIE_NAME,
  clearCookieOptions,
  getCookieOptions,
  signSessionToken,
  verifySessionToken,
} from '../auth.js';

const router = Router();

const normalizeUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  role: row.role || 'user',
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const session = verifySessionToken(token);
    return res.json({ user: session });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    const [rows] = await pool.query(
      `SELECT id, username, email, password_hash AS passwordHash, role, is_active AS isActive
       FROM app_users
       WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?))
       LIMIT 1`,
      [identifier, identifier]
    );

    const user = rows?.[0];
    if (!user || !user.passwordHash || !user.isActive) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await pool.query('UPDATE app_users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const normalizedUser = normalizeUser(user);
    const token = signSessionToken(normalizedUser);

    res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());
    return res.json({ user: normalizedUser });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, clearCookieOptions());
  return res.status(204).send();
});

export default router;
