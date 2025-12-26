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
         NAMEFULL AS nameFull,
         CITY AS city,
         STNAME AS stateName,
         ZIP AS zipCode
       FROM fdic_structure
       WHERE CERT = ?
       ORDER BY CALLYM DESC
       LIMIT 1`,
      [cert]
    );

    const { nameFull, city, stateName, zipCode } = structureRows?.[0] ?? {};

    if (!nameFull) {
      return res.status(404).json({ message: 'Bank not found' });
    }

    const [seriesRows] = await pool.query(
      `SELECT
         f.CALLYM AS callym,
         f.ASSET AS asset,
         f.P3ASSET AS P3Asset,
         f.P9ASSET AS P9Asset,
         f.NAASSET AS NAAsset,
         f.LNAG AS LNAG,
         f.LNCI AS LNCI,
         f.LNCOMRE AS LNCOMRE,
         f.LNRE AS LNRE,
         f.LNCON AS LNCON,
         f.EQ AS eq,
         f.DEP AS dep,
         f.LNLSGR AS lnlsgr,
         c.RWA AS rwa,
         r.ROA AS roa,
         r.ROE AS roe,
         r.NIMY AS nimy,
         r.EQTANQTA AS eqtanqta,
         r.EEFFR AS efficiencyRatio,
         r.P3LNLSY1 AS P3LNLSY1,
         r.LNAGY1 AS LNAGY1,
         r.LNCIY1 AS LNCIY1,
         r.LNCOMRY1 AS LNCOMRY1,
         r.LNCONY1 AS LNCONY1,
         r.LNCIT1R AS lncit1r,
         r.LNCONT1R AS lncont1r,
         r.LNHRSKR AS lnhrskr,
         r.LNCDT1R AS lncdt1r
       FROM fdic_fts f
       LEFT JOIN fdic_cdi c
         ON f.CERT = c.CERT AND f.CALLYM = c.CALLYM
       LEFT JOIN fdic_rat r
         ON f.CERT = r.CERT AND f.CALLYM = r.CALLYM
       WHERE f.CERT = ?
       ORDER BY f.CALLYM ASC`,
      [cert]
    );

    const [ratRows] = await pool.query(
      `SELECT
         r.CALLYM AS callym,
         r.NIMY AS nimy,
         r.EQTANQTA AS eqtanqta,
         r.EEFFR AS efficiencyRatio,
         r.P3LNLSY1 AS P3LNLSY1,
         r.LNAGY1 AS LNAGY1,
         r.LNCIY1 AS LNCIY1,
         r.LNCOMRY1 AS LNCOMRY1,
         r.LNCONY1 AS LNCONY1
       FROM fdic_rat r
       WHERE r.CERT = ?
       ORDER BY r.CALLYM DESC
       LIMIT 1`,
      [cert]
    );

    res.json({
      cert,
      nameFull,
      city,
      stateName,
      zipCode,
      points: seriesRows,
      latestRat: ratRows?.[0] ?? null,
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ message: 'Failed to fetch chart data' });
  }
});

router.get('/benchmark', async (_req, res) => {
  try {
    const segment = _req.query.segment;
    const segmentRanges = {
      'Over 1 Trillion': { min: 1000000000 },
      'Between $250 B and 1 Trillion': { min: 250000000, max: 1000000000 },
      'Between $100 B and 250 B': { min: 100000000, max: 250000000 },
      'Between $10 B and 100 B': { min: 10000000, max: 100000000 },
      'Between $1 B and 10 B': { min: 1000000, max: 10000000 },
      'Less than 1 B': { max: 1000000 },
    };
    const range = segmentRanges[segment] ?? null;
    const conditions = [];
    const params = [];

    if (range) {
      if (range.min != null) {
        conditions.push('f.ASSET >= ?');
        params.push(range.min);
      }
      if (range.max != null) {
        conditions.push('f.ASSET < ?');
        params.push(range.max);
      }
    }

    const [rows] = await pool.query(
      `SELECT
         s.NAMEFULL AS nameFull,
         s.CITY AS city,
         s.STNAME AS stateName,
         f.ASSET AS asset,
         dep_fts.DEP AS dep,
         r.ROA AS roa,
         r.ROE AS roe
       FROM (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_fts
         GROUP BY CERT
       ) latest_fts
       JOIN fdic_fts f
         ON f.CERT = latest_fts.CERT
         AND f.CALLYM = latest_fts.callym
       JOIN (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_structure
         GROUP BY CERT
       ) latest_structure
         ON latest_structure.CERT = f.CERT
       JOIN fdic_structure s
         ON s.CERT = latest_structure.CERT
         AND s.CALLYM = latest_structure.callym
       LEFT JOIN (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_fts
         WHERE DEP IS NOT NULL
         GROUP BY CERT
       ) latest_dep
         ON latest_dep.CERT = f.CERT
       LEFT JOIN fdic_fts dep_fts
         ON dep_fts.CERT = latest_dep.CERT
         AND dep_fts.CALLYM = latest_dep.callym
       LEFT JOIN (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_rat
         GROUP BY CERT
       ) latest_rat
         ON latest_rat.CERT = f.CERT
       LEFT JOIN fdic_rat r
         ON r.CERT = latest_rat.CERT
         AND r.CALLYM = latest_rat.callym
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY f.ASSET DESC
       LIMIT 10`
      ,
      params
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error fetching benchmark data:', error);
    res.status(500).json({ message: 'Failed to fetch benchmark data' });
  }
});

export default router;
