import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'Jhakaas Express server is running!' });
});

router.get('/api/health', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 AS result');

    res.json({
      server: 'ok',
      database: 'connected',
      result: rows?.[0]?.result ?? null,
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(500).json({
      server: 'ok',
      database: 'error',
      message: 'Database check failed',
    });
  }
});

export default router;
