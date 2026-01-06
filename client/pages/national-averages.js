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
  const [stateAssets, setStateAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchStateAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const segmentParam =
          selectedPortfolio && selectedPortfolio !== 'National Average'
            ? `?segment=${encodeURIComponent(selectedPortfolio)}`
            : '';
        const response = await fetch(`${API_BASE}/state-assets${segmentParam}`, {
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
  }, [selectedPortfolio]);

  const stateAssetMap = useMemo(() => {
    return stateAssets.reduce((acc, item) => {
      if (item.stateName) {
        acc[item.stateName] = Number(item.totalAssets);
      }
      return acc;
    }, {});
  }, [stateAssets]);

  const assetValues = Object.values(stateAssetMap).filter(Number.isFinite);
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
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.status}>Loading state assets...</p> : null}

        <div className={styles.mapWrapper}>
          <svg
            className={styles.tileMap}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label="US tile map showing total assets by state"
          >
            {usStateTiles.map((tile) => {
              const value = stateAssetMap[tile.name];
              const fill = getTileFill(value, minAsset, maxAsset);
              const x = tile.x * (tileSize + tileGap);
              const y = tile.y * (tileSize + tileGap);
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
                    <title>{`${tile.name}: ${formatCurrency(value)}`}</title>
                  </rect>
                  <text
                    x={x + tileSize / 2}
                    y={y + tileSize / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.tileLabel}
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
            <p className={styles.legendNote}>Darker shades represent higher total assets.</p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default NationalAverages;
