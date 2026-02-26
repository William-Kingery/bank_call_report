# Bank Call Report Explorer: User Guide

This guide explains how to use the app to search for a bank and read its call report trends.

## Who this guide is for

- Credit analysts
- Bank risk teams
- Portfolio managers
- Anyone reviewing FDIC call report trends by institution

## What you can do in the app

- Search institutions by full or partial bank name
- Select a bank by `CERT`
- Review latest-quarter performance snapshot
- Inspect asset-quality concentration and trend
- Analyze capital and loan-to-capital ratio trends
- Toggle between `Latest 9 Qtrs` and `Latest 4 Qtrs`

## Screen overview

The app has one main workflow:

1. Use the `Bank search` field.
2. Pick a bank from suggestions.
3. Review three tabs:
   - `Performance`
   - `Asset Quality`
   - `Capital`
4. Change the quarter range to narrow or widen history.

## Step-by-step usage

### 1) Search for a bank

- Click the `Bank search` input.
- Type at least 2 characters.
- Choose a result from the dropdown suggestions.
- Press `Enter` to select the top suggestion quickly.

What happens next:

- The app loads the selected institution’s historical data.
- A summary banner appears with bank name, location, and `CERT`.

### 2) Use the `Performance` tab

The `Performance` tab shows the latest quarter snapshot:

- `Liabilities`
- `Equity`
- `ROE`
- `ROA`

Important details:

- `Liabilities` is calculated as `Assets - Equity`.
- Dollar values on this tab are shown in thousands.
- Percentages are formatted to two decimals.
- If data is missing for a field, the app shows `N/A`.

### 3) Use the `Asset Quality` tab

This tab focuses on criticized/classified assets (`CCIDOUBT`):

- A donut chart showing latest criticized/classified share of total assets
- A bar chart showing criticized/classified trend by quarter
- A table with quarter-by-quarter `CCIDOUBT` values

How to read it:

- The donut chart center shows latest criticized/classified amount and percent share.
- The bar chart helps you spot acceleration or improvement over recent quarters.
- Use the table for exact values when chart bars are close.

### 4) Use the `Capital` tab

This tab shows capital strength and concentration ratios:

- `Tangible Equity Capital (EQTANQTA)` latest value
- Trend charts for:
  - `LNCIT1R` (C&I loans to Tier 1 capital)
  - `LNCONT1R` (Consumer loans to Tier 1 capital)
  - `LNHRSKR` (High-risk loans to Tier 1 capital)
  - `LNCDT1R` (Construction/Land Development to Tier 1 capital)

How to read it:

- Higher concentration ratios can indicate elevated capital sensitivity.
- Use recent-quarter trends to identify direction, not just a single-point value.
- Ratios are shown as percentages.

### 5) Change the quarter window

At the top right of the tab area:

- `Latest 9 Qtrs` shows a broader trend window.
- `Latest 4 Qtrs` shows a tighter, recent view.

Use `Latest 4 Qtrs` for recent momentum and `Latest 9 Qtrs` for context.

## Data interpretation notes

### Quarter labels

- The app maps report dates to quarter labels:
  - `YYYY03` -> `YYYY Q1`
  - `YYYY06` -> `YYYY Q2`
  - `YYYY09` -> `YYYY Q3`
  - `YYYY12` -> `YYYY Q4`

### Units and formatting

- Monetary values are displayed in thousands.
- Ratio values are displayed as percentages.
- Missing values appear as `N/A`.

### Latest quarter definition

- Latest quarter is the newest available reporting period for the selected bank in the dataset.

## Suggested analysis workflow

1. Search and select a bank.
2. Start in `Performance` to get current scale and profitability.
3. Move to `Asset Quality` to evaluate criticized/classified pressure.
4. Check `Capital` ratios for concentration and buffer context.
5. Toggle between `Latest 4 Qtrs` and `Latest 9 Qtrs` before concluding.

## Practical tips

- Use precise legal-name fragments for better search matches.
- If multiple similarly named banks appear, verify by `CERT`.
- Prefer trend confirmation across tabs over single-metric decisions.
- Recheck quarter range before sharing a chart screenshot or summary.

## Common issues and fixes

### No search suggestions appear

- Make sure you typed at least 2 characters.
- Try a broader name fragment.

### Data does not load after selecting a bank

- Refresh the page and try again.
- If the issue persists, the selected bank may not have complete records in the current dataset.

### You see `N/A` values

- Some fields may be absent for a given bank/quarter.
- This is expected when source data is incomplete for that metric.

## Scope and limitations

- The app is a visualization and exploration tool.
- It does not replace formal underwriting policy or regulatory review.
- Results depend on the loaded database snapshot and source-data quality.

## Metric glossary

- `CERT`: FDIC certificate identifier for an institution
- `ASSET`: Total assets
- `EQ`: Total equity capital
- `ROE`: Return on equity
- `ROA`: Return on assets
- `CCIDOUBT`: Criticized and classified assets
- `EQTANQTA`: Tangible equity capital ratio
- `LNCIT1R`: C&I loans to Tier 1 capital ratio
- `LNCONT1R`: Consumer loans to Tier 1 capital ratio
- `LNHRSKR`: High-risk loans to Tier 1 capital ratio
- `LNCDT1R`: Construction and land development loans to Tier 1 capital ratio
