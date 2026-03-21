import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'jhakaas_session';

const parseHours = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  return value === 'true';
};

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Missing SESSION_SECRET environment variable');
  }
  return secret;
};

export const getCookieOptions = () => {
  const maxAgeHours = parseHours(process.env.AUTH_SESSION_TTL_HOURS, 12);
  const sameSite = process.env.COOKIE_SAME_SITE || 'lax';
  const secure = parseBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: maxAgeHours * 60 * 60 * 1000,
    path: '/',
  };
};

export const signSessionToken = (user) => {
  const maxAgeHours = parseHours(process.env.AUTH_SESSION_TTL_HOURS, 12);

  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'user',
    },
    getSessionSecret(),
    { expiresIn: `${maxAgeHours}h` }
  );
};

export const verifySessionToken = (token) => jwt.verify(token, getSessionSecret());

export const clearCookieOptions = () => {
  const { maxAge, ...cookieOptions } = getCookieOptions();
  return cookieOptions;
};
