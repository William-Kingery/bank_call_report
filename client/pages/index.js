import { useEffect, useMemo, useState } from 'react';
import styles from '../styles/Home.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

const ColumnChart = ({ series, maxValue, formatLabel, formatValue }) => (
  <div className={styles.columnChart}>
    {series.length === 0 ? (
      <p className={styles.emptyState}>No quarterly data available.</p>
    ) : (
      <div className={styles.columnChartBars}>
        {series.map((point) => {
          const value = point.value === null || point.value === undefined ? 0 : point.value;
          const height = maxValue > 0 ? `${(value / maxValue) * 100}%` : '0%';

          return (
            <div key={point.callym} className={styles.columnChartBarWrapper}>
              <div
                className={styles.columnChartBar}
                style={{ height }}
                title={`${formatLabel(point.callym)}: ${formatValue(point.value)}`}
              />
              <span className={styles.columnChartLabel}>{formatLabel(point.callym)}</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

const getMaxValue = (series) =>
  series.reduce((maxValue, point) => {
    if (point.value === null || point.value === undefined) return maxValue;
    return point.value > maxValue ? point.value : maxValue;
  }, 0);

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSelectedBank, setHasSelectedBank] = useState(false);
  const [activeTab, setActiveTab] = useState('performance');
  const [quarterRange, setQuarterRange] = useState('latest-9');

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

  const latestPoint = useMemo(() => {
    if (!reportData?.points?.length) return null;
    return reportData.points[reportData.points.length - 1];
  }, [reportData]);

  const filteredPoints = useMemo(() => {
    if (!reportData?.points?.length) return [];
    if (quarterRange === 'latest-4') {
      return reportData.points.slice(-4);
    }
    return reportData.points.slice(-9);
  }, [quarterRange, reportData]);

  const assetQualitySeries = useMemo(() => {
    if (!filteredPoints.length) return [];
    return filteredPoints.map((point) => ({
      callym: point.callym,
      value: point.ccidoubt,
    }));
  }, [filteredPoints]);

  const netChargeOffSeries = useMemo(() => {
    if (!filteredPoints.length) return [];
    return filteredPoints.map((point) => ({
      callym: point.callym,
      value: point.ntlnlsqr,
    }));
  }, [filteredPoints]);

  const maxCriticizedValue = useMemo(() => {
    if (!assetQualitySeries.length) return 0;
    return getMaxValue(assetQualitySeries);
  }, [assetQualitySeries]);

  const ratioExtent = useMemo(() => {
    if (!netChargeOffSeries.length) return { min: 0, max: 0 };

    const values = netChargeOffSeries
      .map((point) => point.value)
      .filter((value) => value !== null && value !== undefined)
      .map((value) => Number(value));

    if (!values.length) return { min: 0, max: 0 };

    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return { min: min - 1, max: max + 1 };
    }
    const padding = Math.max(0.25, (max - min) * 0.15);
    return { min: min - padding, max: max + padding };
  }, [netChargeOffSeries]);

  const ratioChart = useMemo(() => {
    if (!netChargeOffSeries.length) {
      return { points: [], path: '', width: 560, height: 180, padding: 24 };
    }

    const width = 560;
    const height = 180;
    const padding = 24;
    const range = ratioExtent.max - ratioExtent.min || 1;

    const points = netChargeOffSeries.map((point, index) => {
      const value =
        point.value === null || point.value === undefined ? null : Number(point.value);
      const x =
        netChargeOffSeries.length === 1
          ? width / 2
          : padding +
            (index / (netChargeOffSeries.length - 1)) * (width - padding * 2);
      const y =
        value === null
          ? null
          : padding + (1 - (value - ratioExtent.min) / range) * (height - padding * 2);

      return {
        ...point,
        value,
        x,
        y,
      };
    });

    let path = '';
    let penDown = false;
    points.forEach((point) => {
      if (point.y === null) {
        penDown = false;
        return;
      }
      if (!penDown) {
        path += `M ${point.x} ${point.y}`;
        penDown = true;
      } else {
        path += ` L ${point.x} ${point.y}`;
      }
    });

    return {
      points,
      path,
      width,
      height,
      padding,
    };
  }, [netChargeOffSeries, ratioExtent]);

  const capitalSeries = useMemo(() => {
    if (!filteredPoints.length) {
      return {
        tangibleEquity: [],
        ciLoans: [],
        consumerLoans: [],
        highRiskLoans: [],
        constructionLoans: [],
      };
    }

    const buildSeries = (field) =>
      filteredPoints.map((point) => ({
        callym: point.callym,
        value: point[field],
      }));

    return {
      tangibleEquity: buildSeries('eqtanqta'),
      ciLoans: buildSeries('lncit1r'),
      consumerLoans: buildSeries('lncont1r'),
      highRiskLoans: buildSeries('lnhrskr'),
      constructionLoans: buildSeries('lncdt1r'),
    };
  }, [filteredPoints]);

  const maxTangibleEquity = useMemo(
    () => getMaxValue(capitalSeries.tangibleEquity),
    [capitalSeries]
  );
  const maxCiLoans = useMemo(() => getMaxValue(capitalSeries.ciLoans), [capitalSeries]);
  const maxConsumerLoans = useMemo(
    () => getMaxValue(capitalSeries.consumerLoans),
    [capitalSeries]
  );
  const maxHighRiskLoans = useMemo(
    () => getMaxValue(capitalSeries.highRiskLoans),
    [capitalSeries]
  );
  const maxConstructionLoans = useMemo(
    () => getMaxValue(capitalSeries.constructionLoans),
    [capitalSeries]
  );

  const formattedLocation = useMemo(() => {
    if (!reportData) return null;

    const parts = [reportData.city, reportData.stateName, reportData.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }, [reportData]);

  const latestLiabilities =
    latestPoint?.asset != null && latestPoint?.eq != null
      ? latestPoint.asset - latestPoint.eq
      : null;
  const latestCriticized = latestPoint?.ccidoubt ?? null;
  const latestAssets = latestPoint?.asset ?? null;
  const criticizedShare =
    latestCriticized != null && latestAssets
      ? Math.min(100, Math.max(0, (latestCriticized / latestAssets) * 100))
      : null;

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
          <h1 className={styles.title}>Search by NameFull and view performance metrics</h1>
          <p className={styles.subtitle}>
            Start typing a bank name to view assets, equity, ROE, and ROA over time.
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
          <section className={styles.tabSection}>
            <div className={styles.tabs} role="tablist" aria-label="Report tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'performance'}
                className={`${styles.tabButton} ${
                  activeTab === 'performance' ? styles.tabButtonActive : ''
                }`}
                onClick={() => setActiveTab('performance')}
              >
                Performance
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
                aria-selected={activeTab === 'capital'}
                className={`${styles.tabButton} ${
                  activeTab === 'capital' ? styles.tabButtonActive : ''
                }`}
                onClick={() => setActiveTab('capital')}
              >
                Capital
              </button>
            </div>
            <div className={styles.rangeControls} role="group" aria-label="Quarter range">
              <button
                type="button"
                className={`${styles.rangeButton} ${
                  quarterRange === 'latest-9' ? styles.rangeButtonActive : ''
                }`}
                onClick={() => setQuarterRange('latest-9')}
              >
                Latest 9 Qtrs
              </button>
              <button
                type="button"
                className={`${styles.rangeButton} ${
                  quarterRange === 'latest-4' ? styles.rangeButtonActive : ''
                }`}
                onClick={() => setQuarterRange('latest-4')}
              >
                Latest 4 Qtrs
              </button>
            </div>

            {activeTab === 'performance' && (
              <div className={styles.tabPanel} role="tabpanel">
                <div className={styles.latestHeader}>
                  <div>
                    <p className={styles.latestLabel}>Latest quarter</p>
                    <p className={styles.latestQuarter}>
                      {formatQuarterLabel(latestPoint?.callym)}
                    </p>
                  </div>
                  <p className={styles.latestHint}>Values shown are in thousands</p>
                </div>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Liabilities</p>
                    <p className={styles.metricValue}>{formatNumber(latestLiabilities)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Equity</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.eq)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>ROE</p>
                    <p className={styles.metricValue}>{formatPercentage(latestPoint?.roe)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>ROA</p>
                    <p className={styles.metricValue}>{formatPercentage(latestPoint?.roa)}</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'asset-quality' && (
              <div className={styles.tabPanel} role="tabpanel">
                <div className={styles.assetQualityHeader}>
                  <div>
                    <p className={styles.latestLabel}>Criticized &amp; Classified assets</p>
                    <p className={styles.latestQuarter}>Trend by quarter</p>
                  </div>
                  <p className={styles.latestHint}>Values shown are in thousands</p>
                </div>
                <div className={styles.assetQualityCharts}>
                  <div className={styles.assetQualityCard}>
                    <p className={styles.chartTitle}>Latest criticized &amp; classified mix</p>
                    {criticizedShare === null ? (
                      <p className={styles.emptyState}>No data available.</p>
                    ) : (
                      <div className={styles.pieChartWrapper}>
                        <div
                          className={styles.pieChart}
                          style={{ '--criticized-percent': `${criticizedShare}%` }}
                        >
                          <div className={styles.pieCenter}>
                            <span className={styles.pieValue}>
                              {formatNumber(latestCriticized)}
                            </span>
                            <span className={styles.pieLabel}>
                              {formatPercentage(criticizedShare)}
                            </span>
                          </div>
                        </div>
                        <div className={styles.pieLegend}>
                          <div className={styles.legendRow}>
                            <span className={`${styles.legendSwatch} ${styles.legendCriticized}`} />
                            <span>Criticized &amp; Classified</span>
                          </div>
                          <div className={styles.legendRow}>
                            <span className={`${styles.legendSwatch} ${styles.legendOther}`} />
                            <span>All other assets</span>
                          </div>
                        </div>
                      </div>
                      )}
                  </div>
                  <div className={styles.assetQualityCard}>
                    <p className={styles.chartTitle}>
                      Loan &amp; lease net charge-off ratio (NTLNLSQR)
                    </p>
                    {netChargeOffSeries.length === 0 ? (
                      <p className={styles.emptyState}>No quarterly data available.</p>
                    ) : (
                      <>
                        <svg
                          className={styles.RatioLineChart}
                          viewBox={`0 0 ${ratioChart.width} ${ratioChart.height}`}
                          role="img"
                          aria-label="Loan and lease net charge-off ratio trend"
                        >
                          <defs>
                            <linearGradient id="ratioLineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#38bdf8" />
                              <stop offset="100%" stopColor="#0ea5e9" />
                            </linearGradient>
                          </defs>
                          <line
                            x1={ratioChart.padding}
                            y1={ratioChart.height - ratioChart.padding}
                            x2={ratioChart.width - ratioChart.padding}
                            y2={ratioChart.height - ratioChart.padding}
                            className={styles.ratioAxis}
                          />
                          <line
                            x1={ratioChart.padding}
                            y1={ratioChart.padding}
                            x2={ratioChart.padding}
                            y2={ratioChart.height - ratioChart.padding}
                            className={styles.ratioAxis}
                          />
                          {ratioChart.path && (
                            <path
                              d={ratioChart.path}
                              fill="none"
                              stroke="url(#ratioLineGradient)"
                              strokeWidth="3"
                              strokeLinecap="round"
                            />
                          )}
                          {ratioChart.points.map((point) =>
                            point.y === null ? null : (
                              <circle
                                key={point.callym}
                                cx={point.x}
                                cy={point.y}
                                r="4.5"
                                className={styles.ratioPoint}
                              >
                                <title>
                                  {formatQuarterLabel(point.callym)}:{' '}
                                  {formatPercentage(point.value)}
                                </title>
                              </circle>
                            )
                          )}
                        </svg>
                        <div className={styles.lineChartLabels}>
                          {ratioChart.points.map((point) => (
                            <span key={point.callym}>{formatQuarterLabel(point.callym)}</span>
                          ))}
                        </div>
                        <div className={styles.lineChartRange}>
                          <span>{formatPercentage(ratioExtent.max)}</span>
                          <span>{formatPercentage(ratioExtent.min)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.assetQualityCard}>
                  <p className={styles.chartTitle}>Criticized &amp; Classified assets by quarter</p>
                  <div className={styles.columnChart}>
                    {assetQualitySeries.length === 0 ? (
                      <p className={styles.emptyState}>No quarterly data available.</p>
                    ) : (
                      <div className={styles.columnChartBars}>
                        {assetQualitySeries.map((point) => {
                          const value =
                            point.value === null || point.value === undefined ? 0 : point.value;
                          const height =
                            maxCriticizedValue > 0 ? `${(value / maxCriticizedValue) * 100}%` : '0%';

                          return (
                            <div key={point.callym} className={styles.columnChartBarWrapper}>
                              <div
                                className={styles.columnChartBar}
                                style={{ height }}
                                title={`${formatQuarterLabel(point.callym)}: ${formatNumber(
                                  point.value
                                )}`}
                              />
                              <span className={styles.columnChartLabel}>
                                {formatQuarterLabel(point.callym)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.trendTable}>
                    <thead>
                      <tr>
                        <th scope="col">Quarter</th>
                        <th scope="col">CCIDOUBT</th>
                        <th scope="col">NTLNLSQR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPoints.map((point) => (
                        <tr key={point.callym}>
                          <td>{formatQuarterLabel(point.callym)}</td>
                          <td>{formatNumber(point.ccidoubt)}</td>
                          <td>{formatPercentage(point.ntlnlsqr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'capital' && (
              <div className={styles.tabPanel} role="tabpanel">
                <div className={styles.latestHeader}>
                  <div>
                    <p className={styles.latestLabel}>Latest quarter</p>
                    <p className={styles.latestQuarter}>
                      {formatQuarterLabel(latestPoint?.callym)}
                    </p>
                  </div>
                  <p className={styles.latestHint}>Ratios shown are percentages</p>
                </div>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Tangible Equity Capital (EQTANQTA)</p>
                    <p className={styles.metricValue}>
                      {formatPercentage(latestPoint?.eqtanqta)}
                    </p>
                  </div>
                </div>
                <div className={styles.capitalCharts}>
                  <div className={styles.capitalCard}>
                    <p className={styles.chartTitle}>Tangible Equity Capital Ratio trend</p>
                    <ColumnChart
                      series={capitalSeries.tangibleEquity}
                      maxValue={maxTangibleEquity}
                      formatLabel={formatQuarterLabel}
                      formatValue={formatPercentage}
                    />
                  </div>
                  <div className={styles.capitalCard}>
                    <p className={styles.chartTitle}>C&amp;I Loans to Tier 1 Capital trend</p>
                    <ColumnChart
                      series={capitalSeries.ciLoans}
                      maxValue={maxCiLoans}
                      formatLabel={formatQuarterLabel}
                      formatValue={formatPercentage}
                    />
                  </div>
                  <div className={styles.capitalCard}>
                    <p className={styles.chartTitle}>
                      Consumer Loans to Tier 1 Capital trend
                    </p>
                    <ColumnChart
                      series={capitalSeries.consumerLoans}
                      maxValue={maxConsumerLoans}
                      formatLabel={formatQuarterLabel}
                      formatValue={formatPercentage}
                    />
                  </div>
                  <div className={styles.capitalCard}>
                    <p className={styles.chartTitle}>
                      High Risk Loans to Tier 1 Capital trend
                    </p>
                    <ColumnChart
                      series={capitalSeries.highRiskLoans}
                      maxValue={maxHighRiskLoans}
                      formatLabel={formatQuarterLabel}
                      formatValue={formatPercentage}
                    />
                  </div>
                  <div className={styles.capitalCard}>
                    <p className={styles.chartTitle}>
                      Construction and Land Dev to Tier 1 Capital trend
                    </p>
                    <ColumnChart
                      series={capitalSeries.constructionLoans}
                      maxValue={maxConstructionLoans}
                      formatLabel={formatQuarterLabel}
                      formatValue={formatPercentage}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
