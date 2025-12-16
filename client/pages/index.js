import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import styles from '../styles/Home.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export default function Home() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSelectedBank, setHasSelectedBank] = useState(false);

  const assetCanvasRef = useRef(null);
  const roeCanvasRef = useRef(null);
  const roaCanvasRef = useRef(null);

  const assetChartRef = useRef(null);
  const roeChartRef = useRef(null);
  const roaChartRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    if (
      !query ||
      query.length < 2 ||
      (hasSelectedBank && chartData?.points?.length > 0 && query === selectedName)
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
  }, [chartData, hasSelectedBank, query, selectedName]);

  useEffect(() => {
    return () => {
      assetChartRef.current?.destroy();
      roeChartRef.current?.destroy();
      roaChartRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!chartData?.points?.length) {
      assetChartRef.current?.destroy();
      roeChartRef.current?.destroy();
      roaChartRef.current?.destroy();
      return;
    }

    const formatQuarterLabel = (callym) => {
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

    const labels = chartData.points.map((point) => formatQuarterLabel(point.callym));
    const assetValues = chartData.points.map((point) => point.asset ?? null);
    const roeValues = chartData.points.map((point) => point.roe ?? null);
    const roaValues = chartData.points.map((point) => point.roa ?? null);

    if (assetCanvasRef.current) {
      assetChartRef.current?.destroy();
      assetChartRef.current = new Chart(assetCanvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Assets',
              data: assetValues,
              backgroundColor: '#4f46e5',
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            x: { ticks: { autoSkip: false } },
            y: { beginAtZero: true },
          },
        },
      });
    }

    if (roeCanvasRef.current) {
      roeChartRef.current?.destroy();
      roeChartRef.current = new Chart(roeCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'ROE',
              data: roeValues,
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22, 163, 74, 0.2)',
              tension: 0.2,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            x: { ticks: { autoSkip: false } },
          },
        },
      });
    }

    if (roaCanvasRef.current) {
      roaChartRef.current?.destroy();
      roaChartRef.current = new Chart(roaCanvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'ROA',
              data: roaValues,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              tension: 0.2,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            x: { ticks: { autoSkip: false } },
          },
        },
      });
    }
  }, [chartData]);

  const fetchCharts = async (cert) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/charts?cert=${cert}`);
      if (!response.ok) {
        throw new Error('Failed to load chart data');
      }
      const data = await response.json();
      setChartData(data);
    } catch (err) {
      setError(err.message);
      setChartData(null);
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
    fetchCharts(item.cert);
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
          <h1 className={styles.title}>Search by NameFull and chart performance</h1>
          <p className={styles.subtitle}>
            Start typing a bank name to view assets, ROE, and ROA over time.
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
          !(hasSelectedBank && chartData?.points?.length > 0 && query === selectedName) && (
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

      {loading && <p className={styles.status}>Loading chart data...</p>}
      {error && <p className={styles.error}>Error: {error}</p>}

      {selectedCert && selectedName && !loading && (
        <section className={styles.selectionSummary}>
          <div>
            <p className={styles.selectionLabel}>Selected bank</p>
            <h2 className={styles.selectionName}>{selectedName}</h2>
          </div>
          <div className={styles.selectionCert}>CERT #{selectedCert}</div>
        </section>
      )}

      {chartData?.points?.length > 0 && (
        <section className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <h3>Assets</h3>
            <canvas ref={assetCanvasRef} aria-label="Assets bar chart" />
          </div>
          <div className={styles.chartCard}>
            <h3>ROE</h3>
            <canvas ref={roeCanvasRef} aria-label="ROE line chart" />
          </div>
          <div className={styles.chartCard}>
            <h3>ROA</h3>
            <canvas ref={roaCanvasRef} aria-label="ROA line chart" />
          </div>
        </section>
      )}
    </main>
  );
}
