import 'dotenv/config';
import bcrypt from 'bcryptjs';

import pool from '../db.js';

const [usernameArg, passwordArg, emailArg = ''] = process.argv.slice(2);

if (!usernameArg || !passwordArg) {
  console.error('Usage: node scripts/create-user.js <username> <password> [email]');
  process.exit(1);
}

const username = usernameArg.trim();
const email = emailArg.trim() || `${username}@local.invalid`;

try {
  const passwordHash = await bcrypt.hash(passwordArg, 12);

  await pool.query(
    `INSERT INTO app_users (username, email, password_hash, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       email = VALUES(email),
       password_hash = VALUES(password_hash),
       updated_at = NOW(),
       is_active = 1`,
    [username, email, passwordHash]
  );

  console.log(`Created or updated user "${username}".`);
  process.exit(0);
} catch (error) {
  console.error('Failed to create user:', error);
  process.exit(1);
}
