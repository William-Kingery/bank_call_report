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

  const assetsByQuarter = useMemo(() => {
    if (!reportData?.points?.length) return [];

    const maxAsset = Math.max(...reportData.points.map((point) => Number(point.asset) || 0), 0);
    const roaValues = reportData.points
      .map((point) => Number(point.roa))
      .filter((value) => Number.isFinite(value));

    const roaMin = roaValues.length ? Math.min(...roaValues) : 0;
    const roaMax = roaValues.length ? Math.max(...roaValues) : 0;
    const roaRange = roaMax - roaMin || 1;

    return reportData.points.map((point) => {
      const roaValue = Number(point.roa);
      const hasRoa = Number.isFinite(roaValue);

      return {
        label: formatQuarterLabel(point.callym),
        value: point.asset,
        percentage: maxAsset > 0 ? ((Number(point.asset) || 0) / maxAsset) * 100 : 0,
        roa: hasRoa ? roaValue : null,
        roaPosition: hasRoa ? ((roaValue - roaMin) / roaRange) * 100 : null,
      };
    });
  }, [reportData]);

  const roaLine = useMemo(() => {
    if (!assetsByQuarter.length) {
      return { path: '', coordinates: [] };
    }

    const xMax = Math.max(assetsByQuarter.length - 1, 1);
    const coordinates = assetsByQuarter
      .map((point, index) => {
        if (point.roaPosition === null) return null;
        const x = assetsByQuarter.length > 1 ? (index / xMax) * 100 : 50;
        const y = 100 - point.roaPosition;
        return { x, y, label: point.label, value: point.roa };
      })
      .filter(Boolean);

    if (!coordinates.length) {
      return { path: '', coordinates: [] };
    }

    const path = coordinates
      .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x} ${coord.y}`)
      .join(' ')
      .trim();

    return { path, coordinates };
  }, [assetsByQuarter]);

  const latestPoint = useMemo(() => {
    if (!reportData?.points?.length) return null;
    return reportData.points[reportData.points.length - 1];
  }, [reportData]);

  const formattedLocation = useMemo(() => {
    if (!reportData) return null;

    const parts = [reportData.city, reportData.stateName, reportData.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }, [reportData]);

  const latestLiabilities =
    latestPoint?.asset != null && latestPoint?.eq != null
      ? latestPoint.asset - latestPoint.eq
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
          <section className={styles.latestMetrics}>
            <div className={styles.latestHeader}>
              <div>
                <p className={styles.latestLabel}>Latest quarter</p>
                <p className={styles.latestQuarter}>{formatQuarterLabel(latestPoint?.callym)}</p>
              </div>
              <p className={styles.latestHint}>Values shown are in thousands</p>
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
                <p className={styles.metricName}>ROE</p>
                <p className={styles.metricValue}>{formatPercentage(latestPoint?.roe)}</p>
              </div>
              <div className={styles.metricCard}>
                <p className={styles.metricName}>ROA</p>
                <p className={styles.metricValue}>{formatPercentage(latestPoint?.roa)}</p>
              </div>
            </div>
          </section>

          <section className={styles.chartSection}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.chartKicker}>Time series</p>
                <h3 className={styles.sectionTitle}>Assets by quarter</h3>
              </div>
              <p className={styles.chartHint}>Values shown are in thousands</p>
            </div>
            <div className={styles.combinedChart}>
              <div className={styles.barChart} role="figure" aria-label="Assets by quarter bar chart">
                {assetsByQuarter.map((point) => (
                  <div key={point.label} className={styles.barColumn}>
                    <div className={styles.barWrapper}>
                      <div
                        className={styles.bar}
                        style={{ height: `${point.percentage}%` }}
                        aria-label={`${point.label} assets ${formatNumber(point.value)}`}
                      />
                    </div>
                    <span className={styles.barLabel}>{point.label}</span>
                    <span className={styles.barValue}>{formatNumber(point.value)}</span>
                  </div>
                ))}
              </div>

              {roaLine.coordinates.length > 0 && (
                <>
                  <svg
                    className={styles.roaChartOverlay}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path className={styles.roaPath} d={roaLine.path} />
                    {roaLine.coordinates.map((coord) => (
                      <circle
                        key={`${coord.label}-${coord.value}`}
                        className={styles.roaPoint}
                        cx={coord.x}
                        cy={coord.y}
                        r="1.8"
                      />
                    ))}
                  </svg>
                  <div className={styles.roaLegend}>
                    <span className={styles.roaLegendDot} aria-hidden="true" />
                    <span className={styles.roaLegendLabel}>ROA trend</span>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
