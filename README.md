# AGL QA & Live Dispatch Audit Platform

Internal, self-hosted, free/open-source web app for AirGround Logistics' QA Auditor.
Tracks live dispatch routes on a US map (Phase 3), three kinds of cutoff times,
a clinic database with full change history, driver pay / charge comparisons (Phase 4),
a digitized documentation audit checklist (Phase 2), SOP violation tracking,
daily audit reports with Excel export (Phase 5), and monthly trend analysis (Phase 6).

**Current status: Phase 6 complete** — Phase 2 (audit checklist, photos,
violations), Phase 3 (cutoff tracking, ETA calculation, US-wide Leaflet
dispatch map with manual location updates and projected State Cutoff
at-risk warnings), Phase 4 (financial tracking: driver pay vs client billing),
Phase 5 (daily audit report generator, matching §3.4, exportable to Excel),
and Phase 6 (monthly trend analysis: recurring issues by driver / clinic /
dispatcher with training-opportunity flags).

**New to the app?** Read the [Auditing & usage guide](./GUIDE.md) — the daily
pickup-sheet flow, the 12-step audit workflow, severity & escalation, the
checklist protocol, and a page-by-page walkthrough. The same guide is built
into the app under **Guide** in the sidebar.

---

## Quick start

### Backend (FastAPI + SQLite)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On first boot the SQLite database (`backend/agl.db`) is created automatically
and **seeded with demo data** — today's pickup sheets across VA / MD / NC with
audited records, SOP checklist statuses, charges and violations, ready to test
the Excel export and dashboards. To start with a clean sheet (only your own
data), set `AGL_SEED_DEMO=0` when starting the backend. Delete
`backend/agl.db` and restart to reseed from scratch. API docs at
[http://localhost:8000/docs](http://localhost:8000/docs).

### Frontend (React + Vite + Tailwind)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to the
backend on port 8000. Production build: `npm run build` (output in `frontend/dist`).

---

## Deployment (Vercel + Render)

The app ships as a monorepo: `frontend/` (React + Vite) and `backend/`
(FastAPI + SQLite). Deploy the frontend on Vercel and the backend on Render.

### 1. Push to GitHub (one repo, both folders)

```bash
cd E:\Auditor
git init
git add .
git commit -m "AGL QA audit platform — frontend + backend"
# create an empty repo on github.com (e.g. arslanaftab-0-8/agl-audit), then:
git branch -M main
git remote add origin https://github.com/arslanaftab-0-8/agl-audit.git
git push -u origin main
```

`backend/*.db`, `backend/photos/`, `node_modules`, `frontend/dist` and `.env*`
are gitignored, so no local data or secrets get committed.

### 2. Backend → Render (Web Service)

1. **New + PostgreSQL** → create a free database (region near the web service)
   → copy its **Internal Database URL**.
2. **New + Web Service** → connect the GitHub repo → pick `agl-audit`.
3. **Root directory**: `backend`
4. **Environment**: `Python` (auto-detected from `requirements.txt`; `runtime.txt`
   pins Python 3.11).
5. **Build command**: `pip install -r requirements.txt`
6. **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
7. **Environment variables**:
   - `DATABASE_URL=<your postgres internal url>` — persistent storage. Without
     it the backend falls back to a SQLite file on the **ephemeral** disk, and
     data resets on every restart/redeploy.
   - `AGL_SEED_DEMO=0` (start with a clean sheet — the US state list is still
     auto-seeded so the Driver state dropdown works).
8. Deploy → you get a URL like `https://agl-api.onrender.com`. Check
   `https://<your-app>.onrender.com/api/health` → `{"status":"ok"}`.

> 💡 **Database**: with `DATABASE_URL` set, your data survives restarts and
> redeploys. Uploaded audit photos still live on the ephemeral disk
> (`backend/photos/`) — the audit flow doesn't upload photos, so this rarely
> matters; attach a Render disk if you ever need them persisted too.
>
> ℹ️ **Schema changes after launch**: `create_all` creates tables but never
> alters them, and the ALTER-based light migrations are SQLite-only — so any
> column added to the models after the live Postgres exists must be created
> manually or with a real migration.

### 3. Frontend → Vercel

1. **Add New Project** → connect the GitHub repo → pick `agl-audit`.
2. **Root directory**: `frontend`
3. Framework preset: **Vite** (auto-detected; build `npm run build`, output
   `dist` — `vercel.json` adds the SPA fallback for client-side routes).
4. **Environment variables**: `VITE_API_URL=https://<your-render-app>.onrender.com`
   (no trailing slash; the frontend appends `/api`).
5. Deploy → live URL like `https://agl-audit.vercel.app`.

CORS is already wide open on the backend (`allow_origins=["*"]`), so the
Vercel domain can call the Render API without changes. After setting
`VITE_API_URL`, redeploy the frontend (or push a commit) and the live site
points at the Render backend.

### Local vs live API base

- **Local dev**: no `VITE_API_URL` set → the app calls relative `/api`, which
  Vite proxies to `localhost:8000`.
- **Live**: `VITE_API_URL` is baked in at build time (must be set in Vercel
  before building).

---

## Architecture

```
backend/            FastAPI + SQLAlchemy + SQLite
  app/
    main.py         app entry, CORS, startup create_all + seed
    database.py     engine / session (SQLite file at backend/agl.db)
    models.py       ORM models (Phase 1 tables + photos, checklist_items,
                    violations)
    schemas.py      Pydantic v2 request/response schemas
    seed.py         idempotent demo seed
    eta.py          Phase 3: haversine, historical speed/dwell, ETA + cutoffs
    routers/        CRUD per entity (clinics, drivers, dispatchers,
                    carriers, states, routes, stops) + Phase 2:
                    checklist, photos (upload), violations +
                    Phase 3: dispatch (map data)
frontend/           React 18 + Vite 5 + Tailwind 3 + React Router
  src/
    api/client.ts   typed fetch client
    components/     layout, UI kit (buttons, modals, tables, badges)
    pages/          dashboard + CRUD pages
```

## Data model

| Table | Notes |
|---|---|
| `drivers` | name, phone, vehicle, active, **current_lat/lng + location_updated_at** (manual live location) |
| `dispatchers` | name, active |
| `clinics` | contact, address, city/state/zip, lat/lng, clinic cutoff, notes, **JSON `change_log`** |
| `carriers` | type (fedex/ups/airport/lab), location, lat/lng, carrier cutoff |
| `states` | 2-letter code, state cutoff |
| `routes` | driver, state, date, status, closed_at, `state_cutoff_breached` |
| `stops` | route sequence, pickup/delivery, clinic-or-carrier, schedule, arrival/departure, status, **merged Job fields** (dispatcher, package counts ×3, driver/dispatch notes, audit status) |
| `photos` | stop, photo_type (pickup/delivery/building/lockbox/label/receipt/proof_slip/other), file on disk under `backend/photos/`, quality_status |
| `checklist_items` | stop, item_name (14 canonical §3.3 items, seeded verbatim), status pass/fail/na, notes |
| `violations` | stop **or** route, severity critical/major/minor, category, description, source driver/dispatch, escalated_at, resolved_at/by |
| `charge_records` | 1:1 with stop, driver_pay, client_billed, derived variance (billed − pay), notes |
| `daily_reports` | one per date, §3.4 snapshot (routes audited, stops reviewed, passed/failed, critical/major/minor, dispatch/driver errors), recommendations |

### Owner-approved Phase 1 decisions (do not silently revert)

- **Job merged into Stop** — no separate `jobs` table; audit fields live on `stops`.
  Phase 2 tables (Photo, ChecklistItem, Violation) will reference `stop_id`.
- **Clinic change history** stored as JSON in `clinics.change_log` (capped at 200
  entries) instead of a dedicated table.
- **Phase 2 tables** (`photos`, `checklist_items`, `violations`) reference
  `stop_id` directly (Job was merged into Stop in Phase 1). `violations` also
  carries a nullable `route_id` for whole-route findings (Phase 3 State Cutoff
  breach). `daily_reports` arrives in Phase 5.
- **Charge records (Phase 4)** are 1:1 with stops (`charge_records.stop_id`
  unique). `variance` is derived (`client_billed − driver_pay`) at
  serialization time so it never goes stale. Pickup/delivery timestamps live
  on the stop (`arrival_time` / `departure_time`).
- **Daily reports (Phase 5)** are snapshots per date (`daily_reports.report_date`
  unique). Metrics are derived from the day's audits (stops with a final
  pass/fail decision whose `audited_at` falls on the date) and the day's
  violations (by `created_at`), split by severity and source.
  `POST /api/reports/generate?date=…` is idempotent — re-run anytime to
  refresh a date's snapshot.
- **Schema auto-created** with `create_all` on startup (no Alembic).
- **Enums as strings** everywhere for SQLite friendliness; validated by Pydantic.
- **Audit checklist logic (§3 of the spec)** is untouched — the 14 item names in
  `backend/app/routers/checklist.py` are copied verbatim from the QA training
  manual and auto-seeded per stop on first open.
- **Suggested violations** (audit page → "Log violation" when an item fails) are
  derived from the §3.2 severity-examples table; the auditor can edit before saving.
- **Photos** are stored on local disk (`backend/photos/`, gitignored), served at
  `/photos`, limited to 15 MB. `python-multipart` is required — re-run
  `pip install -r requirements.txt` after updating. The audit page does **not**
  ask for photo uploads (owner decision) — the checklist is marked
  Pass/Fail/N/A from the evidence reviewed; the upload API stays available for
  other tools.
- **Escalation (§3.6):** marking a violation escalated stamps `escalated_at`; the
  dashboard surfaces open Critical violations for immediate supervisor notification.

## Deliberate security choices (flag if unacceptable)

- **PHI-adjacent data.** Deliberate Phase 1 choice: LAN-only deployment, no
  encryption at rest, no access logs, CORS open. HIPAA-style safeguards (access
  logging, restricted exports) are intentionally **deferred** — say the word if
  they must be scoped in.
- **No auth in Phase 1.** The single-user password gate is planned per the spec
  roadmap; it is not part of Phase 1.
- **No external dispatch-portal integration.** All data entry is manual.

## Roadmap

- **Phase 1** ✅ DB schema + CRUD
- **Phase 2** ✅ Audit checklist UI (§3 exactly), pass/fail, severity,
  violation tracking with escalation (checklist-only per owner — no photo upload)
- **Phase 3** ✅ Cutoff logic (carrier/clinic per stop, state per route) + ETA
  recalculation + dispatch map with manual location updates + projected-risk warnings
- **Phase 4** ✅ Financial / charge tracking (driver pay per stop, billed-vs-paid
  variance, uncharged-stop gap check)
- **Phase 5** ✅ Daily audit report generator (§3.4) + Excel export (openpyxl)
- **Phase 6** ✅ Monthly trend analysis dashboard (repeat offenders + training
  opportunity flags per §3.6 step 9 / §3.7)
- **Phase 7** — Docker Compose packaging (see `docker-compose.yml` stub)

## Phase 3 notes

- **Cutoffs (§4, finalized):** clinic cutoff = arrive **after**; carrier cutoff =
  arrive **before**; state cutoff = whole route. Per-stop status is computed as
  `ok | at_risk | breached | na`. **State Cutoff**: on route close, a late close
  auto-logs one Major "State cutoff breach" violation (idempotent); before close,
  the map shows a projected at-risk warning only.
- **ETA:** straight-line distance × 1.3 road factor ÷ historical average speed,
  plus historical dwell time — learned from completed stops on closed routes,
  with 55 km/h / 10 min defaults until history exists. Recalculated on every
  driver-location update; the map corrects for server-vs-browser clock skew via
  `generated_at`.
- **Manual location:** `PUT /api/drivers/{id}/location` (lat/lng) or "Driver is
  at…" stop picker on the map. New `drivers.current_lat/lng/location_updated_at`
  columns are added to existing databases automatically at startup
  (`run_light_migrations`, no Alembic).
- **Map:** Leaflet + OSM tiles (requires internet access for tiles; markers and
  polylines still render on a blank canvas offline).

## Phase 6 notes

- **Trends page** (`/trends`): pick a month/year → `GET /api/trends` aggregates
  that calendar month's violations (by `created_at`) into totals by severity /
  source / open-resolved, per-day activity, the most common violation
  categories, and repeat-offender tables by driver, clinic, and dispatcher.
  Read-only — no new tables.
- **Training-opportunity flags:** an entity is flagged when the same violation
  category recurs **2+ times** within the month (e.g. "Missing lockbox photo
  ×2"), per §3.6 step 9 (trend analysis) and §3.7 (common errors).
- **Context resolution:** driver comes from the violation's route (including
  route-level findings like the State Cutoff breach); clinic and dispatcher
  come from the stop. Seed data now includes violations spread across the
  current month so the dashboard demonstrates patterns on a fresh DB.

## Phase 5 notes

- **Reports page** (`/reports`): pick a date → **Generate report** computes and
  stores the §3.4 metrics; **Refresh report** recomputes. Auditor name +
  recommendations are editable; **Export .xlsx** downloads the workbook.
- **Excel workbook** (`backend/app/reporting.py`): sheet 1 renders §3.4 exactly
  (summary row 1: Date | Auditor | Routes Audited | Stops Reviewed | Total
  Passed | Total Failed; row 2: Critical | Major | Minor | Dispatch Errors |
  Driver Errors; plus Recommendations). Sheet 2 lists the day's violations in
  detail. New dependency: `openpyxl` — re-run `pip install -r requirements.txt`.
- **Seed:** the demo database now includes yesterday's report (4 passed / 1
  failed, 1 count-mismatch Major, 1 State Cutoff breach Major, 1 dispatch
  Minor). Delete `backend/agl.db` and restart to see it.
- **Pickup photo protocol (owner-defined extension, flagged per §3):** the 14
  §3.3 checklist items are untouched, but pickup stops now also seed **7
  additional documentation items** — *Inside Lockbox Photo, Outside Lockbox
  Photo, Front of Clinic Photo, Specimen Count Photo, Reception Area Photo,
  Package Photo, Clinic Entrance Photo* (lockbox set + reception set; items
  that don't apply to the pickup method are marked N/A). New photo types were
  added to match (`lockbox_inside`, `lockbox_outside`, `clinic_front`,
  `specimen_count`, `reception_area`, `package`, `clinic_entrance`). Seeding
  is additive and idempotent — existing pickup stops pick up the new items on
  their next audit open. Failing any item raises a violation (flag), which
  flows straight into the Daily Audit Report and trends.
- **Driver Day view** (`/driver-day`): pick a driver + date to see every stop
  with the flags raised on it (violation badges) and its pay — driver pay,
  client billed, variance — plus day totals (stops, flags incl. route-level,
  income, billed). Powered by `GET /api/drivers/{id}/day?day=YYYY-MM-DD`.
- **Pickup sheet flow (owner-defined, the main page):** the **Pickup Sheet**
  (`/sheet`, first item in the sidebar) is driver + date driven.
  `POST /api/routes/sheet` **finds-or-creates** the day's route for a
  driver+date, so there is no separate create-route step. Stops are added in
  order (1st, 2nd, 3rd…) with **clinic ID**, **pickup location**, **FedEx
  cutoff time**, and a **fare** — entering the fare auto-creates the driver's
  pay record (`ChargeRecord`). A one-click **✓ Picked up / ✓ Delivered**
  button completes the stop and stamps the arrival/departure times, and each
  row links straight to the audit page's **protocol checklist** (checklist
  only — no photo upload is asked for; the auditor marks each item
  Pass/Fail/N/A). Flags (violations) and audit results then flow into the
  Daily Audit Report (`/reports`), Driver Day, Financials, and Trends.
  New columns: `stops.fedex_cutoff` (time) + `stops.pickup_location` (text),
  auto-added to existing databases by `run_light_migrations`.
- **Manual entry (owner-defined):** the sheet never blocks on pre-added
  records. The driver is **typed by name** — the backend finds-or-creates the
  Driver on first use (`SheetCreate.driver_name`), so no drivers page visit is
  required. The clinic is **typed by ID or name** into the stop row
  (`stops.clinic_ref`, free text) — a name isn't required. When the typed
  value matches a known clinic (numeric id or case-insensitive name) it is
  auto-linked (`clinic_id`) so map/cutoff features still work; otherwise the
  stop keeps the plain typed label. The sheet also shows each stop's
  **checklist progress** (passed ✓ / failed ✕) right on the row.
- **Clock convention (app-wide):** every timestamp is **naive local time** —
  `datetime.now()` everywhere in the backend (models, routes, ETA/cutoff
  projections, dispatch-map `generated_at`, clinic change-log, violation
  `created_at`) matching the UI's local `audited_at`/`nowLocal()` stamps. This
  keeps cutoff comparisons (state-cutoff breach on close, per-stop at-risk
  status, map countdown clock-skew correction) and report date bucketing
  correct for a US office. If the office ever runs the server in a different
  timezone than the browser, switch everything together (one convention only).

## Phase 4 notes

- **Financials page** (`/financials`): filters by route / driver / date range,
  summary cards (client billed, driver pay, net variance, uncharged completed
  stops), and per-record CRUD. The "Add charge" picker lists only completed
  stops that don't yet have a charge.
- **API:** `GET /api/charges`, `GET /api/charges/summary`, `POST /api/stops/{id}/charge`,
  `PUT/DELETE /api/charges/{id}`. Stop serialization now includes
  `driver_pay` / `client_billed` / `variance` (null when uncharged), surfaced
  as the Pay column on Route Detail.
