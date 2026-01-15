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

const FRB_DISTRICTS = [
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

const getFrbDistrict = (fedValue) => {
  const fedNumber = Number.parseInt(fedValue, 10);
  if (!Number.isFinite(fedNumber)) {
    return 'Unknown';
  }
  return FRB_DISTRICTS[fedNumber - 1] ?? 'Unknown';
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
  const [availableQuarters, setAvailableQuarters] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [stateAssets, setStateAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bankRows, setBankRows] = useState([]);
  const [bankSelections, setBankSelections] = useState({});
  const [selectedBankCert, setSelectedBankCert] = useState('');
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState(null);
  const [summaryRows, setSummaryRows] = useState([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

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
        const response = await fetch(`${API_BASE}/national-averages/summary`, {
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

  useEffect(() => {
    const controller = new AbortController();

    const fetchBanks = async () => {
      setBankLoading(true);
      setBankError(null);
      try {
        const response = await fetch(`${API_BASE}/structure/banks`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to load structure data');
        }
        const data = await response.json();
        const results = (data.results ?? []).map((row) => ({
          ...row,
          frbDistrict: getFrbDistrict(row.fed),
        }));
        setBankRows(results);
        setBankSelections(
          results.reduce((acc, row) => {
            acc[row.cert] = row.frbDistrict || 'Unknown';
            return acc;
          }, {})
        );
        if (!selectedBankCert && results.length) {
          setSelectedBankCert(results[0].cert);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setBankRows([]);
          setBankError(err.message);
        }
      } finally {
        setBankLoading(false);
      }
    };

    fetchBanks();

    return () => controller.abort();
  }, []);

  const handleDistrictChange = (cert, value) => {
    setBankSelections((prev) => ({
      ...prev,
      [cert]: value,
    }));
  };

  const selectedPeriodLabel = useMemo(() => {
    if (!selectedPeriod) {
      return '';
    }
    const [, periodValue] = selectedPeriod.split(':');
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
  const totalAssets = stateAssets
    .filter((item) => isStateInRegion(item.stateName))
    .reduce((sum, item) => {
      const value = Number(item.totalAssets);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  const totalAssetsLabel =
    selectedRegion === 'All Regions' ? 'All regions' : `${selectedRegion} region`;

  const selectedQuarterValue = selectedPeriod ? selectedPeriod.split(':')[1] : '';

  const filteredSummaryRows = useMemo(() => {
    if (!selectedQuarterValue) {
      return summaryRows;
    }
    return summaryRows.filter((row) => String(row.callym) === selectedQuarterValue);
  }, [selectedQuarterValue, summaryRows]);

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
            <label className={styles.selectLabel}>
              FRB District
              <select
                className={styles.select}
                value={bankSelections[selectedBankCert] || 'Unknown'}
                onChange={(event) =>
                  handleDistrictChange(selectedBankCert, event.target.value)
                }
                disabled={!selectedBankCert}
              >
                {FRB_DISTRICTS.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
                {!FRB_DISTRICTS.includes(bankSelections[selectedBankCert]) ? (
                  <option value="Unknown">Unknown</option>
                ) : null}
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
                    <th>Period</th>
                    <th>Banks</th>
                    <th>Assets</th>
                    <th>Deposits</th>
                    <th>Liabilities</th>
                    <th>Equity</th>
                    <th>Net income</th>
                    <th>ROA</th>
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
                        <td>{formatQuarter(row.callym)}</td>
                        <td>{formatCount(Number(row.bankCount))}</td>
                        <td>{formatCurrency(Number(row.assets))}</td>
                        <td>{formatCurrency(Number(row.deposits))}</td>
                        <td>{formatCurrency(Number(row.liabilities))}</td>
                        <td>{formatCurrency(Number(row.equity))}</td>
                        <td>{formatCurrency(Number(row.netIncome))}</td>
                        <td>{formatPercentage(Number(row.roa))}</td>
                      </tr>
                    );
                  })}
                  {!filteredSummaryRows.length ? (
                    <tr>
                      <td colSpan={8}>No summary data for the selected quarter.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className={styles.bankSection}>
          <div>
            <p className={styles.sectionKicker}>Structure data</p>
            <h3 className={styles.bankTitle}>FRB District assignments</h3>
            <p className={styles.sectionSubtitle}>
              Assign the Federal Reserve Bank district for each bank using the structure FED code.
            </p>
          </div>
          {bankError ? <p className={styles.error}>{bankError}</p> : null}
          {bankLoading ? <p className={styles.status}>Loading bank structure data...</p> : null}
          {!bankLoading && !bankError ? (
            <div className={styles.tableWrapper}>
              <table className={styles.bankTable}>
                <thead>
                  <tr>
                    <th>Bank</th>
                    <th>Cert</th>
                    <th>State</th>
                    <th>FRB District</th>
                  </tr>
                </thead>
                <tbody>
                  {bankRows.map((row) => (
                    <tr key={row.cert}>
                      <td>{row.nameFull}</td>
                      <td>{row.cert}</td>
                      <td>{row.stateName || 'N/A'}</td>
                      <td>
                        <select
                          className={styles.select}
                          value={bankSelections[row.cert] || 'Unknown'}
                          onChange={(event) =>
                            handleDistrictChange(row.cert, event.target.value)
                          }
                        >
                          {FRB_DISTRICTS.map((district) => (
                            <option key={district} value={district}>
                              {district}
                            </option>
                          ))}
                          {!FRB_DISTRICTS.includes(bankSelections[row.cert]) ? (
                            <option value="Unknown">Unknown</option>
                          ) : null}
                        </select>
                      </td>
                    </tr>
                  ))}
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
