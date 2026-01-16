import { Router } from 'express';
import pool from '../db.js';
import { stateNameToAbbr, stateNameToCoords, stateNames } from '../utils/stateGeo.js';

const router = Router();

const segmentRanges = {
  'Over 1 Trillion': { min: 1000000000 },
  'Between $250 B and 1 Trillion': { min: 250000000, max: 1000000000 },
  'Between $100 B and 250 B': { min: 100000000, max: 250000000 },
  'Between $10 B and 100 B': { min: 10000000, max: 100000000 },
  'Between $1 B and 10 B': { min: 1000000, max: 10000000 },
  'Less than 1 B': { max: 1000000 },
};
const FRB_DISTRICTS = {
  1: 'Boston',
  2: 'New York',
  3: 'Philadelphia',
  4: 'Cleveland',
  5: 'Richmond',
  6: 'Atlanta',
  7: 'Chicago',
  8: 'St. Louis',
  9: 'Minneapolis',
  10: 'Kansas City',
  11: 'Dallas',
  12: 'San Francisco',
};
const REGION_BY_STATE = {
  Alabama: 'South',
  Alaska: 'West',
  Arizona: 'West',
  Arkansas: 'South',
  California: 'West',
  Colorado: 'West',
  Connecticut: 'Northeast',
  Delaware: 'South',
  'District of Columbia': 'South',
  Florida: 'South',
  Georgia: 'South',
  Hawaii: 'West',
  Idaho: 'West',
  Illinois: 'Midwest',
  Indiana: 'Midwest',
  Iowa: 'Midwest',
  Kansas: 'Midwest',
  Kentucky: 'South',
  Louisiana: 'South',
  Maine: 'Northeast',
  Maryland: 'South',
  Massachusetts: 'Northeast',
  Michigan: 'Midwest',
  Minnesota: 'Midwest',
  Mississippi: 'South',
  Missouri: 'Midwest',
  Montana: 'West',
  Nebraska: 'Midwest',
  Nevada: 'West',
  'New Hampshire': 'Northeast',
  'New Jersey': 'Northeast',
  'New Mexico': 'West',
  'New York': 'Northeast',
  'North Carolina': 'South',
  'North Dakota': 'Midwest',
  Ohio: 'Midwest',
  Oklahoma: 'South',
  Oregon: 'West',
  Pennsylvania: 'Northeast',
  'Rhode Island': 'Northeast',
  'South Carolina': 'South',
  'South Dakota': 'Midwest',
  Tennessee: 'South',
  Texas: 'South',
  Utah: 'West',
  Vermont: 'Northeast',
  Virginia: 'South',
  Washington: 'West',
  'West Virginia': 'South',
  Wisconsin: 'Midwest',
  Wyoming: 'West',
};
const REGION_STATES = Object.entries(REGION_BY_STATE).reduce((acc, [state, region]) => {
  if (!acc[region]) {
    acc[region] = [];
  }
  acc[region].push(state);
  return acc;
}, {});
const FRB_DISTRICT_BY_NAME = Object.entries(FRB_DISTRICTS).reduce((acc, [key, value]) => {
  acc[value] = Number.parseInt(key, 10);
  return acc;
}, {});

const getSegmentRange = (segment) => segmentRanges[segment] ?? null;
const getFrbDistrict = (fedValue) => {
  const fedNumber = Number.parseInt(fedValue, 10);
  if (!Number.isFinite(fedNumber)) {
    return 'Unknown';
  }
  return FRB_DISTRICTS[fedNumber] ?? 'Unknown';
};
const canonicalStateNames = Object.values(stateNames).reduce((acc, name) => {
  acc.set(name.toLowerCase(), name);
  return acc;
}, new Map());

router.get('/search', async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT
         CERT AS cert,
         NAMEFULL AS nameFull,
         STNAME AS stateName
       FROM fdic_structure
       WHERE NAMEFULL LIKE CONCAT('%', ?, '%')
       ORDER BY NAMEFULL ASC
       LIMIT 20`,
      [query]
    );

    const results = rows.map((row) => {
      const coords = stateNameToCoords[row.stateName];
      return {
        ...row,
        stateAbbr: stateNameToAbbr[row.stateName] ?? null,
        latitude: coords ? coords[0] : null,
        longitude: coords ? coords[1] : null,
      };
    });

    res.json({ results });
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
         c.NPERF AS nperf,
         c.DRLNLSQ AS DRLNLSQ,
         c.RWA AS rwa,
         r.ROAQ AS roa,
         r.ROEQ AS roe,
         r.NIMY AS nimy,
         r.EQTANQTA AS eqtanqta,
         r.EEFFR AS efficiencyRatio,
         r.NTLNSQR AS ntlnsqr,
         r.P3LNLSY1 AS P3LNLSY1,
         r.LNAGY1 AS LNAGY1,
         r.LNCIY1 AS LNCIY1,
         r.LNCOMRY1 AS LNCOMRY1,
         r.LNCONY1 AS LNCONY1,
         r.LNCIT1R AS lncit1r,
         r.LNRERT1R AS lnrert1r,
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
         r.NTLNSQR AS ntlnsqr,
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
    const range = getSegmentRange(segment);
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

router.get('/state-assets', async (req, res) => {
  try {
    const segment = req.query.segment;
    const quarter = req.query.quarter;
    const year = req.query.year ? Number(req.query.year) : null;
    const range = getSegmentRange(segment);
    const conditions = ['s.STNAME IS NOT NULL', 'f.ASSET IS NOT NULL'];
    const params = [];

    let targetQuarter = null;
    if (!year) {
      targetQuarter = quarter;
      if (!targetQuarter) {
        const [latestRows] = await pool.query(`SELECT MAX(CALLYM) AS callym FROM fdic_fts`);
        targetQuarter = latestRows?.[0]?.callym ?? null;
      }
    }

    if (year) {
      conditions.push('FLOOR(f.CALLYM / 100) = ?');
      params.push(year);
    } else if (targetQuarter) {
      conditions.push('f.CALLYM = ?');
      params.push(targetQuarter);
    }

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
         s.STNAME AS stateName,
         SUM(f.ASSET) AS totalAssets
       FROM fdic_fts f
       JOIN (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_structure
         GROUP BY CERT
       ) latest_structure
         ON latest_structure.CERT = f.CERT
       JOIN fdic_structure s
         ON s.CERT = latest_structure.CERT
         AND s.CALLYM = latest_structure.callym
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY s.STNAME
       ORDER BY totalAssets DESC`,
      params
    );

    const results = rows.map((row) => {
      const rawState = row.stateName;
      const trimmedState = typeof rawState === 'string' ? rawState.trim() : rawState;
      let normalizedState = trimmedState;

      if (typeof trimmedState === 'string') {
        const upperState = trimmedState.toUpperCase();
        const lowerState = trimmedState.toLowerCase();
        if (stateNames[upperState]) {
          normalizedState = stateNames[upperState];
        } else if (canonicalStateNames.has(lowerState)) {
          normalizedState = canonicalStateNames.get(lowerState);
        }
      }

      return {
        ...row,
        stateName: normalizedState,
      };
    });

    res.json({ results });
  } catch (error) {
    console.error('Error fetching state assets:', error);
    res.status(500).json({ message: 'Failed to fetch state assets' });
  }
});

router.get('/state-assets/quarters', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT CALLYM AS callym
       FROM fdic_fts
       WHERE CALLYM IS NOT NULL
       GROUP BY CALLYM
       ORDER BY CALLYM DESC`
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error fetching state asset quarters:', error);
    res.status(500).json({ message: 'Failed to fetch state asset quarters' });
  }
});

router.get('/national-averages/summary', async (req, res) => {
  try {
    const segment = req.query.segment;
    const quarter = req.query.quarter;
    const region = req.query.region;
    const district = req.query.district;
    const range = getSegmentRange(segment);
    const conditions = [];
    const params = [];

    if (quarter) {
      conditions.push('f.CALLYM = ?');
      params.push(quarter);
    }

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

    if (region && region !== 'All Regions') {
      const states = REGION_STATES[region] ?? [];
      if (!states.length) {
        return res.json({ results: [] });
      }
      conditions.push(`s.STNAME IN (${states.map(() => '?').join(', ')})`);
      params.push(...states);
    }

    if (district && district !== 'All Districts') {
      const fedCode = FRB_DISTRICT_BY_NAME[district];
      if (!Number.isFinite(fedCode)) {
        return res.json({ results: [] });
      }
      conditions.push('s.FED = ?');
      params.push(fedCode);
    }

    const [rows] = await pool.query(
      `SELECT
         f.CALLYM AS callym,
         COUNT(DISTINCT f.CERT) AS bankCount,
         SUM(f.ASSET) AS assets,
         SUM(f.DEP) AS deposits,
         SUM(f.LIAB) AS liabilities,
         SUM(f.EQ) AS equity,
         SUM(f.NETINC) AS netIncome,
         SUM(f.NETINC) / NULLIF(SUM(f.ASSET), 0) * 100 AS roa
       FROM fdic_fts f
       JOIN (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_structure
         GROUP BY CERT
       ) latest_structure
         ON latest_structure.CERT = f.CERT
       JOIN fdic_structure s
         ON s.CERT = latest_structure.CERT
         AND s.CALLYM = latest_structure.callym
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY f.CALLYM
       ORDER BY f.CALLYM DESC`,
      params
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error fetching national average summary:', error);
    res.status(500).json({ message: 'Failed to fetch national average summary' });
  }
});

router.get('/structure/banks', async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit, 10);
    const params = [];
    const limitClause = Number.isFinite(limit) && limit > 0 ? 'LIMIT ?' : '';

    if (limitClause) {
      params.push(limit);
    }

    const [rows] = await pool.query(
      `SELECT
         s.CERT AS cert,
         s.NAMEFULL AS nameFull,
         s.STNAME AS stateName,
         s.FED AS fed
       FROM (
         SELECT CERT, MAX(CALLYM) AS callym
         FROM fdic_structure
         GROUP BY CERT
       ) latest_structure
       JOIN fdic_structure s
         ON s.CERT = latest_structure.CERT
         AND s.CALLYM = latest_structure.callym
       ORDER BY s.NAMEFULL ASC
       ${limitClause}`,
      params
    );

    const results = rows.map((row) => ({
      ...row,
      frbDistrict: getFrbDistrict(row.fed),
    }));

    res.json({ results });
  } catch (error) {
    console.error('Error fetching structure data:', error);
    res.status(500).json({ message: 'Failed to fetch structure data' });
  }
});

export default router;
