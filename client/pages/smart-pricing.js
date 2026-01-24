import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from '../styles/SmartPricing.module.css';

const THEME_STORAGE_KEY = 'bloomberg-theme';
const DAY_COUNT_OPTIONS = ['30/360', 'ACT/360', 'ACT/365'];
const PAYMENT_RULES = ['recast_on_reset', 'fixed_payment'];
const PAYMENTS_PER_YEAR_OPTIONS = [12, 6, 4, 3, 2, 1];

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const parseDate = (value) => {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
};

const formatDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'N/A';
  return date.toISOString().slice(0, 10);
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

const differenceInDays = (start, end) =>
  Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

const yearFraction = (d1, d2, dc) => {
  if (d1.getTime() === d2.getTime()) return 0.0;
  if (d2 < d1) {
    throw new Error(`Dates must be strictly increasing: start=${formatDate(d1)} end=${formatDate(d2)}`);
  }

  if (dc === 'ACT/365') {
    return differenceInDays(d1, d2) / 365.0;
  }
  if (dc === 'ACT/360') {
    return differenceInDays(d1, d2) / 360.0;
  }
  if (dc === '30/360') {
    const d1d = Math.min(d1.getDate(), 30);
    const d2d = Math.min(d2.getDate(), 30);
    const yearDelta = d2.getFullYear() - d1.getFullYear();
    const monthDelta = d2.getMonth() - d1.getMonth();
    return (yearDelta * 360 + monthDelta * 30 + (d2d - d1d)) / 360.0;
  }
  throw new Error('Unsupported day count');
};

const pmt = (periodRate, n, pv) => {
  if (n <= 0) return 0.0;
  if (Math.abs(periodRate) < 1e-12) return pv / n;
  return (pv * periodRate) / (1 - (1 + periodRate) ** -n);
};

const makePaymentDates = (start, termMonths, paymentsPerYear) => {
  if (paymentsPerYear <= 0) {
    throw new Error('payments_per_year must be > 0');
  }
  if (12 % paymentsPerYear !== 0) {
    throw new Error('payments_per_year must divide 12 (12, 6, 4, 3, 2, 1).');
  }
  const stepMonths = 12 / paymentsPerYear;
  const nPeriods =
    Math.floor(termMonths / stepMonths) + (termMonths % stepMonths !== 0 ? 1 : 0);
  return Array.from({ length: nPeriods }, (_, i) => addMonths(start, stepMonths * (i + 1)));
};

const sanitizeSchedule = (accrualStart, paymentDates) => {
  if (!paymentDates.length) {
    throw new Error('payment_dates cannot be empty');
  }
  for (let i = 1; i < paymentDates.length; i += 1) {
    if (paymentDates[i] <= paymentDates[i - 1]) {
      throw new Error(
        `payment_dates not strictly increasing at i=${i}: ${formatDate(paymentDates[i - 1])} -> ${formatDate(
          paymentDates[i],
        )}`,
      );
    }
  }

  let adjustedDates = [...paymentDates];
  if (paymentDates[0] <= accrualStart) {
    const bump = differenceInDays(paymentDates[0], accrualStart) + 1;
    adjustedDates = paymentDates.map((date) => addDays(date, bump));
  }

  return adjustedDates;
};

const parseIndexSeries = (text, nNeeded, defaultValue) => {
  const raw = text
    .replace(/\n/g, ',')
    .replace(/\s/g, ',')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const values = raw.map((value) => Number(value)).filter((value) => Number.isFinite(value));

  let result = values.length ? values : [defaultValue];
  if (result.length < nNeeded) {
    result = result.concat(Array.from({ length: nNeeded - result.length }, () => result[result.length - 1]));
  } else if (result.length > nNeeded) {
    result = result.slice(0, nNeeded);
  }
  return result;
};

const npvFromYield = (paymentDates, accrualStart, cashflows, annualYield, dayCount) => {
  let pv = 0.0;
  for (let i = 0; i < paymentDates.length; i += 1) {
    const t = yearFraction(accrualStart, paymentDates[i], dayCount);
    pv += cashflows[i] / (1.0 + annualYield) ** t;
  }
  return pv;
};

const irrAnnualFromCashflows = (paymentDates, accrualStart, cashflows, dayCount) => {
  const hasNegative = cashflows.some((cf) => cf < 0);
  const hasPositive = cashflows.some((cf) => cf > 0);
  if (!hasNegative || !hasPositive) return null;

  const f = (rate) => npvFromYield(paymentDates, accrualStart, cashflows, rate, dayCount);
  let lo = -0.99;
  let hi = 5.0;
  let flo = f(lo);
  let fhi = f(hi);

  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 120; i += 1) {
    const mid = (lo + hi) / 2.0;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-10) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2.0;
};

const buildFloatRateSchedule = (terms) => {
  const { principal, spread, indexRates, paymentDates, accrualStartDate, dayCount } = terms;
  if (principal <= 0) {
    throw new Error('principal must be > 0');
  }
  if (!paymentDates.length) {
    throw new Error('payment_dates cannot be empty');
  }
  if (indexRates.length !== paymentDates.length) {
    throw new Error('index_rates must have same length as payment_dates');
  }

  const payDates = [...paymentDates];
  for (let i = 1; i < payDates.length; i += 1) {
    if (payDates[i] <= payDates[i - 1]) {
      throw new Error('payment_dates must be strictly increasing');
    }
  }

  const n = payDates.length;
  const io = clampNumber(Math.floor(terms.interestOnlyPeriods), 0, n);
  const resetK = Math.max(1, Math.floor(terms.resetEveryPeriods));

  const accrualStarts = [accrualStartDate, ...payDates.slice(0, -1)];
  const dcf = accrualStarts.map((start, i) => yearFraction(start, payDates[i], dayCount));

  const applyCapFloor = (rateAnnual) => {
    let adjusted = rateAnnual;
    if (terms.floorRate !== null && terms.floorRate !== undefined) {
      adjusted = Math.max(adjusted, terms.floorRate);
    }
    if (terms.capRate !== null && terms.capRate !== undefined) {
      adjusted = Math.min(adjusted, terms.capRate);
    }
    return adjusted;
  };

  const effAnnual = indexRates.map((idx) => applyCapFloor(idx + spread));

  const rows = [];
  let balance = principal;
  let currentPayment = null;

  if (terms.payRule === 'fixed_payment') {
    if (!terms.fixedPayment || terms.fixedPayment <= 0) {
      throw new Error('For fixed_payment, provide fixed_payment > 0.');
    }
    currentPayment = terms.fixedPayment;
  }

  for (let i = 0; i < n; i += 1) {
    const period = i + 1;
    const startBalance = balance;
    const rateAnnual = effAnnual[i];
    const interest = startBalance * rateAnnual * dcf[i];

    let payment;
    if (period <= io) {
      payment = interest;
    } else if (terms.payRule === 'recast_on_reset') {
      const isReset = (period - io - 1) % resetK === 0;
      if (isReset || currentPayment === null) {
        const remaining = n - i;
        const perPeriodRate = rateAnnual * dcf[i];
        currentPayment = pmt(perPeriodRate, remaining, startBalance);
      }
      payment = currentPayment;
    } else {
      payment = currentPayment;
    }

    let principalPaid = payment - interest;

    if (i === n - 1) {
      principalPaid = startBalance;
      payment = interest + principalPaid;
    }

    balance = startBalance - principalPaid;

    rows.push({
      period,
      accrualStart: accrualStarts[i],
      paymentDate: payDates[i],
      dayCountFrac: dcf[i],
      indexRate: indexRates[i],
      spread,
      allInRate: rateAnnual,
      beginBalance: startBalance,
      payment: Number(payment),
      interest: Number(interest),
      principal: Number(principalPaid),
      endBalance: Number(balance),
      negAm: principalPaid < 0,
    });
  }

  let cumInterest = 0;
  let cumPrincipal = 0;
  return rows.map((row) => {
    cumInterest += row.interest;
    cumPrincipal += row.principal;
    return {
      ...row,
      cumInterest,
      cumPrincipal,
    };
  });
};

const formatOutput = (rows) =>
  rows.map((row) => ({
    ...row,
    accrualStart: formatDate(row.accrualStart),
    paymentDate: formatDate(row.paymentDate),
    indexRate: `${(row.indexRate * 100).toFixed(2)}%`,
    allInRate: `${(row.allInRate * 100).toFixed(2)}%`,
    beginBalance: row.beginBalance.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    endBalance: row.endBalance.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    payment: row.payment.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    interest: row.interest.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    principal: row.principal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    cumInterest: row.cumInterest.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    cumPrincipal: row.cumPrincipal.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  }));

const buildCsv = (rows, columns) => {
  const headers = columns.map((col) => col.label).join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key] instanceof Date ? formatDate(row[col.key]) : row[col.key];
        const safe = value === null || value === undefined ? '' : String(value);
        return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      })
      .join(','),
  );
  return [headers, ...lines].join('\n');
};

const downloadCsv = (data, filename) => {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const columnConfig = [
  { key: 'period', label: 'Period' },
  { key: 'accrualStart', label: 'Accrual Start' },
  { key: 'paymentDate', label: 'Payment Date' },
  { key: 'dayCountFrac', label: 'Day Count' },
  { key: 'indexRate', label: 'Index Rate' },
  { key: 'spread', label: 'Spread' },
  { key: 'allInRate', label: 'All-in Rate' },
  { key: 'beginBalance', label: 'Begin Balance' },
  { key: 'payment', label: 'Payment' },
  { key: 'interest', label: 'Interest' },
  { key: 'principal', label: 'Principal' },
  { key: 'endBalance', label: 'End Balance' },
  { key: 'cumInterest', label: 'Cum Interest' },
  { key: 'cumPrincipal', label: 'Cum Principal' },
  { key: 'negAm', label: 'Neg Am' },
];

export default function SmartPricing() {
  const [principal, setPrincipal] = useState(500000);
  const [spreadBps, setSpreadBps] = useState(250);
  const [defaultIndexPct, setDefaultIndexPct] = useState(5.0);
  const [startDate, setStartDate] = useState('2026-02-01');
  const [paymentsPerYear, setPaymentsPerYear] = useState(12);
  const [termMonths, setTermMonths] = useState(60);
  const [payRule, setPayRule] = useState('recast_on_reset');
  const [resetEvery, setResetEvery] = useState(1);
  const [interestOnlyPeriods, setInterestOnlyPeriods] = useState(0);
  const [dayCount, setDayCount] = useState('30/360');
  const [capText, setCapText] = useState('');
  const [floorText, setFloorText] = useState('');
  const [fixedPayment, setFixedPayment] = useState(10000);
  const [indexText, setIndexText] = useState('0.050, 0.051, 0.052, 0.049, 0.048');
  const [discYieldPct, setDiscYieldPct] = useState(8.25);
  const [upfrontFeePct, setUpfrontFeePct] = useState(0);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [results, setResults] = useState(null);
  const [theme, setTheme] = useState('night');

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

  const spread = useMemo(() => spreadBps / 10000, [spreadBps]);
  const defaultIndex = useMemo(() => defaultIndexPct / 100, [defaultIndexPct]);

  const formattedResults = useMemo(() => {
    if (!results) return null;
    return {
      ...results,
      formattedSchedule: formatOutput(results.schedule),
    };
  }, [results]);

  const handleBuild = () => {
    setError(null);
    setWarning(null);

    try {
      const accrualStart = parseDate(startDate);
      if (!accrualStart) {
        throw new Error('Please provide a valid accrual start date.');
      }

      let paymentDates = makePaymentDates(accrualStart, Number(termMonths), Number(paymentsPerYear));
      paymentDates = sanitizeSchedule(accrualStart, paymentDates);

      if (paymentDates[0] <= accrualStart) {
        setWarning(
          `Adjusted payment dates so first payment (${formatDate(paymentDates[0])}) is after accrual start (${formatDate(
            accrualStart,
          )}).`,
        );
      }

      const indexRates = parseIndexSeries(indexText, paymentDates.length, defaultIndex);
      const capRate = capText.trim() ? Number(capText) / 100.0 : null;
      const floorRate = floorText.trim() ? Number(floorText) / 100.0 : null;
      const upfrontFee = (Number(upfrontFeePct) / 100.0) * Number(principal);
      const discYield = Number(discYieldPct) / 100.0;

      const schedule = buildFloatRateSchedule({
        principal: Number(principal),
        spread: Number(spread),
        indexRates,
        paymentDates,
        accrualStartDate: accrualStart,
        dayCount,
        floorRate,
        capRate,
        payRule,
        resetEveryPeriods: Number(resetEvery),
        interestOnlyPeriods: Number(interestOnlyPeriods),
        fixedPayment: payRule === 'fixed_payment' ? Number(fixedPayment) : null,
      });

      const cashflows = [-Number(principal) + upfrontFee, ...schedule.map((row) => row.payment)];
      const cfDates = [accrualStart, ...schedule.map((row) => row.paymentDate)];

      const pvInflows = npvFromYield(
        schedule.map((row) => row.paymentDate),
        accrualStart,
        schedule.map((row) => row.payment),
        discYield,
        dayCount,
      );
      const npv = -Number(principal) + upfrontFee + pvInflows;
      const price = (upfrontFee + pvInflows) / Number(principal);

      const irr = irrAnnualFromCashflows(cfDates, accrualStart, cashflows, dayCount);

      setResults({
        schedule,
        npv,
        price,
        pvInflows,
        irr,
        upfrontFee,
        accrualStart,
      });
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : 'Unexpected error building schedule.');
    }
  };

  const handleDownload = (rows, filename) => {
    const csv = buildCsv(rows, columnConfig);
    downloadCsv(csv, filename);
  };

  return (
    <main
      className={`${styles.main} ${
        theme === 'night' ? styles.themeNight : styles.themeDay
      }`}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Smart Pricing</p>
          <h1 className={styles.title}>Floating-Rate Loan Pricing</h1>
          <p className={styles.subtitle}>
            Build amortization schedules and pricing metrics using the same logic as the Streamlit
            prototype, now in JavaScript.
          </p>
          <Link className={styles.backButton} href="/">
            Back to search
          </Link>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.themeLabel}>Mode</span>
          <div className={styles.themeButtons} role="group" aria-label="Display mode">
            <button
              type="button"
              className={`${styles.themeButton} ${
                theme === 'day' ? styles.themeButtonActive : ''
              }`}
              onClick={() => setTheme('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${
                theme === 'night' ? styles.themeButtonActive : ''
              }`}
              onClick={() => setTheme('night')}
            >
              Night
            </button>
          </div>
        </div>
      </header>

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <h2 className={styles.sectionTitle}>Loan Inputs</h2>
          <label className={styles.label}>
            Principal
            <input
              className={styles.input}
              type="number"
              min="0"
              step="10000"
              value={principal}
              onChange={(event) => setPrincipal(Number(event.target.value))}
            />
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Spread (bps)
              <input
                className={styles.input}
                type="number"
                step="25"
                value={spreadBps}
                onChange={(event) => setSpreadBps(Number(event.target.value))}
              />
            </label>
            <label className={styles.label}>
              Default index (%)
              <input
                className={styles.input}
                type="number"
                step="0.1"
                value={defaultIndexPct}
                onChange={(event) => setDefaultIndexPct(Number(event.target.value))}
              />
            </label>
          </div>

          <label className={styles.label}>
            Accrual Start Date
            <input
              className={styles.input}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <h3 className={styles.sectionSubtitle}>Schedule</h3>
          <div className={styles.row}>
            <label className={styles.label}>
              Payments per year
              <select
                className={styles.input}
                value={paymentsPerYear}
                onChange={(event) => setPaymentsPerYear(Number(event.target.value))}
              >
                {PAYMENTS_PER_YEAR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              Term (months)
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={termMonths}
                onChange={(event) => setTermMonths(Number(event.target.value))}
              />
            </label>
          </div>

          <label className={styles.label}>
            Payment rule
            <select className={styles.input} value={payRule} onChange={(event) => setPayRule(event.target.value)}>
              {PAYMENT_RULES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Reset every N periods
              <input
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={resetEvery}
                onChange={(event) => setResetEvery(Number(event.target.value))}
              />
            </label>
            <label className={styles.label}>
              Interest-only periods
              <input
                className={styles.input}
                type="number"
                min="0"
                step="1"
                value={interestOnlyPeriods}
                onChange={(event) => setInterestOnlyPeriods(Number(event.target.value))}
              />
            </label>
          </div>

          <label className={styles.label}>
            Day count
            <select className={styles.input} value={dayCount} onChange={(event) => setDayCount(event.target.value)}>
              {DAY_COUNT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.row}>
            <label className={styles.label}>
              Rate cap (%) optional
              <input
                className={styles.input}
                type="text"
                value={capText}
                onChange={(event) => setCapText(event.target.value)}
              />
            </label>
            <label className={styles.label}>
              Rate floor (%) optional
              <input
                className={styles.input}
                type="text"
                value={floorText}
                onChange={(event) => setFloorText(event.target.value)}
              />
            </label>
          </div>

          {payRule === 'fixed_payment' && (
            <label className={styles.label}>
              Fixed payment amount
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="100"
                value={fixedPayment}
                onChange={(event) => setFixedPayment(Number(event.target.value))}
              />
            </label>
          )}

          <h3 className={styles.sectionSubtitle}>Index Path (annualized decimals)</h3>
          <p className={styles.helperText}>
            Enter rates like 0.0525. If shorter than the schedule, it pads with the last value.
          </p>
          <textarea
            className={styles.textarea}
            rows={4}
            value={indexText}
            onChange={(event) => setIndexText(event.target.value)}
          />

          <h2 className={styles.sectionTitle}>Pricing Assumptions</h2>
          <label className={styles.label}>
            Discount yield / required return (%)
            <input
              className={styles.input}
              type="number"
              step="0.1"
              value={discYieldPct}
              onChange={(event) => setDiscYieldPct(Number(event.target.value))}
            />
          </label>
          <label className={styles.label}>
            Upfront fee / OID (% of principal, + means lender collects)
            <input
              className={styles.input}
              type="number"
              step="0.1"
              value={upfrontFeePct}
              onChange={(event) => setUpfrontFeePct(Number(event.target.value))}
            />
          </label>

          <button type="button" className={styles.primaryButton} onClick={handleBuild}>
            Build Schedule &amp; Price
          </button>

          {warning && <p className={styles.warning}>{warning}</p>}
          {error && <p className={styles.error}>Error: {error}</p>}
        </aside>

        <section className={styles.results}>
          {!results && !error && (
            <div className={styles.emptyState}>
              <h3>Enter inputs, then build your schedule.</h3>
              <p>Results will appear here once the schedule and pricing are calculated.</p>
            </div>
          )}

          {results && formattedResults && (
            <>
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <p className={styles.metricLabel}>NPV ($)</p>
                  <p className={styles.metricValue}>
                    {results.npv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.metricLabel}>Price (% of par)</p>
                  <p className={styles.metricValue}>{(results.price * 100).toFixed(3)}%</p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.metricLabel}>PV of payments ($)</p>
                  <p className={styles.metricValue}>
                    {results.pvInflows.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.metricLabel}>IRR (annual)</p>
                  <p className={styles.metricValue}>
                    {results.irr === null ? 'N/A' : `${(results.irr * 100).toFixed(3)}%`}
                  </p>
                </div>
              </div>

              <p className={styles.caption}>
                Cashflow convention: lender perspective (t0 outflow = principal - upfront fee; inflows = payments).
              </p>

              <div className={styles.tableActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleDownload(formattedResults.formattedSchedule, 'amort_schedule_floating_rate_formatted.csv')}
                >
                  Download schedule CSV (formatted)
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleDownload(results.schedule, 'amort_schedule_floating_rate_raw.csv')}
                >
                  Download schedule CSV (raw numeric)
                </button>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {columnConfig.map((column) => (
                        <th key={column.key}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {formattedResults.formattedSchedule.map((row) => (
                      <tr key={`row-${row.period}`}>
                        {columnConfig.map((column) => (
                          <td key={`${row.period}-${column.key}`}>
                            {String(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
