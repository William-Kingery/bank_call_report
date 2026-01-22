import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/NationalAverages.module.css';
import USAssetsMap from '../components/USAssetsMap';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const BENCHMARK_PORTFOLIOS = [
  'National Average',
  'Over 700 Billion',
  'Between $250 B and 700 Billion',
  'Between $100 B and 250 B',
  'Between $50 B and 100 B',
  'Between $10 B and 50 B',
  'Between $5 B and 10 B',
  'Between $1 B and 5 B',
  'Between $0.5 B and 1 B',
  'Less than 0.5 B',
];

const REGION_OPTIONS = ['All Regions', 'Northeast', 'Midwest', 'South', 'West'];

const FRB_DISTRICT_OPTIONS = [
  'All Districts',
  'Boston',
  'New York',
  'Philadelphia',
  'Cleveland',
  'Richmond',
  'Atlanta',
  'Chicago',
  'St. Louis',
  'Minneapolis',
  'Kansas City',
  'Dallas',
  'San Francisco',
];

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

const FRB_DISTRICT_BY_STATE = {
  Alabama: 'Atlanta',
  Alaska: 'San Francisco',
  Arizona: 'San Francisco',
  Arkansas: 'St. Louis',
  California: 'San Francisco',
  Colorado: 'Kansas City',
  Connecticut: 'Boston',
  Delaware: 'Philadelphia',
  'District of Columbia': 'Richmond',
  Florida: 'Atlanta',
  Georgia: 'Atlanta',
  Hawaii: 'San Francisco',
  Idaho: 'San Francisco',
  Illinois: 'Chicago',
  Indiana: 'Chicago',
  Iowa: 'Chicago',
  Kansas: 'Kansas City',
  Kentucky: 'Cleveland',
  Louisiana: 'Dallas',
  Maine: 'Boston',
  Maryland: 'Richmond',
  Massachusetts: 'Boston',
  Michigan: 'Chicago',
  Minnesota: 'Minneapolis',
  Mississippi: 'Atlanta',
  Missouri: 'St. Louis',
  Montana: 'Minneapolis',
  Nebraska: 'Kansas City',
  Nevada: 'San Francisco',
  'New Hampshire': 'Boston',
  'New Jersey': 'Philadelphia',
  'New Mexico': 'Dallas',
  'New York': 'New York',
  'North Carolina': 'Richmond',
  'North Dakota': 'Minneapolis',
  Ohio: 'Cleveland',
  Oklahoma: 'Kansas City',
  Oregon: 'San Francisco',
  Pennsylvania: 'Philadelphia',
  'Rhode Island': 'Boston',
  'South Carolina': 'Richmond',
  'South Dakota': 'Minneapolis',
  Tennessee: 'Atlanta',
  Texas: 'Dallas',
  Utah: 'San Francisco',
  Vermont: 'Boston',
  Virginia: 'Richmond',
  Washington: 'San Francisco',
  'West Virginia': 'Cleveland',
  Wisconsin: 'Chicago',
  Wyoming: 'Kansas City',
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
  const billions = value / 1_000_000;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(billions);
  return `${formatted}B`;
};

const formatCount = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US').format(value);
};

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(2)}%`;
};

const getTileFill = (value) => {
  if (!Number.isFinite(value)) {
    return '#e5e7eb';
  }
  const shades = ['#facc15', '#fb923c', '#3b82f6', '#166534'];
  const billions = value / 1_000_000;

  if (billions < 500) {
    return shades[0];
  }
  if (billions < 1000) {
    return shades[1];
  }
  if (billions < 2500) {
    return shades[2];
  }
  return shades[3];
};

const NationalAverages = () => {
  const [selectedPortfolio, setSelectedPortfolio] = useState('National Average');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [availableQuarters, setAvailableQuarters] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [stateAssets, setStateAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [regionSummaryRows, setRegionSummaryRows] = useState([]);
  const [regionSummaryLoading, setRegionSummaryLoading] = useState(false);
  const [regionSummaryError, setRegionSummaryError] = useState(null);
  const [segmentSummaryRows, setSegmentSummaryRows] = useState([]);
  const [segmentSummaryLoading, setSegmentSummaryLoading] = useState(false);
  const [segmentSummaryError, setSegmentSummaryError] = useState(null);
  const [districtSummaryRows, setDistrictSummaryRows] = useState([]);
  const [districtSummaryLoading, setDistrictSummaryLoading] = useState(false);
  const [districtSummaryError, setDistrictSummaryError] = useState(null);

  const buildSummaryQueryParams = () => {
    const queryParams = new URLSearchParams();
    if (selectedPortfolio && selectedPortfolio !== 'National Average') {
      queryParams.set('segment', selectedPortfolio);
    }
    if (selectedPeriod) {
      const [, periodValue] = selectedPeriod.split(':');
      queryParams.set('quarter', periodValue);
    }
    if (selectedRegion && selectedRegion !== 'All Regions') {
      queryParams.set('region', selectedRegion);
    }
    if (selectedDistrict && selectedDistrict !== 'All Districts') {
      queryParams.set('district', selectedDistrict);
    }
    return queryParams;
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

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

    const fetchSummary = async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const queryString = buildSummaryQueryParams().toString();
        const response = await fetch(`${API_BASE}/national-averages/summary${queryString ? `?${queryString}` : ''}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to load national summary');
        }
        const data = await response.json();
        setSummaryRows(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSummaryRows([]);
          setSummaryError(err.message);
        }
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchSummary();

    return () => controller.abort();
  }, [selectedPortfolio, selectedPeriod, selectedRegion, selectedDistrict]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchRegionSummary = async () => {
      setRegionSummaryLoading(true);
      setRegionSummaryError(null);
      try {
        const queryString = buildSummaryQueryParams().toString();
        const response = await fetch(
          `${API_BASE}/national-averages/region-summary${queryString ? `?${queryString}` : ''}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Failed to load region summary');
        }
        const data = await response.json();
        setRegionSummaryRows(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setRegionSummaryRows([]);
          setRegionSummaryError(err.message);
        }
      } finally {
        setRegionSummaryLoading(false);
      }
    };

    fetchRegionSummary();

    return () => controller.abort();
  }, [selectedPortfolio, selectedPeriod, selectedRegion, selectedDistrict]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSegmentSummary = async () => {
      setSegmentSummaryLoading(true);
      setSegmentSummaryError(null);
      try {
        const queryString = buildSummaryQueryParams().toString();
        const response = await fetch(
          `${API_BASE}/national-averages/segment-summary${queryString ? `?${queryString}` : ''}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Failed to load segment summary');
        }
        const data = await response.json();
        setSegmentSummaryRows(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSegmentSummaryRows([]);
          setSegmentSummaryError(err.message);
        }
      } finally {
        setSegmentSummaryLoading(false);
      }
    };

    fetchSegmentSummary();

    return () => controller.abort();
  }, [selectedPortfolio, selectedPeriod, selectedRegion, selectedDistrict]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchDistrictSummary = async () => {
      setDistrictSummaryLoading(true);
      setDistrictSummaryError(null);
      try {
        const queryString = buildSummaryQueryParams().toString();
        const response = await fetch(
          `${API_BASE}/national-averages/district-summary${queryString ? `?${queryString}` : ''}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Failed to load district summary');
        }
        const data = await response.json();
        setDistrictSummaryRows(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setDistrictSummaryRows([]);
          setDistrictSummaryError(err.message);
        }
      } finally {
        setDistrictSummaryLoading(false);
      }
    };

    fetchDistrictSummary();

    return () => controller.abort();
  }, [selectedPortfolio, selectedPeriod, selectedRegion, selectedDistrict]);

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
          const [, periodValue] = selectedPeriod.split(':');
          queryParams.set('quarter', periodValue);
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

  const isStateInDistrict =
    selectedDistrict === 'All Districts'
      ? () => true
      : (stateName) => FRB_DISTRICT_BY_STATE[stateName] === selectedDistrict;

  const isStateVisible = (stateName) =>
    isStateInRegion(stateName) && isStateInDistrict(stateName);

  const assetValues = stateAssets
    .filter((item) => isStateVisible(item.stateName))
    .map((item) => Number(item.totalAssets))
    .filter(Number.isFinite);
  const minAsset = assetValues.length ? Math.min(...assetValues) : 0;
  const maxAsset = assetValues.length ? Math.max(...assetValues) : 0;
  const totalAssets = stateAssets
    .filter((item) => isStateVisible(item.stateName))
    .reduce((sum, item) => {
      const value = Number(item.totalAssets);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  const totalAssetsLabelParts = [];
  if (selectedRegion !== 'All Regions') {
    totalAssetsLabelParts.push(`${selectedRegion} region`);
  }
  if (selectedDistrict !== 'All Districts') {
    totalAssetsLabelParts.push(`${selectedDistrict} district`);
  }
  const totalAssetsLabel = totalAssetsLabelParts.length
    ? totalAssetsLabelParts.join(', ')
    : 'All regions';

  const selectedQuarterValue = selectedPeriod ? selectedPeriod.split(':')[1] : '';

  const filteredSummaryRows = useMemo(() => {
    if (!selectedQuarterValue) {
      return summaryRows;
    }
    return summaryRows.filter((row) => String(row.callym) === selectedQuarterValue);
  }, [selectedQuarterValue, summaryRows]);

  const renderFilterControls = () => (
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
      <div className={styles.printControlGroup}>
        <button className={styles.printButton} type="button" onClick={handlePrint}>
          Print chart + table
        </button>
        <label className={styles.selectLabel}>
          FRB District
          <select
            className={styles.select}
            value={selectedDistrict}
            onChange={(event) => setSelectedDistrict(event.target.value)}
          >
            {FRB_DISTRICT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );

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
          {renderFilterControls()}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.status}>Loading state assets...</p> : null}

        <div className={styles.mapWrapper}>
          <USAssetsMap
            stateAssetMap={stateAssetMap}
            minAsset={minAsset}
            maxAsset={maxAsset}
            isStateInRegion={isStateVisible}
            formatCurrency={formatCurrency}
            getTileFill={getTileFill}
          />

          <div className={styles.legend}>
            <div className={styles.legendSummary}>
              <span className={styles.legendSummaryLabel}>
                Total assets ({totalAssetsLabel})
              </span>
              <span className={styles.legendSummaryValue}>{formatCurrency(totalAssets)}</span>
            </div>
            <div className={styles.legendBar} />
          </div>
        </div>

        <div className={styles.summarySection}>
          <div>
            <p className={styles.sectionKicker}>Nation-wide performance</p>
            <h3 className={styles.bankTitle}>FDIC industry totals by quarter</h3>
            <p className={styles.sectionSubtitle}>
              Aggregated totals for assets, deposits, liabilities, equity, and profitability.
            </p>
          </div>
          {summaryError ? <p className={styles.error}>{summaryError}</p> : null}
          {summaryLoading ? (
            <p className={styles.status}>Loading national summary...</p>
          ) : null}
          {!summaryLoading && !summaryError ? (
            <div className={styles.tableWrapper}>
              <table className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>Banks</th>
                    <th>Assets</th>
                    <th>Liabilities</th>
                    <th>Deposits</th>
                    <th>Equity</th>
                    <th>Net income</th>
                    <th>ROA</th>
                    <th>ROE</th>
                    <th>NIM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummaryRows.map((row) => {
                    const rowKey = String(row.callym);
                    const isSelected = selectedQuarterValue === rowKey;
                    return (
                      <tr
                        key={rowKey}
                        className={isSelected ? styles.highlightRow : undefined}
                      >
                        <td>{formatCount(Number(row.bankCount))}</td>
                        <td>{formatCurrency(Number(row.assets))}</td>
                        <td>{formatCurrency(Number(row.liabilities))}</td>
                        <td>{formatCurrency(Number(row.deposits))}</td>
                        <td>{formatCurrency(Number(row.equity))}</td>
                        <td>{formatCurrency(Number(row.netIncome))}</td>
                        <td>{formatPercentage(Number(row.roa))}</td>
                        <td>{formatPercentage(Number(row.roe))}</td>
                        <td>{formatPercentage(Number(row.nim))}</td>
                      </tr>
                    );
                  })}
                  {!filteredSummaryRows.length ? (
                    <tr>
                      <td colSpan={9}>No summary data for the selected quarter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className={styles.summarySection}>
          <div>
            <p className={styles.sectionKicker}>Region segmentation</p>
            <h3 className={styles.bankTitle}>Regional performance totals</h3>
            <p className={styles.sectionSubtitle}>
              Summary metrics broken out by region for the selected filters.
            </p>
          </div>
          {regionSummaryError ? <p className={styles.error}>{regionSummaryError}</p> : null}
          {regionSummaryLoading ? (
            <p className={styles.status}>Loading regional summary...</p>
          ) : null}
          {!regionSummaryLoading && !regionSummaryError ? (
            <div className={styles.tableWrapper}>
              <table className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Banks</th>
                    <th>Assets</th>
                    <th>Liabilities</th>
                    <th>Deposits</th>
                    <th>Equity</th>
                    <th>Net income</th>
                    <th>ROA</th>
                    <th>ROE</th>
                    <th>NIM</th>
                  </tr>
                </thead>
                <tbody>
                  {regionSummaryRows.map((row) => (
                    <tr key={`${row.region}-${row.segment ?? 'all'}`}>
                      <td>{row.region}</td>
                      <td>{formatCount(Number(row.bankCount))}</td>
                      <td>{formatCurrency(Number(row.assets))}</td>
                      <td>{formatCurrency(Number(row.liabilities))}</td>
                      <td>{formatCurrency(Number(row.deposits))}</td>
                      <td>{formatCurrency(Number(row.equity))}</td>
                      <td>{formatCurrency(Number(row.netIncome))}</td>
                      <td>{formatPercentage(Number(row.roa))}</td>
                      <td>{formatPercentage(Number(row.roe))}</td>
                      <td>{formatPercentage(Number(row.nim))}</td>
                    </tr>
                  ))}
                  {!regionSummaryRows.length ? (
                    <tr>
                      <td colSpan={10}>No region summary data for the selected filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className={styles.summarySection}>
          <div>
            <p className={styles.sectionKicker}>Asset range segmentation</p>
            <h3 className={styles.bankTitle}>Asset range performance totals</h3>
            <p className={styles.sectionSubtitle}>
              Summary metrics grouped by asset range for the selected filters.
            </p>
          </div>
          {segmentSummaryError ? <p className={styles.error}>{segmentSummaryError}</p> : null}
          {segmentSummaryLoading ? (
            <p className={styles.status}>Loading asset range summary...</p>
          ) : null}
          {!segmentSummaryLoading && !segmentSummaryError ? (
            <div className={styles.tableWrapper}>
              <table className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>Asset range</th>
                    <th>Banks</th>
                    <th>Assets</th>
                    <th>Liabilities</th>
                    <th>Deposits</th>
                    <th>Equity</th>
                    <th>Net income</th>
                    <th>ROA</th>
                    <th>ROE</th>
                    <th>NIM</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentSummaryRows.map((row) => (
                    <tr key={row.segment}>
                      <td>{row.segment}</td>
                      <td>{formatCount(Number(row.bankCount))}</td>
                      <td>{formatCurrency(Number(row.assets))}</td>
                      <td>{formatCurrency(Number(row.liabilities))}</td>
                      <td>{formatCurrency(Number(row.deposits))}</td>
                      <td>{formatCurrency(Number(row.equity))}</td>
                      <td>{formatCurrency(Number(row.netIncome))}</td>
                      <td>{formatPercentage(Number(row.roa))}</td>
                      <td>{formatPercentage(Number(row.roe))}</td>
                      <td>{formatPercentage(Number(row.nim))}</td>
                    </tr>
                  ))}
                  {!segmentSummaryRows.length ? (
                    <tr>
                      <td colSpan={10}>No asset range summary data for the selected filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className={styles.summarySection}>
          <div>
            <p className={styles.sectionKicker}>FRB District segmentation</p>
            <h3 className={styles.bankTitle}>District performance totals</h3>
            <p className={styles.sectionSubtitle}>
              Summary metrics grouped by Federal Reserve district for the selected filters.
            </p>
          </div>
          {districtSummaryError ? <p className={styles.error}>{districtSummaryError}</p> : null}
          {districtSummaryLoading ? (
            <p className={styles.status}>Loading district summary...</p>
          ) : null}
          {!districtSummaryLoading && !districtSummaryError ? (
            <div className={styles.tableWrapper}>
              <table className={styles.summaryTable}>
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Banks</th>
                    <th>Assets</th>
                    <th>Liabilities</th>
                    <th>Deposits</th>
                    <th>Equity</th>
                    <th>Net income</th>
                    <th>ROA</th>
                    <th>ROE</th>
                    <th>NIM</th>
                  </tr>
                </thead>
                <tbody>
                  {districtSummaryRows.map((row) => (
                    <tr key={row.district}>
                      <td>{row.district}</td>
                      <td>{formatCount(Number(row.bankCount))}</td>
                      <td>{formatCurrency(Number(row.assets))}</td>
                      <td>{formatCurrency(Number(row.liabilities))}</td>
                      <td>{formatCurrency(Number(row.deposits))}</td>
                      <td>{formatCurrency(Number(row.equity))}</td>
                      <td>{formatCurrency(Number(row.netIncome))}</td>
                      <td>{formatPercentage(Number(row.roa))}</td>
                      <td>{formatPercentage(Number(row.roe))}</td>
                      <td>{formatPercentage(Number(row.nim))}</td>
                    </tr>
                  ))}
                  {!districtSummaryRows.length ? (
                    <tr>
                      <td colSpan={10}>No district summary data for the selected filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

      </section>
    </main>
  );
};

export default NationalAverages;
