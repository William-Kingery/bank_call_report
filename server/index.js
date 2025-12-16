import 'dotenv/config';
import express from 'express';
import cors from "cors";

import pool from './db.js';
import routes from './routes/health.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(routes);

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
