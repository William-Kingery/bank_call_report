import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import styles from '../styles/EarlyWarnings.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const THEME_STORAGE_KEY = 'bloomberg-theme';

const PORTFOLIO_OPTIONS = [
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

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'N/A';
  return currencyFormatter.format(numeric * 1000);
};

const formatMillions = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'N/A';
  return `${currencyFormatter.format(numeric / 1000)}M`;
};

const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'N/A';
  return `${numeric.toFixed(2)}%`;
};

const columns = [
  { key: 'bankName', label: 'Bank Name', formatter: (value) => value || 'N/A', sticky: true },
  { key: 'totalAssets', label: 'Total Assets (MM)', formatter: formatMillions },
  { key: 'totalDeposits', label: 'Total Deposits (MM)', formatter: formatMillions },
  { key: 'tier1Capital', label: 'Tier 1 Capital (MM)', formatter: formatMillions },
  { key: 'totalCreLoans', label: 'Total CRE Loans (MM)', formatter: formatMillions },
  { key: 'yoyLoanGrowth', label: 'YoY Loan Growth', formatter: formatPercent },
  { key: 'yoyDepositGrowth', label: 'YoY Deposit Growth', formatter: formatPercent },
  { key: 'npaPercent', label: 'NPA %', formatter: formatPercent },
  { key: 'chargeOffPercent', label: 'Charge-Off %', formatter: formatPercent },
  { key: 'roaa', label: 'RoAA', formatter: formatPercent },
  { key: 'roae', label: 'ROAE', formatter: formatPercent },
  { key: 'nim', label: 'nIM', formatter: formatPercent },
  { key: 'loanToDepositRatio', label: 'Loan to Deposit Ratio', formatter: formatPercent },
  { key: 'uninsuredDepositRate', label: 'Uninsured Deposit Rate', formatter: formatPercent },
  { key: 'brokeredDepositRate', label: 'Brokered Deposit Rate', formatter: formatPercent },
];

const formatQuarter = (callym) => {
  const numeric = Number(callym);
  if (!Number.isFinite(numeric)) return 'latest available quarter';
  const year = Math.floor(numeric / 100);
  const month = numeric % 100;
  const quarter = Math.ceil(month / 3);
  return `Q${quarter} ${year}`;
};

const buildExportValue = (column, row) => {
  const value = row?.[column.key];
  if (!Number.isFinite(Number(value))) {
    return column.formatter(value, row);
  }
  return value;
};

const escapeCsvCell = (value) => {
  const normalized = value == null ? '' : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

export default function EarlyWarningsPage() {
  const [theme, setTheme] = useState('night');
  const [selectedPortfolio, setSelectedPortfolio] = useState('National Average');
  const [selectedRegion, setSelectedRegion] = useState('All Regions');
  const [selectedDistrict, setSelectedDistrict] = useState('All Districts');
  const [rows, setRows] = useState([]);
  const [quarter, setQuarter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'day' || storedTheme === 'night') {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle(styles.themeNight, theme === 'night');
    document.body.classList.toggle(styles.themeDay, theme === 'day');
    return () => {
      document.body.classList.remove(styles.themeNight);
      document.body.classList.remove(styles.themeDay);
    };
  }, [theme]);

  const filterRequestKey = useMemo(
    () => [selectedPortfolio, selectedRegion, selectedDistrict].join('|'),
    [selectedPortfolio, selectedRegion, selectedDistrict],
  );

  useEffect(() => {
    const controller = new AbortController();

    const fetchRows = async () => {
      setLoading(true);
      setError(null);
      setRows([]);
      setQuarter(null);

      try {
        const queryParams = new URLSearchParams();
        if (selectedPortfolio && selectedPortfolio !== 'National Average') {
          queryParams.set('segment', selectedPortfolio);
        }
        if (selectedRegion && selectedRegion !== 'All Regions') {
          queryParams.set('region', selectedRegion);
        }
        if (selectedDistrict && selectedDistrict !== 'All Districts') {
          queryParams.set('district', selectedDistrict);
        }

        const queryString = queryParams.toString();
        const response = await fetch(
          `${API_BASE}/early-warnings${queryString ? `?${queryString}` : ''}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch early warnings data (${response.status})`);
        }

        const data = await response.json();
        setRows(data.results ?? []);
        setQuarter(data.quarter ?? null);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') return;
        setRows([]);
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
    return () => controller.abort();
  }, [filterRequestKey]);

  const summaryLabel = useMemo(() => {
    const parts = [`One row per bank for ${formatQuarter(quarter)}`];
    if (selectedPortfolio !== 'National Average') parts.push(selectedPortfolio);
    if (selectedRegion !== 'All Regions') parts.push(selectedRegion);
    if (selectedDistrict !== 'All Districts') parts.push(selectedDistrict);
    return parts.join(' • ');
  }, [quarter, filterRequestKey]);

  const handleExportToExcel = () => {
    const headers = columns.map((column) => column.label);
    const csvLines = [
      headers.join(','),
      ...rows.map((row) =>
        columns
          .map((column) => escapeCsvCell(buildExportValue(column, row)))
          .join(','),
      ),
    ];
    const csv = csvLines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `early-warnings-${quarter || 'latest'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className={`${styles.main} ${theme === 'night' ? styles.themeNight : styles.themeDay}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Early Warnings</p>
          <h1 className={styles.title}>Bank Early Warning Dashboard</h1>
          <p className={styles.subtitle}>
            Review key balance sheet, profitability, asset quality, and funding metrics with one
            row per bank for each bank&apos;s latest available quarter.
          </p>
          <div className={styles.headerLinks}>
            <Link className={styles.backButton} href="/">
              Back to search
            </Link>
            <Link className={styles.backButtonSecondary} href="/smart-pricing">
              Smart Pricing
            </Link>
          </div>
        </div>
        <div className={styles.headerActions}>
          <p className={styles.contextLabel}>Data scope</p>
          <p className={styles.contextValue}>{summaryLabel}</p>
          <button className={styles.exportButton} type="button" onClick={handleExportToExcel}>
            Export to Excel
          </button>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
      </header>

      <section className={styles.filtersCard}>
        <label className={styles.filterField}>
          Portfolio View
          <select value={selectedPortfolio} onChange={(event) => setSelectedPortfolio(event.target.value)}>
            {PORTFOLIO_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          Region
          <select value={selectedRegion} onChange={(event) => setSelectedRegion(event.target.value)}>
            {REGION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          FRB Districts
          <select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)}>
            {FRB_DISTRICT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section key={filterRequestKey} className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <p className={styles.sectionKicker}>Monitoring set</p>
            <h2 className={styles.sectionTitle}>Early warning indicators</h2>
          </div>
          <p className={styles.bankCount}>{loading ? 'Loading…' : `${rows.length} banks`}</p>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={column.sticky ? styles.stickyColumn : undefined}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && !rows.length ? (
                <tr>
                  <td className={styles.emptyState} colSpan={columns.length}>
                    No banks matched the selected filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.cert}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.sticky ? styles.stickyColumn : undefined}>
                      {column.formatter(row[column.key], row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
