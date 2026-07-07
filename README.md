# InvestTrack — Personal Investment Tracker

A local web app that tracks the family's FDs, mutual funds / shares, bank shares
and bank balances. All data lives in a single human-readable JSON file
(`data/db.json`) — no database to install. Back it up by copying that one file.

## Starting the app

Double-click **`start.bat`**. It builds the app on first use, starts the server,
and opens http://localhost:3001 in your browser. Keep the black window open
while using the app; close it to stop.

## What it does

- **Dashboard** — total invested vs current value, gain per holder,
  **instruments maturing soon** (window adjustable: 15/30/60/90/180 days) plus a
  matured/overdue list, ROI by category, and the best & worst performing
  instruments (annualized where dates are known). Click any row for details.
- **Investments** — the full list with filters by type, holder and name search.
  Add / edit / delete. For **FD, Bank Shares and Bank Balance** you type the
  **Maturity Value** yourself, exactly like the Excel sheet.
- **Live values for Shares/MF platforms** — open a Shares investment (UTI MF,
  Kuvera, PPFA, …) and add its holdings:
  - **Mutual funds**: search the scheme by name (use the exact scheme name shown
    in your AMC portal or investment app, e.g. *"Parag Parikh Flexi Cap Fund -
    Direct Plan - Growth"*), enter the units you hold. NAV comes from AMFI (via
    mfapi.in) and updates automatically.
  - **Stocks**: search by company name or NSE symbol (prices from Yahoo Finance).
  - Once a platform has holdings, its live value replaces the manual figure.
    Platforms without holdings keep using the manually entered value.
  - Prices auto-refresh when you open the dashboard (at most every 15 minutes);
    the **↻ Refresh prices** button forces an update. Last fetched prices are
    cached, so the app still works offline.

## Useful commands (run in this folder)

| Command | What it does |
|---|---|
| `npm run dev` | Development mode with auto-reload (app at http://localhost:5173) |
| `npm run build` | Rebuild the production app after code changes |
| `npm run seed -- --force` | **Wipes all data** and re-imports the original Excel file |
| `npm run export-ca` | Re-export the antivirus TLS certificate (see below) |

## If live prices stop working

Norton antivirus inspects HTTPS traffic with its own certificate, which Node.js
doesn't trust by default. The app ships with that certificate exported to
`certs/local-ca.pem`. If Norton updates and prices start failing with
certificate errors, run `npm run export-ca` once and restart the app.

## Data notes

- Imported from `narendra investment.xlsx` on 2026-07-06 (41 instruments).
- The Janta Sahakari bank-share maturity date read "1931" in the sheet and was
  imported as 2031 (see its Notes field — edit if that's wrong).
- ROI shown as "p.a." is annualized: `(value/invested)^(365/days) − 1`. Rows
  without dates show simple percentage gain instead.
