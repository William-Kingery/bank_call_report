import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/NationalAverages.module.css';
import USAssetsMap from '../components/USAssetsMap';

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
  if (value === 0) return '$0B';
  const billions = value / 1_000_000_000;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(billions);
  return `${formatted}B`;
};

const getTileFill = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return '#e5e7eb';
  }
  const shades = ['#fb923c', '#22c55e', '#3b82f6'];
  if (min === max) {
    return shades[1];
  }
  const ratio = (value - min) / (max - min);
  const clamp = Math.max(0, Math.min(1, ratio));
  const index = clamp < 0.34 ? 0 : clamp < 0.67 ? 1 : 2;
  return shades[index];
};

const NationalAverages = () => {
  const [selectedPortfolio, setSelectedPortfolio] = useState('National Average');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [availableQuarters, setAvailableQuarters] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [stateAssets, setStateAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchQuarters = async () => {
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
        setAvailableQuarters(availableQuarters);
        if (availableQuarters.length) {
          setSelectedPeriod(`quarter:${availableQuarters[0]}`);
        } else {
          setSelectedPeriod('');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setAvailableQuarters([]);
          setSelectedPeriod('');
        }
      } finally {
      }
    };

    fetchQuarters();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchStateAssets = async () => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (selectedPortfolio && selectedPortfolio !== 'National Average') {
          queryParams.set('segment', selectedPortfolio);
        }
        if (selectedPeriod) {
          const [periodType, periodValue] = selectedPeriod.split(':');
          if (periodType === 'year') {
            queryParams.set('year', periodValue);
          } else if (periodType === 'quarter') {
            queryParams.set('quarter', periodValue);
          }
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
  }, [selectedPortfolio, selectedPeriod]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        availableQuarters
          .map((quarter) => Math.floor(Number(quarter) / 100))
          .filter((year) => Number.isFinite(year))
      )
    );
    years.sort((a, b) => b - a);
    return years;
  }, [availableQuarters]);

  const selectedPeriodLabel = useMemo(() => {
    if (!selectedPeriod) {
      return '';
    }
    const [periodType, periodValue] = selectedPeriod.split(':');
    if (periodType === 'year') {
      return `Year ${periodValue}`;
    }
    return formatQuarter(periodValue);
  }, [selectedPeriod]);

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

  const assetValues = stateAssets
    .filter((item) => isStateInRegion(item.stateName))
    .map((item) => Number(item.totalAssets))
    .filter(Number.isFinite);
  const minAsset = assetValues.length ? Math.min(...assetValues) : 0;
  const maxAsset = assetValues.length ? Math.max(...assetValues) : 0;

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
            <p className={styles.sectionKicker}>Latest assets by state</p>
            <h2 className={styles.sectionTitle}>US Nation-wide Banking</h2>
            <p className={styles.sectionSubtitle}>
              Total Summary for each State for the selected period
            </p>
          </div>
          <div className={styles.filterControls}>
            <label className={styles.selectLabel}>
              Qtr by Year
              <select
                className={styles.select}
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
                disabled={!availableQuarters.length}
              >
                <optgroup label="Quarterly">
                  {availableQuarters.map((option) => (
                    <option key={option} value={`quarter:${option}`}>
                      {formatQuarter(option)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Yearly">
                  {yearOptions.map((option) => (
                    <option key={option} value={`year:${option}`}>
                      {option}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
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
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.status}>Loading state assets...</p> : null}

        <div className={styles.mapWrapper}>
          <USAssetsMap
            stateAssetMap={stateAssetMap}
            minAsset={minAsset}
            maxAsset={maxAsset}
            isStateInRegion={isStateInRegion}
            formatCurrency={formatCurrency}
            getTileFill={getTileFill}
          />

          <div className={styles.legend}>
            <div className={styles.legendBar} />
            <div className={styles.legendLabels}>
              <span>{formatCurrency(minAsset)}</span>
              <span>{formatCurrency(maxAsset)}</span>
            </div>
            {selectedPeriodLabel ? (
              <p className={styles.legendDate}>As of {selectedPeriodLabel}</p>
            ) : null}
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
