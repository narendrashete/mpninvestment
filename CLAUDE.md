# CLAUDE.md — Personal Investment Tracker

See [README.md](README.md) for what this app does and how to run it. This file covers
what a README wouldn't: who it's for, and hard-won conventions specific to this data.

## Who this is for

A private, single-user tracker for Narendra's family investments (FD, mutual funds/shares,
bank shares, bank balances). Solo use only — Mrunal and Nivedita appear as data holders
whose investments are tracked on their behalf, but they never log in or use the app
themselves. Don't add multi-user auth, logins, or roles.

## Two things not obvious from reading the code

- `data/db.json` now holds Narendra's real financial data (folio numbers, ISINs, bank
  names) — treat it as production data, not a sample/fixture, in any script that touches it.
- Any outbound HTTPS call from Node (mfapi.in, Yahoo Finance) fails with
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` unless `NODE_EXTRA_CA_CERTS=certs/local-ca.pem` is set —
  Norton intercepts TLS on this machine. Already wired into `start.bat` and the npm scripts;
  re-run `npm run export-ca` if it breaks after an antivirus update.

## Holdings data model

- `maturityValue` is manual-entry only for FD, Bank Shares, and Bank Balance types.
- A SHARES-type investment (a platform like "UTI MF" or "HDFC D-Mat") shows a *live* value
  only once it has holdings; with none, it falls back to the manual value — don't remove
  that fallback.
- Holding `kind` is one of: `MF` (AMFI NAV via mfapi.in), `STOCK` (Yahoo quote, tries `.NS`
  then `.BO`), or `OTHER` (no live feed — SGBs, delisted/illiquid micro-caps — price entered
  and updated by hand, and must be skipped in the price-refresh loop, not treated as a
  failure).

## When adding holdings from a new statement or screenshot

- Cross-check the scheme code you pick against the ISIN (or NAV rate) stated in the source
  document — don't trust a name-search match alone. Funds get renamed in AMFI's database
  (e.g. "Aditya Birla Sun Life Pure Value Fund" is now listed as "...Value Fund", same
  ISIN); a plausible-looking name match can be the wrong scheme.
- For IDCW/dividend-reinvestment plans, mfapi can return two different ISINs under one
  scheme code (`isin_growth` vs `isin_div_reinvestment`) — match whichever the statement
  actually states (e.g. "DIVREINOP" → reinvestment ISIN), not `isin_growth` by default.
- HDFC demat mutual fund holdings are Regular plans, not Direct — search and match
  accordingly; don't assume Direct just because other platforms in this app are.

## Version control

No git repo yet. When you set one up, a private remote (GitHub or similar) is fine — just
never public, since the data includes real folio numbers and near-PAN details.
