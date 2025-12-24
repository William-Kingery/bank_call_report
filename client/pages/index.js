import { useEffect, useMemo, useState } from 'react';
import styles from '../styles/Home.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const buildLineData = (series, key) => {
  if (!series?.length) {
    return {
      path: '',
      points: [],
      min: null,
      max: null,
    };
  }

  const values = series
    .map((point) => Number(point?.[key]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return {
      path: '',
      points: [],
      min: null,
      max: null,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = series.length > 1 ? 100 / (series.length - 1) : 0;

  let path = '';
  let hasStarted = false;
  const points = [];

  series.forEach((point, index) => {
    const value = Number(point?.[key]);
    if (!Number.isFinite(value)) {
      hasStarted = false;
      return;
    }

    const x = series.length > 1 ? index * step : 50;
    const y = 100 - ((value - min) / range) * 100;
    path += `${hasStarted ? 'L' : 'M'}${x},${y}`;
    hasStarted = true;
    points.push({ x, y, value, label: point.label });
  });

  return {
    path,
    points,
    min,
    max,
  };
};

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [reportData, setReportData] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState([]);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState(null);
  const [benchmarkSegment, setBenchmarkSegment] = useState(null);
  const [benchmarkSortField, setBenchmarkSortField] = useState('asset');
  const [benchmarkSortOrder, setBenchmarkSortOrder] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSelectedBank, setHasSelectedBank] = useState(false);
  const [activeTab, setActiveTab] = useState('portfolio');

  const formatQuarterLabel = (callym) => {
    if (!callym) return 'N/A';

    const year = String(callym).slice(0, 4);
    const month = String(callym).slice(4);
    const quarterMap = {
      '03': 'Q1',
      '06': 'Q2',
      '09': 'Q3',
      '12': 'Q4',
    };

    const quarter = quarterMap[month] ?? month;
    return `${year} ${quarter}`;
  };

  const formatNumber = (value) =>
    value === null || value === undefined ? 'N/A' : Number(value).toLocaleString('en-US');
  const formatPercentage = (value) =>
    value === null || value === undefined ? 'N/A' : `${Number.parseFloat(value).toFixed(2)}%`;

  const getAssetSegment = (assetValue) => {
    const asset = Number(assetValue);
    if (!Number.isFinite(asset)) return null;
    if (asset >= 1000000000) return 'Over 1 Trillion';
    if (asset >= 250000000) return 'Between $250 B and 1 Trillion';
    if (asset >= 100000000) return 'Between $100 B and 250 B';
    if (asset >= 10000000) return 'Between $10 B and 100 B';
    if (asset >= 1000000) return 'Between $1 B and 10 B';
    return 'Less than 1 B';
  };

  const sortedPoints = useMemo(() => {
    if (!reportData?.points?.length) return [];
    return [...reportData.points].sort((a, b) => Number(a.callym) - Number(b.callym));
  }, [reportData]);

  const assetMaxValue = useMemo(
    () =>
      sortedPoints.reduce(
        (maxValue, point) => Math.max(maxValue, Number(point.asset) || 0),
        0,
      ),
    [sortedPoints],
  );

  const equityMaxValue = useMemo(
    () =>
      sortedPoints.reduce(
        (maxValue, point) => Math.max(maxValue, Number(point.eq) || 0),
        0,
      ),
    [sortedPoints],
  );

  const quarterlySeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return sortedPoints.map((point) => {
      const assetValue = Number(point.asset);
      const equityValue = Number(point.eq);
      const hasAsset = Number.isFinite(assetValue);
      const hasEquity = Number.isFinite(equityValue);

      return {
        label: formatQuarterLabel(point.callym),
        asset: hasAsset ? assetValue : null,
        equity: hasEquity ? equityValue : null,
        assetPercentage:
          assetMaxValue > 0 && hasAsset ? (assetValue / assetMaxValue) * 100 : 0,
        equityPercentage:
          equityMaxValue > 0 && hasEquity ? (equityValue / equityMaxValue) * 100 : 0,
      };
    });
  }, [assetMaxValue, equityMaxValue, sortedPoints]);

  const profitabilitySeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return sortedPoints.map((point) => {
      const nimValue = Number(point.nimy);
      const roaValue = Number(point.roa);
      const roeValue = Number(point.roe);

      return {
        label: formatQuarterLabel(point.callym),
        nim: Number.isFinite(nimValue) ? nimValue : null,
        roa: Number.isFinite(roaValue) ? roaValue : null,
        roe: Number.isFinite(roeValue) ? roeValue : null,
      };
    });
  }, [sortedPoints]);

  const efficiencySeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return sortedPoints.map((point) => {
      const efficiencyValue = Number(point.efficiencyRatio);

      return {
        label: formatQuarterLabel(point.callym),
        efficiencyRatio: Number.isFinite(efficiencyValue) ? efficiencyValue : null,
      };
    });
  }, [sortedPoints]);

  const profitabilityLineData = useMemo(
    () => ({
      nim: buildLineData(profitabilitySeries, 'nim'),
      roa: buildLineData(profitabilitySeries, 'roa'),
      roe: buildLineData(profitabilitySeries, 'roe'),
      efficiencyRatio: buildLineData(efficiencySeries, 'efficiencyRatio'),
    }),
    [efficiencySeries, profitabilitySeries],
  );

  const latestPoint = useMemo(() => {
    if (!sortedPoints.length) return null;
    return sortedPoints[sortedPoints.length - 1];
  }, [sortedPoints]);
  const latestRatPoint = reportData?.latestRat ?? null;

  const selectedAssetSegment = useMemo(
    () => getAssetSegment(latestPoint?.asset),
    [latestPoint?.asset],
  );

  const benchmarkSubtitle = selectedAssetSegment
    ? `Top 10 banks in the ${selectedAssetSegment} segment by assets.`
    : 'Top 10 banks by assets with profitability ratios.';

  const benchmarkSortedData = useMemo(() => {
    if (!benchmarkData.length) return [];

    const sorted = [...benchmarkData];
    sorted.sort((a, b) => {
      const aValue = Number(a?.[benchmarkSortField]);
      const bValue = Number(b?.[benchmarkSortField]);
      const aHasValue = Number.isFinite(aValue);
      const bHasValue = Number.isFinite(bValue);

      if (!aHasValue && !bHasValue) return 0;
      if (!aHasValue) return 1;
      if (!bHasValue) return -1;

      return benchmarkSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return sorted;
  }, [benchmarkData, benchmarkSortField, benchmarkSortOrder]);

  const formattedLocation = useMemo(() => {
    if (!reportData) return null;

    const parts = [reportData.city, reportData.stateName, reportData.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }, [reportData]);

  const latestLiabilities =
    latestPoint?.asset != null && latestPoint?.eq != null
      ? latestPoint.asset - latestPoint.eq
      : null;

  const latestRwa = latestPoint?.rwa;
  const latestNim = latestRatPoint?.nimy ?? latestPoint?.nimy;
  const latestAgLoans = latestPoint?.LNAG;
  const latestCILoans = latestPoint?.LNCI;
  const latestCreLoans = latestPoint?.LNCOMRE;
  const latestReLoans = latestPoint?.LNRE;
  const latestConsumerLoans = latestPoint?.LNCON;
  const latestQuarterLabel = formatQuarterLabel(latestPoint?.callym);

  const loanMixData = useMemo(() => {
    const items = [
      {
        label: 'Consumer Loans',
        value: latestConsumerLoans,
        color: '#6366f1',
      },
      {
        label: 'Real Estate Loans',
        value: latestReLoans,
        color: '#0ea5e9',
      },
      {
        label: 'Ag Loans',
        value: latestAgLoans,
        color: '#22c55e',
      },
      {
        label: 'C&I Loans',
        value: latestCILoans,
        color: '#f97316',
      },
    ];

    const total = items.reduce((sum, item) => {
      const numericValue = Number(item.value);
      if (!Number.isFinite(numericValue)) return sum;
      return sum + numericValue;
    }, 0);

    const itemsWithPercentages = items.map((item) => {
      const numericValue = Number(item.value);
      const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
      const percentage = total > 0 ? (safeValue / total) * 100 : null;
      return {
        ...item,
        numericValue: safeValue,
        percentage,
      };
    });

    let cumulative = 0;
    const gradientStops =
      total > 0
        ? itemsWithPercentages
            .map((item) => {
              const start = cumulative;
              cumulative += item.percentage ?? 0;
              return `${item.color} ${start}% ${cumulative}%`;
            })
            .join(', ')
        : '#e2e8f0 0% 100%';

    return {
      total: total > 0 ? total : null,
      items: itemsWithPercentages,
      gradient: `conic-gradient(${gradientStops})`,
    };
  }, [latestAgLoans, latestCILoans, latestConsumerLoans, latestReLoans]);

  useEffect(() => {
    if (activeTab !== 'benchmark' || benchmarkLoading) {
      return;
    }

    if (!selectedAssetSegment) {
      setBenchmarkData([]);
      setBenchmarkSegment(null);
      return;
    }

    if (benchmarkSegment === selectedAssetSegment && benchmarkData.length > 0) {
      return;
    }

    const fetchBenchmarkData = async () => {
      setBenchmarkLoading(true);
      setBenchmarkError(null);
      try {
        const response = await fetch(
          `${API_BASE}/benchmark?segment=${encodeURIComponent(selectedAssetSegment)}`,
        );
        if (!response.ok) {
          throw new Error('Failed to load benchmark data');
        }
        const data = await response.json();
        setBenchmarkData(data.results ?? []);
        setBenchmarkSegment(selectedAssetSegment);
      } catch (err) {
        setBenchmarkError(err.message);
      } finally {
        setBenchmarkLoading(false);
      }
    };

    fetchBenchmarkData();
  }, [
    activeTab,
    benchmarkData.length,
    benchmarkLoading,
    benchmarkSegment,
    selectedAssetSegment,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    if (
      !query ||
      query.length < 2 ||
      (hasSelectedBank && reportData?.points?.length > 0 && query === selectedName)
    ) {
      setSuggestions([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE}/search?query=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch suggestions');
        }

        const data = await response.json();
        setSuggestions(data.results ?? []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hasSelectedBank, query, reportData, selectedName]);

  const fetchReportData = async (cert) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/charts?cert=${cert}`);
      if (!response.ok) {
        throw new Error('Failed to load performance data');
      }
      const data = await response.json();
      setReportData(data);
    } catch (err) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item) => {
    setSelectedCert(item.cert);
    setSelectedName(item.nameFull);
    setHasSelectedBank(true);
    setQuery(item.nameFull);
    setSuggestions([]);
    fetchReportData(item.cert);
  };

  const handleSubmit = (event) => {
    if (event.key === 'Enter' && suggestions.length > 0) {
      event.preventDefault();
      handleSelect(suggestions[0]);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>FDIC Call Report explorer</p>
          <h1 className={styles.title}>Search by Bank and view performance metrics</h1>
          <p className={styles.subtitle}>
            Start typing a bank name to view assets, equity, and ROA over time.
          </p>
        </div>
      </div>

      <section className={styles.searchSection}>
        <label className={styles.label} htmlFor="bank-search">
          Bank search
        </label>
        <input
          id="bank-search"
          type="text"
          className={styles.searchInput}
          value={query}
          placeholder="Type at least two characters..."
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
            setHasSelectedBank(false);
          }}
          onKeyDown={handleSubmit}
        />
        {suggestions.length > 0 &&
          !(hasSelectedBank && reportData?.points?.length > 0 && query === selectedName) && (
            <ul className={styles.suggestions}>
              {suggestions.map((item) => (
                <li key={`${item.cert}-${item.nameFull}`}>
                  <button
                    type="button"
                    className={styles.suggestionButton}
                    onClick={() => handleSelect(item)}
                  >
                    <span className={styles.suggestionName}>{item.nameFull}</span>
                    <span className={styles.suggestionCert}>CERT: {item.cert}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>

      {loading && <p className={styles.status}>Loading metrics...</p>}
      {error && <p className={styles.error}>Error: {error}</p>}

      {selectedCert && selectedName && !loading && (
        <section className={styles.selectionSummary}>
          <div>
            <p className={styles.selectionLabel}>Selected bank</p>
            <h2 className={styles.selectionName}>{reportData?.nameFull ?? selectedName}</h2>
            {formattedLocation && (
              <p className={styles.selectionLocation}>{formattedLocation}</p>
            )}
          </div>
          <div className={styles.selectionCert}>CERT #{selectedCert}</div>
        </section>
      )}

      {reportData?.points?.length > 0 && (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Performance views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'portfolio'}
              className={`${styles.tabButton} ${
                activeTab === 'portfolio' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('portfolio')}
            >
              Portfolio Trends
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'asset-quality'}
              className={`${styles.tabButton} ${
                activeTab === 'asset-quality' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('asset-quality')}
            >
              Asset Quality
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'profitability'}
              className={`${styles.tabButton} ${
                activeTab === 'profitability' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('profitability')}
            >
              Profitability
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'liquidity'}
              className={`${styles.tabButton} ${
                activeTab === 'liquidity' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('liquidity')}
            >
              Liquidity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'earnings'}
              className={`${styles.tabButton} ${
                activeTab === 'earnings' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('earnings')}
            >
              Earnings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'capital'}
              className={`${styles.tabButton} ${
                activeTab === 'capital' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('capital')}
            >
              Capital
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'benchmark'}
              className={`${styles.tabButton} ${
                activeTab === 'benchmark' ? styles.tabButtonActive : ''
              }`}
              onClick={() => setActiveTab('benchmark')}
            >
              Benchmark
            </button>
          </div>

          {activeTab === 'portfolio' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.latestMetrics}>
                <div className={styles.latestHeader}>
                  <div>
                    <p className={styles.latestLabel}>Latest quarter</p>
                    <p className={styles.latestQuarter}>
                      {formatQuarterLabel(latestPoint?.callym)}
                    </p>
                  </div>
                  <p className={styles.latestHint}>Values shown are in thousands</p>
                </div>
                <div className={styles.rwaSummary}>
                  <div>
                    <p className={styles.rwaLabel}>Risk-weighted assets</p>
                    <p className={styles.rwaQuarter}>
                      As of {formatQuarterLabel(latestPoint?.callym)}
                    </p>
                  </div>
                  <p className={styles.rwaValue}>{formatNumber(latestRwa)}</p>
                </div>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Assets</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.asset)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Liabilities</p>
                    <p className={styles.metricValue}>{formatNumber(latestLiabilities)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Equity</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.eq)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Total deposits</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.dep)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>NIM</p>
                    <p className={styles.metricValue}>{formatPercentage(latestNim)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>ROA</p>
                    <p className={styles.metricValue}>{formatPercentage(latestPoint?.roa)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>ROE</p>
                    <p className={styles.metricValue}>{formatPercentage(latestPoint?.roe)}</p>
                  </div>
                </div>
              </section>
              <section className={styles.chartSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.chartKicker}>Time series</p>
                    <h3 className={styles.sectionTitle}>
                      Quarterly assets and equity performance
                    </h3>
                  </div>
                  <div className={styles.sectionHeaderMeta}>
                    <p className={styles.chartHint}>Values shown are in thousands</p>
                  </div>
                </div>

                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartCardHeader}>
                      <h4 className={styles.chartCardTitle}>Assets by quarter</h4>
                      <p className={styles.chartCardSubhead}>Quarterly asset balances</p>
                    </div>

                    <div className={styles.chartLegendRow} aria-hidden="true">
                      <div className={styles.legendItem}>
                        <span className={`${styles.legendSwatch} ${styles.legendAssets}`} />
                        <span className={styles.legendLabel}>Assets</span>
                      </div>
                    </div>

                    <div className={styles.combinedChart}>
                      <div className={styles.chartBody}>
                        <div
                          className={styles.barChart}
                          role="figure"
                          aria-label="Assets by quarter"
                          style={{
                            gridTemplateColumns: `repeat(${quarterlySeries.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {quarterlySeries.map((point) => (
                            <div key={point.label} className={styles.barColumn}>
                              <div className={styles.barWrapper}>
                                <span className={styles.barHoverValue}>
                                  {formatNumber(point.asset)}
                                </span>
                                <div
                                  className={`${styles.bar} ${styles.assetBar}`}
                                  style={{ height: `${point.assetPercentage}%` }}
                                  aria-label={`${point.label} assets ${formatNumber(point.asset)}`}
                                />
                              </div>
                              <span className={styles.barLabel}>{point.label}</span>
                            </div>
                          ))}
                        </div>

                      </div>
                    </div>

                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartCardHeader}>
                      <h4 className={styles.chartCardTitle}>Equity by quarter</h4>
                      <p className={styles.chartCardSubhead}>Quarterly equity levels</p>
                    </div>

                    <div className={styles.chartLegendRow} aria-hidden="true">
                      <div className={styles.legendItem}>
                        <span className={`${styles.legendSwatch} ${styles.legendEquity}`} />
                        <span className={styles.legendLabel}>Equity</span>
                      </div>
                    </div>

                    <div className={styles.combinedChart}>
                      <div className={styles.chartBody}>
                        <div
                          className={styles.barChart}
                          role="figure"
                          aria-label="Equity by quarter"
                          style={{
                            gridTemplateColumns: `repeat(${quarterlySeries.length}, minmax(0, 1fr))`,
                          }}
                        >
                          {quarterlySeries.map((point) => (
                            <div key={point.label} className={styles.barColumn}>
                              <div className={styles.barWrapper}>
                                <div
                                  className={`${styles.bar} ${styles.equityBar}`}
                                  style={{ height: `${point.equityPercentage}%` }}
                                  aria-label={`${point.label} equity ${formatNumber(point.equity)}`}
                                />
                                <span className={styles.barHoverValue}>
                                  {formatNumber(point.equity)}
                                </span>
                              </div>
                              <span className={styles.barLabel}>{point.label}</span>
                            </div>
                          ))}
                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'asset-quality' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Asset Quality</h3>
                <p className={styles.assetQualityText}>
                  Latest delinquency metrics from the call report. Values shown are in thousands.
                </p>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>30-89 Delinquencies</p>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestPoint?.P3Asset)}</p>
                      <p className={styles.metricRatio}>
                        {formatPercentage(latestPoint?.P3LNLSY1)}
                      </p>
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>90+ Delinquencies</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.P9Asset)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Non-Accrual</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.NAAsset)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Ag Loans</p>
                    <p className={styles.metricValue}>{formatNumber(latestAgLoans)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>C&amp;I Loans</p>
                    <p className={styles.metricValue}>{formatNumber(latestCILoans)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>CRE Loans</p>
                    <p className={styles.metricValue}>{formatNumber(latestCreLoans)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>RE Loans</p>
                    <p className={styles.metricValue}>{formatNumber(latestReLoans)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Consumer Loans</p>
                    <p className={styles.metricValue}>{formatNumber(latestConsumerLoans)}</p>
                  </div>
                </div>
                <div className={styles.loanMixSection}>
                  <div className={styles.loanMixHeader}>
                    <div>
                      <h4 className={styles.loanMixTitle}>Latest quarterly loan mix</h4>
                      <p className={styles.loanMixSubtitle}>
                        {latestQuarterLabel !== 'N/A'
                          ? `As of ${latestQuarterLabel}`
                          : 'As of latest quarter'}
                      </p>
                    </div>
                    <p className={styles.loanMixTotal}>
                      Total: {formatNumber(loanMixData.total)}
                    </p>
                  </div>
                  <div className={styles.loanMixContent}>
                    <div
                      className={styles.loanMixChart}
                      role="img"
                      aria-label="Loan mix pie chart for consumer, real estate, ag, and C&I loans"
                      style={{ backgroundImage: loanMixData.gradient }}
                    />
                    <div className={styles.loanMixLegend}>
                      {loanMixData.items.map((item) => (
                        <div key={item.label} className={styles.loanMixLegendItem}>
                          <span
                            className={styles.loanMixSwatch}
                            style={{ backgroundColor: item.color }}
                          />
                          <div className={styles.loanMixLegendText}>
                            <p className={styles.loanMixLabel}>{item.label}</p>
                            <div className={styles.loanMixValues}>
                              <span className={styles.loanMixValue}>
                                {formatNumber(item.value)}
                              </span>
                              <span className={styles.loanMixPercent}>
                                {formatPercentage(item.percentage)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'profitability' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Profitability</h3>
                <p className={styles.assetQualityText}>
                  Review net interest margin, return metrics, and efficiency ratio trends across
                  all reported quarters.
                </p>
              </section>
              <section className={styles.chartSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.chartKicker}>Trend lines</p>
                    <h3 className={styles.sectionTitle}>Quarterly profitability ratios</h3>
                  </div>
                  <div className={styles.sectionHeaderMeta}>
                    <p className={styles.chartHint}>Values shown are percentages</p>
                  </div>
                </div>

                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Net interest margin (NIM)</h4>
                        <p className={styles.lineChartSubhead}>Interest income strength</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {profitabilityLineData.nim.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityLineData.nim.max)}
                          </span>
                        )}
                        {profitabilityLineData.nim.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityLineData.nim.min)}
                          </span>
                        )}
                        {profitabilityLineData.nim.path ? (
                          <svg
                            className={styles.lineOverlay}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="Net interest margin trend line"
                          >
                            <path
                              className={styles.nimLinePath}
                              d={profitabilityLineData.nim.path}
                            />
                            {profitabilityLineData.nim.points.map((point) => (
                              <circle
                                key={`nim-${point.label}`}
                                className={styles.nimLinePoint}
                                cx={point.x}
                                cy={point.y}
                                r="1.6"
                              >
                                <title>
                                  {point.label}: {formatPercentage(point.value)}
                                </title>
                              </circle>
                            ))}
                          </svg>
                        ) : (
                          <p className={styles.status}>No NIM data available.</p>
                        )}
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilitySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {profitabilitySeries.map((point) => (
                          <span key={`nim-label-${point.label}`}>{point.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Return on assets (ROA)</h4>
                        <p className={styles.lineChartSubhead}>Core profitability</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {profitabilityLineData.roa.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityLineData.roa.max)}
                          </span>
                        )}
                        {profitabilityLineData.roa.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityLineData.roa.min)}
                          </span>
                        )}
                        {profitabilityLineData.roa.path ? (
                          <svg
                            className={styles.lineOverlay}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="Return on assets trend line"
                          >
                            <path
                              className={styles.roaLinePath}
                              d={profitabilityLineData.roa.path}
                            />
                            {profitabilityLineData.roa.points.map((point) => (
                              <circle
                                key={`roa-${point.label}`}
                                className={styles.roaLinePoint}
                                cx={point.x}
                                cy={point.y}
                                r="1.6"
                              >
                                <title>
                                  {point.label}: {formatPercentage(point.value)}
                                </title>
                              </circle>
                            ))}
                          </svg>
                        ) : (
                          <p className={styles.status}>No ROA data available.</p>
                        )}
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilitySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {profitabilitySeries.map((point) => (
                          <span key={`roa-label-${point.label}`}>{point.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Return on equity (ROE)</h4>
                        <p className={styles.lineChartSubhead}>Shareholder returns</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {profitabilityLineData.roe.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityLineData.roe.max)}
                          </span>
                        )}
                        {profitabilityLineData.roe.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityLineData.roe.min)}
                          </span>
                        )}
                        {profitabilityLineData.roe.path ? (
                          <svg
                            className={styles.lineOverlay}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="Return on equity trend line"
                          >
                            <path
                              className={styles.roeLinePath}
                              d={profitabilityLineData.roe.path}
                            />
                            {profitabilityLineData.roe.points.map((point) => (
                              <circle
                                key={`roe-${point.label}`}
                                className={styles.roeLinePoint}
                                cx={point.x}
                                cy={point.y}
                                r="1.6"
                              >
                                <title>
                                  {point.label}: {formatPercentage(point.value)}
                                </title>
                              </circle>
                            ))}
                          </svg>
                        ) : (
                          <p className={styles.status}>No ROE data available.</p>
                        )}
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilitySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {profitabilitySeries.map((point) => (
                          <span key={`roe-label-${point.label}`}>{point.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Efficiency ratio</h4>
                        <p className={styles.lineChartSubhead}>Operating expense control</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {profitabilityLineData.efficiencyRatio.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityLineData.efficiencyRatio.max)}
                          </span>
                        )}
                        {profitabilityLineData.efficiencyRatio.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityLineData.efficiencyRatio.min)}
                          </span>
                        )}
                        {profitabilityLineData.efficiencyRatio.path ? (
                          <svg
                            className={styles.lineOverlay}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            role="img"
                            aria-label="Efficiency ratio trend line"
                          >
                            <path
                              className={styles.efficiencyLinePath}
                              d={profitabilityLineData.efficiencyRatio.path}
                            />
                            {profitabilityLineData.efficiencyRatio.points.map((point) => (
                              <circle
                                key={`eff-${point.label}`}
                                className={styles.efficiencyLinePoint}
                                cx={point.x}
                                cy={point.y}
                                r="1.6"
                              >
                                <title>
                                  {point.label}: {formatPercentage(point.value)}
                                </title>
                              </circle>
                            ))}
                          </svg>
                        ) : (
                          <p className={styles.status}>No efficiency data available.</p>
                        )}
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${efficiencySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {efficiencySeries.map((point) => (
                          <span key={`eff-label-${point.label}`}>{point.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'liquidity' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Liquidity</h3>
                <p className={styles.assetQualityText}>
                  Liquidity coverage and funding insights will be summarized here in an upcoming
                  update.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'earnings' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Earnings</h3>
                <p className={styles.assetQualityText}>
                  Earnings performance trends will be displayed here once the data is connected.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'capital' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Capital</h3>
                <p className={styles.assetQualityText}>
                  Capital ratios and buffers will be summarized here when the data is ready.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'benchmark' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.benchmarkCard}>
                <div className={styles.benchmarkHeader}>
                  <div>
                    <h3 className={styles.benchmarkTitle}>Benchmark</h3>
                    <p className={styles.benchmarkSubtitle}>{benchmarkSubtitle}</p>
                  </div>
                  <p className={styles.benchmarkHint}>Asset values are reported in thousands.</p>
                </div>
                <div className={styles.benchmarkControls}>
                  <label className={styles.benchmarkControlLabel} htmlFor="benchmark-sort-field">
                    Sort by
                  </label>
                  <select
                    id="benchmark-sort-field"
                    className={styles.benchmarkSelect}
                    value={benchmarkSortField}
                    onChange={(event) => setBenchmarkSortField(event.target.value)}
                  >
                    <option value="asset">Total assets</option>
                    <option value="dep">Total deposits</option>
                    <option value="roa">ROA</option>
                    <option value="roe">ROE</option>
                  </select>
                  <div className={styles.benchmarkSortButtons} role="group" aria-label="Sort order">
                    <button
                      type="button"
                      className={`${styles.benchmarkSortButton} ${
                        benchmarkSortOrder === 'desc' ? styles.benchmarkSortButtonActive : ''
                      }`}
                      onClick={() => setBenchmarkSortOrder('desc')}
                      aria-pressed={benchmarkSortOrder === 'desc'}
                    >
                      Descending
                    </button>
                    <button
                      type="button"
                      className={`${styles.benchmarkSortButton} ${
                        benchmarkSortOrder === 'asc' ? styles.benchmarkSortButtonActive : ''
                      }`}
                      onClick={() => setBenchmarkSortOrder('asc')}
                      aria-pressed={benchmarkSortOrder === 'asc'}
                    >
                      Ascending
                    </button>
                  </div>
                </div>

                {benchmarkLoading && (
                  <p className={styles.status}>Loading benchmark data...</p>
                )}
                {benchmarkError && (
                  <p className={styles.error}>Error: {benchmarkError}</p>
                )}

                {!benchmarkLoading && !benchmarkError && (
                  <div className={styles.benchmarkTableWrapper}>
                    <table className={styles.benchmarkTable}>
                      <thead>
                        <tr>
                          <th>Bank</th>
                          <th>City</th>
                          <th>State</th>
                          <th>Total Assets</th>
                          <th>Total Deposits</th>
                          <th>ROA</th>
                          <th>ROE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {benchmarkSortedData.map((bank) => (
                          <tr key={`${bank.nameFull}-${bank.city}-${bank.stateName}`}>
                            <td className={styles.benchmarkBank}>{bank.nameFull}</td>
                            <td>{bank.city ?? 'N/A'}</td>
                            <td>{bank.stateName ?? 'N/A'}</td>
                            <td>{formatNumber(bank.asset)}</td>
                            <td>{formatNumber(bank.dep)}</td>
                            <td>{formatPercentage(bank.roa)}</td>
                            <td>{formatPercentage(bank.roe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {benchmarkData.length === 0 && (
                      <p className={styles.benchmarkEmpty}>
                        No benchmark data is available right now.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
