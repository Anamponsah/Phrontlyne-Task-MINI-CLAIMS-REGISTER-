# Mini Claims Register

A small web application for recording insurance claims and the payments made
against them: register a claim, set an approved (reserved) amount, record one
or more payments — each potentially in its own currency — and see the
approved amount, total paid, and outstanding balance for every claim, with a
filterable list and a totals row grouped by currency.

Stack: **Node.js + TypeScript + 9 + SQLite** (`better-sqlite3`),
server-rendered with **EJS**. No frontend build step, no framework lock-in —
chosen for speed and because the interesting part of this exercise is the
data model and the money arithmetic, not the UI stack.

## Running locally

Requires Node.js 20+.

```bash
npm install
npm run dev       # starts the app at http://localhost:3000, auto-seeds 18 sample claims
```

`npm run dev` uses `tsx` to run TypeScript directly with hot reload. The
SQLite database is created at `data/claims.sqlite` on first run and seeded
automatically with 18 sample claims (see `src/seed.ts`) if it's empty — there's
nothing else to set up.

Other scripts:

```bash
npm run build   # compile to dist/ (also copies views/, public/, schema.sql)
npm start       # run the compiled app (node dist/server.js)
npm run seed    # re-run the seed script directly (no-ops if claims already exist)
npm test        # run the money-arithmetic test suite (node:test)
```

Environment variables:

- `PORT` — defaults to `3000`.
- `DATABASE_PATH` — defaults to `data/claims.sqlite`; set this to point at a
  writable path on whatever host you deploy to.

## data base files
the file only exists after you've run the app at least once (npm run dev), since that's what creates and seeds it.

## Deploying

The app is a single stateful Node process with a SQLite file, which is the
simplest thing that satisfies every requirement in this exercise (including
"seed with 15+ sample claims" — it seeds itself on boot). That shape runs
as-is on Render, Railway, or Fly.io's free tiers: push the repo, set the
start command to `npm run build && npm start` (or use the included
`render.yaml` blueprint), and give it a writable disk for `DATABASE_PATH`.

**A live URL was not produced for this submission** — deploying requires an
account on one of these platforms (email verification / OAuth login), which
wasn't something this session could do on its own, and the task was placed
into "repo only for now" mode as a result. The app runs and is fully
functional locally per the instructions above; `render.yaml` is included so
whoever has an account can deploy it with a couple of clicks.

## Data model

Two tables:

**`claims`** — policy number, insured name, loss date, date notified, nature
of loss, `currency`, `estimated_minor` (the estimated loss at registration),
and `approved_minor` (nullable — null until someone sets a reserve/approved
amount).

**`payments`** — belongs to a claim; has its own `payment_date`, `currency`,
and `amount_minor`. When a payment's currency differs from its claim's
currency, it also carries the `fx_rate` used and a `converted_minor` (the
payment amount converted into the claim's own currency at that rate).
`converted_minor` equals `amount_minor` when the currencies match.

All money is stored as **integer minor units** (cents, or the equivalent for
the currency), never as floats — see "Money arithmetic" below.

Everything else is derived, not stored, so it can never drift out of sync
with its inputs:

- `total_paid` = `SUM(converted_minor)` over a claim's payments (in the
  claim's own currency).
- `balance` = `approved_minor − total_paid`, or `null` if no approved amount
  has been set.
- `status`:
  - **Reserved, not yet settled** — `approved_minor` is `null`.
  - **Settled, payment outstanding** — `approved_minor` is set and
    `balance > 0`.
  - **Settled and paid** — `approved_minor` is set and `balance ≤ 0` (a
    claim can be paid slightly over its approved amount, e.g. through a
    currency conversion rounding — that still reads as fully paid, not as a
    negative-outstanding oddity).

The list view's totals row groups by each claim's own currency (never by
payment currency) and sums `estimated`, `approved`, `paid`, and `outstanding`
independently per currency bucket — see `totalsByCurrency` in `src/claims.ts`.

## Money arithmetic

This is the part the exercise is really testing, so it's worth spelling out
(`src/money.ts`):

- Every amount is parsed straight from its decimal string into an integer
  count of minor units (e.g. `"1234.56"` → `123456` for a 2-decimal
  currency) — never through `parseFloat`, so there's no binary-floating-point
  representation error to worry about.
- Each currency has its own number of decimal places (USD/GBP/EUR/GHS/etc.
  are 2, JPY is 0, KWD is 3), so `"4500000"` JPY and `"15000.000"` KWD are
  both valid, and `"10.50"` JPY is correctly rejected.
- All arithmetic on money — summing payments, computing balances, converting
  currencies — is done on those integers, so nothing ever touches a
  floating-point number.

### Paying a claim in a different currency than it was reserved in

A claim is reserved in one currency, but a payment can be made in any
currency. When they differ, the payment form requires an **exchange rate**
(units of the claim's currency per 1 unit of the payment's currency),
captured at the time the payment is recorded — this mirrors how an insurer
actually settles a cross-currency payment: at whatever rate applied on the
day, not a rate looked up after the fact. The app stores:

- the original `amount` and `currency` as entered (the source of truth for
  what was actually paid out), and
- the `fx_rate` and the resulting `converted_minor` in the claim's currency
  (what feeds `total_paid` and `balance`).

The conversion itself (`convertMinor`) is done entirely in `BigInt`
fixed-point arithmetic — the rate is captured to 6 decimal places, the
payment amount and rate are multiplied as integers, and the single division
back down to the target currency's minor units is rounded half-up exactly
once, at the end. That means:

- no float ever enters the calculation,
- differing decimal places between the payment and claim currencies (e.g.
  KWD's 3 vs. USD's 2) are handled correctly, and
- the result is fully deterministic and reproducible from the stored
  `amount`, `currency`, and `fx_rate` alone.

One consequence worth calling out: converting many small payments
independently and summing them can land a cent or two away from converting
their total in one lump sum, because each payment rounds independently at
the time it's recorded — which is the same thing that happens in real
settlement systems, not a bug. `test/money.test.ts` covers both that
determinism and the (separate) case of an exactly-divisible rate producing
no drift at all.

## Assumptions

- **One currency per claim.** A claim reserves in a single currency;
  payments may differ but are always converted back into the claim's
  currency for that claim's own totals. The list/report totals are grouped
  by currency, so a GHS claim and a USD claim never get summed together.
- **The exchange rate is a manual, per-payment input**, not fetched from a
  live FX API — there's no dependency on an external service, and it matches
  how an adjuster would actually record "we paid GBP 40,000 at 1.27" against
  a USD reserve.
- **Filters apply to the loss date**, not the notification date or payment
  dates — "claims with a loss date in this range" felt like the more natural
  reading of "filters on date range" for a claims register.
- **The approved amount can be revised** (the form re-submits to the same
  endpoint and simply overwrites the stored value) rather than keeping a
  history of reserve changes — a real claims system would likely audit that,
  but it wasn't asked for here.
- **No authentication.** Anyone with the URL can register claims and record
  payments — reasonable for a take-home exercise, not for production.
- Amounts must be non-negative; there's no support for recording a refund or
  a negative/reversing payment.

## What I'd do differently with more time

- **Persist to Postgres instead of SQLite** for a real deployment — SQLite
  is fine for a self-contained demo, but a container restart on most free
  hosting tiers wipes its (ephemeral) disk, which isn't durable for anything
  beyond a demo. The data layer (`src/claims.ts`) is a thin enough
  abstraction that swapping the driver wouldn't touch the money logic at
  all.
- **A currency table with effective-dated FX rates**, so a payment could
  either look up a recorded market rate for its date or accept a manual
  override, instead of always requiring the user to type one in.
- **An audit trail** for approved-amount revisions and payment edits/voids,
  rather than allowing the approved amount to be silently overwritten.
  (To create a permission based system)
- **Server + client-side validation parity** — right now validation lives
  entirely on the server (with error messages re-rendering the form); a
  production version would mirror the currency-decimals and non-negative
  rules in the browser for faster feedback.
- **Pagination** on the list view — fine at 18 seeded claims, not fine at
  18,000.
- **Proper integration tests** against the HTTP routes (the current test
  suite only covers the money arithmetic in isolation, which is where the
  exercise said the scrutiny would be, but route-level tests would catch
  regressions in the filtering/status logic too).
