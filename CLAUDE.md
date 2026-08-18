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

## Masters (holder + investment name pick-lists)

- `db.data.masters.holders` and `.investmentNames` are the only source of those two fields.
  The Add/Edit Investment form offers them as dropdowns; `POST`/`PUT /api/investments` (and
  `/renew`) **reject** any holder or name not on the list. New entries are created only on
  the Masters page (`/masters`, `/api/masters`) — don't reintroduce free-text entry.
- `db.js` back-fills the masters from whatever the existing investments use on startup, so
  the lists can never go out of sync with real data. Any script that writes investments
  directly must call `ensureMaster()` too (see `server/seed/import-excel.js`).
- Renaming a master entry cascades to every investment using the old value; deleting one is
  refused while it's still in use. That's why the UI shows a usage count per entry.

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

## Vehicle policies (motor insurance)

- Unlike LIC/Health, this is **two-level**: `vehicles` are the top-level record and
  `vehiclePolicies` hang off them by `vehicleId`. A vehicle outlives its policies, and one
  vehicle routinely carries **two concurrent policies from different insurers with
  different expiry dates** — Narendra's XL6 has a standalone OD from Reliance alongside a
  3-year third-party policy from HDFC ERGO. A flat one-row-per-policy list can't express
  that, which is the whole reason for the extra level.
- `holder` lives on the **vehicle**, never on the policy — one car, one owner, and one
  entry in the masters `holders` cascade.
- `policyType` is `COMPREHENSIVE` | `OD_ONLY` | `TP_ONLY`. A `TP_ONLY` policy carries **no
  IDV**, so any total over a vehicle's policies must skip nulls rather than treat them as
  zero — otherwise a car with both kinds of cover gets counted at its value twice. The
  form hides the IDV and own-damage fields for `TP_ONLY`.
- Headline figures (`totalIdv`, `premiumPaid`, `nextExpiryDate`) come from **active**
  policies only; renewed/expired ones are records. It's "premium **paid**", not "annual
  premium" — a third-party policy often runs three years, so annualising would be a lie.
- **Renewal** mirrors the FD chain below (`renewedFromId`/`renewedToId`/`renewedOn`, old
  record set to `status: 'renewed'`) with one deliberate difference: motor cover runs to
  23:59 of `endDate`, so the new policy starts the **day after** the old one ends — an FD
  renewal starts *on* the old maturity date. Don't "fix" this back.
- Deleting a policy repairs the renewal chain on both neighbours; deleting a vehicle takes
  its policies, premium log and every file in `data/vehicle-docs/` +
  `data/vehicle-premium-docs/` with it.
- Registration numbers are unique per group, compared with spaces/hyphens stripped and
  upper-cased (`MH05FP6134` == `mh-05 fp 6134`) but stored as typed.
- Insurer names come from the `vehicleInsurers` master; premium payments carry the same
  multi-file receipt/cheque/screenshot attachments as LIC and Health.

## FD redemption / renewal (`status` on an investment)

- An FD or Bank Share can be **redeemed** (`POST /api/investments/:id/redeem`) or an
  FD **renewed** (`POST /api/investments/:id/renew`). Both set `status` on the old
  record: `redeemed` or `renewed`. Absent `status` = active.
- A closed instrument (`status` redeemed/renewed) is a **record only** — `enrich`
  flags it `closed` and it is excluded from every live aggregate (dashboard totals,
  maturing/overdue lists, best/worst, category/holder summaries, and the Investments
  list totals). This prevents double-counting money that has moved elsewhere.
- Closed records don't appear on the Dashboard or the Investments list at all. They live
  on their own **Redeemed / Renewed** tab (`/closed`, `GET /api/investments/closed`),
  which reports their figures separately and resolves the linked record (credited bank
  account / renewed-into FD) server-side so a row click can show full details.
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
