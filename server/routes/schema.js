import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/schema/tables', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        TABLE_NAME AS tableName,
        TABLE_TYPE AS tableType,
        ENGINE AS engine,
        TABLE_ROWS AS tableRows,
        TABLE_COMMENT AS tableComment
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching tables metadata:', error);
    res.status(500).json({ message: 'Failed to fetch tables metadata' });
  }
});

router.get('/schema/table/:tableName', async (req, res) => {
  const { tableName } = req.params;

  try {
    const [rows] = await pool.query(
      `SELECT 
        COLUMN_NAME AS columnName,
        DATA_TYPE AS dataType,
        IS_NULLABLE AS isNullable,
        COLUMN_KEY AS columnKey,
        COLUMN_DEFAULT AS columnDefault,
        ORDINAL_POSITION AS ordinalPosition
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
      [tableName]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: `Table not found: ${tableName}` });
    }

    res.json(rows);
  } catch (error) {
    console.error(`Error fetching columns for table ${tableName}:`, error);
    res.status(500).json({ message: 'Failed to fetch table schema' });
  }
});

router.get('/schema/keys', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        TABLE_NAME AS tableName,
        INDEX_NAME AS indexName,
        COLUMN_NAME AS columnName,
        NON_UNIQUE AS nonUnique,
        SEQ_IN_INDEX AS seqInIndex,
        INDEX_TYPE AS indexType
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching index metadata:', error);
    res.status(500).json({ message: 'Failed to fetch index metadata' });
  }
});

export default router;
