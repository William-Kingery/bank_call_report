import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import styles from '../styles/Home.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
const THEME_STORAGE_KEY = 'bloomberg-theme';
const buildColumnData = (series, key) => {
  if (!series?.length) {
    return {
      values: [],
      min: null,
      max: null,
      hasData: false,
    };
  }

  const numericValues = series
    .map((point) => Number(point?.[key]))
    .filter((value) => Number.isFinite(value));

  if (!numericValues.length) {
    return {
      values: [],
      min: null,
      max: null,
      hasData: false,
    };
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const range = max - min || 1;
  const values = series.map((point) => {
    const value = Number(point?.[key]);
    if (!Number.isFinite(value)) {
      return { label: point.label, value: null, percentage: 0 };
    }

    return {
      label: point.label,
      value,
      percentage: ((value - min) / range) * 100,
    };
  });

  return {
    values,
    min,
    max,
    hasData: true,
  };
};

const buildLineChartData = (series, columnWidth, valueSelector) => {
  const rawValues = series.map((point) => ({
    label: point.label,
    value: valueSelector(point),
  }));
  const numericValues = rawValues
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value));
  const min = numericValues.length ? Math.min(...numericValues) : null;
  const max = numericValues.length ? Math.max(...numericValues) : null;
  const range = Number.isFinite(max) && Number.isFinite(min) ? max - min : 0;
  const values = rawValues.map((point) => {
    if (!Number.isFinite(point.value)) {
      return { label: point.label, value: null, percentage: 0 };
    }
    return {
      label: point.label,
      value: point.value,
      percentage: range === 0 ? 50 : ((point.value - min) / range) * 100,
    };
  });
  const height = 160;
  const paddingTop = 18;
  const paddingBottom = 18;
  const rangeHeight = height - paddingTop - paddingBottom;
  const width = Math.max(series.length * columnWidth, 320);
  const points = values.map((point, index) => {
    if (point.value == null) {
      return null;
    }
    const x = index * columnWidth + columnWidth / 2;
    const y = paddingTop + (1 - point.percentage / 100) * rangeHeight;
    return {
      x,
      y,
      label: point.label,
      value: point.value,
    };
  });
  const segments = [];
  let current = [];
  points.forEach((point) => {
    if (!point) {
      if (current.length > 1) {
        segments.push(current);
      }
      current = [];
      return;
    }
    current.push(point);
  });
  if (current.length > 1) {
    segments.push(current);
  }

  return {
    width,
    height,
    points,
    segments,
    min,
    max,
    hasData: numericValues.length > 0,
  };
};

const buildQuarterSeries = (points, mapper) => {
  const grouped = new Map();

  points.forEach((point) => {
    const mapped = mapper(point);
    if (!mapped?.label) return;
    grouped.set(mapped.label, mapped);
  });

  return Array.from(grouped.values());
};

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;
  const parsed = Number.parseInt(fullHex, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
};

const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`;

const mixColors = (baseColor, mixColor, amount) => {
  const base = hexToRgb(baseColor);
  const mix = hexToRgb(mixColor);
  const clamped = clampNumber(amount, 0, 1);
  return rgbToHex(
    base.r + (mix.r - base.r) * clamped,
    base.g + (mix.g - base.g) * clamped,
    base.b + (mix.b - base.b) * clamped,
  );
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
  const [segmentLiquidityData, setSegmentLiquidityData] = useState([]);
  const [segmentLiquidityLoading, setSegmentLiquidityLoading] = useState(false);
  const [segmentLiquidityError, setSegmentLiquidityError] = useState(null);
  const [segmentLiquiditySegment, setSegmentLiquiditySegment] = useState(null);
  const [benchmarkSortField, setBenchmarkSortField] = useState('asset');
  const [benchmarkSortOrder, setBenchmarkSortOrder] = useState('desc');
  const [segmentBankCount, setSegmentBankCount] = useState(null);
  const [segmentBankCountError, setSegmentBankCountError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSelectedBank, setHasSelectedBank] = useState(false);
  const [activeTab, setActiveTab] = useState('portfolio');
  const [printAllTabs, setPrintAllTabs] = useState(false);
  const [portfolioView, setPortfolioView] = useState('latest');
  const [assetQualityView, setAssetQualityView] = useState('latest');
  const [profitabilityView, setProfitabilityView] = useState('latest');
  const [capitalView, setCapitalView] = useState('latest');
  const [liquidityView, setLiquidityView] = useState('latest');
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle(styles.themeNight, theme === 'night');
    document.body.classList.toggle(styles.themeDay, theme === 'day');
    return () => {
      document.body.classList.remove(styles.themeNight);
      document.body.classList.remove(styles.themeDay);
    };
  }, [theme]);

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
  const formatQuarterShortLabel = (label) => {
    if (!label) return 'N/A';
    const [year, quarter] = label.split(' ');
    if (!year || !quarter) return label;
    return `${quarter} '${year.slice(-2)}`;
  };
  const formatCapitalAxisLabel = (point) => {
    if (!point) return 'N/A';
    if (point.callym) return formatQuarterLabel(point.callym);
    return point.label ?? 'N/A';
  };

  const sliceSeries = (series, view) => {
    const count = view === 'latest4' ? 4 : 9;
    return series.slice(Math.max(series.length - count, 0));
  };

  const getAxisMinWidth = (length, minColumnWidth = 64) =>
    `${Math.max(length * minColumnWidth, 320)}px`;
  const getPortfolioAxisMinWidthForView = () => '100%';
  const getProfitabilityAxisMinWidthForView = (length, view) =>
    getAxisMinWidth(length, view === 'latest4' ? 40 : 33);

  const getAssetSegment = (assetValue) => {
    const asset = Number(assetValue);
    if (!Number.isFinite(asset)) return null;
    if (asset >= 700000000) return 'Over 700 Billion';
    if (asset >= 250000000) return 'Between $250 B and 700 Billion';
    if (asset >= 100000000) return 'Between $100 B and 250 B';
    if (asset >= 50000000) return 'Between $50 B and 100 B';
    if (asset >= 10000000) return 'Between $10 B and 50 B';
    if (asset >= 5000000) return 'Between $5 B and 10 B';
    if (asset >= 1000000) return 'Between $1 B and 5 B';
    if (asset >= 500000) return 'Between $0.5 B and 1 B';
    return 'Less than 0.5 B';
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

    return buildQuarterSeries(sortedPoints, (point) => {
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

    return buildQuarterSeries(sortedPoints, (point) => {
      const efficiencyValue = Number(point.efficiencyRatio);

      return {
        label: formatQuarterLabel(point.callym),
        efficiencyRatio: Number.isFinite(efficiencyValue) ? efficiencyValue : null,
      };
    });
  }, [sortedPoints]);

  const capitalSeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return buildQuarterSeries(sortedPoints, (point) => {
      const tangibleEquityValue = Number(point.eqtanqta);
      const ciLoansValue = Number(point.lncit1r);
      const reLoansValue = Number(point.lnrert1r);
      const consumerLoansValue = Number(point.lncont1r);
      const highRiskLoansValue = Number(point.lnhrskr);
      const constructionLoansValue = Number(point.lncdt1r);
      const rbct1Value = Number(point.rbct1);
      const rbct2Value = Number(point.rbct2);

      return {
        callym: point.callym,
        label: formatQuarterLabel(point.callym),
        tangibleEquityRatio: Number.isFinite(tangibleEquityValue) ? tangibleEquityValue : null,
        ciLoansRatio: Number.isFinite(ciLoansValue) ? ciLoansValue : null,
        reLoansRatio: Number.isFinite(reLoansValue) ? reLoansValue : null,
        consumerLoansRatio: Number.isFinite(consumerLoansValue) ? consumerLoansValue : null,
        highRiskLoansRatio: Number.isFinite(highRiskLoansValue) ? highRiskLoansValue : null,
        constructionLoansRatio: Number.isFinite(constructionLoansValue)
          ? constructionLoansValue
          : null,
        rbct1: Number.isFinite(rbct1Value) ? rbct1Value : null,
        rbct2: Number.isFinite(rbct2Value) ? rbct2Value : null,
      };
    });
  }, [sortedPoints]);

  const liquiditySeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return buildQuarterSeries(sortedPoints, (point) => {
      const coreDepositsValue = Number(point.coredep);
      const brokeredDepositsValue = Number(point.bro);
      const depositsValue = Number(point.dep);
      const loanDepositRatioValue = Number(point.lnlsdepr);
      const coreDepositRatio =
        Number.isFinite(coreDepositsValue) &&
        Number.isFinite(depositsValue) &&
        depositsValue !== 0
          ? (coreDepositsValue / depositsValue) * 100
          : null;

      return {
        label: formatQuarterLabel(point.callym),
        coreDeposits: Number.isFinite(coreDepositsValue) ? coreDepositsValue : null,
        brokeredDeposits: Number.isFinite(brokeredDepositsValue)
          ? brokeredDepositsValue
          : null,
        coreDepositRatio,
        loanDepositRatio: Number.isFinite(loanDepositRatioValue) ? loanDepositRatioValue : null,
      };
    });
  }, [sortedPoints]);

  const portfolioSeries = useMemo(
    () => sliceSeries(quarterlySeries, portfolioView),
    [portfolioView, quarterlySeries],
  );

  const profitabilityViewSeries = useMemo(
    () => sliceSeries(profitabilitySeries, profitabilityView),
    [profitabilitySeries, profitabilityView],
  );
  const profitabilityColumnWidth = profitabilityView === 'latest4' ? 40 : 33;

  const efficiencyViewSeries = useMemo(
    () => sliceSeries(efficiencySeries, profitabilityView),
    [efficiencySeries, profitabilityView],
  );

  const capitalViewSeries = useMemo(
    () => sliceSeries(capitalSeries, capitalView),
    [capitalSeries, capitalView],
  );
  const capitalColumnWidth = capitalView === 'latest4' ? 52 : 44;

  const liquidityViewSeries = useMemo(
    () => sliceSeries(liquiditySeries, liquidityView),
    [liquiditySeries, liquidityView],
  );
  const liquidityColumnWidth = liquidityView === 'latest4' ? 52 : 44;

  const assetQualitySeries = useMemo(() => {
    if (!sortedPoints.length) return [];

    return buildQuarterSeries(sortedPoints, (point) => {
      const delinq3089Value = Number(point.P3Asset);
      const delinq90Value = Number(point.P9Asset);
      const nonAccrualValue = Number(point.NAAsset);
      const npaValue = Number(point.nperf);
      const npaRatioValue = Number(point.nperfRatio);
      const loanLeaseCoValue = Number(point.DRLNLSQ);
      const netChargeOffRatioValue = Number(point.ntlnlsqr);
      return {
        label: formatQuarterLabel(point.callym),
        delinq3089: Number.isFinite(delinq3089Value) ? delinq3089Value : null,
        delinq90: Number.isFinite(delinq90Value) ? delinq90Value : null,
        nonAccruals: Number.isFinite(nonAccrualValue) ? nonAccrualValue : null,
        npa: Number.isFinite(npaValue) ? npaValue : null,
        npaRatio: Number.isFinite(npaRatioValue) ? npaRatioValue : null,
        loanLeaseCO: Number.isFinite(loanLeaseCoValue) ? loanLeaseCoValue : null,
        netChargeOffRatio: Number.isFinite(netChargeOffRatioValue)
          ? netChargeOffRatioValue
          : null,
      };
    });
  }, [sortedPoints]);

  const assetQualityViewSeries = useMemo(
    () => sliceSeries(assetQualitySeries, assetQualityView),
    [assetQualitySeries, assetQualityView],
  );
  const assetQualityColumnWidth = assetQualityView === 'latest4' ? 52 : 44;

  const profitabilityColumnData = useMemo(
    () => ({
      nim: buildColumnData(profitabilityViewSeries, 'nim'),
      roa: buildColumnData(profitabilityViewSeries, 'roa'),
      roe: buildColumnData(profitabilityViewSeries, 'roe'),
      efficiencyRatio: buildColumnData(efficiencyViewSeries, 'efficiencyRatio'),
    }),
    [efficiencyViewSeries, profitabilityViewSeries],
  );

  const capitalColumnData = useMemo(
    () => ({
      tangibleEquity: buildColumnData(capitalViewSeries, 'tangibleEquityRatio'),
      ciLoans: buildColumnData(capitalViewSeries, 'ciLoansRatio'),
      reLoans: buildColumnData(capitalViewSeries, 'reLoansRatio'),
      consumerLoans: buildColumnData(capitalViewSeries, 'consumerLoansRatio'),
      highRiskLoans: buildColumnData(capitalViewSeries, 'highRiskLoansRatio'),
      constructionLoans: buildColumnData(capitalViewSeries, 'constructionLoansRatio'),
    }),
    [capitalViewSeries],
  );

  const capitalStackedData = useMemo(() => {
    const values = capitalViewSeries.map((point) => {
      const rbct1Value = Number(point?.rbct1);
      const rbct2Value = Number(point?.rbct2);
      const rbct1 = Number.isFinite(rbct1Value) ? rbct1Value : null;
      const rbct2 = Number.isFinite(rbct2Value) ? rbct2Value : null;
      const total = (rbct1 ?? 0) + (rbct2 ?? 0);
      const hasAnyValue = rbct1 != null || rbct2 != null;

      return {
        label: point.label,
        rbct1,
        rbct2,
        total: Number.isFinite(total) && hasAnyValue ? total : null,
      };
    });

    const totals = values
      .map((point) => point.total)
      .filter((value) => Number.isFinite(value));
    const max = totals.length ? Math.max(...totals) : 0;

    return {
      values: values.map((point) => ({
        ...point,
        rbct1Percent: point.rbct1 != null && max > 0 ? (point.rbct1 / max) * 100 : 0,
        rbct2Percent: point.rbct2 != null && max > 0 ? (point.rbct2 / max) * 100 : 0,
      })),
      max,
      hasData: totals.length > 0,
    };
  }, [capitalViewSeries]);

  const liquidityStackedData = useMemo(() => {
    const values = liquidityViewSeries.map((point) => {
      const coreValue = Number(point?.coreDeposits);
      const brokeredValue = Number(point?.brokeredDeposits);
      const coreDeposits = Number.isFinite(coreValue) ? coreValue : null;
      const brokeredDeposits = Number.isFinite(brokeredValue) ? brokeredValue : null;
      const total = (coreDeposits ?? 0) + (brokeredDeposits ?? 0);
      const hasAnyValue = coreDeposits != null || brokeredDeposits != null;

      return {
        label: point.label,
        coreDeposits,
        brokeredDeposits,
        total: Number.isFinite(total) && hasAnyValue ? total : null,
      };
    });

    const totals = values
      .map((point) => point.total)
      .filter((value) => Number.isFinite(value));
    const max = totals.length ? Math.max(...totals) : 0;

    return {
      values: values.map((point) => ({
        ...point,
        coreDepositsPercent:
          point.coreDeposits != null && max > 0 ? (point.coreDeposits / max) * 100 : 0,
        brokeredDepositsPercent:
          point.brokeredDeposits != null && max > 0
            ? (point.brokeredDeposits / max) * 100
            : 0,
      })),
      max,
      hasData: totals.length > 0,
    };
  }, [liquidityViewSeries]);

  const coreDepositRatioChart = useMemo(
    () =>
      buildLineChartData(
        liquidityViewSeries,
        liquidityColumnWidth,
        (point) => point.coreDepositRatio,
      ),
    [liquidityColumnWidth, liquidityViewSeries],
  );

  const loanDepositRatioChart = useMemo(
    () =>
      buildLineChartData(
        liquidityViewSeries,
        liquidityColumnWidth,
        (point) => point.loanDepositRatio,
      ),
    [liquidityColumnWidth, liquidityViewSeries],
  );

  const segmentLoanDepositLookup = useMemo(() => {
    const lookup = new Map();
    segmentLiquidityData.forEach((row) => {
      const label = formatQuarterLabel(row.callym);
      const value = Number(row.avgLnlsdepr);
      if (Number.isFinite(value)) {
        lookup.set(label, value);
      }
    });
    return lookup;
  }, [segmentLiquidityData]);

  const segmentLoanDepositChart = useMemo(
    () =>
      buildLineChartData(
        liquidityViewSeries,
        liquidityColumnWidth,
        (point) => segmentLoanDepositLookup.get(point.label),
      ),
    [liquidityColumnWidth, liquidityViewSeries, segmentLoanDepositLookup],
  );

  const assetQualityColumnData = useMemo(
    () => ({
      delinq3089: buildColumnData(assetQualityViewSeries, 'delinq3089'),
      delinq90: buildColumnData(assetQualityViewSeries, 'delinq90'),
      nonAccruals: buildColumnData(assetQualityViewSeries, 'nonAccruals'),
      npa: buildColumnData(assetQualityViewSeries, 'npa'),
      npaRatio: buildColumnData(assetQualityViewSeries, 'npaRatio'),
      loanLeaseCO: buildColumnData(assetQualityViewSeries, 'loanLeaseCO'),
      netChargeOffRatio: buildColumnData(assetQualityViewSeries, 'netChargeOffRatio'),
    }),
    [assetQualityViewSeries],
  );

  const npaRatioChart = useMemo(() => {
    const rawValues = assetQualityViewSeries.map((point) => ({
      label: point.label,
      value: Number(point?.npaRatio),
    }));
    const numericValues = rawValues
      .map((point) => point.value)
      .filter((value) => Number.isFinite(value));
    const min = numericValues.length ? Math.min(...numericValues) : 0;
    const max = numericValues.length ? Math.max(...numericValues) : 0;
    const range = max - min;
    const values = rawValues.map((point) => {
      if (!Number.isFinite(point.value)) {
        return { label: point.label, value: null, percentage: 0 };
      }
      return {
        label: point.label,
        value: point.value,
        percentage: range === 0 ? 50 : ((point.value - min) / range) * 100,
      };
    });
    const height = 160;
    const paddingTop = 18;
    const paddingBottom = 18;
    const rangeHeight = height - paddingTop - paddingBottom;
    const width = Math.max(assetQualityViewSeries.length * assetQualityColumnWidth, 320);
    const points = values.map((point, index) => {
      if (point.value == null) {
        return null;
      }
      const x = index * assetQualityColumnWidth + assetQualityColumnWidth / 2;
      const y = paddingTop + (1 - point.percentage / 100) * rangeHeight;
      return {
        x,
        y,
        label: point.label,
        value: point.value,
      };
    });
    const segments = [];
    let current = [];
    points.forEach((point) => {
      if (!point) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
        return;
      }
      current.push(point);
    });
    if (current.length > 1) {
      segments.push(current);
    }

    return {
      width,
      height,
      points,
      segments,
    };
  }, [assetQualityColumnWidth, assetQualityViewSeries]);

  const netChargeOffRatioChart = useMemo(() => {
    const rawValues = assetQualityViewSeries.map((point) => ({
      label: point.label,
      value: Number(point?.netChargeOffRatio),
    }));
    const numericValues = rawValues
      .map((point) => point.value)
      .filter((value) => Number.isFinite(value));
    const min = numericValues.length ? Math.min(...numericValues) : 0;
    const max = numericValues.length ? Math.max(...numericValues) : 0;
    const range = max - min;
    const values = rawValues.map((point) => {
      if (!Number.isFinite(point.value)) {
        return { label: point.label, value: null, percentage: 0 };
      }
      return {
        label: point.label,
        value: point.value,
        percentage: range === 0 ? 50 : ((point.value - min) / range) * 100,
      };
    });
    const height = 160;
    const paddingTop = 18;
    const paddingBottom = 18;
    const rangeHeight = height - paddingTop - paddingBottom;
    const width = Math.max(assetQualityViewSeries.length * assetQualityColumnWidth, 320);
    const points = values.map((point, index) => {
      if (point.value == null) {
        return null;
      }
      const x = index * assetQualityColumnWidth + assetQualityColumnWidth / 2;
      const y = paddingTop + (1 - point.percentage / 100) * rangeHeight;
      return {
        x,
        y,
        label: point.label,
        value: point.value,
      };
    });
    const segments = [];
    let current = [];
    points.forEach((point) => {
      if (!point) {
        if (current.length > 1) {
          segments.push(current);
        }
        current = [];
        return;
      }
      current.push(point);
    });
    if (current.length > 1) {
      segments.push(current);
    }

    return {
      width,
      height,
      points,
      segments,
    };
  }, [assetQualityColumnWidth, assetQualityViewSeries]);

  const latestPoint = useMemo(() => {
    if (!sortedPoints.length) return null;
    return sortedPoints[sortedPoints.length - 1];
  }, [sortedPoints]);
  const priorPoint = useMemo(() => {
    if (sortedPoints.length < 2) return null;
    return sortedPoints[sortedPoints.length - 2];
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

  const benchmarkBubbleChart = useMemo(() => {
    const chartWidth = 640;
    const chartHeight = 320;
    const padding = 48;
    const points = benchmarkSortedData
      .map((bank, index) => {
        const asset = Number(bank?.asset);
        const roe = Number(bank?.roe);
        if (!Number.isFinite(asset) || !Number.isFinite(roe)) {
          return null;
        }
        return {
          bank,
          asset,
          roe,
          index,
        };
      })
      .filter(Boolean);

    if (!points.length) {
      return {
        chartWidth,
        chartHeight,
        padding,
        points: [],
        ticks: [],
      };
    }

    const maxAsset = Math.max(...points.map((point) => point.asset));
    const minRoe = Math.min(...points.map((point) => point.roe));
    const maxRoe = Math.max(...points.map((point) => point.roe));
    const roeRange = maxRoe - minRoe || 1;
    const minRadius = 8;
    const maxRadius = 32;
    const lowRoeColor = '#f97316';
    const highRoeColor = '#22c55e';

    const count = points.length;
    const scaleX = (index) => {
      if (count === 1) return chartWidth / 2;
      return padding + (index / (count - 1)) * (chartWidth - padding * 2);
    };

    const scaleY = (value) =>
      padding + (1 - (value - minRoe) / roeRange) * (chartHeight - padding * 2);

    const ticks = Array.from({ length: 4 }, (_, tickIndex) => {
      const ratio = tickIndex / 3;
      const value = minRoe + ratio * roeRange;
      return {
        value,
        y: scaleY(value),
      };
    });

    const chartPoints = points.map((point) => {
      const radiusScale = maxAsset > 0 ? point.asset / maxAsset : 0;
      const radius = minRadius + radiusScale * (maxRadius - minRadius);
      const roeRatio = clampNumber((point.roe - minRoe) / roeRange, 0, 1);
      const baseColor = mixColors(lowRoeColor, highRoeColor, roeRatio);
      const highlightColor = mixColors(baseColor, '#ffffff', 0.45);
      const shadowColor = mixColors(baseColor, '#0f172a', 0.35);
      return {
        ...point,
        x: scaleX(point.index),
        y: scaleY(point.roe),
        r: radius,
        color: baseColor,
        highlightColor,
        shadowColor,
        gradientId: `bubble-gradient-${point.index}`,
      };
    });

    return {
      chartWidth,
      chartHeight,
      padding,
      minRoe,
      maxRoe,
      points: chartPoints,
      lowRoeColor,
      highRoeColor,
      ticks,
    };
  }, [benchmarkSortedData]);

  const formattedLocation = useMemo(() => {
    if (!reportData) return null;

    const parts = [reportData.city, reportData.stateName, reportData.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }, [reportData]);

  const getLiabilitiesValue = (point) =>
    point?.asset != null && point?.eq != null ? point.asset - point.eq : null;
  const latestLiabilities = getLiabilitiesValue(latestPoint);

  const latestRwa = latestPoint?.rwa;
  const latestTangibleEquity = latestPoint?.eqtanqta;
  const latestCet1 = latestPoint?.rbct1cer;
  const latestTotalRbc = latestPoint?.rbcrwaj;
  const latestNim = latestRatPoint?.nimy ?? latestPoint?.nimy;
  const latestInterestIncome = latestRatPoint?.INTINCY ?? latestPoint?.INTINCY;
  const latestInterestExpense = latestRatPoint?.INTEXPY ?? latestPoint?.INTEXPY;
  const latestLoanDepositRatio = latestRatPoint?.lnlsdepr ?? latestPoint?.lnlsdepr;
  const latestCoreDeposits = latestPoint?.coredep;
  const latestBrokeredDeposits = latestPoint?.bro;
  const getCoreDepositRatio = (point) => {
    const coreValue = Number(point?.coredep);
    const depositValue = Number(point?.dep);
    if (!Number.isFinite(coreValue) || !Number.isFinite(depositValue) || depositValue === 0) {
      return null;
    }
    return (coreValue / depositValue) * 100;
  };
  const latestCoreDepositRatio = getCoreDepositRatio(latestPoint);
  const priorLiabilities = getLiabilitiesValue(priorPoint);
  const priorRwa = priorPoint?.rwa;
  const priorLoanDepositRatio = priorPoint?.lnlsdepr;
  const priorCoreDeposits = priorPoint?.coredep;
  const priorBrokeredDeposits = priorPoint?.bro;
  const priorCoreDepositRatio = getCoreDepositRatio(priorPoint);
  const priorInterestIncome = priorPoint?.INTINCY;
  const priorInterestExpense = priorPoint?.INTEXPY;
  const priorNim = priorPoint?.nimy;
  const priorRoa = priorPoint?.roa;
  const priorRoe = priorPoint?.roe;
  const priorTangibleEquity = priorPoint?.eqtanqta;
  const priorCet1 = priorPoint?.rbct1cer;
  const priorTotalRbc = priorPoint?.rbcrwaj;
  const latestAgLoans = latestPoint?.LNAG;
  const latestCILoans = latestPoint?.LNCI;
  const latestCreLoans = latestPoint?.LNCOMRE;
  const latestReLoans = latestPoint?.LNRE;
  const latestConsumerLoans = latestPoint?.LNCON;
  const latestQuarterLabel = formatQuarterLabel(latestPoint?.callym);
  const totalAssetsSummary =
    latestPoint?.asset != null ? formatNumber(latestPoint.asset) : 'N/A';
  const totalAssetsContext = latestPoint?.callym
    ? `As of ${latestQuarterLabel}`
    : 'Select a bank to see totals.';
  const getMetricTrend = (latestValue, priorValue, comparisonLabel) => {
    const latestNumber = Number(latestValue);
    const priorNumber = Number(priorValue);

    if (!Number.isFinite(latestNumber) || !Number.isFinite(priorNumber)) {
      return null;
    }

    if (latestNumber > priorNumber) {
      return { direction: 'up', label: `Higher than ${comparisonLabel}` };
    }

    if (latestNumber < priorNumber) {
      return { direction: 'down', label: `Lower than ${comparisonLabel}` };
    }

    return null;
  };

  const yearAgoPoint = useMemo(() => {
    if (!latestPoint?.callym) return null;
    const targetCallym = Number(latestPoint.callym) - 100;
    return sortedPoints.find((point) => Number(point.callym) === targetCallym) ?? null;
  }, [latestPoint?.callym, sortedPoints]);

  const nimTrend = getMetricTrend(latestNim, priorNim, 'prior quarter');
  const roaTrend = getMetricTrend(latestPoint?.roa, priorRoa, 'prior quarter');
  const roeTrend = getMetricTrend(latestPoint?.roe, priorRoe, 'prior quarter');
  const interestIncomeTrend = getMetricTrend(
    latestInterestIncome,
    priorInterestIncome,
    'prior quarter',
  );
  const interestExpenseTrend = getMetricTrend(
    latestInterestExpense,
    priorInterestExpense,
    'prior quarter',
  );
  const tangibleEquityTrend = getMetricTrend(
    latestTangibleEquity,
    priorTangibleEquity,
    'prior quarter',
  );
  const cet1Trend = getMetricTrend(latestCet1, priorCet1, 'prior quarter');
  const totalRbcTrend = getMetricTrend(latestTotalRbc, priorTotalRbc, 'prior quarter');
  const assetsTrend = getMetricTrend(latestPoint?.asset, priorPoint?.asset, 'prior quarter');
  const liabilitiesTrend = getMetricTrend(
    latestLiabilities,
    priorLiabilities,
    'prior quarter',
  );
  const equityTrend = getMetricTrend(latestPoint?.eq, priorPoint?.eq, 'prior quarter');
  const loansTrend = getMetricTrend(latestPoint?.lnlsgr, priorPoint?.lnlsgr, 'prior quarter');
  const depositsTrend = getMetricTrend(latestPoint?.dep, priorPoint?.dep, 'prior quarter');
  const loanDepositTrend = getMetricTrend(
    latestLoanDepositRatio,
    priorLoanDepositRatio,
    'prior quarter',
  );
  const rwaTrend = getMetricTrend(latestRwa, priorRwa, 'prior quarter');
  const coreDepositsTrend = getMetricTrend(
    latestCoreDeposits,
    priorCoreDeposits,
    'prior quarter',
  );
  const brokeredDepositsTrend = getMetricTrend(
    latestBrokeredDeposits,
    priorBrokeredDeposits,
    'prior quarter',
  );
  const coreDepositRatioTrend = getMetricTrend(
    latestCoreDepositRatio,
    priorCoreDepositRatio,
    'prior quarter',
  );
  const nimYearTrend = getMetricTrend(latestNim, yearAgoPoint?.nimy, 'prior year');
  const roaYearTrend = getMetricTrend(latestPoint?.roa, yearAgoPoint?.roa, 'prior year');
  const roeYearTrend = getMetricTrend(latestPoint?.roe, yearAgoPoint?.roe, 'prior year');
  const interestIncomeYearTrend = getMetricTrend(
    latestInterestIncome,
    yearAgoPoint?.INTINCY,
    'prior year',
  );
  const interestExpenseYearTrend = getMetricTrend(
    latestInterestExpense,
    yearAgoPoint?.INTEXPY,
    'prior year',
  );
  const tangibleEquityYearTrend = getMetricTrend(
    latestTangibleEquity,
    yearAgoPoint?.eqtanqta,
    'prior year',
  );
  const cet1YearTrend = getMetricTrend(latestCet1, yearAgoPoint?.rbct1cer, 'prior year');
  const totalRbcYearTrend = getMetricTrend(latestTotalRbc, yearAgoPoint?.rbcrwaj, 'prior year');
  const assetsYearTrend = getMetricTrend(latestPoint?.asset, yearAgoPoint?.asset, 'prior year');
  const liabilitiesYearTrend = getMetricTrend(
    latestLiabilities,
    getLiabilitiesValue(yearAgoPoint),
    'prior year',
  );
  const equityYearTrend = getMetricTrend(latestPoint?.eq, yearAgoPoint?.eq, 'prior year');
  const loansYearTrend = getMetricTrend(latestPoint?.lnlsgr, yearAgoPoint?.lnlsgr, 'prior year');
  const depositsYearTrend = getMetricTrend(latestPoint?.dep, yearAgoPoint?.dep, 'prior year');
  const loanDepositYearTrend = getMetricTrend(
    latestLoanDepositRatio,
    yearAgoPoint?.lnlsdepr,
    'prior year',
  );
  const rwaYearTrend = getMetricTrend(latestRwa, yearAgoPoint?.rwa, 'prior year');
  const coreDepositsYearTrend = getMetricTrend(
    latestCoreDeposits,
    yearAgoPoint?.coredep,
    'prior year',
  );
  const brokeredDepositsYearTrend = getMetricTrend(
    latestBrokeredDeposits,
    yearAgoPoint?.bro,
    'prior year',
  );
  const coreDepositRatioYearTrend = getMetricTrend(
    latestCoreDepositRatio,
    getCoreDepositRatio(yearAgoPoint),
    'prior year',
  );

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
    if (!selectedAssetSegment || segmentLiquidityLoading) {
      return;
    }

    if (segmentLiquiditySegment === selectedAssetSegment && segmentLiquidityData.length > 0) {
      return;
    }

    const fetchSegmentLiquidity = async () => {
      setSegmentLiquidityLoading(true);
      setSegmentLiquidityError(null);
      try {
        const response = await fetch(
          `${API_BASE}/segment-liquidity?segment=${encodeURIComponent(selectedAssetSegment)}`,
        );
        if (!response.ok) {
          throw new Error('Failed to load segment liquidity averages');
        }
        const data = await response.json();
        setSegmentLiquidityData(data.results ?? []);
        setSegmentLiquiditySegment(selectedAssetSegment);
      } catch (err) {
        setSegmentLiquidityError(err.message);
        setSegmentLiquidityData([]);
        setSegmentLiquiditySegment(selectedAssetSegment);
      } finally {
        setSegmentLiquidityLoading(false);
      }
    };

    fetchSegmentLiquidity();
  }, [
    segmentLiquidityData.length,
    segmentLiquidityLoading,
    segmentLiquiditySegment,
    selectedAssetSegment,
  ]);

  useEffect(() => {
    if (!selectedAssetSegment) {
      setSegmentBankCount(null);
      setSegmentBankCountError(null);
      return;
    }

    const fetchSegmentBankCount = async () => {
      setSegmentBankCountError(null);
      try {
        const response = await fetch(
          `${API_BASE}/segment-bank-count?segment=${encodeURIComponent(selectedAssetSegment)}`,
        );
        if (!response.ok) {
          throw new Error('Failed to load peer group count');
        }
        const data = await response.json();
        setSegmentBankCount(data.count ?? null);
      } catch (err) {
        setSegmentBankCountError(err.message);
        setSegmentBankCount(null);
      }
    };

    fetchSegmentBankCount();
  }, [selectedAssetSegment]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleBeforePrint = () => setPrintAllTabs(true);
    const handleAfterPrint = () => setPrintAllTabs(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    setPrintAllTabs(true);
    window.setTimeout(() => window.print(), 50);
  };

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
    <main
      className={`${styles.main} ${
        theme === 'night' ? styles.themeNight : styles.themeDay
      }`}
    >
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <p className={styles.kicker}>FDIC Call Report explorer</p>
          <h1 className={styles.title}>Search by Bank and view performance metrics</h1>
          <h2 className={styles.secondaryTitle}>National Averages and Peer Group Trends</h2>
          <p className={styles.subtitle}>
            Start typing a bank name to view assets, equity, and ROA over time.
          </p>
          <div className={styles.headerLinks}>
            <Link className={styles.headerLink} href="/national-averages">
              View national averages overview
            </Link>
            <Link className={styles.headerLink} href="/smart-pricing">
              Smart Pricing
            </Link>
          </div>
        </div>
        <div className={styles.headerActions}>
          <ThemeToggle theme={theme} onChange={setTheme} />
          <button type="button" className={styles.printButton} onClick={handlePrint}>
            Print dashboard
          </button>
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
                    <span className={styles.suggestionDetails}>
                      <span className={styles.suggestionName}>{item.nameFull}</span>
                      {item.stateName && (
                        <span className={styles.suggestionState}>{item.stateName}</span>
                      )}
                    </span>
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
            {(segmentBankCount != null || segmentBankCountError) && (
              <p className={styles.peerGroupCount}>
                {segmentBankCountError
                  ? segmentBankCountError
                  : `Number of Banks within Peer Group: ${segmentBankCount.toLocaleString(
                      'en-US',
                    )}`}
              </p>
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

          {(activeTab === 'portfolio' || printAllTabs) && (
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
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Assets</p>
                      {assetsYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            assetsYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${assetsYearTrend.label}`}
                          title={`Year over year change: ${assetsYearTrend.label}`}
                        >
                          YoY {assetsYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestPoint?.asset)}</p>
                      {assetsTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            assetsTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={assetsTrend.label}
                          title={assetsTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {assetsTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Liabilities</p>
                      {liabilitiesYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            liabilitiesYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${liabilitiesYearTrend.label}`}
                          title={`Year over year change: ${liabilitiesYearTrend.label}`}
                        >
                          YoY {liabilitiesYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestLiabilities)}</p>
                      {liabilitiesTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            liabilitiesTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={liabilitiesTrend.label}
                          title={liabilitiesTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {liabilitiesTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Equity</p>
                      {equityYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            equityYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${equityYearTrend.label}`}
                          title={`Year over year change: ${equityYearTrend.label}`}
                        >
                          YoY {equityYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestPoint?.eq)}</p>
                      {equityTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            equityTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={equityTrend.label}
                          title={equityTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {equityTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Total loans &amp; leases</p>
                      {loansYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            loansYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${loansYearTrend.label}`}
                          title={`Year over year change: ${loansYearTrend.label}`}
                        >
                          YoY {loansYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestPoint?.lnlsgr)}</p>
                      {loansTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            loansTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={loansTrend.label}
                          title={loansTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {loansTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Total deposits</p>
                      {depositsYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            depositsYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${depositsYearTrend.label}`}
                          title={`Year over year change: ${depositsYearTrend.label}`}
                        >
                          YoY {depositsYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestPoint?.dep)}</p>
                      {depositsTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            depositsTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={depositsTrend.label}
                          title={depositsTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {depositsTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Loan to deposit ratio</p>
                      {loanDepositYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            loanDepositYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${loanDepositYearTrend.label}`}
                          title={`Year over year change: ${loanDepositYearTrend.label}`}
                        >
                          YoY {loanDepositYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatPercentage(latestLoanDepositRatio)}
                      </p>
                      {loanDepositTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            loanDepositTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={loanDepositTrend.label}
                          title={loanDepositTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {loanDepositTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Risk-weighted assets</p>
                      {rwaYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            rwaYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${rwaYearTrend.label}`}
                          title={`Year over year change: ${rwaYearTrend.label}`}
                        >
                          YoY {rwaYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestRwa)}</p>
                      {rwaTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            rwaTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={rwaTrend.label}
                          title={rwaTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {rwaTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Int Income</p>
                      {interestIncomeYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            interestIncomeYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${interestIncomeYearTrend.label}`}
                          title={`Year over year change: ${interestIncomeYearTrend.label}`}
                        >
                          YoY {interestIncomeYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatNumber(latestInterestIncome)}
                      </p>
                      {interestIncomeTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            interestIncomeTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={interestIncomeTrend.label}
                          title={interestIncomeTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {interestIncomeTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Int Exp</p>
                      {interestExpenseYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            interestExpenseYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${interestExpenseYearTrend.label}`}
                          title={`Year over year change: ${interestExpenseYearTrend.label}`}
                        >
                          YoY {interestExpenseYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatNumber(latestInterestExpense)}
                      </p>
                      {interestExpenseTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            interestExpenseTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={interestExpenseTrend.label}
                          title={interestExpenseTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {interestExpenseTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>NIM</p>
                      {nimYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            nimYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${nimYearTrend.label}`}
                          title={`Year over year change: ${nimYearTrend.label}`}
                        >
                          YoY {nimYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatPercentage(latestNim)}</p>
                      {nimTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            nimTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={nimTrend.label}
                          title={nimTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {nimTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>ROA</p>
                      {roaYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            roaYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${roaYearTrend.label}`}
                          title={`Year over year change: ${roaYearTrend.label}`}
                        >
                          YoY {roaYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatPercentage(latestPoint?.roa)}
                      </p>
                      {roaTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            roaTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={roaTrend.label}
                          title={roaTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {roaTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>ROE</p>
                      {roeYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            roeYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${roeYearTrend.label}`}
                          title={`Year over year change: ${roeYearTrend.label}`}
                        >
                          YoY {roeYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatPercentage(latestPoint?.roe)}
                      </p>
                      {roeTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            roeTrend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={roeTrend.label}
                          title={roeTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {roeTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
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
                    <div
                      className={styles.chartViewToggle}
                      role="group"
                      aria-label="Portfolio quarter range"
                    >
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          portfolioView === 'latest' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setPortfolioView('latest')}
                        aria-pressed={portfolioView === 'latest'}
                      >
                        Latest 9
                      </button>
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          portfolioView === 'latest4' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setPortfolioView('latest4')}
                        aria-pressed={portfolioView === 'latest4'}
                      >
                        Latest 4 Qtrs
                      </button>
                    </div>
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
                        <div className={styles.chartScroll}>
                          <div
                            className={styles.chartScrollInner}
                            style={{
                              minWidth: getPortfolioAxisMinWidthForView(
                                portfolioSeries.length,
                                portfolioView,
                              ),
                            }}
                          >
                            <div
                              className={styles.barChart}
                              role="figure"
                              aria-label="Assets by quarter"
                              style={{
                                gridTemplateColumns: `repeat(${portfolioSeries.length}, minmax(0, 1fr))`,
                              }}
                            >
                              {portfolioSeries.map((point) => (
                                <div key={point.label} className={styles.barColumn}>
                                  <div
                                    className={styles.barWrapper}
                                    tabIndex={0}
                                    aria-label={`${point.label} assets ${formatNumber(point.asset)}`}
                                  >
                                    <span className={styles.barTooltip} role="tooltip">
                                      {formatNumber(point.asset)}
                                    </span>
                                    <div
                                      className={`${styles.bar} ${styles.assetBar}`}
                                      style={{ height: `${point.assetPercentage}%` }}
                                    />
                                  </div>
                                  <span className={styles.barLabel}>
                                    {formatQuarterShortLabel(point.label)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
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
                        <div className={styles.chartScroll}>
                          <div
                            className={styles.chartScrollInner}
                            style={{
                              minWidth: getPortfolioAxisMinWidthForView(
                                portfolioSeries.length,
                                portfolioView,
                              ),
                            }}
                          >
                            <div
                              className={styles.barChart}
                              role="figure"
                              aria-label="Equity by quarter"
                              style={{
                                gridTemplateColumns: `repeat(${portfolioSeries.length}, minmax(0, 1fr))`,
                              }}
                            >
                              {portfolioSeries.map((point) => (
                                <div key={point.label} className={styles.barColumn}>
                                  <div
                                    className={styles.barWrapper}
                                    tabIndex={0}
                                    aria-label={`${point.label} equity ${formatNumber(point.equity)}`}
                                  >
                                    <span className={styles.barTooltip} role="tooltip">
                                      {formatNumber(point.equity)}
                                    </span>
                                    <div
                                      className={`${styles.bar} ${styles.equityBar}`}
                                      style={{ height: `${point.equityPercentage}%` }}
                                    />
                                  </div>
                                  <span className={styles.barLabel}>
                                    {formatQuarterShortLabel(point.label)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              </section>
            </div>
          )}

          {(activeTab === 'asset-quality' || printAllTabs) && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Asset Quality</h3>
                <p className={styles.assetQualityText}>
                  Latest delinquency metrics from the call report. Values shown are in thousands.
                </p>
                <div className={`${styles.metricsGrid} ${styles.assetQualityMetricsGrid}`}>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>30-89 Delinquencies</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.P3Asset)}</p>
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
                    <p className={styles.metricName}>Non-Performing Assets</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.nperf)}</p>
                  </div>
                  <div className={styles.metricCard}>
                    <p className={styles.metricName}>Loans and Leases C/O&apos;s</p>
                    <p className={styles.metricValue}>{formatNumber(latestPoint?.DRLNLSQ)}</p>
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

                <section className={`${styles.chartSection} ${styles.assetQualityChartSection}`}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <p className={styles.chartKicker}>Quarterly trends</p>
                      <h3 className={styles.sectionTitle}>Asset quality delinquencies</h3>
                    </div>
                    <div className={styles.sectionHeaderMeta}>
                      <p className={styles.chartHint}>Values shown are in thousands</p>
                      <div
                        className={styles.chartViewToggle}
                        role="group"
                        aria-label="Asset quality quarter range"
                      >
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          assetQualityView === 'latest' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setAssetQualityView('latest')}
                        aria-pressed={assetQualityView === 'latest'}
                      >
                        Latest 9
                      </button>
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          assetQualityView === 'latest4' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setAssetQualityView('latest4')}
                        aria-pressed={assetQualityView === 'latest4'}
                      >
                        Latest 4 Qtrs
                      </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartGrid}>
                    <div className={styles.chartCard}>
                      <div className={styles.lineChartBlock}>
                        <div className={styles.lineChartHeader}>
                          <h4 className={styles.lineChartTitle}>30-89 day delinquencies</h4>
                          <p className={styles.lineChartSubhead}>Early-stage past due</p>
                        </div>
                        <div className={styles.lineChartBody}>
                          <span className={styles.lineChartYAxis}>Thousands</span>
                          {assetQualityColumnData.delinq3089.max != null && (
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(assetQualityColumnData.delinq3089.max)}
                            </span>
                          )}
                          {assetQualityColumnData.delinq3089.min != null && (
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              {formatNumber(assetQualityColumnData.delinq3089.min)}
                            </span>
                          )}
                          {assetQualityColumnData.delinq3089.hasData ? (
                            <div
                              className={styles.columnChartGrid}
                              role="img"
                              aria-label="30-89 day delinquencies column chart"
                              style={{
                                gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                                minWidth: getAxisMinWidth(
                                  assetQualityViewSeries.length,
                                  assetQualityColumnWidth,
                                ),
                              }}
                            >
                              {assetQualityColumnData.delinq3089.values.map((point) => (
                                <div
                                  key={`delinq3089-${point.label}`}
                                  className={styles.columnChartBarWrapper}
                                  title={
                                    point.value == null
                                      ? `${point.label}: N/A`
                                      : `${point.label}: ${formatNumber(point.value)}`
                                  }
                                >
                                  <div
                                    className={`${styles.columnChartBar} ${styles.delinq3089ColumnBar} ${
                                      point.value == null ? styles.columnChartBarEmpty : ''
                                    }`}
                                    style={{ height: `${point.percentage}%` }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.status}>No 30-89 day delinquency data.</p>
                          )}
                        </div>
                        <div
                          className={`${styles.lineChartLabels} ${styles.assetQualityChartLabels}`}
                          style={{
                            gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                            minWidth: getAxisMinWidth(
                              assetQualityViewSeries.length,
                              assetQualityColumnWidth,
                            ),
                          }}
                        >
                          {assetQualityViewSeries.map((point) => (
                            <span key={`delinq3089-label-${point.label}`}>
                              {formatQuarterShortLabel(point.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chartCard}>
                      <div className={styles.lineChartBlock}>
                        <div className={styles.lineChartHeader}>
                          <h4 className={styles.lineChartTitle}>90+ day delinquencies</h4>
                          <p className={styles.lineChartSubhead}>Later-stage past due</p>
                        </div>
                        <div className={styles.lineChartBody}>
                          <span className={styles.lineChartYAxis}>Thousands</span>
                          {assetQualityColumnData.delinq90.max != null && (
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(assetQualityColumnData.delinq90.max)}
                            </span>
                          )}
                          {assetQualityColumnData.delinq90.min != null && (
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              {formatNumber(assetQualityColumnData.delinq90.min)}
                            </span>
                          )}
                          {assetQualityColumnData.delinq90.hasData ? (
                            <div
                              className={styles.columnChartGrid}
                              role="img"
                              aria-label="90+ day delinquencies column chart"
                              style={{
                                gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                                minWidth: getAxisMinWidth(
                                  assetQualityViewSeries.length,
                                  assetQualityColumnWidth,
                                ),
                              }}
                            >
                              {assetQualityColumnData.delinq90.values.map((point) => (
                                <div
                                  key={`delinq90-${point.label}`}
                                  className={styles.columnChartBarWrapper}
                                  title={
                                    point.value == null
                                      ? `${point.label}: N/A`
                                      : `${point.label}: ${formatNumber(point.value)}`
                                  }
                                >
                                  <div
                                    className={`${styles.columnChartBar} ${styles.delinq90ColumnBar} ${
                                      point.value == null ? styles.columnChartBarEmpty : ''
                                    }`}
                                    style={{ height: `${point.percentage}%` }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.status}>No 90+ day delinquency data.</p>
                          )}
                        </div>
                        <div
                          className={`${styles.lineChartLabels} ${styles.assetQualityChartLabels}`}
                          style={{
                            gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                            minWidth: getAxisMinWidth(
                              assetQualityViewSeries.length,
                              assetQualityColumnWidth,
                            ),
                          }}
                        >
                          {assetQualityViewSeries.map((point) => (
                            <span key={`delinq90-label-${point.label}`}>
                              {formatQuarterShortLabel(point.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chartCard}>
                      <div className={styles.lineChartBlock}>
                        <div className={styles.lineChartHeader}>
                          <h4 className={styles.lineChartTitle}>Non-accruals</h4>
                          <p className={styles.lineChartSubhead}>Loans not accruing interest</p>
                        </div>
                        <div className={styles.lineChartBody}>
                          <span className={styles.lineChartYAxis}>Thousands</span>
                          {assetQualityColumnData.nonAccruals.max != null && (
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(assetQualityColumnData.nonAccruals.max)}
                            </span>
                          )}
                          {assetQualityColumnData.nonAccruals.min != null && (
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              {formatNumber(assetQualityColumnData.nonAccruals.min)}
                            </span>
                          )}
                          {assetQualityColumnData.nonAccruals.hasData ? (
                            <div
                              className={styles.columnChartGrid}
                              role="img"
                              aria-label="Non-accruals column chart"
                              style={{
                                gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                                minWidth: getAxisMinWidth(
                                  assetQualityViewSeries.length,
                                  assetQualityColumnWidth,
                                ),
                              }}
                            >
                              {assetQualityColumnData.nonAccruals.values.map((point) => (
                                <div
                                  key={`nonAccruals-${point.label}`}
                                  className={styles.columnChartBarWrapper}
                                  title={
                                    point.value == null
                                      ? `${point.label}: N/A`
                                      : `${point.label}: ${formatNumber(point.value)}`
                                  }
                                >
                                  <div
                                    className={`${styles.columnChartBar} ${styles.nonAccrualsColumnBar} ${
                                      point.value == null ? styles.columnChartBarEmpty : ''
                                    }`}
                                    style={{ height: `${point.percentage}%` }}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className={styles.status}>No non-accrual data available.</p>
                          )}
                        </div>
                        <div
                          className={`${styles.lineChartLabels} ${styles.assetQualityChartLabels}`}
                          style={{
                            gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                            minWidth: getAxisMinWidth(
                              assetQualityViewSeries.length,
                              assetQualityColumnWidth,
                            ),
                          }}
                        >
                          {assetQualityViewSeries.map((point) => (
                            <span key={`nonAccruals-label-${point.label}`}>
                              {formatQuarterShortLabel(point.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chartCard}>
                      <div className={styles.lineChartBlock}>
                        <div className={styles.lineChartHeader}>
                          <h4 className={styles.lineChartTitle}>Non-performing assets (NPA)</h4>
                          <p className={styles.lineChartSubhead}>Delinquencies plus non-accruals</p>
                        </div>
                        <div className={styles.lineChartBody}>
                          <span className={styles.lineChartYAxis}>Thousands</span>
                          <span className={styles.lineChartYAxisRight}>Percent</span>
                          {assetQualityColumnData.npa.max != null && (
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(assetQualityColumnData.npa.max)}
                            </span>
                          )}
                          {assetQualityColumnData.npa.min != null && (
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              {formatNumber(assetQualityColumnData.npa.min)}
                            </span>
                          )}
                          {assetQualityColumnData.npaRatio.max != null && (
                            <span className={styles.lineChartTickRight} style={{ top: '12%' }}>
                              {formatPercentage(assetQualityColumnData.npaRatio.max)}
                            </span>
                          )}
                          {assetQualityColumnData.npaRatio.min != null && (
                            <span className={styles.lineChartTickRight} style={{ top: '88%' }}>
                              {formatPercentage(assetQualityColumnData.npaRatio.min)}
                            </span>
                          )}
                          {assetQualityColumnData.npa.hasData ? (
                            <>
                              <div
                                className={styles.columnChartGrid}
                                role="img"
                                aria-label="Non-performing assets column chart"
                                style={{
                                  gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                                  minWidth: getAxisMinWidth(
                                    assetQualityViewSeries.length,
                                    assetQualityColumnWidth,
                                  ),
                                }}
                              >
                                {assetQualityColumnData.npa.values.map((point) => (
                                  <div
                                    key={`npa-${point.label}`}
                                    className={styles.columnChartBarWrapper}
                                    title={
                                      point.value == null
                                        ? `${point.label}: N/A`
                                        : `${point.label}: ${formatNumber(point.value)}`
                                    }
                                  >
                                    <div
                                      className={`${styles.columnChartBar} ${styles.npaColumnBar} ${
                                        point.value == null ? styles.columnChartBarEmpty : ''
                                      }`}
                                      style={{ height: `${point.percentage}%` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {assetQualityColumnData.npaRatio.hasData && (
                                <div
                                  className={`${styles.ratioLineChartWrapper} ${styles.ratioLineChartOverlay}`}
                                  aria-hidden="true"
                                  style={{
                                    minWidth: getAxisMinWidth(
                                      assetQualityViewSeries.length,
                                      assetQualityColumnWidth,
                                    ),
                                  }}
                                >
                                  <svg
                                    className={styles.ratioLineChart}
                                    role="img"
                                    aria-label="Non-performing assets ratio line chart"
                                    viewBox={`0 0 ${npaRatioChart.width} ${npaRatioChart.height}`}
                                    width={npaRatioChart.width}
                                    height={npaRatioChart.height}
                                    preserveAspectRatio="none"
                                  >
                                    {npaRatioChart.segments.map((segment) => (
                                      <polyline
                                        key={`npa-ratio-segment-${segment[0].label}-${segment[segment.length - 1].label}`}
                                        className={styles.ratioLine}
                                        points={segment
                                          .map((point) => `${point.x},${point.y}`)
                                          .join(' ')}
                                      />
                                    ))}
                                    {npaRatioChart.points.map((point) =>
                                      point ? (
                                        <circle
                                          key={`npa-ratio-dot-${point.label}`}
                                          className={styles.ratioLineDot}
                                          cx={point.x}
                                          cy={point.y}
                                          r="4"
                                        >
                                          <title>
                                            {`${point.label}: ${formatPercentage(point.value)}`}
                                          </title>
                                        </circle>
                                      ) : null,
                                    )}
                                  </svg>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className={styles.status}>No NPA data available.</p>
                          )}
                        </div>
                        <div
                          className={`${styles.lineChartLabels} ${styles.assetQualityChartLabels}`}
                          style={{
                            gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                            minWidth: getAxisMinWidth(
                              assetQualityViewSeries.length,
                              assetQualityColumnWidth,
                            ),
                          }}
                        >
                          {assetQualityViewSeries.map((point) => (
                            <span key={`npa-label-${point.label}`}>
                              {formatQuarterShortLabel(point.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.chartCard}>
                      <div className={styles.lineChartBlock}>
                        <div className={styles.lineChartHeader}>
                          <h4 className={styles.lineChartTitle}>Loans &amp; leases C/O</h4>
                          <p className={styles.lineChartSubhead}>Charge-offs over time</p>
                        </div>
                        <div className={styles.lineChartBody}>
                          <span className={styles.lineChartYAxis}>Thousands</span>
                          <span className={styles.lineChartYAxisRight}>Percent</span>
                          {assetQualityColumnData.loanLeaseCO.max != null && (
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(assetQualityColumnData.loanLeaseCO.max)}
                            </span>
                          )}
                          {assetQualityColumnData.loanLeaseCO.min != null && (
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              {formatNumber(assetQualityColumnData.loanLeaseCO.min)}
                            </span>
                          )}
                          {assetQualityColumnData.netChargeOffRatio.max != null && (
                            <span className={styles.lineChartTickRight} style={{ top: '12%' }}>
                              {formatPercentage(assetQualityColumnData.netChargeOffRatio.max)}
                            </span>
                          )}
                          {assetQualityColumnData.netChargeOffRatio.min != null && (
                            <span className={styles.lineChartTickRight} style={{ top: '88%' }}>
                              {formatPercentage(assetQualityColumnData.netChargeOffRatio.min)}
                            </span>
                          )}
                          {assetQualityColumnData.loanLeaseCO.hasData ? (
                            <>
                              <div
                                className={styles.columnChartGrid}
                                role="img"
                                aria-label="Loans and leases charge-offs column chart"
                                style={{
                                  gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                                  minWidth: getAxisMinWidth(
                                    assetQualityViewSeries.length,
                                    assetQualityColumnWidth,
                                  ),
                                }}
                              >
                                {assetQualityColumnData.loanLeaseCO.values.map((point) => (
                                  <div
                                    key={`loanLeaseCO-${point.label}`}
                                    className={styles.columnChartBarWrapper}
                                    title={
                                      point.value == null
                                        ? `${point.label}: N/A`
                                        : `${point.label}: ${formatNumber(point.value)}`
                                    }
                                  >
                                    <div
                                      className={`${styles.columnChartBar} ${styles.loanLeaseCoColumnBar} ${
                                        point.value == null ? styles.columnChartBarEmpty : ''
                                      }`}
                                      style={{ height: `${point.percentage}%` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {assetQualityColumnData.netChargeOffRatio.hasData && (
                                <div
                                  className={`${styles.ratioLineChartWrapper} ${styles.ratioLineChartOverlay}`}
                                  aria-hidden="true"
                                  style={{
                                    minWidth: getAxisMinWidth(
                                      assetQualityViewSeries.length,
                                      assetQualityColumnWidth,
                                    ),
                                  }}
                                >
                                  <svg
                                    className={styles.ratioLineChart}
                                    role="img"
                                    aria-label="Net charge-offs to loans and leases ratio line chart"
                                    viewBox={`0 0 ${netChargeOffRatioChart.width} ${netChargeOffRatioChart.height}`}
                                    width={netChargeOffRatioChart.width}
                                    height={netChargeOffRatioChart.height}
                                    preserveAspectRatio="none"
                                  >
                                    {netChargeOffRatioChart.segments.map((segment) => (
                                      <polyline
                                        key={`net-chargeoff-segment-${segment[0].label}-${segment[segment.length - 1].label}`}
                                        className={styles.ratioLine}
                                        points={segment
                                          .map((point) => `${point.x},${point.y}`)
                                          .join(' ')}
                                      />
                                    ))}
                                    {netChargeOffRatioChart.points.map((point) =>
                                      point ? (
                                        <circle
                                          key={`net-chargeoff-dot-${point.label}`}
                                          className={styles.ratioLineDot}
                                          cx={point.x}
                                          cy={point.y}
                                          r="4"
                                        >
                                          <title>
                                            {`${point.label}: ${formatPercentage(point.value)}`}
                                          </title>
                                        </circle>
                                      ) : null,
                                    )}
                                  </svg>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className={styles.status}>No charge-off data available.</p>
                          )}
                        </div>
                        <div
                          className={`${styles.lineChartLabels} ${styles.assetQualityChartLabels}`}
                          style={{
                            gridTemplateColumns: `repeat(${assetQualityViewSeries.length}, minmax(0, ${assetQualityColumnWidth}px))`,
                            minWidth: getAxisMinWidth(
                              assetQualityViewSeries.length,
                              assetQualityColumnWidth,
                            ),
                          }}
                        >
                          {assetQualityViewSeries.map((point) => (
                            <span key={`loanLeaseCO-label-${point.label}`}>
                              {formatQuarterShortLabel(point.label)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                </section>
              </section>
            </div>
          )}

          {(activeTab === 'profitability' || printAllTabs) && (
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
                    <div
                      className={styles.chartViewToggle}
                      role="group"
                      aria-label="Profitability quarter range"
                    >
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          profitabilityView === 'latest' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setProfitabilityView('latest')}
                        aria-pressed={profitabilityView === 'latest'}
                      >
                        Latest 9
                      </button>
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          profitabilityView === 'latest4' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setProfitabilityView('latest4')}
                        aria-pressed={profitabilityView === 'latest4'}
                      >
                        Latest 4 Qtrs
                      </button>
                    </div>
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
                        {profitabilityColumnData.nim.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityColumnData.nim.max)}
                          </span>
                        )}
                        {profitabilityColumnData.nim.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityColumnData.nim.min)}
                          </span>
                        )}
                        {profitabilityColumnData.nim.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Net interest margin column chart"
                            style={{
                              gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                              minWidth: getProfitabilityAxisMinWidthForView(
                                profitabilityViewSeries.length,
                                profitabilityView,
                              ),
                            }}
                          >
                            {profitabilityColumnData.nim.values.map((point) => (
                              <div
                                key={`nim-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.nimColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No NIM data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.profitabilityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                          minWidth: getProfitabilityAxisMinWidthForView(
                            profitabilityViewSeries.length,
                            profitabilityView,
                          ),
                        }}
                      >
                        {profitabilityViewSeries.map((point) => (
                          <span key={`nim-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
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
                        {profitabilityColumnData.roa.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityColumnData.roa.max)}
                          </span>
                        )}
                        {profitabilityColumnData.roa.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityColumnData.roa.min)}
                          </span>
                        )}
                        {profitabilityColumnData.roa.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Return on assets column chart"
                            style={{
                              gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                              minWidth: getProfitabilityAxisMinWidthForView(
                                profitabilityViewSeries.length,
                                profitabilityView,
                              ),
                            }}
                          >
                            {profitabilityColumnData.roa.values.map((point) => (
                              <div
                                key={`roa-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.roaColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No ROA data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.profitabilityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                          minWidth: getProfitabilityAxisMinWidthForView(
                            profitabilityViewSeries.length,
                            profitabilityView,
                          ),
                        }}
                      >
                        {profitabilityViewSeries.map((point) => (
                          <span key={`roa-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
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
                        {profitabilityColumnData.roe.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityColumnData.roe.max)}
                          </span>
                        )}
                        {profitabilityColumnData.roe.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityColumnData.roe.min)}
                          </span>
                        )}
                        {profitabilityColumnData.roe.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Return on equity column chart"
                            style={{
                              gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                              minWidth: getProfitabilityAxisMinWidthForView(
                                profitabilityViewSeries.length,
                                profitabilityView,
                              ),
                            }}
                          >
                            {profitabilityColumnData.roe.values.map((point) => (
                              <div
                                key={`roe-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.roeColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No ROE data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.profitabilityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${profitabilityViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                          minWidth: getProfitabilityAxisMinWidthForView(
                            profitabilityViewSeries.length,
                            profitabilityView,
                          ),
                        }}
                      >
                        {profitabilityViewSeries.map((point) => (
                          <span key={`roe-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>EEFFQR</h4>
                        <p className={styles.lineChartSubhead}>Operating expense control</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {profitabilityColumnData.efficiencyRatio.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(profitabilityColumnData.efficiencyRatio.max)}
                          </span>
                        )}
                        {profitabilityColumnData.efficiencyRatio.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(profitabilityColumnData.efficiencyRatio.min)}
                          </span>
                        )}
                        {profitabilityColumnData.efficiencyRatio.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="EEFFQR column chart"
                            style={{
                              gridTemplateColumns: `repeat(${efficiencyViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                              minWidth: getProfitabilityAxisMinWidthForView(
                                efficiencyViewSeries.length,
                                profitabilityView,
                              ),
                            }}
                          >
                            {profitabilityColumnData.efficiencyRatio.values.map((point) => (
                              <div
                                key={`eff-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${
                                    styles.efficiencyColumnBar
                                  } ${point.value == null ? styles.columnChartBarEmpty : ''}`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No efficiency data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.profitabilityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${efficiencyViewSeries.length}, minmax(0, ${profitabilityColumnWidth}px))`,
                          minWidth: getProfitabilityAxisMinWidthForView(
                            efficiencyViewSeries.length,
                            profitabilityView,
                          ),
                        }}
                      >
                        {efficiencyViewSeries.map((point) => (
                          <span key={`eff-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
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
                  Track core funding strength and brokered reliance with deposit mix and loan to
                  deposit trends.
                </p>
              </section>
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
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Core deposits</p>
                      {coreDepositsYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            coreDepositsYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${coreDepositsYearTrend.label}`}
                          title={`Year over year change: ${coreDepositsYearTrend.label}`}
                        >
                          YoY {coreDepositsYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestCoreDeposits)}</p>
                      {coreDepositsTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            coreDepositsTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={coreDepositsTrend.label}
                          title={coreDepositsTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {coreDepositsTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Brokered deposits</p>
                      {brokeredDepositsYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            brokeredDepositsYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${brokeredDepositsYearTrend.label}`}
                          title={`Year over year change: ${brokeredDepositsYearTrend.label}`}
                        >
                          YoY {brokeredDepositsYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatNumber(latestBrokeredDeposits)}</p>
                      {brokeredDepositsTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            brokeredDepositsTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={brokeredDepositsTrend.label}
                          title={brokeredDepositsTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {brokeredDepositsTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Core deposits / total deposits</p>
                      {coreDepositRatioYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            coreDepositRatioYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${coreDepositRatioYearTrend.label}`}
                          title={`Year over year change: ${coreDepositRatioYearTrend.label}`}
                        >
                          YoY {coreDepositRatioYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatPercentage(latestCoreDepositRatio)}
                      </p>
                      {coreDepositRatioTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            coreDepositRatioTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={coreDepositRatioTrend.label}
                          title={coreDepositRatioTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {coreDepositRatioTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              <section className={styles.chartSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.chartKicker}>Trend lines</p>
                    <h3 className={styles.sectionTitle}>Liquidity funding trends</h3>
                  </div>
                  <div className={styles.sectionHeaderMeta}>
                    <p className={styles.chartHint}>Values shown are in thousands and percentages</p>
                    <div
                      className={styles.chartViewToggle}
                      role="group"
                      aria-label="Liquidity quarter range"
                    >
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          liquidityView === 'latest' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setLiquidityView('latest')}
                        aria-pressed={liquidityView === 'latest'}
                      >
                        Latest 9
                      </button>
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          liquidityView === 'latest4' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setLiquidityView('latest4')}
                        aria-pressed={liquidityView === 'latest4'}
                      >
                        Latest 4 Qtrs
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Core vs brokered deposits</h4>
                        <p className={styles.lineChartSubhead}>
                          Core deposit ratio overlay
                        </p>
                      </div>
                      <div className={styles.chartLegendRow} aria-hidden="true">
                        <div className={styles.legendItem}>
                          <span className={`${styles.legendSwatch} ${styles.legendCoreDeposits}`} />
                          <span className={styles.legendLabel}>Core</span>
                        </div>
                        <div className={styles.legendItem}>
                          <span
                            className={`${styles.legendSwatch} ${styles.legendBrokeredDeposits}`}
                          />
                          <span className={styles.legendLabel}>Brokered</span>
                        </div>
                        <div className={styles.legendItem}>
                          <span
                            className={`${styles.legendSwatch} ${styles.legendCoreRatio}`}
                          />
                          <span className={styles.legendLabel}>Core deposit ratio</span>
                        </div>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Thousands</span>
                        <span className={styles.lineChartYAxisRight}>Percent</span>
                        {liquidityStackedData.max > 0 && (
                          <>
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(liquidityStackedData.max)}
                            </span>
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              0
                            </span>
                          </>
                        )}
                        {coreDepositRatioChart.max != null && (
                          <span className={styles.lineChartTickRight} style={{ top: '12%' }}>
                            {formatPercentage(coreDepositRatioChart.max)}
                          </span>
                        )}
                        {coreDepositRatioChart.min != null && (
                          <span className={styles.lineChartTickRight} style={{ top: '88%' }}>
                            {formatPercentage(coreDepositRatioChart.min)}
                          </span>
                        )}
                        {liquidityStackedData.hasData ? (
                          <>
                            <div
                              className={styles.columnChartGrid}
                              role="img"
                              aria-label="Core and brokered deposits stacked column chart"
                              style={{
                                gridTemplateColumns: `repeat(${liquidityViewSeries.length}, minmax(0, ${liquidityColumnWidth}px))`,
                                minWidth: getAxisMinWidth(
                                  liquidityViewSeries.length,
                                  liquidityColumnWidth,
                                ),
                              }}
                            >
                              {liquidityStackedData.values.map((point) => (
                                <div
                                  key={`liquidity-deposits-${point.label}`}
                                  className={styles.columnChartBarWrapper}
                                  title={
                                    point.total == null
                                      ? `${point.label}: N/A`
                                      : `${point.label}: Core ${formatNumber(
                                          point.coreDeposits,
                                        )} | Brokered ${formatNumber(point.brokeredDeposits)}`
                                  }
                                >
                                  <div
                                    className={`${styles.stackedColumnBar} ${
                                      point.total == null ? styles.stackedColumnBarEmpty : ''
                                    }`}
                                  >
                                    <div
                                      className={`${styles.stackedSegment} ${styles.stackedSegmentBrokered}`}
                                      style={{ height: `${point.brokeredDepositsPercent}%` }}
                                    />
                                    <div
                                      className={`${styles.stackedSegment} ${styles.stackedSegmentCore}`}
                                      style={{ height: `${point.coreDepositsPercent}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            {coreDepositRatioChart.hasData && (
                              <div
                                className={`${styles.ratioLineChartWrapper} ${styles.ratioLineChartOverlay}`}
                                aria-hidden="true"
                                style={{
                                  minWidth: getAxisMinWidth(
                                    liquidityViewSeries.length,
                                    liquidityColumnWidth,
                                  ),
                                }}
                              >
                                <svg
                                  className={styles.ratioLineChart}
                                  role="img"
                                  aria-label="Core deposit ratio line chart"
                                  viewBox={`0 0 ${coreDepositRatioChart.width} ${coreDepositRatioChart.height}`}
                                  width={coreDepositRatioChart.width}
                                  height={coreDepositRatioChart.height}
                                  preserveAspectRatio="none"
                                >
                                  {coreDepositRatioChart.segments.map((segment) => (
                                    <polyline
                                      key={`core-deposit-segment-${segment[0].label}-${segment[segment.length - 1].label}`}
                                      className={styles.ratioLine}
                                      points={segment
                                        .map((point) => `${point.x},${point.y}`)
                                        .join(' ')}
                                    />
                                  ))}
                                  {coreDepositRatioChart.points.map((point) =>
                                    point ? (
                                      <circle
                                        key={`core-deposit-dot-${point.label}`}
                                        className={styles.ratioLineDot}
                                        cx={point.x}
                                        cy={point.y}
                                        r="4"
                                      >
                                        <title>
                                          {`${point.label}: ${formatPercentage(point.value)}`}
                                        </title>
                                      </circle>
                                    ) : null,
                                  )}
                                </svg>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className={styles.status}>No core deposit data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.liquidityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${liquidityViewSeries.length}, minmax(0, ${liquidityColumnWidth}px))`,
                          minWidth: getAxisMinWidth(
                            liquidityViewSeries.length,
                            liquidityColumnWidth,
                          ),
                        }}
                      >
                        {liquidityViewSeries.map((point) => (
                          <span key={`core-deposit-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>LNLSDEPR</h4>
                        <p className={styles.lineChartSubhead}>Loan to deposit ratio trend</p>
                      </div>
                      <div className={styles.chartLegendRow} aria-hidden="true">
                        <div className={styles.legendItem}>
                          <span className={`${styles.legendSwatch} ${styles.legendLoanDeposit}`} />
                          <span className={styles.legendLabel}>Bank</span>
                        </div>
                        <div className={styles.legendItem}>
                          <span
                            className={`${styles.legendSwatch} ${styles.legendLoanDepositAverage}`}
                          />
                          <span className={styles.legendLabel}>Segment average</span>
                        </div>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {loanDepositRatioChart.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(loanDepositRatioChart.max)}
                          </span>
                        )}
                        {loanDepositRatioChart.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(loanDepositRatioChart.min)}
                          </span>
                        )}
                        {loanDepositRatioChart.hasData ? (
                          <>
                            <div
                              className={styles.ratioLineChartWrapper}
                              style={{
                                minWidth: getAxisMinWidth(
                                  liquidityViewSeries.length,
                                  liquidityColumnWidth,
                                ),
                              }}
                            >
                              <svg
                                className={styles.ratioLineChart}
                                role="img"
                                aria-label="Loan to deposit ratio line chart"
                                viewBox={`0 0 ${loanDepositRatioChart.width} ${loanDepositRatioChart.height}`}
                                width={loanDepositRatioChart.width}
                                height={loanDepositRatioChart.height}
                                preserveAspectRatio="none"
                              >
                                {loanDepositRatioChart.segments.map((segment) => (
                                  <polyline
                                    key={`loan-deposit-segment-${segment[0].label}-${segment[segment.length - 1].label}`}
                                    className={styles.ratioLine}
                                    points={segment
                                      .map((point) => `${point.x},${point.y}`)
                                      .join(' ')}
                                  />
                                ))}
                                {loanDepositRatioChart.points.map((point) =>
                                  point ? (
                                    <circle
                                      key={`loan-deposit-dot-${point.label}`}
                                      className={styles.ratioLineDot}
                                      cx={point.x}
                                      cy={point.y}
                                      r="4"
                                    >
                                      <title>
                                        {`${point.label}: ${formatPercentage(point.value)}`}
                                      </title>
                                    </circle>
                                  ) : null,
                                )}
                                {segmentLoanDepositChart.segments.map((segment) => (
                                  <polyline
                                    key={`segment-loan-deposit-segment-${segment[0].label}-${segment[segment.length - 1].label}`}
                                    className={`${styles.ratioLine} ${styles.ratioLineAverage}`}
                                    points={segment
                                      .map((point) => `${point.x},${point.y}`)
                                      .join(' ')}
                                  />
                                ))}
                                {segmentLoanDepositChart.points.map((point) =>
                                  point ? (
                                    <circle
                                      key={`segment-loan-deposit-dot-${point.label}`}
                                      className={`${styles.ratioLineDot} ${styles.ratioLineAverageDot}`}
                                      cx={point.x}
                                      cy={point.y}
                                      r="4"
                                    >
                                      <title>
                                        {`${point.label}: ${formatPercentage(point.value)}`}
                                      </title>
                                    </circle>
                                  ) : null,
                                )}
                              </svg>
                            </div>
                            {segmentLiquidityError && (
                              <p className={styles.status}>{segmentLiquidityError}</p>
                            )}
                          </>
                        ) : (
                          <p className={styles.status}>
                            No loan to deposit ratio data available.
                          </p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.liquidityChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${liquidityViewSeries.length}, minmax(0, ${liquidityColumnWidth}px))`,
                          minWidth: getAxisMinWidth(
                            liquidityViewSeries.length,
                            liquidityColumnWidth,
                          ),
                        }}
                      >
                        {liquidityViewSeries.map((point) => (
                          <span key={`loan-deposit-label-${point.label}`}>
                            {formatQuarterShortLabel(point.label)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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

          {(activeTab === 'capital' || printAllTabs) && (
            <div className={styles.tabPanel} role="tabpanel">
              <section className={styles.assetQualityCard}>
                <h3 className={styles.assetQualityTitle}>Capital</h3>
                <p className={styles.assetQualityText}>
                  Latest capital ratios from the call report as of{' '}
                  {formatQuarterLabel(latestRatPoint?.callym)}.
                </p>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Tangible equity capital</p>
                      {tangibleEquityYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            tangibleEquityYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${tangibleEquityYearTrend.label}`}
                          title={`Year over year change: ${tangibleEquityYearTrend.label}`}
                        >
                          YoY {tangibleEquityYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>
                        {formatPercentage(latestTangibleEquity)}
                      </p>
                      {tangibleEquityTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            tangibleEquityTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={tangibleEquityTrend.label}
                          title={tangibleEquityTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {tangibleEquityTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>CET1</p>
                      {cet1YearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            cet1YearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${cet1YearTrend.label}`}
                          title={`Year over year change: ${cet1YearTrend.label}`}
                        >
                          YoY {cet1YearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatPercentage(latestCet1)}</p>
                      {cet1Trend && (
                        <span
                          className={`${styles.trendArrow} ${
                            cet1Trend.direction === 'up' ? styles.trendUp : styles.trendDown
                          }`}
                          aria-label={cet1Trend.label}
                          title={cet1Trend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {cet1Trend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.metricCard}>
                    <div className={styles.metricNameRow}>
                      <p className={styles.metricName}>Total RBC</p>
                      {totalRbcYearTrend && (
                        <span
                          className={`${styles.yoyTrend} ${
                            totalRbcYearTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={`Year over year change: ${totalRbcYearTrend.label}`}
                          title={`Year over year change: ${totalRbcYearTrend.label}`}
                        >
                          YoY {totalRbcYearTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                    <div className={styles.metricValueRow}>
                      <p className={styles.metricValue}>{formatPercentage(latestTotalRbc)}</p>
                      {totalRbcTrend && (
                        <span
                          className={`${styles.trendArrow} ${
                            totalRbcTrend.direction === 'up'
                              ? styles.trendUp
                              : styles.trendDown
                          }`}
                          aria-label={totalRbcTrend.label}
                          title={totalRbcTrend.label}
                        >
                          <span className={styles.qoqTrendText}>QoQ</span>
                          {totalRbcTrend.direction === 'up' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
              <section className={styles.chartSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <p className={styles.chartKicker}>Trend lines</p>
                    <h3 className={styles.sectionTitle}>Capital ratio trends</h3>
                  </div>
                  <div className={styles.sectionHeaderMeta}>
                    <p className={styles.chartHint}>Values shown are percentages</p>
                    <div
                      className={styles.chartViewToggle}
                      role="group"
                      aria-label="Capital quarter range"
                    >
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          capitalView === 'latest' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setCapitalView('latest')}
                        aria-pressed={capitalView === 'latest'}
                      >
                        Latest 9
                      </button>
                      <button
                        type="button"
                        className={`${styles.chartViewButton} ${
                          capitalView === 'latest4' ? styles.chartViewButtonActive : ''
                        }`}
                        onClick={() => setCapitalView('latest4')}
                        aria-pressed={capitalView === 'latest4'}
                      >
                        Latest 4 Qtrs
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`${styles.chartGrid} ${styles.capitalChartGrid}`}>
                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>
                          Tangible equity capital ratio
                        </h4>
                        <p className={styles.lineChartSubhead}>Equity strength</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.tangibleEquity.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.tangibleEquity.max)}
                          </span>
                        )}
                        {capitalColumnData.tangibleEquity.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.tangibleEquity.min)}
                          </span>
                        )}
                        {capitalColumnData.tangibleEquity.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Tangible equity capital ratio column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.tangibleEquity.values.map((point) => (
                              <div
                                key={`tangible-equity-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.tangibleEquityColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No tangible equity data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span
                            key={`tangible-equity-label-${point.label}`}
                            className={styles.capitalAxisLabel}
                          >
                            <span>{formatCapitalAxisLabel(point)}</span>
                            <span className={styles.capitalAxisCallYm}>
                              CallYM {point.callym ?? 'N/A'}
                            </span>
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>
                          Risk-based capital components
                        </h4>
                        <p className={styles.lineChartSubhead}>
                          RBCT1 and RBCT2 by quarter
                        </p>
                      </div>
                      <div className={styles.chartLegendRow} aria-hidden="true">
                        <div className={styles.legendItem}>
                          <span className={`${styles.legendSwatch} ${styles.legendRbct1}`} />
                          <span className={styles.legendLabel}>RBCT1</span>
                        </div>
                        <div className={styles.legendItem}>
                          <span className={`${styles.legendSwatch} ${styles.legendRbct2}`} />
                          <span className={styles.legendLabel}>RBCT2</span>
                        </div>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Thousands</span>
                        {capitalStackedData.max > 0 && (
                          <>
                            <span className={styles.lineChartTick} style={{ top: '12%' }}>
                              {formatNumber(capitalStackedData.max)}
                            </span>
                            <span className={styles.lineChartTick} style={{ top: '88%' }}>
                              0
                            </span>
                          </>
                        )}
                        {capitalStackedData.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Risk-based capital components stacked column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalStackedData.values.map((point) => (
                              <div
                                key={`capital-components-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.total == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: RBCT1 ${formatNumber(point.rbct1)} | RBCT2 ${formatNumber(point.rbct2)}`
                                }
                              >
                                <div
                                  className={`${styles.stackedColumnBar} ${
                                    point.total == null ? styles.stackedColumnBarEmpty : ''
                                  }`}
                                >
                                  <div
                                    className={`${styles.stackedSegment} ${styles.stackedSegmentRbct1}`}
                                    style={{ height: `${point.rbct1Percent}%` }}
                                  />
                                  <div
                                    className={`${styles.stackedSegment} ${styles.stackedSegmentRbct2}`}
                                    style={{ height: `${point.rbct2Percent}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No risk-based capital data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`capital-components-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>C&amp;I loans to Tier 1</h4>
                        <p className={styles.lineChartSubhead}>Commercial exposure</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.ciLoans.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.ciLoans.max)}
                          </span>
                        )}
                        {capitalColumnData.ciLoans.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.ciLoans.min)}
                          </span>
                        )}
                        {capitalColumnData.ciLoans.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="C&I loans to Tier 1 capital column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.ciLoans.values.map((point) => (
                              <div
                                key={`ci-loans-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.ciLoansColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No C&amp;I loan data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`ci-loans-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>RE loans to Tier 1</h4>
                        <p className={styles.lineChartSubhead}>Real estate exposure</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.reLoans.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.reLoans.max)}
                          </span>
                        )}
                        {capitalColumnData.reLoans.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.reLoans.min)}
                          </span>
                        )}
                        {capitalColumnData.reLoans.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Real estate loans to Tier 1 capital column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.reLoans.values.map((point) => (
                              <div
                                key={`re-loans-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.reLoansColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No real estate loan data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`re-loans-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>Consumer loans to Tier 1</h4>
                        <p className={styles.lineChartSubhead}>Household credit share</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.consumerLoans.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.consumerLoans.max)}
                          </span>
                        )}
                        {capitalColumnData.consumerLoans.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.consumerLoans.min)}
                          </span>
                        )}
                        {capitalColumnData.consumerLoans.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Consumer loans to Tier 1 capital column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.consumerLoans.values.map((point) => (
                              <div
                                key={`consumer-loans-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.consumerLoansColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No consumer loan data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`consumer-loans-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>High risk loans to Tier 1</h4>
                        <p className={styles.lineChartSubhead}>Risk-weighted exposure</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.highRiskLoans.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.highRiskLoans.max)}
                          </span>
                        )}
                        {capitalColumnData.highRiskLoans.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.highRiskLoans.min)}
                          </span>
                        )}
                        {capitalColumnData.highRiskLoans.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="High risk loans to Tier 1 capital column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.highRiskLoans.values.map((point) => (
                              <div
                                key={`high-risk-loans-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.highRiskLoansColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>No high risk loan data available.</p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`high-risk-loans-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.lineChartBlock}>
                      <div className={styles.lineChartHeader}>
                        <h4 className={styles.lineChartTitle}>
                          Construction &amp; land development to Tier 1
                        </h4>
                        <p className={styles.lineChartSubhead}>Construction exposure</p>
                      </div>
                      <div className={styles.lineChartBody}>
                        <span className={styles.lineChartYAxis}>Percent</span>
                        {capitalColumnData.constructionLoans.max != null && (
                          <span className={styles.lineChartTick} style={{ top: '12%' }}>
                            {formatPercentage(capitalColumnData.constructionLoans.max)}
                          </span>
                        )}
                        {capitalColumnData.constructionLoans.min != null && (
                          <span className={styles.lineChartTick} style={{ top: '88%' }}>
                            {formatPercentage(capitalColumnData.constructionLoans.min)}
                          </span>
                        )}
                        {capitalColumnData.constructionLoans.hasData ? (
                          <div
                            className={styles.columnChartGrid}
                            role="img"
                            aria-label="Construction and land development loans to Tier 1 capital column chart"
                            style={{
                              gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                              minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                            }}
                          >
                            {capitalColumnData.constructionLoans.values.map((point) => (
                              <div
                                key={`construction-loans-${point.label}`}
                                className={styles.columnChartBarWrapper}
                                title={
                                  point.value == null
                                    ? `${point.label}: N/A`
                                    : `${point.label}: ${formatPercentage(point.value)}`
                                }
                              >
                                <div
                                  className={`${styles.columnChartBar} ${styles.constructionLoansColumnBar} ${
                                    point.value == null ? styles.columnChartBarEmpty : ''
                                  }`}
                                  style={{ height: `${point.percentage}%` }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.status}>
                            No construction loan data available.
                          </p>
                        )}
                      </div>
                      <div
                        className={`${styles.lineChartLabels} ${styles.capitalChartLabels}`}
                        style={{
                          gridTemplateColumns: `repeat(${capitalViewSeries.length}, minmax(0, ${capitalColumnWidth}px))`,
                          minWidth: getAxisMinWidth(capitalViewSeries.length, capitalColumnWidth),
                        }}
                      >
                        {capitalViewSeries.map((point) => (
                          <span key={`construction-loans-label-${point.label}`}>
                            {formatCapitalAxisLabel(point)}
                          </span>
                        ))}
                      </div>
                      <p className={styles.chartXAxisLabel}>Quarter</p>
                    </div>
                  </div>
                </div>
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

                {!benchmarkLoading && !benchmarkError && benchmarkSortedData.length > 0 && (
                  <div className={styles.benchmarkBubbleSection}>
                    <div className={styles.benchmarkBubbleHeader}>
                      <div>
                        <h4 className={styles.benchmarkBubbleTitle}>ROE vs. Asset Size</h4>
                        <p className={styles.benchmarkBubbleSubtitle}>
                          Bubble size reflects total assets (in thousands) and color grades
                          with ROE.
                        </p>
                      </div>
                    </div>
                    <div className={styles.benchmarkBubbleChart}>
                      <svg
                        viewBox={`0 0 ${benchmarkBubbleChart.chartWidth} ${benchmarkBubbleChart.chartHeight}`}
                        role="img"
                        aria-label="Bubble chart comparing return on equity and total assets"
                      >
                        <defs>
                          <linearGradient
                            id="roeScaleLegend"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor={benchmarkBubbleChart.lowRoeColor} />
                            <stop offset="100%" stopColor={benchmarkBubbleChart.highRoeColor} />
                          </linearGradient>
                          <filter
                            id="bubbleShadow"
                            x="-30%"
                            y="-30%"
                            width="160%"
                            height="160%"
                          >
                            <feDropShadow
                              dx="0"
                              dy="6"
                              stdDeviation="6"
                              floodColor="rgba(15, 23, 42, 0.25)"
                            />
                          </filter>
                          {benchmarkBubbleChart.points.map((point) => (
                            <radialGradient
                              key={point.gradientId}
                              id={point.gradientId}
                              cx="30%"
                              cy="30%"
                              r="70%"
                            >
                              <stop offset="0%" stopColor={point.highlightColor} />
                              <stop offset="45%" stopColor={point.color} />
                              <stop offset="100%" stopColor={point.shadowColor} />
                            </radialGradient>
                          ))}
                        </defs>
                        <rect
                          x="0"
                          y="0"
                          width={benchmarkBubbleChart.chartWidth}
                          height={benchmarkBubbleChart.chartHeight}
                          rx="12"
                          fill="#f8fafc"
                        />
                        <line
                          x1={benchmarkBubbleChart.padding}
                          y1={benchmarkBubbleChart.padding}
                          x2={benchmarkBubbleChart.padding}
                          y2={benchmarkBubbleChart.chartHeight - benchmarkBubbleChart.padding}
                          stroke="#cbd5f5"
                          strokeWidth="1"
                        />
                        <line
                          x1={benchmarkBubbleChart.padding}
                          y1={benchmarkBubbleChart.chartHeight - benchmarkBubbleChart.padding}
                          x2={benchmarkBubbleChart.chartWidth - benchmarkBubbleChart.padding}
                          y2={benchmarkBubbleChart.chartHeight - benchmarkBubbleChart.padding}
                          stroke="#cbd5f5"
                          strokeWidth="1"
                        />
                        {benchmarkBubbleChart.ticks.map((tick) => (
                          <g key={`roe-tick-${tick.value}`}>
                            <line
                              x1={benchmarkBubbleChart.padding - 6}
                              y1={tick.y}
                              x2={benchmarkBubbleChart.padding}
                              y2={tick.y}
                              stroke="#94a3b8"
                              strokeWidth="1"
                            />
                            <text
                              x={benchmarkBubbleChart.padding - 10}
                              y={tick.y + 4}
                              textAnchor="end"
                              fontSize="10"
                              fill="#64748b"
                            >
                              {tick.value.toFixed(2)}%
                            </text>
                          </g>
                        ))}
                        <text
                          x="14"
                          y={benchmarkBubbleChart.chartHeight / 2}
                          textAnchor="middle"
                          fontSize="11"
                          fill="#475569"
                          transform={`rotate(-90 14 ${benchmarkBubbleChart.chartHeight / 2})`}
                        >
                          ROE (%)
                        </text>
                        <text
                          x={benchmarkBubbleChart.chartWidth / 2}
                          y={benchmarkBubbleChart.chartHeight - 12}
                          textAnchor="middle"
                          fontSize="11"
                          fill="#475569"
                        >
                          Banks (sorted by assets)
                        </text>
                        <g transform={`translate(${benchmarkBubbleChart.chartWidth - 190} 18)`}>
                          <rect width="120" height="8" rx="4" fill="url(#roeScaleLegend)" />
                          <text x="0" y="20" fontSize="10" fill="#64748b">
                            Lower ROE
                          </text>
                          <text x="70" y="20" fontSize="10" fill="#64748b">
                            Higher ROE
                          </text>
                        </g>
                        {benchmarkBubbleChart.points.map((point) => (
                          <g
                            key={`${point.bank.nameFull}-${point.bank.city}-${point.bank.stateName}`}
                          >
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r={point.r}
                              fill={`url(#${point.gradientId})`}
                              stroke={point.shadowColor}
                              strokeWidth="1.5"
                              filter="url(#bubbleShadow)"
                            >
                              <title>
                                {`${point.bank.nameFull} • Assets: ${formatNumber(
                                  point.asset,
                                )} • ROE: ${formatPercentage(point.roe)}`}
                              </title>
                            </circle>
                          </g>
                        ))}
                      </svg>
                    </div>
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
