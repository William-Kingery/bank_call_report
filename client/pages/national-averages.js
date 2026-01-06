import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/NationalAverages.module.css';
import usStateTiles from '../data/usStateTiles';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const BENCHMARK_PORTFOLIOS = [
  'National Average',
  'Over 1 Trillion',
  'Between $250 B and 1 Trillion',
  'Between $100 B and 250 B',
  'Between $10 B and 100 B',
  'Between $1 B and 10 B',
  'Less than 1 B',
];

const REGION_OPTIONS = ['All Regions', 'Northeast', 'Midwest', 'South', 'West'];

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

const formatQuarter = (callym) => {
  const numeric = Number(callym);
  if (!Number.isFinite(numeric)) return 'Unknown';
  const year = Math.floor(numeric / 100);
  const month = numeric % 100;
  const quarter = Math.ceil(month / 3);
  return `Q${quarter} ${year}`;
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

const getTileFill = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return '#e2e8f0';
  }
  if (min === max) {
    return '#4338ca';
  }
  const ratio = (value - min) / (max - min);
  const clamp = Math.max(0, Math.min(1, ratio));
  const start = [226, 232, 240];
  const end = [67, 56, 202];
  const channels = start.map((channel, index) =>
    Math.round(channel + (end[index] - channel) * clamp)
  );
  return `rgb(${channels.join(',')})`;
};

const NationalAverages = () => {
  const [selectedPortfolio, setSelectedPortfolio] = useState('National Average');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [quarters, setQuarters] = useState([]);
  const [selectedQuarter, setSelectedQuarter] = useState('');
  const [stateAssets, setStateAssets] = useState([]);
  const [loadingQuarters, setLoadingQuarters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [quarterError, setQuarterError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchQuarters = async () => {
      setLoadingQuarters(true);
      setQuarterError(null);
      try {
        const response = await fetch(`${API_BASE}/state-assets/quarters`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to load quarters');
        }
        const data = await response.json();
        const availableQuarters = (data.results ?? [])
          .map((item) => String(item.callym))
          .filter((value) => value)
          .sort((a, b) => Number(b) - Number(a));
        setQuarters(availableQuarters);
        if (availableQuarters.length) {
          setSelectedQuarter((current) =>
            current && availableQuarters.includes(current) ? current : availableQuarters[0]
          );
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setQuarterError(err.message);
        }
      } finally {
        setLoadingQuarters(false);
      }
    };

    fetchQuarters();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedQuarter) {
      return undefined;
    }

    const controller = new AbortController();

    const fetchStateAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (selectedPortfolio && selectedPortfolio !== 'National Average') {
          queryParams.set('segment', selectedPortfolio);
        }
        if (selectedQuarter) {
          queryParams.set('quarter', selectedQuarter);
        }
        const queryString = queryParams.toString();
        const response = await fetch(`${API_BASE}/state-assets${queryString ? `?${queryString}` : ''}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to load state assets');
        }
        const data = await response.json();
        setStateAssets(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStateAssets();

    return () => controller.abort();
  }, [selectedPortfolio, selectedQuarter]);

  const stateAssetMap = useMemo(() => {
    return stateAssets.reduce((acc, item) => {
      if (item.stateName) {
        acc[item.stateName] = Number(item.totalAssets);
      }
      return acc;
    }, {});
  }, [stateAssets]);

  const isStateInRegion =
    selectedRegion === 'All Regions'
      ? () => true
      : (stateName) => REGION_BY_STATE[stateName] === selectedRegion;

  const assetValues = usStateTiles
    .filter((tile) => isStateInRegion(tile.name))
    .map((tile) => stateAssetMap[tile.name])
    .filter(Number.isFinite);
  const minAsset = assetValues.length ? Math.min(...assetValues) : 0;
  const maxAsset = assetValues.length ? Math.max(...assetValues) : 0;

  const tileSize = 48;
  const tileGap = 6;
  const columns = 13;
  const rows = 6;
  const svgWidth = columns * (tileSize + tileGap) - tileGap;
  const svgHeight = rows * (tileSize + tileGap) - tileGap;

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.kicker}>National Averages</p>
        <h1 className={styles.title}>Peer Group Trends Overview</h1>
        <p className={styles.subtitle}>
          This page provides a quick way to return to the National Averages and Peer Group Trends
          dashboard.
        </p>
        <Link className={styles.backButton} href="/">
          Back to Individual Bank Call Reports
        </Link>
      </div>

      <section className={styles.mapSection}>
        <div className={styles.mapHeader}>
          <div>
            <p className={styles.sectionKicker}>Total assets by state</p>
            <h2 className={styles.sectionTitle}>Banking assets mapped across the U.S.</h2>
          </div>
          <div className={styles.filterControls}>
            <label className={styles.selectLabel}>
              Portfolio view
              <select
                className={styles.select}
                value={selectedPortfolio}
                onChange={(event) => setSelectedPortfolio(event.target.value)}
              >
                {BENCHMARK_PORTFOLIOS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectLabel}>
              Region
              <select
                className={styles.select}
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.selectLabel}>
              Quarter
              <select
                className={styles.select}
                value={selectedQuarter}
                onChange={(event) => setSelectedQuarter(event.target.value)}
                disabled={loadingQuarters || !quarters.length}
              >
                {quarters.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    {formatQuarter(quarter)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {quarterError ? <p className={styles.error}>{quarterError}</p> : null}
        {loading ? <p className={styles.status}>Loading state assets...</p> : null}
        {loadingQuarters ? <p className={styles.status}>Loading available quarters...</p> : null}

        <div className={styles.mapWrapper}>
          <svg
            className={styles.tileMap}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label="US tile map showing total assets by state"
          >
            {usStateTiles.map((tile) => {
              const value = stateAssetMap[tile.name];
              const inRegion = isStateInRegion(tile.name);
              const fill = inRegion ? getTileFill(value, minAsset, maxAsset) : '#f1f5f9';
              const x = tile.x * (tileSize + tileGap);
              const y = tile.y * (tileSize + tileGap);
              const labelClass = inRegion ? styles.tileLabel : styles.tileLabelMuted;
              return (
                <g key={tile.name}>
                  <rect
                    x={x}
                    y={y}
                    width={tileSize}
                    height={tileSize}
                    rx={10}
                    fill={fill}
                    className={styles.tile}
                  >
                    <title>
                      {inRegion
                        ? `${tile.name}: ${formatCurrency(value)}`
                        : `${tile.name}: not in selected region`}
                    </title>
                  </rect>
                  <text
                    x={x + tileSize / 2}
                    y={y + tileSize / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={labelClass}
                  >
                    {tile.abbr}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className={styles.legend}>
            <div className={styles.legendBar} />
            <div className={styles.legendLabels}>
              <span>{formatCurrency(minAsset)}</span>
              <span>{formatCurrency(maxAsset)}</span>
            </div>
            <p className={styles.legendNote}>
              {selectedRegion === 'All Regions'
                ? 'Darker shades represent higher total assets.'
                : `${selectedRegion} states are highlighted by asset level.`}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default NationalAverages;
