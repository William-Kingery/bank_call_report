import 'dotenv/config';
import express from 'express';
import cors from "cors";


import pool from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.get('/', (req, res) => {
  res.json({ message: 'Jhakaas Express server is running!' });
});

app.get('/api/health', async (_req, res) => {
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

const startServer = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('MySQL database connected');

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MySQL database:', error);
    process.exit(1);
  }
};

startServer();
