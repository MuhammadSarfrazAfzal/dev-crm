# Devsolutionspk Sales CRM

A multi-user B2B outreach CRM for two divisions: **8staros POS** (shop software) and
**Star Cellular Wholesale** (wholesale phones). Salespeople import lead lists, copy a
number, call from their own phone, log what happened, and schedule the next follow-up
in the shop's time zone. Admins assign leads, read reports and export CSVs.

There is **no calling or email integration** (no Zoom Phone, no Zoho Mail). Calls and
emails happen outside the app and are logged by hand. The AI adapters (import extraction,
script drafting, the web research agent) ship disabled and make no network calls. OCR
runs locally. See [`docs/PLAN.md`](docs/PLAN.md) for the architecture, data model, RLS
model and the database decision.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Supabase
(PostgreSQL 17, Auth, Realtime, Storage) with Row Level Security. Development and tests
run on an embedded PostgreSQL with the same migrations.

## What's in the app

| Area | Where |
|---|---|
| Research agent (setup only): choose an agent (Codex, Claude, Gemini, custom), what to look up and which fields to collect; saved requests wait until an agent is connected; results will go through the import review | `/research`, `src/lib/research` |
| Companies: every business with phone, email, contacts, address, leads per division and recent calls | `/companies`, `/companies/[id]` |
| Live updates: pages refresh when teammates change data (Supabase Realtime; a local event stream in development) | `src/components/LiveUpdates.tsx`, `/api/realtime/token`, `/api/live` |
| Login, admin and salesperson roles, sessions, rate limits | `/login`, `src/lib/auth`, `src/proxy.ts` |
| Dashboard: total leads, not called, call attempts, callbacks due, interested, email pending, deals won | `/` |
| Bulk import: CSV, TSV, XLSX, PDF (text + OCR fallback), DOCX, TXT, PNG/JPG/WEBP/GIF/BMP/TIFF (OCR), safe ZIP, pasted text | `/imports/new`, `src/lib/import` |
| Import preview: every field in its own column (company, contact, phone, email, street, city, state, ZIP, website, source, area), a summary of which details the file had, column matching, normalization, duplicates, explicit approval, provenance + original file | `/imports/[id]`, `src/server/imports.ts` |
| Companies and contacts with several numbers/emails; ownership; divisions | lead page, `supabase/migrations` |
| After the call: outcomes grouped by "reached someone" (agreed, interested, call back later, spoke, not interested, do not call) and "didn't reach" (no answer, voicemail, busy, gatekeeper, wrong number); next step, call-back time in the shop's time zone, email request, notes; append-only history | `/leads/[id]`, `src/components/lead/LogCallForm.tsx` |
| Separate call outcomes, deal stages and email statuses | `src/lib/labels.ts`, enums in the schema |
| Lead page: timeline, scripts, documents, notes, follow-ups, deal, company and contacts | `/leads/[id]` |
| Script library ordered by call flow, highlighted name placeholders, versions; disabled AI drafting adapter | `/scripts` |
| Manager reports, assignment, filters, pagination, CSV export | `/reports`, `/leads`, `/api/export/*` |
| Security: strict RLS, upload validation, role checks, import and export auditing, rate limits, private file access, do-not-call / do-not-email | `supabase/migrations`, `/audit` |
| Time-zone-aware follow-ups and calling windows (TCPA 8 am–9 pm, FL/OK 8 am–8 pm, house rule weekdays 9–6) | `src/lib/time.ts`, `/followups` |

## Development environment

Requirements: Node.js 22 or newer and npm. No Docker, no root and no system Postgres:
the local database is PostgreSQL 17 from the `embedded-postgres` npm package, run in user
space. Fake demo data only ever goes into this local database.

### 1. Install

```bash
npm install
cp .env.example .env.local   # then set SESSION_SECRET (any 32+ random characters)
```

The embedded Postgres binaries and a few native packages need their install scripts;
they are listed under `allowScripts` in `package.json`.

### 2. Start the database, migrate and seed

```bash
npm run db:start     # initialises .local/pgdata on first run, starts Postgres on 127.0.0.1:54329
npm run db:migrate   # applies supabase/local/auth_shim.sql + supabase/migrations/*.sql
npm run db:seed      # fake US phone shops, 555-01xx numbers, example.com addresses (local only)
```

`npm run db:reset` drops the database and does migrate + seed in one go.
`npm run db:stop` stops the server. Data lives in `PG_DATA_DIR` (default `.local/pgdata`,
gitignored).

To use your own Postgres instead, set `PG_EMBEDDED=0` and `DATABASE_URL`, and run
`APPLY_AUTH_SHIM=1 npm run db:migrate` (the shim adds the Supabase `auth` schema,
`auth.uid()` and the `anon` / `authenticated` / `service_role` roles).

### 3. Start the app

```bash
npm run dev          # http://127.0.0.1:3020
```

The local seed creates an admin and two salespeople with `@example.com` addresses; in
local development the sign-in page lists them. They exist only in the local database.
For real accounts see [Users](#users).

### 4. Run the tests

```bash
npm test             # unit + database tests (Vitest)
npm run test:unit    # parsers, OCR, phone/email/time-zone rules, CSV safety, rate limiter
npm run test:db      # RLS matrix, append-only history, suppression, import approval (fresh salescrm_test db)
npm run test:e2e     # Playwright: upload → preview → approve → open lead → log call → follow-up
```

The database tests create a fresh `salescrm_test` database and the e2e suite creates
`salescrm_e2e`, both on the local embedded server even when `.env.local` points the app at
Supabase; the tooling refuses to create, drop or seed a database that isn't on this
machine. The e2e suite starts its own server on port 3031 (build dir `.next-e2e`). Playwright
needs a Chromium: either `npx playwright install chromium`, or point it at a system one
with `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.

`npm run typecheck` and `npm run lint` run TypeScript and ESLint.

## How it fits together

- **One data path, RLS everywhere.** Every signed-in request runs in a transaction that
  switches to the `authenticated` role and sets `request.jwt.claims`, exactly like
  Supabase's API does, so the same policies decide what each user sees
  (`src/lib/db/core.ts`). Only login, seeding and the cross-rep duplicate check use the
  privileged connection.
- **Append-only history.** Calls, email steps, notes and the audit log can't be updated
  or deleted by anyone; triggers keep lead counters in step with them.
- **Do-not-call is enforced by the database.** A call can't be logged against a
  suppressed shop; an "asked not to be called" outcome suppresses it and cancels
  pending call follow-ups; email opt-outs block "drafted"/"sent" email logs.
- **Imports never write leads until approved.** Originals are stored privately with a
  SHA-256, every created company/contact/lead keeps its `import_id`, and creation and
  approval are audited.
- **Imports come out as one business per row.** PDFs are read with their layout (columns
  kept apart, pages joined). Directory-style documents (numbered entries with a phone at
  the right, a "City, ST | address" line and a source line) are split by
  `src/lib/import/record-blocks.ts`: wrapped names are joined, section headings such as
  "Houston area" become a tag, and listing sites (Waze, Yahoo Local, Yellow Pages…) are
  kept as the source, never the website. Anything less structured goes through the
  free-text segmenter (`text-records.ts`), which anchors on each phone and email. Rows it
  can't split cleanly land in **Needs a look** with the original text, where they can be
  fixed or split before approval. Duplicates are only flagged for the same phone, or the
  same name at the same address.
- **Times are stored in UTC** and always entered and shown with an IANA zone: the shop's
  (from state or area code) and the rep's own.

## Running on Supabase

The CRM's own project holds the schema from `supabase/migrations/` (tables, RLS, the
Realtime publication and the private `crm-files` bucket). In `.env.local` (never commit it):

```bash
DATABASE_URL=postgres://postgres:<db password, url-encoded>@db.<ref>.supabase.co:5432/postgres?sslmode=require
PG_EMBEDDED=0                 # the embedded server still runs for tests
AUTH_PROVIDER=supabase        # sign in with Supabase Auth
STORAGE_PROVIDER=supabase     # files in the private crm-files bucket
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_DB_HOST=db.<ref>.supabase.co
SUPABASE_DB_PASSWORD=...
```

```bash
npm run supabase:migrate          # apply migrations not yet recorded (no auth shim)
npm run supabase:status           # applied migrations and row counts
npm run supabase:default-scripts  # standard call and email scripts, if the library is empty
```

The app never holds a service-role key. Signed-in requests run as the `authenticated`
role under RLS over the database connection; Supabase Auth tokens are kept in an
encrypted httpOnly cookie and used for Storage (as the user) and handed to the browser,
short-lived, for Realtime. Realtime only delivers rows the user can read.

### Users

Admins add people on the **Team** page (works with Supabase Auth too). From a terminal:

```bash
npm run supabase:create-user -- --email name@company.com --name "Full Name" --role admin --password-file ./first-login.txt
```

With `--password-file` a strong password is generated and written there (mode 600); or
set `NEW_USER_PASSWORD`. Share it privately and ask the person to change it.

## Design system

One set of colour tokens (`src/app/globals.css`) for light and dark: `canvas`, `surface`,
`line`, `fg`, `muted`, `brand` and the tones `success`, `warning`, `danger`, `info`,
`accent`, each with `-soft`, `-line` and `-fg`. Pages use these, never raw palette
colours, so both themes stay consistent. Dark follows the system setting; the sidebar
toggle can force light or dark. Shared pieces live in `src/components/ui.tsx` (page
header, card, badge, stat, empty state, alert, segmented control, detail list) and
`src/components/icons.tsx`. Inter is the typeface.

## Not built yet

Calling and email integrations, a real agent behind the research page and the other AI
adapters, National DNC registry scrubbing (only the internal list is enforced),
SMS/WhatsApp, and a background queue for very large imports.
