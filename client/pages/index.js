import { useEffect, useMemo, useState } from 'react';
import styles from '../styles/Home.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [reportData, setReportData] = useState(null);
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
      const roaValue = Number(point.roa);
      const roeValue = Number(point.roe);
      const hasAsset = Number.isFinite(assetValue);
      const hasEquity = Number.isFinite(equityValue);
      const hasRoa = Number.isFinite(roaValue);
      const hasRoe = Number.isFinite(roeValue);

      return {
        label: formatQuarterLabel(point.callym),
        asset: hasAsset ? assetValue : null,
        equity: hasEquity ? equityValue : null,
        roa: hasRoa ? roaValue : null,
        roe: hasRoe ? roeValue : null,
        assetPercentage:
          assetMaxValue > 0 && hasAsset ? (assetValue / assetMaxValue) * 100 : 0,
        equityPercentage:
          equityMaxValue > 0 && hasEquity ? (equityValue / equityMaxValue) * 100 : 0,
      };
    });
  }, [assetMaxValue, equityMaxValue, sortedPoints]);

  const clampValue = (value, minValue, maxValue) =>
    Math.min(maxValue, Math.max(minValue, value));

  const buildLineSeries = (seriesKey) => {
    if (!quarterlySeries.length) return null;

    const values = quarterlySeries
      .map((point) => point[seriesKey])
      .filter((value) => value !== null);

    if (!values.length) return null;

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    const step = quarterlySeries.length > 1 ? 100 / (quarterlySeries.length - 1) : 0;

    const points = quarterlySeries.map((point, index) => {
      if (point[seriesKey] === null) return null;
      const x = step * index;
      const y = 100 - ((point[seriesKey] - minValue) / range) * 100;
      return {
        x,
        y,
        label: point.label,
        value: point[seriesKey],
      };
    });

    const path = points.reduce((acc, point) => {
      if (!point) return acc;
      const command = acc ? 'L' : 'M';
      return `${acc} ${command} ${point.x} ${point.y}`;
    }, '');

    const tickValues =
      maxValue === minValue ? [maxValue] : [maxValue, (maxValue + minValue) / 2, minValue];
    const ticks = tickValues.map((value) => {
      const rawY = maxValue === minValue ? 50 : 100 - ((value - minValue) / range) * 100;
      return {
        value,
        y: clampValue(rawY, 4, 96),
      };
    });

    return { points: points.filter(Boolean), path, ticks };
  };

  const roaLineSeries = useMemo(() => buildLineSeries('roa'), [quarterlySeries]);
  const roeLineSeries = useMemo(() => buildLineSeries('roe'), [quarterlySeries]);

  const latestPoint = useMemo(() => {
    if (!sortedPoints.length) return null;
    return sortedPoints[sortedPoints.length - 1];
  }, [sortedPoints]);

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

                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h5 className={styles.lineChartTitle}>ROA by quarter</h5>
                        <p className={styles.lineChartSubhead}>Return on assets</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <svg
                          className={styles.lineOverlay}
                          viewBox="0 0 100 100"
                          role="img"
                          aria-label="ROA by quarter line chart"
                          preserveAspectRatio="none"
                        >
                          {roaLineSeries?.path && (
                            <path className={styles.roaLinePath} d={roaLineSeries.path} />
                          )}
                          {roaLineSeries?.points.map((point) => (
                            <circle
                              key={`${point.label}-roa`}
                              className={styles.roaLinePoint}
                              cx={point.x}
                              cy={point.y}
                              r="1.8"
                            />
                          ))}
                        </svg>
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${quarterlySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {quarterlySeries.map((point) => (
                          <span key={`${point.label}-roa-label`} className={styles.barLabel}>
                            {point.label}
                          </span>
                        ))}
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

                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h5 className={styles.lineChartTitle}>ROE by quarter</h5>
                        <p className={styles.lineChartSubhead}>Return on equity</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <svg
                          className={styles.lineOverlay}
                          viewBox="0 0 100 100"
                          role="img"
                          aria-label="ROE by quarter line chart"
                          preserveAspectRatio="none"
                        >
                          {roeLineSeries?.path && (
                            <path className={styles.roeLinePath} d={roeLineSeries.path} />
                          )}
                          {roeLineSeries?.points.map((point) => (
                            <circle
                              key={`${point.label}-roe`}
                              className={styles.roeLinePoint}
                              cx={point.x}
                              cy={point.y}
                              r="1.8"
                            />
                          ))}
                        </svg>
                      </div>
                      <div
                        className={styles.lineChartLabels}
                        style={{
                          gridTemplateColumns: `repeat(${quarterlySeries.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {quarterlySeries.map((point) => (
                          <span key={`${point.label}-roe-label`} className={styles.barLabel}>
                            {point.label}
                          </span>
                        ))}
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
                  Asset quality insights will appear here once they are available. For now,
                  continue exploring the portfolio trends above.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'profitability' && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Profitability</h3>
                <p className={styles.assetQualityText}>
                  Profitability highlights will show key margin and return metrics for the
                  selected bank once the data is available.
                </p>
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
        </>
      )}
    </main>
  );
}
