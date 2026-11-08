# Sales CRM: architecture and Phase 1 plan

A multi-user B2B outreach CRM for two divisions, **8staros POS** (shop software) and
**Star Cellular Wholesale** (wholesale phones). Salespeople call and email shops from
their own phone and mailbox; the CRM is where they find the lead, copy the number, log
what happened and schedule the next touch. Managers assign leads and read reports.

Phase 1 has **no Zoom Phone, Zoho Mail, dialer or mail integration**. Calls and emails
happen outside the app and are logged by hand. AI is an adapter interface that ships
disabled (no keys, no network calls). OCR runs locally.

## 1. Architecture

```
Browser ──► Next.js 16 (App Router, React 19, Tailwind 4, TypeScript)
              │  server components + server actions + route handlers
              │  proxy.ts: session check, role gate, security headers
              ▼
           lib/db  ── withUser(userId, fn) ──► BEGIN
                                               SET LOCAL ROLE authenticated
                                               set_config('request.jwt.claims', {sub, role})
                                               …queries (RLS applies)…
                                               COMMIT
              ▼
           PostgreSQL 17 (local: embedded-postgres; later: Supabase)
             schema auth   (shim locally; Supabase's own in the cloud)
             schema public (12 tables + notes/documents, RLS on every table)
```

- **One data path for both environments.** The server talks SQL to Postgres with the
  `postgres` driver. Every user request runs inside a transaction that switches to the
  `authenticated` role and sets `request.jwt.claims`, exactly what Supabase's PostgREST
  does, so `auth.uid()` and every RLS policy behave the same locally and on Supabase.
  Moving to Supabase means pointing `DATABASE_URL` at the Supabase pooler and choosing
  the Supabase auth adapter: a config change, not a rewrite.
- **Auth adapters** (`AUTH_PROVIDER=local|supabase`). `local` checks a bcrypt hash in
  the `auth.users` shim (same column name, `encrypted_password`, as Supabase) and issues
  a signed, httpOnly, SameSite=Lax session cookie (HS256 via `jose`, 12 h). `supabase`
  verifies with Supabase Auth and keeps the same session shape.
- **Roles**: `admin` (manager) and `salesperson`, stored in `profiles.role`. The UI hides
  what a role cannot do, server actions re-check, and RLS is the final word.
- **Storage adapter** for uploaded files: local directory outside `public/` (default
  `.local/uploads`, gitignored) now, Supabase Storage later. Files are stored under a
  random key and only served through an authenticated route that first reads the
  owning `imports` row through RLS.
- **Background-free**: imports are parsed inside the upload request (size-capped), so
  no job queue is needed in Phase 1.

## 2. Data model

All ids are `uuid`, all times `timestamptz` (UTC). Enums keep the three status
families separate (point 7).

| Table | Purpose and key columns |
|---|---|
| `profiles` | One per `auth.users` row. `full_name`, `email`, `role` (`admin`/`salesperson`), `time_zone`, `active`. |
| `companies` | The shop. `name`, `website`, `address`, `city`, `state`, `postal_code`, `time_zone` (IANA), `phones jsonb[]`, `emails jsonb[]`, `suppression` (`none`, `do_not_call`, `do_not_email`, `do_not_contact`), `created_by`, `import_id`. |
| `contacts` | People at a company. `full_name`, `title`, `phones jsonb` (`[{e164, raw, label}]`), `emails jsonb` (`[{address, label}]`), `suppression`, `is_primary`. |
| `imports` | One uploaded file or paste. `source_type`, `original_filename`, `storage_key`, `mime_type`, `size_bytes`, `sha256`, `division`, `status` (`parsing`, `preview`, `approved`, `rejected`, `failed`), `column_mapping`, `parser`, counts, `uploaded_by`, `approved_by/at`. |
| `import_rows` | One extracted record. `row_index`, `source_ref` (sheet/page/zip entry), `raw jsonb`, `normalized jsonb`, `issues text[]`, `confidence` (0–1), `duplicate_of_lead`, `duplicate_of_company`, `decision` (`include`, `skip`), `lead_id` after approval. |
| `leads` | A company worked for **one division** (`unique(company_id, division)`). `owner_id`, `primary_contact_id`, `status` (`new`, `working`, `nurturing`, `qualified`, `unqualified`, `closed`), `interest` (`unknown`, `not_interested`, `curious`, `interested`, `hot`), `email_required`, `email_status`, `call_attempts`, `last_call_at`, `last_outcome`, `next_followup_at`, `import_id`, `source`. |
| `call_activities` | **Immutable** log of a manual call. `lead_id`, `user_id`, `phone_e164`, `outcome` (`no_answer`, `voicemail`, `busy`, `wrong_number`, `gatekeeper`, `connected`, `callback_requested`, `not_interested`, `interested`, `do_not_call`), `notes`, `interest`, `duration_seconds`, `occurred_at`. |
| `followups` | Scheduled next touch. `lead_id`, `assigned_to`, `kind` (`call`, `email`, `task`), `due_at`, `time_zone` used when scheduling, `status` (`pending`, `done`, `cancelled`), `notes`, `completed_at`. |
| `email_activities` | **Immutable** log of a manual email step. `lead_id`, `user_id`, `to_address`, `status` (`pending`, `drafted`, `sent`, `replied`, `bounced`, `opted_out`), `subject`, `notes`. Latest status is mirrored to `leads.email_status`. |
| `sales_opportunities` | The deal. `lead_id`, `division`, `stage` (`prospect`, `demo_booked`/`price_list_sent`, `trial`/`sample_order`, `negotiation`, `won`, `lost`), `value_cents`, `expected_close_on`, `owner_id`. |
| `scripts` | Call and email scripts. `division`, `script_type` (`opening`, `voicemail`, `objection`, `follow_up_email`, `gatekeeper`, `closing`), `script_key` + `version` (unique together), `title`, `body`, `is_current`, `created_by`. New version = new row; history kept. |
| `audit_logs` | Insert-only. `actor_id`, `action`, `entity`, `entity_id`, `details jsonb`, `created_at`. Written by `log_audit()` (security definer) and by triggers. |

Two small supporting tables beyond the twelve, needed for point 8: `notes`
(immutable free-text notes on a lead) and `documents` (files attached to a lead or
company, pointing at the storage adapter; import originals are linked here too).

Immutability is enforced in the database: `call_activities`, `email_activities`,
`notes` and `audit_logs` have no UPDATE/DELETE policies **and** a trigger that raises on
UPDATE/DELETE for everyone except the `service_role` maintenance path.

Counters on `leads` (`call_attempts`, `last_outcome`, `email_status`) are maintained by
triggers on the activity tables so dashboards stay cheap and can't drift from the log.

## 3. Row Level Security model

Helpers (security definer, `stable`, `search_path` pinned): `app.is_admin()`,
`app.can_see_lead(lead_id)`, `app.can_see_company(company_id)`.

| Table | salesperson | admin |
|---|---|---|
| `profiles` | read all active (names for assignment); update own name/time zone only (trigger blocks `role`/`active` change) | all |
| `leads` | read/update where `owner_id = auth.uid()`; insert only with `owner_id = auth.uid()`; cannot change `owner_id` | all, including reassignment |
| `companies`, `contacts` | read/update when they own a lead on the company or created it; insert own | all |
| `call_activities`, `email_activities`, `notes` | insert as themselves on visible leads; read on visible leads; never update/delete | read all, insert; never update/delete |
| `followups` | CRUD on visible leads, `assigned_to` must be self | all |
| `sales_opportunities` | on visible leads | all |
| `scripts` | read | all |
| `imports`, `import_rows` | own uploads | all |
| `documents` | on visible leads/companies or own imports | all |
| `audit_logs` | none | read only |

`anon` gets nothing. Suppression is enforced in the database too: a trigger rejects a
`call_activities` insert when the company or contact is `do_not_call`/`do_not_contact`,
and logging outcome `do_not_call` sets the suppression and cancels pending follow-ups.

RLS is tested directly against the database (see 6) by switching role and claims the
same way the app does.

## 4. Import pipeline

```
upload / paste ─► validate ─► store original ─► extract ─► records ─► map ─► normalize ─► dedupe ─► preview ─► approve ─► write
```

1. **Validate**: size cap (20 MB file, 50 MB total unzipped), extension + magic-byte
   sniffing must agree, allow-list only (CSV, TSV, XLSX, PDF, DOCX, TXT, PNG, JPEG,
   WEBP, GIF, BMP, TIFF, ZIP). Per-user upload rate limit. SHA-256 recorded; re-uploading
   the same file is flagged.
2. **Extractors** (`lib/import/extractors/*`, one interface: `canHandle(file)` and
   `extract(file) → { tables[], texts[] }`): CSV/TSV (papaparse), XLSX (exceljs, every
   sheet), DOCX (mammoth raw text + tables), PDF (unpdf text layer; OCR fallback on
   rendered pages when a page has no text), TXT and pasted text, images (tesseract.js,
   bundled English data, runs locally), ZIP (fflate; depth 1, ≤ 200 entries, ratio and
   total-size caps, no path use, nested archives and unknown types skipped with a note).
3. **Record builder**: tables become rows with their header; free text goes through a
   line/block parser that finds phones, emails, websites and a likely business name.
   An optional `AiExtractor` adapter can turn text into rows; the shipped
   implementation is a disabled no-op.
4. **Column matching**: header synonyms (`Business Name`, `Company`, `Phone 1`,
   `Mobile`, `E-mail` …) give a suggested mapping that the user can change in the
   preview; the mapping is saved on the import.
5. **Normalize**: phones to E.164 (US/Canada NANP, extensions kept), emails syntax-checked
   and lower-cased, states to two-letter codes, time zone from state or area code.
   Each row gets `issues` (e.g. `invalid_phone`, `no_contact_method`, `ocr_low_confidence`)
   and a confidence score.
6. **Duplicates**: against existing companies (same E.164 phone, website domain, or
   normalized name + state) and within the file. Duplicates default to *skip*.
7. **Preview and approve**: nothing touches companies/leads until the user presses
   *Approve*. Approval runs in one transaction, creates companies, contacts and leads
   (owner = importer unless an admin picks someone), links every created row back to
   `import_id` / `import_rows.lead_id`, attaches the original file as a document and
   writes an audit entry.

## 5. Time zones and follow-ups

- Each company gets an IANA zone from its state (or area code when the state is
  missing); salespeople have their own zone on their profile.
- Follow-ups are entered as wall-clock time **in the lead's zone** by default (the form
  shows both zones), converted with `Intl`-based helpers that handle DST gaps/overlaps,
  and stored as UTC `timestamptz`.
- Quick picks ("tomorrow 10 am their time", "next business day", "in 2 hours") skip
  weekends and are clamped into the calling window.
- **Calling window**: 8 am–9 pm local (federal TCPA); 8 am–8 pm for Florida and
  Oklahoma; our house rule 9 am–6 pm weekdays shows as a softer warning. The lead page
  shows the shop's local time and a warning outside the window; scheduling outside
  it asks for confirmation.
- "Callbacks due" = pending follow-ups with `due_at` before the end of the salesperson's
  own local day.

## 6. Test strategy

- **Unit (Vitest)**: phone/email/state normalization, time-zone conversion across DST,
  calling-window rules, column matcher, text record parser, dedupe keys, every extractor
  on small fixtures (OCR on a generated PNG), zip-bomb and traversal guards, rate
  limiter, CSV export escaping (formula injection).
- **Database (Vitest + embedded Postgres)**: migrations apply cleanly; RLS matrix
  (salesperson A cannot read B's leads, cannot change owner, cannot touch audit logs,
  cannot update/delete activities; admin can); suppression trigger; counter triggers.
- **End-to-end (Playwright, system Chromium)**: login → upload CSV → preview →
  approve → open lead → copy number → log call → schedule follow-up → follow-up shows
  as due on the dashboard. Runs against a fresh test database.

## 7. Increments

1. Scaffold: Next.js + Tailwind + Vitest + lint; README dev section.
2. Database: embedded Postgres runner, auth shim, migrations, RLS, seed (fake data).
3. RLS test suite.
4. Login, sessions, roles, app shell, rate limiting.
5. Dashboard metrics.
6. Domain libs: phone, email, states/time zones, calling window.
7. Import: upload, validation, storage, extractors (CSV/XLSX/TXT/paste/DOCX/PDF/images/ZIP), OCR.
8. Import preview: mapping, normalization, duplicates, approve.
9. Leads list: filters, pagination, salesperson queue.
10. Salesperson workflow: copy number, log call, outcome, interest, email requirement, follow-up.
11. Lead detail: timeline, notes, documents, scripts, follow-ups, opportunity stage.
12. Scripts library with versions, copy, AI-draft adapter (disabled).
13. Manager: reports, assignment, CSV export, users.
14. End-to-end test, security pass, docs.

## 8. Database environment decision

Docker is not usable by workers here, so the local Supabase stack can't run.

| Option | Pros | Cons |
|---|---|---|
| **(a)** New free Supabase project | Real Supabase (Auth, Storage, PostgREST) from day one | Needs approval; cloud data; free projects pause; tests need network |
| **(b)** Fix Docker access, run local Supabase | Closest to production, fully local | Needs a machine change (docker group) outside a worker's reach |
| **(c)** Local Postgres (embedded, from npm) with the same migrations and RLS | Works now with no root; fast, repeatable RLS tests; migrations stay Supabase-compatible | No Supabase Auth/Storage locally, so thin adapters are needed |

**Decision (24 Oct 2026): (c).** The captain chose (c) for Phase 1 and will pick the
hosted database when the CRM goes live.

**Recommendation: (c) now, then (a) or (b) when a deploy target is chosen.** Phase 1 is
built and tested on embedded Postgres 17 with a local `auth` shim (`auth.users`,
`auth.uid()`, `auth.jwt()`, roles `anon`/`authenticated`/`service_role`). Migrations in
`supabase/migrations/` never create anything in `auth`, so `supabase db push` works
unchanged later; switching is `DATABASE_URL` + `AUTH_PROVIDER` + `STORAGE_PROVIDER`.

**Update (27 Oct 2026): the CRM now runs on its own Supabase project.** Same migrations,
applied with `npm run supabase:migrate`; `AUTH_PROVIDER=supabase` (Supabase Auth) and
`STORAGE_PROVIDER=supabase` (private `crm-files` bucket). The demo seed never goes there;
tests keep using the embedded server. Because the project is far from where the app runs
(a round trip is several hundred ms), `asUser` pipelines BEGIN and the role setup with the
first queries, pages run their queries in parallel, and imports write in bulk statements.

### Live updates

Tables people watch are in the `supabase_realtime` publication. The browser subscribes
with the user's own access token (fetched from `/api/realtime/token`, refreshed by the
server from an encrypted httpOnly cookie), so Realtime applies the same RLS as queries.
On a change the page re-renders and reads again under RLS. Locally, statement triggers
`NOTIFY crm_changes` with only the table name and `/api/live` streams that to the browser.

### Research agent

`/research` is the setup for an AI agent that looks businesses up on the web. Providers
(Codex/OpenAI, Claude, Gemini, custom) implement `ResearchProvider` in
`src/lib/research/providers.ts`; all ship disabled and make no network calls. Saved
requests (`research_requests`) wait for a provider. Results are turned into a table by
`resultsToTable` and go through `createImport` like a spreadsheet: same preview,
duplicate checks and approval.

## 9. Deferred

Zoom Phone / Zoho Mail / any dialer or mail sending; a real agent behind the research page
and the other AI adapters; National DNC registry scrubbing (internal suppression list
only); SMS/WhatsApp; background job queue for very large imports.
