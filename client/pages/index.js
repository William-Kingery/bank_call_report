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
          <h1 className={styles.title}>Search by NameFull and view performance metrics</h1>
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
          <section className={styles.latestMetrics}>
            <div className={styles.latestHeader}>
              <div>
                <p className={styles.latestLabel}>Latest quarter</p>
                <p className={styles.latestQuarter}>{formatQuarterLabel(latestPoint?.callym)}</p>
              </div>
              <p className={styles.latestHint}>Values shown are in thousands</p>
            </div>
            <div className={styles.rwaSummary}>
              <div>
                <p className={styles.rwaLabel}>Risk-weighted assets</p>
                <p className={styles.rwaQuarter}>As of {formatQuarterLabel(latestPoint?.callym)}</p>
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
            </div>
          </section>
          <div className={styles.rwaCallout}>
            <div>
              <p className={styles.rwaCalloutLabel}>Latest quarterly RWA</p>
              <p className={styles.rwaCalloutQuarter}>
                As of {formatQuarterLabel(latestPoint?.callym)}
              </p>
            </div>
            <p className={styles.rwaCalloutValue}>{formatNumber(latestRwa)}</p>
          </div>
          <section className={styles.chartSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.chartKicker}>Time series</p>
                <h3 className={styles.sectionTitle}>Quarterly assets and equity performance</h3>
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
        </>
      )}
    </main>
  );
}
