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
  re-run `npm run export-ca` if it breaks after an antivirus update. This is a **Windows-only,
  local-dev-only** workaround — never set it on the VPS, Ubuntu has no such interception.

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

## FD redemption / renewal (`status` on an investment)

- An FD or Bank Share can be **redeemed** (`POST /api/investments/:id/redeem`) or an
  FD **renewed** (`POST /api/investments/:id/renew`). Both set `status` on the old
  record: `redeemed` or `renewed`. Absent `status` = active.
- A closed instrument (`status` redeemed/renewed) is a **record only** — `enrich`
  flags it `closed` and it is excluded from every live aggregate (dashboard totals,
  maturing/overdue lists, best/worst, category/holder summaries, and the Investments
  list totals). This prevents double-counting money that has moved elsewhere.
- **Redeem** optionally credits the proceeds to a `BANK_BALANCE` account, bumping that
  account's `amountInvested` and `maturityValue` by the redeemed amount. Fields on the
  redeemed FD: `redeemedOn`, `redeemedAmount`, `redeemedToId`.
- **Renew** creates a brand-new FD (its own record) with `renewedFromId` back to the
  original; the original gets `renewedToId` + `renewedOn`. Renewal chains are kept as
  separate linked rows, not mutated in place.

## Version control

Private GitHub repo (never public — real folio numbers and near-PAN details live in this
data). `data/db.json`, `certs/*.pem`, and `.env` are gitignored and never pushed.

## Login / auth

`server/middleware/auth.js` only requires login when `AUTH_USERNAME` + `AUTH_PASSWORD_HASH`
are set in `.env` (see `.env.example`) — local dev via `start.bat` has neither, so it stays
login-free exactly as before. The VPS's `.env` sets both, so production is gated. Don't make
login mandatory everywhere; that would break the frictionless local workflow this app was
built for.

## Deployment (Hostinger VPS)

- Ubuntu 24.04 at 200.97.162.75, domain `mpninvestment.primecomputers.co.in`. HTTPS via
  Let's Encrypt/Certbot (nginx plugin, auto-renews); HTTP redirects to HTTPS.
- App lives at `/opt/investment-app`, run under PM2 as process `investment-app`, registered
  as a systemd service so it survives reboots.
- Only the `deploy` user can SSH in — root login and password auth are both disabled
  (`/etc/ssh/sshd_config.d/99-harden.conf`). `deploy` has **no password**, only an SSH key,
  and passwordless sudo via `/etc/sudoers.d/deploy-nopasswd` (`NOPASSWD:ALL`) — grant this
  *before* disabling root, not after, or you'll be locked out of privileged commands with no
  way back in except the hosting provider's out-of-band browser console.
- `.github/workflows/deploy.yml` auto-deploys on push to `main`: SSH in as `deploy`,
  `git pull`, reinstall, rebuild, `pm2 restart`. Needs repo secrets `VPS_HOST`, `VPS_USER`,
  `VPS_SSH_KEY` (a key generated solely for this, added to `deploy`'s `authorized_keys`).
- The VPS pulls the repo itself via a separate **read-only GitHub deploy key**, generated
  on the VPS so the private half never left it — not the same key as the one above.
- `data/db.json` is never touched by a deploy — it was copied to the VPS once via `scp` and
  stays there; deploys only update code.
- Curl/browsers on this Windows dev machine may report `CRYPT_E_NO_REVOCATION_CHECK` or
  status `000` for `https://mpninvestment.primecomputers.co.in` — that's Norton's local TLS
  interception on this PC (the same issue that affects mfapi.in/Yahoo calls), not a server
  problem. Verify suspected HTTPS issues by curling from the VPS itself before assuming the
  cert is broken.
