import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/search', async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT CERT AS cert, NAMEFULL AS nameFull
       FROM fdic_structure
       WHERE NAMEFULL LIKE CONCAT('%', ?, '%')
       ORDER BY NAMEFULL ASC
       LIMIT 20`,
      [query]
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({ message: 'Search failed' });
  }
});

router.get('/charts', async (req, res) => {
  const cert = Number.parseInt(req.query.cert, 10);

  if (!Number.isFinite(cert)) {
    return res.status(400).json({ message: 'Invalid cert parameter' });
  }

  try {
    const [structureRows] = await pool.query(
      `SELECT
         s.NAMEFULL AS nameFull,
         s.CITY AS city,
         s.STATENAME AS stateName,
         s.ZIPCODE AS zipCode,
         b.webaddr AS webaddr,
         b.ticker AS ticker,
         b.BankCategories AS bankCategories
       FROM fdic_structure s
       LEFT JOIN BankWebAddress b
         ON s.CERT = b.CERT
       WHERE s.CERT = ?
       ORDER BY s.CALLYM DESC
       LIMIT 1`,
      [cert]
    );

    const { nameFull, city, stateName, zipCode, webaddr, ticker, bankCategories } =
      structureRows?.[0] ?? {};

    if (!nameFull) {
      return res.status(404).json({ message: 'Bank not found' });
    }

    const [seriesRows] = await pool.query(
      `SELECT
         f.CALLYM AS callym,
         f.ASSET AS asset,
         f.EQ AS eq,
         f.CCIDOUBT AS ccidoubt,
         r.ROE AS roe,
         r.ROA AS roa,
         r.EQTANQTA AS eqtanqta,
         r.LNCIT1R AS lncit1r,
         r.LNCONT1R AS lncont1r,
         r.LNHRSKR AS lnhrskr,
         r.LNCDT1R AS lncdt1r
       FROM fdic_fts f
       LEFT JOIN fdic_rat r
         ON f.CERT = r.CERT AND f.CALLYM = r.CALLYM
       WHERE f.CERT = ?
       ORDER BY f.CALLYM ASC`,
      [cert]
    );

    res.json({
      cert,
      nameFull,
      city,
      stateName,
      zipCode,
      webaddr,
      ticker,
      bankCategories,
      points: seriesRows,
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ message: 'Failed to fetch chart data' });
  }
});

export default router;
