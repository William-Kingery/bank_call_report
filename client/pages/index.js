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

  const createTrendScale = (values) => {
    const filteredValues = values.filter((value) => Number.isFinite(value));

    if (!filteredValues.length) {
      return { min: 0, max: 0, range: 1, hasData: false, ticks: [] };
    }

    const min = Math.min(...filteredValues);
    const max = Math.max(...filteredValues);
    const range = max - min || 1;
    const midpoint = min + range / 2;
    const ticks = Array.from(new Set([max, midpoint, min]));

    return { min, max, range, hasData: true, ticks };
  };

  const sortedPoints = useMemo(() => {
    if (!reportData?.points?.length) return [];
    return [...reportData.points].sort((a, b) => Number(a.callym) - Number(b.callym));
  }, [reportData]);

  const roaScale = useMemo(
    () => createTrendScale(sortedPoints.map((point) => Number(point.roa))),
    [sortedPoints],
  );

  const roeScale = useMemo(
    () => createTrendScale(sortedPoints.map((point) => Number(point.roe))),
    [sortedPoints],
  );

  const assetsByQuarter = useMemo(() => {
    if (!sortedPoints.length) return [];

    const maxAsset = Math.max(...sortedPoints.map((point) => Number(point.asset) || 0), 0);

    return sortedPoints.map((point) => {
      const assetValue = Number(point.asset);
      const roaValue = Number(point.roa);
      const hasAsset = Number.isFinite(assetValue);
      const hasRoa = Number.isFinite(roaValue);

      return {
        label: formatQuarterLabel(point.callym),
        value: hasAsset ? assetValue : null,
        percentage: maxAsset > 0 && hasAsset ? (assetValue / maxAsset) * 100 : 0,
        roa: hasRoa ? roaValue : null,
        roaPosition:
          hasRoa && roaScale.range > 0
            ? ((roaValue - roaScale.min) / roaScale.range) * 100
            : null,
      };
    });
  }, [roaScale, sortedPoints]);

  const equityByQuarter = useMemo(() => {
    if (!sortedPoints.length) return [];

    const maxEquity = Math.max(...sortedPoints.map((point) => Number(point.eq) || 0), 0);

    return sortedPoints.map((point) => {
      const equityValue = Number(point.eq);
      const roeValue = Number(point.roe);
      const hasEquity = Number.isFinite(equityValue);
      const hasRoe = Number.isFinite(roeValue);

      return {
        label: formatQuarterLabel(point.callym),
        value: hasEquity ? equityValue : null,
        percentage: maxEquity > 0 && hasEquity ? (equityValue / maxEquity) * 100 : 0,
        roe: hasRoe ? roeValue : null,
        roePosition:
          hasRoe && roeScale.range > 0
            ? ((roeValue - roeScale.min) / roeScale.range) * 100
            : null,
      };
    });
  }, [roeScale, sortedPoints]);

  const buildTrendLine = (series, positionKey, valueKey) => {
    if (!series.length) {
      return { path: '', coordinates: [] };
    }

    const coordinates = series
      .map((point, index) => {
        const position = point[positionKey];
        if (position === null || position === undefined) return null;
        const x = ((index + 0.5) / series.length) * 100;
        const y = 100 - position;
        return { x, y, label: point.label, value: point[valueKey] };
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
  };

  const roaLine = useMemo(
    () => buildTrendLine(assetsByQuarter, 'roaPosition', 'roa'),
    [assetsByQuarter],
  );

  const roeLine = useMemo(
    () => buildTrendLine(equityByQuarter, 'roePosition', 'roe'),
    [equityByQuarter],
  );

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

          <div className={styles.chartGrid}>
            <section className={styles.chartSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.chartKicker}>Time series</p>
                  <h3 className={styles.sectionTitle}>Assets by quarter</h3>
                </div>
                <p className={styles.chartHint}>Values shown are in thousands</p>
              </div>
              <div className={styles.combinedChart}>
                <div className={styles.chartBody}>
                  <div
                    className={styles.barChart}
                    role="figure"
                    aria-label="Assets by quarter bar chart"
                    style={{
                      gridTemplateColumns: `repeat(${assetsByQuarter.length}, minmax(0, 1fr))`,
                    }}
                  >
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
                        className={styles.trendChartOverlay}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path className={styles.trendPath} d={roaLine.path} />
                        {roaLine.coordinates.map((coord) => (
                          <circle
                            key={`${coord.label}-${coord.value}`}
                            className={styles.trendPoint}
                            cx={coord.x}
                            cy={coord.y}
                            r="1.8"
                          />
                        ))}
                      </svg>
                      <div className={styles.trendLegend}>
                        <span className={styles.trendLegendDot} aria-hidden="true" />
                        <span className={styles.trendLegendLabel}>ROA trend</span>
                      </div>
                    </>
                  )}
                </div>
                {roaScale.hasData && (
                  <div className={styles.trendAxis} aria-hidden="true">
                    <div className={styles.trendAxisTicks}>
                      {roaScale.ticks.map((tick) => (
                        <span key={tick} className={styles.trendAxisLabel}>
                          {formatPercentage(tick)}
                        </span>
                      ))}
                    </div>
                    <span className={styles.trendAxisTitle}>ROA trend</span>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.chartSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.chartKicker}>Time series</p>
                  <h3 className={styles.sectionTitle}>Equity by quarter</h3>
                </div>
                <p className={styles.chartHint}>Values shown are in thousands</p>
              </div>
              <div className={styles.combinedChart}>
                <div className={styles.chartBody}>
                  <div
                    className={styles.barChart}
                    role="figure"
                    aria-label="Equity by quarter bar chart"
                    style={{
                      gridTemplateColumns: `repeat(${equityByQuarter.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {equityByQuarter.map((point) => (
                      <div key={point.label} className={styles.barColumn}>
                        <div className={styles.barWrapper}>
                          <div
                            className={styles.bar}
                            style={{ height: `${point.percentage}%` }}
                            aria-label={`${point.label} equity ${formatNumber(point.value)}`}
                          />
                        </div>
                        <span className={styles.barLabel}>{point.label}</span>
                        <span className={styles.barValue}>{formatNumber(point.value)}</span>
                      </div>
                    ))}
                  </div>

                  {roeLine.coordinates.length > 0 && (
                    <>
                      <svg
                        className={styles.trendChartOverlay}
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path className={styles.trendPath} d={roeLine.path} />
                        {roeLine.coordinates.map((coord) => (
                          <circle
                            key={`${coord.label}-${coord.value}`}
                            className={styles.trendPoint}
                            cx={coord.x}
                            cy={coord.y}
                            r="1.8"
                          />
                        ))}
                      </svg>
                      <div className={styles.trendLegend}>
                        <span className={styles.trendLegendDot} aria-hidden="true" />
                        <span className={styles.trendLegendLabel}>ROE trend</span>
                      </div>
                    </>
                  )}
                </div>
                {roeScale.hasData && (
                  <div className={styles.trendAxis} aria-hidden="true">
                    <div className={styles.trendAxisTicks}>
                      {roeScale.ticks.map((tick) => (
                        <span key={tick} className={styles.trendAxisLabel}>
                          {formatPercentage(tick)}
                        </span>
                      ))}
                    </div>
                    <span className={styles.trendAxisTitle}>ROE trend</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
