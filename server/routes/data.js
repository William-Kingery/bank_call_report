import { Router } from 'express';
import pool from '../db.js';
import { stateNameToAbbr, stateNameToCoords, stateNames } from '../utils/stateGeo.js';

const router = Router();

const SEGMENT_RANGES = [
  { label: 'Over 700 Billion', min: 700000000 },
  { label: 'Between $250 B and 700 Billion', min: 250000000, max: 700000000 },
  { label: 'Between $100 B and 250 B', min: 100000000, max: 250000000 },
  { label: 'Between $50 B and 100 B', min: 50000000, max: 100000000 },
  { label: 'Between $10 B and 50 B', min: 10000000, max: 50000000 },
  { label: 'Between $5 B and 10 B', min: 5000000, max: 10000000 },
  { label: 'Between $1 B and 5 B', min: 1000000, max: 5000000 },
  { label: 'Between $0.5 B and 1 B', min: 500000, max: 1000000 },
  { label: 'Less than 0.5 B', max: 500000 },
];
const SEGMENT_ORDER = new Map(
  SEGMENT_RANGES.map((range, index) => [range.label, index])
);
const segmentRanges = SEGMENT_RANGES.reduce((acc, range) => {
  acc[range.label] = { min: range.min, max: range.max };
  return acc;
}, {});
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
const isDistrictScopedRange = (range) =>
  range?.max != null && range.max <= 50000000;
const buildSegmentCaseStatement = (assetField = 'f.ASSET') => {
  const cases = SEGMENT_RANGES.map((range) => {
    const conditions = [];
    if (range.min != null) {
      conditions.push(`${assetField} >= ${range.min}`);
    }
    if (range.max != null) {
      conditions.push(`${assetField} < ${range.max}`);
    }
    return `WHEN ${conditions.join(' AND ')} THEN '${range.label}'`;
  });
  return `CASE ${cases.join(' ')} ELSE 'Unknown' END`;
};
const fetchLatestQuarter = async () => {
  const [latestRows] = await pool.query(`SELECT MAX(CALLYM) AS callym FROM fdic_fts`);
  return latestRows?.[0]?.callym ?? null;
};
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
const REGION_ORDER = ['Northeast', 'Midwest', 'South', 'West', 'Unknown'];

const fetchStateSegmentSummary = async ({
  quarter,
  segment,
  region,
  district,
} = {}) => {
  const segmentCase = buildSegmentCaseStatement();
  const conditions = ['s.STNAME IS NOT NULL', 'f.ASSET IS NOT NULL'];
  const params = [];
  let targetQuarter = quarter;

  if (!targetQuarter) {
    targetQuarter = await fetchLatestQuarter();
  }

  if (targetQuarter) {
    conditions.push('f.CALLYM = ?');
    params.push(targetQuarter);
  }

  const range = getSegmentRange(segment);
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
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push(`s.STNAME IN (${states.map(() => '?').join(', ')})`);
    params.push(...states);
  }

  if (district && district !== 'All Districts') {
    const fedCode = FRB_DISTRICT_BY_NAME[district];
    if (!Number.isFinite(fedCode)) {
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push('s.FED = ?');
    params.push(fedCode);
  }

  const [rows] = await pool.query(
    `SELECT
       s.STNAME AS stateName,
       ${segmentCase} AS segment,
       COUNT(DISTINCT f.CERT) AS bankCount,
       SUM(f.ASSET) AS assets,
       SUM(f.DEP) AS deposits,
       SUM(f.LIAB) AS liabilities,
       SUM(f.EQ) AS equity,
       SUM(COALESCE(c.INTINQA, 0)) AS intincqa,
       SUM(COALESCE(c.EINTXQA, 0)) AS eintxqa,
       SUM(COALESCE(c.NETINCQA, 0)) AS netincqa,
       SUM(COALESCE(c.ERNAST2, 0)) AS ernast2,
       SUM(COALESCE(c.EQTOTCP, 0)) AS eqtotcp
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
     LEFT JOIN fdic_cdi c
       ON c.CERT = f.CERT
       AND c.CALLYM = f.CALLYM
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY s.STNAME, segment
     ORDER BY s.STNAME ASC`,
    params
  );

  const sortedRows = rows
    .sort((a, b) => {
      if (a.stateName === b.stateName) {
        const orderA = SEGMENT_ORDER.get(a.segment) ?? Number.MAX_SAFE_INTEGER;
        const orderB = SEGMENT_ORDER.get(b.segment) ?? Number.MAX_SAFE_INTEGER;
        return orderA - orderB;
      }
      return a.stateName.localeCompare(b.stateName);
    });

  return { rows: sortedRows, quarter: targetQuarter };
};

const fetchSegmentSummary = async ({
  quarter,
  segment,
  region,
  district,
} = {}) => {
  const segmentCase = buildSegmentCaseStatement();
  const conditions = ['f.ASSET IS NOT NULL'];
  const params = [];
  let targetQuarter = quarter;

  if (!targetQuarter) {
    targetQuarter = await fetchLatestQuarter();
  }

  if (targetQuarter) {
    conditions.push('f.CALLYM = ?');
    params.push(targetQuarter);
  }

  const range = getSegmentRange(segment);
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
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push(`s.STNAME IN (${states.map(() => '?').join(', ')})`);
    params.push(...states);
  }

  if (district && district !== 'All Districts') {
    const fedCode = FRB_DISTRICT_BY_NAME[district];
    if (!Number.isFinite(fedCode)) {
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push('s.FED = ?');
    params.push(fedCode);
  }

  const [rows] = await pool.query(
    `SELECT
       ${segmentCase} AS segment,
       COUNT(DISTINCT f.CERT) AS bankCount,
       SUM(f.ASSET) AS assets,
       SUM(f.DEP) AS deposits,
       SUM(f.LIAB) AS liabilities,
       SUM(f.EQ) AS equity,
       SUM(COALESCE(c.INTINQA, 0)) AS intincqa,
       SUM(COALESCE(c.EINTXQA, 0)) AS eintxqa,
       SUM(COALESCE(c.NETINCQA, 0)) AS netincqa,
       SUM(COALESCE(c.ERNAST2, 0)) AS ernast2,
       SUM(COALESCE(c.EQTOTCP, 0)) AS eqtotcp,
       (SUM(COALESCE(c.INTINQA, 0)) - SUM(COALESCE(c.EINTXQA, 0)))
         / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS nim,
       SUM(COALESCE(c.NETINCQA, 0))
         / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS roa,
       SUM(COALESCE(c.NETINCQA, 0))
         / NULLIF(SUM(COALESCE(f.EQ, 0)), 0) * 100 AS roe
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
     LEFT JOIN fdic_cdi c
       ON c.CERT = f.CERT
       AND c.CALLYM = f.CALLYM
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY segment`,
    params
  );

  const sortedRows = rows.sort((a, b) => {
    const orderA = SEGMENT_ORDER.get(a.segment) ?? Number.MAX_SAFE_INTEGER;
    const orderB = SEGMENT_ORDER.get(b.segment) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  return { rows: sortedRows, quarter: targetQuarter };
};

const fetchDistrictSummary = async ({
  quarter,
  segment,
  region,
  district,
} = {}) => {
  const conditions = ['s.FED IS NOT NULL', 'f.ASSET IS NOT NULL'];
  const params = [];
  let targetQuarter = quarter;

  if (!targetQuarter) {
    targetQuarter = await fetchLatestQuarter();
  }

  if (targetQuarter) {
    conditions.push('f.CALLYM = ?');
    params.push(targetQuarter);
  }

  const range = getSegmentRange(segment);
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
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push(`s.STNAME IN (${states.map(() => '?').join(', ')})`);
    params.push(...states);
  }

  if (district && district !== 'All Districts') {
    const fedCode = FRB_DISTRICT_BY_NAME[district];
    if (!Number.isFinite(fedCode)) {
      return { rows: [], quarter: targetQuarter };
    }
    conditions.push('s.FED = ?');
    params.push(fedCode);
  }

  const [rows] = await pool.query(
    `SELECT
       s.FED AS fed,
       COUNT(DISTINCT f.CERT) AS bankCount,
       SUM(f.ASSET) AS assets,
       SUM(f.DEP) AS deposits,
       SUM(f.LIAB) AS liabilities,
       SUM(f.EQ) AS equity,
       SUM(COALESCE(c.INTINQA, 0)) AS intincqa,
       SUM(COALESCE(c.EINTXQA, 0)) AS eintxqa,
       SUM(COALESCE(c.NETINCQA, 0)) AS netincqa,
       SUM(COALESCE(c.ERNAST2, 0)) AS ernast2,
       SUM(COALESCE(c.EQTOTCP, 0)) AS eqtotcp,
       (SUM(COALESCE(c.INTINQA, 0)) - SUM(COALESCE(c.EINTXQA, 0)))
         / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS nim,
       SUM(COALESCE(c.NETINCQA, 0))
         / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS roa,
       SUM(COALESCE(c.NETINCQA, 0))
         / NULLIF(SUM(COALESCE(f.EQ, 0)), 0) * 100 AS roe
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
     LEFT JOIN fdic_cdi c
       ON c.CERT = f.CERT
       AND c.CALLYM = f.CALLYM
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY s.FED
     ORDER BY s.FED ASC`,
    params
  );

  const mappedRows = rows.map((row) => ({
    ...row,
    district: getFrbDistrict(row.fed),
  }));

  return { rows: mappedRows, quarter: targetQuarter };
};

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
         ZIP AS zipCode,
         FED AS fed
       FROM fdic_structure
       WHERE CERT = ?
       ORDER BY CALLYM DESC
       LIMIT 1`,
      [cert]
    );

    const { nameFull, city, stateName, zipCode, fed } = structureRows?.[0] ?? {};

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
         f.LNDEP AS LNDEP,
         f.LNOTHER AS LNOTHER,
         f.LNCOMRE AS LNCOMRE,
         f.RBCT1W AS totalTier1Capital,
         f.LNRE AS LNRE,
         f.LNCON AS LNCON,
         f.EQ AS eq,
         f.DEP AS dep,
         f.DEPUNA AS depuna,
         f.LNLSGR AS lnlsgr,
         c.NPERF AS nperf,
         c.DRLNLSQ AS DRLNLSQ,
         c.COREDEP AS coredep,
         f.BRO AS bro,
         f.BROINS AS broins,
         f.BRONINS AS bronins,
         c.RWA AS rwa,
         c.RBCT1 AS rbct1,
         c.RBCT2 AS rbct2,
         c.RBC AS rbc,
         r.ROAQ AS roa,
         r.ROEQ AS roe,
         r.LNLSDEPR AS lnlsdepr,
         r.NIMY AS nimy,
         r.EQTANQTA AS eqtanqta,
         r.EEFFR AS efficiencyRatio,
         r.INTINCY AS INTINCY,
         r.INTEXPY AS INTEXPY,
         r.P3LNLSY1 AS P3LNLSY1,
         r.LNAGY1 AS LNAGY1,
         r.LNCIY1 AS LNCIY1,
         r.LNCOMRY1 AS LNCOMRY1,
         r.LNCONY1 AS LNCONY1,
         r.RBCT1CER AS rbct1cer,
         r.RBCRWAJ AS rbcrwaj,
         r.LNCIT1R AS lncit1r,
         r.LNRERT1R AS lnrert1r,
         r.LNCONT1R AS lncont1r,
         r.LNHRSKR AS lnhrskr,
         r.LNCDT1R AS lncdt1r,
         r.NTLNLSQR AS ntlnlsqr,
         r.NPERFV AS nperfRatio
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
         r.LNLSDEPR AS lnlsdepr,
         r.INTINCY AS INTINCY,
         r.INTEXPY AS INTEXPY,
         r.P3LNLSY1 AS P3LNLSY1,
         r.LNAGY1 AS LNAGY1,
         r.LNCIY1 AS LNCIY1,
         r.LNCOMRY1 AS LNCOMRY1,
         r.LNCONY1 AS LNCONY1,
         r.RBCT1CER AS rbct1cer,
         r.RBCRWAJ AS rbcrwaj
       FROM fdic_rat r
       WHERE r.CERT = ?
       ORDER BY r.CALLYM DESC
       LIMIT 1`,
      [cert]
    );

    const [webAddressRows] = await pool.query(
      `SELECT
         webaddr AS webAddress,
         ticker AS ticker,
         BankCategories AS bankCategory
       FROM BankWebAddress
       WHERE CERT = ?
       LIMIT 1`,
      [cert]
    );

    const { webAddress = null, ticker = null, bankCategory = null } = webAddressRows?.[0] ?? {};

    res.json({
      cert,
      nameFull,
      city,
      stateName,
      zipCode,
      webAddress,
      ticker,
      bankCategory,
      frbDistrict: getFrbDistrict(fed),
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
    const district = _req.query.district;
    const range = getSegmentRange(segment);
    const segmentCase = buildSegmentCaseStatement('f.ASSET');
    const conditions = [];
    const params = [];
    const isDistrictScoped = isDistrictScopedRange(range);

    if (isDistrictScoped && !district) {
      return res.status(400).json({ message: 'Missing district parameter' });
    }

    if (range) {
      if (range.min != null) {
        conditions.push('latest_base_unique.asset >= ?');
        params.push(range.min);
      }
      if (range.max != null) {
        conditions.push('latest_base_unique.asset < ?');
        params.push(range.max);
      }
    }

    if (isDistrictScoped && district) {
      const fedCode = FRB_DISTRICT_BY_NAME[district];
      if (!Number.isFinite(fedCode)) {
        return res.status(400).json({ message: 'Invalid district parameter' });
      }
      conditions.push('latest_base_unique.fed = ?');
      params.push(fedCode);
    }

    const orderClause = isDistrictScoped
      ? `ORDER BY
           (peer_group_base.nim IS NULL) ASC,
           peer_group_base.nim DESC,
           (peer_group_base.roa IS NULL) ASC,
           peer_group_base.roa DESC,
           (peer_group_base.roe IS NULL) ASC,
           peer_group_base.roe DESC,
           peer_group_base.asset DESC`
      : 'ORDER BY peer_group_base.asset DESC';

    const [rows] = await pool.query(
      `WITH latest_base AS (
         SELECT
           f.CERT AS cert,
           f.CALLYM AS callym,
           f.ASSET AS asset,
           ${segmentCase} AS segment,
           s.NAMEFULL AS nameFull,
           s.CITY AS city,
           s.STNAME AS stateName,
           s.FED AS fed,
           dep_fts.DEP AS dep,
           COALESCE(dep_fts.DEPUNA, f.DEPUNA) AS depuna,
           c.COREDEP AS coredep,
           r.NIMY AS nim,
           r.ROA AS roa,
           r.ROE AS roe,
           r.LNLSDEPR AS lnlsdepr
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
         LEFT JOIN (
           SELECT CERT, MAX(CALLYM) AS callym
           FROM fdic_cdi
           GROUP BY CERT
         ) latest_cdi
           ON latest_cdi.CERT = f.CERT
         LEFT JOIN fdic_cdi c
           ON c.CERT = latest_cdi.CERT
           AND c.CALLYM = latest_cdi.callym
       ),
       latest_base_unique AS (
         SELECT *
         FROM (
           SELECT
             latest_base.*,
             ROW_NUMBER() OVER (
               PARTITION BY latest_base.cert
               ORDER BY latest_base.callym DESC
             ) AS bank_row_num
           FROM latest_base
         ) latest_base_dedup
         WHERE latest_base_dedup.bank_row_num = 1
       ),
       peer_group_base AS (
         SELECT *
         FROM latest_base_unique
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ),
       lnlsdepr_ranked AS (
         SELECT
           cert,
           callym,
           fed,
           segment,
           lnlsdepr,
           ROW_NUMBER() OVER (
             ORDER BY
               (lnlsdepr IS NULL) ASC,
               lnlsdepr ASC
           ) AS rn,
           COUNT(*) OVER () AS cnt
         FROM peer_group_base
       ),
       coredep_ranked AS (
         SELECT
           cert,
           callym,
           fed,
           segment,
           coredep,
           ROW_NUMBER() OVER (
             ORDER BY
               (coredep IS NULL OR dep IS NULL OR dep = 0) ASC,
               (coredep / dep) DESC
           ) AS rn,
           COUNT(*) OVER () AS cnt
         FROM peer_group_base
       ),
       depuna_ranked AS (
         SELECT
           cert,
           callym,
           fed,
           segment,
           depuna,
           ROW_NUMBER() OVER (
             ORDER BY
               (depuna IS NULL OR dep IS NULL OR dep = 0) ASC,
               (depuna / dep) ASC
           ) AS rn,
           COUNT(*) OVER () AS cnt
         FROM peer_group_base
       )
       SELECT
         peer_group_base.cert AS cert,
         peer_group_base.nameFull AS nameFull,
         peer_group_base.city AS city,
         peer_group_base.stateName AS stateName,
         peer_group_base.asset AS asset,
         peer_group_base.dep AS dep,
         peer_group_base.depuna AS depuna,
         peer_group_base.coredep AS coredep,
         peer_group_base.nim AS nim,
         peer_group_base.roa AS roa,
         peer_group_base.roe AS roe,
         peer_group_base.lnlsdepr AS lnlsdepr,
         CASE
           WHEN lnlsdepr_ranked.cnt > 0
             THEN lnlsdepr_ranked.rn
           ELSE NULL
         END AS lnlsdepr_rank,
         lnlsdepr_ranked.cnt AS lnlsdepr_rank_total,
         CASE
           WHEN lnlsdepr_ranked.cnt > 1
             THEN (lnlsdepr_ranked.cnt - lnlsdepr_ranked.rn) / (lnlsdepr_ranked.cnt - 1)
           WHEN lnlsdepr_ranked.cnt = 1
             THEN 1
           ELSE NULL
         END AS lnlsdepr_rank_score,
         CASE
           WHEN coredep_ranked.cnt > 0
             THEN coredep_ranked.rn
           ELSE NULL
         END AS coredep_rank,
         coredep_ranked.cnt AS coredep_rank_total,
         CASE
           WHEN coredep_ranked.cnt > 1
             THEN (coredep_ranked.cnt - coredep_ranked.rn) / (coredep_ranked.cnt - 1)
           WHEN coredep_ranked.cnt = 1
             THEN 1
           ELSE NULL
         END AS coredep_rank_score,
         CASE
           WHEN depuna_ranked.cnt > 0
             THEN depuna_ranked.rn
           ELSE NULL
         END AS depuna_rank,
         depuna_ranked.cnt AS depuna_rank_total,
         CASE
           WHEN depuna_ranked.cnt > 1
             THEN (depuna_ranked.cnt - depuna_ranked.rn) / (depuna_ranked.cnt - 1)
           WHEN depuna_ranked.cnt = 1
             THEN 1
           ELSE NULL
         END AS depuna_rank_score,
         CASE
           WHEN lnlsdepr_ranked.cnt > 0
             AND coredep_ranked.cnt > 0
             AND depuna_ranked.cnt > 0
             THEN (
               lnlsdepr_ranked.rn
               + coredep_ranked.rn
               + depuna_ranked.rn
             )
           ELSE NULL
         END AS fundingStructureScore
       FROM peer_group_base
       LEFT JOIN lnlsdepr_ranked
         ON lnlsdepr_ranked.cert = peer_group_base.cert
       LEFT JOIN coredep_ranked
         ON coredep_ranked.cert = peer_group_base.cert
       LEFT JOIN depuna_ranked
         ON depuna_ranked.cert = peer_group_base.cert
       ${orderClause}`
      ,
      params
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error fetching benchmark data:', error);
    res.status(500).json({ message: 'Failed to fetch benchmark data' });
  }
});

router.get('/segment-liquidity', async (req, res) => {
  try {
    const segment = req.query.segment;
    const range = getSegmentRange(segment);
    const conditions = ['r.LNLSDEPR IS NOT NULL', 'f.ASSET IS NOT NULL'];
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
         r.CALLYM AS callym,
         AVG(r.LNLSDEPR) AS avgLnlsdepr
       FROM fdic_rat r
       JOIN fdic_fts f
         ON f.CERT = r.CERT AND f.CALLYM = r.CALLYM
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       GROUP BY r.CALLYM
       ORDER BY r.CALLYM ASC`,
      params,
    );

    res.json({ results: rows });
  } catch (error) {
    console.error('Error fetching segment liquidity averages:', error);
    res.status(500).json({ message: 'Failed to fetch segment liquidity averages' });
  }
});

router.get('/segment-bank-count', async (req, res) => {
  try {
    const segment = req.query.segment;
    const district = req.query.district;
    const range = getSegmentRange(segment);
    const isDistrictScoped = isDistrictScopedRange(range);

    if (!range) {
      return res.status(400).json({ message: 'Invalid segment parameter' });
    }

    if (isDistrictScoped && !district) {
      return res.status(400).json({ message: 'Missing district parameter' });
    }

    const conditions = ['f.ASSET IS NOT NULL'];
    const params = [];
    const latestQuarter = await fetchLatestQuarter();

    if (!latestQuarter) {
      return res.json({ count: 0, quarter: null });
    }

    conditions.push('f.CALLYM = ?');
    params.push(latestQuarter);

    if (range.min != null) {
      conditions.push('f.ASSET >= ?');
      params.push(range.min);
    }
    if (range.max != null) {
      conditions.push('f.ASSET < ?');
      params.push(range.max);
    }

    if (isDistrictScoped && district) {
      const fedCode = FRB_DISTRICT_BY_NAME[district];
      if (!Number.isFinite(fedCode)) {
        return res.status(400).json({ message: 'Invalid district parameter' });
      }
      conditions.push('s.FED = ?');
      params.push(fedCode);
    }

    const [rows] = await pool.query(
      `SELECT COUNT(DISTINCT f.CERT) AS bankCount
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
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}`,
      params,
    );

    res.json({ count: rows?.[0]?.bankCount ?? 0, quarter: latestQuarter });
  } catch (error) {
    console.error('Error fetching segment bank count:', error);
    res.status(500).json({ message: 'Failed to fetch segment bank count' });
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
         SUM(f.ASSET) AS totalAssets,
         SUM(f.LIAB) AS totalLiabilities,
         SUM(f.DEP) AS totalDeposits,
         SUM(f.EQ) AS totalEquity,
         AVG(
           CASE
             WHEN COALESCE(c.ERNAST2, 0) = 0 THEN NULL
             ELSE ((COALESCE(c.INTINQA, 0) - COALESCE(c.EINTXQA, 0)) / c.ERNAST2) * 100
           END
         ) AS avgNim,
         AVG(
           CASE
             WHEN COALESCE(c.ERNAST2, 0) = 0 THEN NULL
             ELSE (COALESCE(c.NETINCQA, 0) / c.ERNAST2) * 100
           END
         ) AS avgRoa,
         AVG(
           CASE
             WHEN COALESCE(f.EQ, 0) = 0 THEN NULL
             ELSE (COALESCE(c.NETINCQA, 0) / f.EQ) * 100
           END
         ) AS avgRoe
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
       LEFT JOIN fdic_cdi c
         ON c.CERT = f.CERT
         AND c.CALLYM = f.CALLYM
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
         SUM(COALESCE(c.INTINQA, 0)) AS intincqa,
         SUM(COALESCE(c.EINTXQA, 0)) AS eintxqa,
         SUM(COALESCE(c.NETINCQA, 0)) AS netincqa,
         SUM(COALESCE(c.ERNAST2, 0)) AS ernast2,
         SUM(COALESCE(c.EQTOTCP, 0)) AS eqtotcp,
         (SUM(COALESCE(c.INTINQA, 0)) - SUM(COALESCE(c.EINTXQA, 0)))
           / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS nim,
         SUM(COALESCE(c.NETINCQA, 0))
           / NULLIF(SUM(COALESCE(c.ERNAST2, 0)), 0) * 100 AS roa,
         SUM(COALESCE(c.NETINCQA, 0))
           / NULLIF(SUM(COALESCE(f.EQ, 0)), 0) * 100 AS roe
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
       LEFT JOIN fdic_cdi c
         ON c.CERT = f.CERT
         AND c.CALLYM = f.CALLYM
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

router.get('/national-averages/state-summary', async (req, res) => {
  try {
    const quarter = req.query.quarter;
    const { rows, quarter: resolvedQuarter } = await fetchStateSegmentSummary({ quarter });

    res.json({ results: rows, quarter: resolvedQuarter });
  } catch (error) {
    console.error('Error fetching state segment summary:', error);
    res.status(500).json({ message: 'Failed to fetch state segment summary' });
  }
});

router.get('/national-averages/region-summary', async (req, res) => {
  try {
    const quarter = req.query.quarter;
    const segment = req.query.segment;
    const region = req.query.region;
    const district = req.query.district;
    const { rows, quarter: resolvedQuarter } = await fetchStateSegmentSummary({
      quarter,
      segment,
      region,
      district,
    });
    const regionMap = new Map();

    rows.forEach((row) => {
      const region = REGION_BY_STATE[row.stateName] ?? 'Unknown';
      const key = `${region}::${row.segment}`;
      const bankCount = Number(row.bankCount) || 0;
      const assets = Number(row.assets) || 0;
      const deposits = Number(row.deposits) || 0;
      const liabilities = Number(row.liabilities) || 0;
      const equity = Number(row.equity) || 0;
      const intincqa = Number(row.intincqa) || 0;
      const eintxqa = Number(row.eintxqa) || 0;
      const netincqa = Number(row.netincqa) || 0;
      const ernast2 = Number(row.ernast2) || 0;
      const eqtotcp = Number(row.eqtotcp) || 0;

      if (!regionMap.has(key)) {
        regionMap.set(key, {
          region,
          segment: row.segment,
          bankCount: 0,
          assets: 0,
          deposits: 0,
          liabilities: 0,
          equity: 0,
          intincqa: 0,
          eintxqa: 0,
          netincqa: 0,
          ernast2: 0,
          eqtotcp: 0,
        });
      }

      const summary = regionMap.get(key);
      summary.bankCount += bankCount;
      summary.assets += assets;
      summary.deposits += deposits;
      summary.liabilities += liabilities;
      summary.equity += equity;
      summary.intincqa += intincqa;
      summary.eintxqa += eintxqa;
      summary.netincqa += netincqa;
      summary.ernast2 += ernast2;
      summary.eqtotcp += eqtotcp;
    });

    const results = Array.from(regionMap.values()).map((summary) => {
      const nim = summary.ernast2
        ? ((summary.intincqa - summary.eintxqa) / summary.ernast2) * 100
        : null;
      const roa = summary.ernast2
        ? (summary.netincqa / summary.ernast2) * 100
        : null;
      const roe = summary.eqtotcp
        ? (summary.netincqa / summary.eqtotcp) * 100
        : null;

      return {
        region: summary.region,
        segment: summary.segment,
        bankCount: summary.bankCount,
        assets: summary.assets,
        deposits: summary.deposits,
        liabilities: summary.liabilities,
        equity: summary.equity,
        nim,
        roa,
        roe,
      };
    });

    results.sort((a, b) => {
      const regionIndexA = REGION_ORDER.indexOf(a.region);
      const regionIndexB = REGION_ORDER.indexOf(b.region);
      const normalizedRegionA = regionIndexA === -1 ? Number.MAX_SAFE_INTEGER : regionIndexA;
      const normalizedRegionB = regionIndexB === -1 ? Number.MAX_SAFE_INTEGER : regionIndexB;
      if (normalizedRegionA !== normalizedRegionB) {
        return normalizedRegionA - normalizedRegionB;
      }
      const orderA = SEGMENT_ORDER.get(a.segment) ?? Number.MAX_SAFE_INTEGER;
      const orderB = SEGMENT_ORDER.get(b.segment) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });

    res.json({ results, quarter: resolvedQuarter });
  } catch (error) {
    console.error('Error fetching region segment summary:', error);
    res.status(500).json({ message: 'Failed to fetch region segment summary' });
  }
});

router.get('/national-averages/segment-summary', async (req, res) => {
  try {
    const quarter = req.query.quarter;
    const segment = req.query.segment;
    const region = req.query.region;
    const district = req.query.district;
    const { rows, quarter: resolvedQuarter } = await fetchSegmentSummary({
      quarter,
      segment,
      region,
      district,
    });

    res.json({ results: rows, quarter: resolvedQuarter });
  } catch (error) {
    console.error('Error fetching segment summary:', error);
    res.status(500).json({ message: 'Failed to fetch segment summary' });
  }
});

router.get('/national-averages/district-summary', async (req, res) => {
  try {
    const quarter = req.query.quarter;
    const segment = req.query.segment;
    const region = req.query.region;
    const district = req.query.district;
    const { rows, quarter: resolvedQuarter } = await fetchDistrictSummary({
      quarter,
      segment,
      region,
      district,
    });

    res.json({ results: rows, quarter: resolvedQuarter });
  } catch (error) {
    console.error('Error fetching district summary:', error);
    res.status(500).json({ message: 'Failed to fetch district summary' });
  }
});


router.get('/early-warnings', async (req, res) => {
  try {
    const segment = req.query.segment;
    const region = req.query.region;
    const district = req.query.district;
    const range = getSegmentRange(segment);
    const conditions = ['f.ASSET IS NOT NULL'];
    const params = [];
    const latestQuarter = await fetchLatestQuarter();

    if (!latestQuarter) {
      return res.json({ results: [], quarter: null });
    }

    conditions.push('f.CALLYM = ?');
    params.push(latestQuarter);

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
        return res.json({ results: [], quarter: latestQuarter });
      }
      conditions.push(`s.STNAME IN (${states.map(() => '?').join(', ')})`);
      params.push(...states);
    }

    if (district && district !== 'All Districts') {
      const fedCode = FRB_DISTRICT_BY_NAME[district];
      if (!Number.isFinite(fedCode)) {
        return res.json({ results: [], quarter: latestQuarter });
      }
      conditions.push('s.FED = ?');
      params.push(fedCode);
    }

    const [rows] = await pool.query(
      `SELECT
         f.CERT AS cert,
         s.NAMEFULL AS bankName,
         s.STNAME AS stateName,
         ${buildSegmentCaseStatement('f.ASSET')} AS portfolioView,
         ${buildSegmentCaseStatement('f.ASSET')} AS segment,
         f.ASSET AS totalAssets,
         f.DEP AS totalDeposits,
         f.RBCT1W AS tier1Capital,
         f.LNCOMRE AS totalCreLoans,
         f.LNLSGR AS yoyLoanGrowth,
         CASE
           WHEN prev_f.DEP IS NULL OR prev_f.DEP = 0 OR f.DEP IS NULL THEN NULL
           ELSE ((f.DEP - prev_f.DEP) / prev_f.DEP) * 100
         END AS yoyDepositGrowth,
         r.NPERFV AS npaPercent,
         c.DRLNLSQ AS chargeOffPercent,
         r.ROAQ AS roaa,
         r.ROEQ AS roae,
         r.NIMY AS nim,
         r.LNLSDEPR AS loanToDepositRatio,
         CASE
           WHEN f.DEP IS NULL OR f.DEP = 0 OR f.DEPUNA IS NULL THEN NULL
           ELSE (f.DEPUNA / f.DEP) * 100
         END AS uninsuredDepositRate,
         CASE
           WHEN f.DEP IS NULL OR f.DEP = 0 OR f.BRO IS NULL THEN NULL
           ELSE (f.BRO / f.DEP) * 100
         END AS brokeredDepositRate,
         s.FED AS fed
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
       LEFT JOIN fdic_rat r
         ON r.CERT = f.CERT
         AND r.CALLYM = f.CALLYM
       LEFT JOIN fdic_cdi c
         ON c.CERT = f.CERT
         AND c.CALLYM = f.CALLYM
       LEFT JOIN fdic_fts prev_f
         ON prev_f.CERT = f.CERT
         AND prev_f.CALLYM = f.CALLYM - 100
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY f.ASSET DESC, s.NAMEFULL ASC`,
      params
    );

    const results = rows.map((row) => ({
      ...row,
      region: REGION_BY_STATE[row.stateName] ?? 'Unknown',
      frbDistrict: getFrbDistrict(row.fed),
    }));

    res.json({ results, quarter: latestQuarter });
  } catch (error) {
    console.error('Error fetching early warnings data:', error);
    res.status(500).json({ message: 'Failed to fetch early warnings data' });
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
