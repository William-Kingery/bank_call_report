import 'dotenv/config';
import express from 'express';
import cors from "cors";

import pool from './db.js';
import healthRoutes from './routes/health.js';
import schemaRoutes from './routes/schema.js';
import dataRoutes from './routes/data.js';

const app = express();
const PORT = process.env.PORT || 4000;
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(express.json());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(healthRoutes);
app.use(schemaRoutes);
app.use(dataRoutes);

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
