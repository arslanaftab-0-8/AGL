import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Badge, PageHeader } from '../components/ui';

// ---------------------------------------------------------------------------
// Static auditing & usage guide. No data fetching — a reference for the auditor.
// A printable companion lives at GUIDE.md in the repo root.
// ---------------------------------------------------------------------------

const SEVERITY_CARDS = [
  {
    severity: 'critical' as const,
    title: 'Critical',
    tone: 'red' as const,
    definition: 'Immediate escalation required.',
    examples: ['No delivery proof', 'Missing shipment', 'Wrong package delivered', 'Wrong clinic visited', 'Package left unattended', 'Missing pickup proof', 'Missing delivery confirmation'],
    action: 'Notify the Dispatch Supervisor immediately (§3.6). Record route + stop IDs, driver, dispatcher, and escalate from the audit page.',
  },
  {
    severity: 'major' as const,
    title: 'Major',
    tone: 'amber' as const,
    definition: 'Correction required before end of shift when possible.',
    examples: ['Missing building/lockbox photo', 'Blurry images', 'Incorrect timestamps', 'Missing shipping label photo', 'Unreadable barcode', 'State Cutoff breach on a route'],
    action: 'Request correction before end of shift (EOS). Track it in the Daily Audit Report.',
  },
  {
    severity: 'minor' as const,
    title: 'Minor',
    tone: 'slate' as const,
    definition: 'Documentation improvement.',
    examples: ['Missing notes', 'Typos', 'Minor formatting'],
    action: 'Track in the Daily Audit Report. Repeat patterns feed the Trends page.',
  },
];

const CHECKLIST_ITEMS = [
  'Pickup Photo', 'Delivery Photo', 'Building Photo', 'Lockbox Photo', 'Proof Slip',
  'Shipping Label Visible', 'Barcode Readable', 'Package Count Verified', 'Correct Clinic',
  'Correct Destination', 'Timestamp Verified', 'Dispatch Verified', 'Driver Notes Reviewed', 'SOP Followed',
];

const PICKUP_PROTOCOL_ITEMS = [
  'Inside Lockbox Photo', 'Outside Lockbox Photo', 'Front of Clinic Photo', 'Specimen Count Photo',
  'Reception Area Photo', 'Package Photo', 'Clinic Entrance Photo',
];

const PAGES = [
  {
    to: '/sheet',
    name: 'Pickup Sheet',
    what: 'The main page. Type a driver name + pick a date and their day opens (or is created) automatically — no need to add the driver first. Add stops as the 1st, 2nd, 3rd… — clinic ID, pickup location, FedEx cutoff, and fare on each row — then mark them picked up and run the protocol checklist. Everything flows to the report.',
  },
  {
    to: '/',
    name: 'Dashboard',
    what: 'The home screen: clinic/driver counts, open routes, audit queue, open violations (critical ones highlighted for immediate supervisor notification), state-cutoff breaches.',
  },
  {
    to: '/routes',
    name: 'Routes',
    what: 'Create a route for each driver each day (date + driver + state). Open a route to work its pickup sheet.',
  },
  {
    to: '/stops',
    name: 'Stops',
    what: 'Every stop across all routes. Filter to completed stops to find your audit queue, then open the audit page.',
  },
  {
    to: '/map',
    name: 'Dispatch Map',
    what: 'US map with active routes, driver location (manually entered), stop sequence line, ETA per stop, and projected state-cutoff risk warnings.',
  },
  {
    to: '/financials',
    name: 'Financials',
    what: 'Driver pay per stop vs. what was billed to the client, with variance. Edit billed amounts here after you know the actual charge.',
  },
  {
    to: '/reports',
    name: 'Reports',
    what: 'Daily Audit Report matching the §3.4 format — generate for any date and export to Excel (.xlsx).',
  },
  {
    to: '/trends',
    name: 'Trends',
    what: 'Monthly view of recurring issues by driver, clinic, and dispatcher, with training-opportunity flags when a category repeats 2+ times.',
  },
  {
    to: '/driver-day',
    name: 'Driver Day',
    what: 'Pick a driver and date to see every stop, the flags raised on it, driver pay, client billed, variance, and the driver\u2019s total income and flags for the day.',
  },
  {
    to: '/clinics',
    name: 'Clinics',
    what: 'The client database: ID, address, cutoff time, notes, and a full change log of every edit.',
  },
  {
    to: '/drivers',
    name: 'Drivers',
    what: 'Courier roster with phone/vehicle and the manual live-location fields used by the dispatch map.',
  },
  {
    to: '/dispatchers',
    name: 'Dispatchers',
    what: 'Office staff who assign/review jobs. Used for violation attribution and trends.',
  },
  {
    to: '/carriers',
    name: 'Carriers',
    what: 'FedEx / UPS / Airport Cargo / Laboratory destinations, their location, and cutoff times.',
  },
  {
    to: '/states',
    name: 'States',
    what: 'State cutoff times — the per-route deadline used to evaluate state-cutoff breaches.',
  },
];

const DRIVER_ERRORS = [
  'Missing pickup/delivery photo', 'Forgot building/lockbox photo', 'Wrong package count',
  'Wrong clinic', 'Blurry pictures', 'Missing label', 'No proof of delivery',
];

const DISPATCH_ERRORS = [
  'Approved incomplete jobs', 'Failed to request missing photos', 'Incorrect job status',
  'Missed SOP violations', 'Closed jobs with incomplete docs',
];

const KPIS = [
  { kpi: 'Audit Accuracy', target: '99%' },
  { kpi: 'Documentation Completeness', target: '100%' },
  { kpi: 'Critical Issues Missed', target: '0' },
  { kpi: 'Missing Photos', target: '0' },
  { kpi: 'Average Audit Time', target: '1–2 min per stop' },
];

function GuideSection({
  index,
  title,
  subtitle,
  children,
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="card mb-6 p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          {index}
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function FlowStep({ n, title, body }: { n: number; title: string; body: ReactNode }) {
  return (
    <li className="group relative flex gap-4 pb-6 last:pb-0">
      <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-slate-200 group-last:hidden" aria-hidden />
      <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700">
        {n}
      </span>
      <div className="min-w-0 pt-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <div className="mt-1 text-sm text-slate-600">{body}</div>
      </div>
    </li>
  );
}

export default function GuidePage() {
  return (
    <div>
      <PageHeader
        title="Auditing Guide"
        subtitle="How to run your daily pickup sheet and perform an audit — everything in one place."
      />

      {/* Daily flow */}
      <GuideSection index="1" title="Your daily flow (the pickup sheet)" subtitle="What you do each day, from blank sheet to finished report.">
        <ol>
          <FlowStep n={1} title="Open the Pickup Sheet" body={<>The <b>Pickup Sheet</b> is the first item in the sidebar — the main page. <b>Type the driver's name</b> (existing drivers appear as suggestions) and pick the <b>date</b>; the app finds or creates that driver's day automatically — no need to add the driver first, and no separate "create route" step.</>} />
          <FlowStep n={2} title="Add each stop with its fare" body={<>On the sheet, add the stops in order — the <b>1st, 2nd, 3rd…</b> stop. For each one: <b>type the clinic ID or name</b> (known clinics appear as suggestions — a name isn't required), the <b>pickup location</b> (e.g. rear lockbox, reception desk), the <b>FedEx cutoff time</b>, and the <b>fare</b>. The driver comes from the sheet itself, and entering the fare auto-creates the driver's pay record — no separate step. Fares can be corrected any time right on the row.</>} />
          <FlowStep n={3} title="Mark it picked up / delivered" body={<>After the pickup happens, hit <b>✓ Picked up</b> on the row (or <b>✓ Delivered</b> for a delivery stop). One click stamps the arrival and departure times.</>} />
          <FlowStep n={4} title="Audit the stop" body={<>Click the stop's audit badge to open the <b>protocol checklist</b>. Work the checklist: mark every item <b>Pass / Fail / N/A</b>. A Fail raises a flag (violation) with a suggested severity. No photos are uploaded in the app — you review the evidence and mark the checklist.</>} />
          <FlowStep n={5} title="Complete the audit" body={<>When every item is marked, hit <b>Complete — Pass</b> or <b>Complete — Fail</b>. Your name is stamped on the audit.</>} />
          <FlowStep n={6} title="Everything is on the sheet" body={<>The Daily Audit Report (<b>Reports</b>, exportable to Excel), driver flags + income (<b>Driver Day</b>), pay vs. billing (<b>Financials</b>), and monthly trends (<b>Trends</b>) all update automatically from your audits.</>} />
        </ol>
      </GuideSection>

      {/* 12-step audit workflow */}
      <GuideSection index="2" title="The 12-step audit workflow" subtitle="The official QA workflow from the training manual, digitized on the audit page.">
        <ol className="space-y-2">
          {[
            ['Open the completed job', 'Verify driver, route #, clinic, pickup time, delivery time, status, dispatcher. Missing info → flag for review.'],
            ['Verify pickup documentation', 'Lockbox: lockbox photo, package inside, empty lockbox after, proof slip, building exterior. Reception: reception area, package, proof slip, entrance.'],
            ['Verify package count', 'Reconcile Portal ↔ Clinic Bag ↔ Driver Photo counts. Mismatch → flag immediately.'],
            ['Verify shipping labels', 'Fully visible, readable, undamaged, correct destination, barcode visible, tracking number readable. Reject if unreadable.'],
            ['Verify arrival times', 'Within the scheduled window, on time, no unusual delay — check driver notes if delayed.'],
            ['Verify delivery documentation', 'FedEx: counter/drop box + receipt. UPS: counter + receipt. Airport: cargo counter + acceptance receipt. Lab: receiving area + proof of delivery.'],
            ['Verify picture quality', 'Clear, focused, well-lit, readable, complete. Reject: blurry, dark, cropped, too close, too far, unreadable.'],
            ['Verify correct clinic', 'Building matches the assigned clinic, name and address correct, right location visited.'],
            ['Verify route sequence', 'Stops in proper order, no unexplained detours, no duplicates, no skipped clinics.'],
            ['Review driver notes', 'e.g. "lockbox missing", "clinic closed", "staff unavailable". The photos must support the stated explanation.'],
            ['Verify dispatch review', 'Dispatcher verified the job, updated status, reviewed photos, added notes where required, followed SOP.'],
            ['Identify SOP violations', 'Assign severity (Critical / Major / Minor) — see the next section.'],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3 rounded-lg bg-slate-50 px-4 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </GuideSection>

      {/* Severity + escalation */}
      <GuideSection index="3" title="Severity levels & escalation" subtitle="How to classify an issue, and what to do about it (§3.2, §3.6).">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {SEVERITY_CARDS.map((s) => (
            <div key={s.severity} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={s.tone}>{s.title}</Badge>
                <span className="text-xs text-slate-500">{s.definition}</span>
              </div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Examples</p>
              <ul className="mb-3 space-y-1">
                {s.examples.map((e) => (
                  <li key={e} className="text-sm text-slate-600">· {e}</li>
                ))}
              </ul>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{s.action}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>Escalation procedure:</b> record route + stop IDs → record driver and dispatcher names → categorize the issue
          (Critical/Major/Minor) → attach screenshots if needed → notify the Dispatch Supervisor immediately for Critical →
          request Major fixes before end of shift → include it in the Daily Audit Report → watch for repeat issues in Trends.
        </div>
      </GuideSection>

      {/* Checklist protocol */}
      <GuideSection index="4" title="The per-stop checklist protocol" subtitle="Mark every item Pass / Fail / N/A on the audit page. Failing an item opens a suggested violation you can edit before saving.">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Standard items (§3.3)</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {CHECKLIST_ITEMS.map((it) => (
            <Badge key={it} tone="indigo">{it}</Badge>
          ))}
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pickup photo protocol (pickup stops only)</p>
        <div className="flex flex-wrap gap-2">
          {PICKUP_PROTOCOL_ITEMS.map((it) => (
            <Badge key={it} tone="sky">{it}</Badge>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Use <b>N/A</b> for items that don't apply (e.g. "Inside Lockbox Photo" for a reception pickup). Notes can be added
          to any item. The audit page shows the package-count reconciliation and arrival-time check automatically — mark the
          related checklist item to match what you find.
        </p>
      </GuideSection>

      {/* Cutoffs */}
      <GuideSection index="5" title="Cutoff times & the dispatch map" subtitle="Three kinds of deadlines (§4) — and how the map warns you live.">
        <div className="space-y-3">
          <CutoffRow
            name="Carrier cutoff"
            detail="Latest time a package can reach the FedEx/UPS counter or airport cargo to make that day's shipment/flight. Driver must arrive before this time."
            per="Per stop"
          />
          <CutoffRow
            name="Clinic cutoff"
            detail="The time the clinic finishes prepping specimens for the day. The driver must visit after this time — arriving early risks an incomplete pickup."
            per="Per stop"
          />
          <CutoffRow
            name="State cutoff"
            detail="A deadline barrier that the whole route must finish by. Evaluated per route: a breach is confirmed when the route closes late, and is logged as a Major violation."
            per="Per route"
          />
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <b>On the map:</b> while a route is still live, the map shows a projected at-risk warning
          (e.g. "projected to miss FL cutoff") when the ETA to the final stop passes the state cutoff. That's a live
          warning only — the formal Major violation is written once the route actually closes late. Driver location is
          entered manually (type it or pick the current stop) and the ETA recalculates automatically.
        </p>
      </GuideSection>

      {/* Page-by-page */}
      <GuideSection index="6" title="Every page, explained" subtitle="What each sidebar page is for and how to use it.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {PAGES.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <p className="text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{p.name} →</p>
              <p className="mt-1 text-sm text-slate-600">{p.what}</p>
            </Link>
          ))}
        </div>
      </GuideSection>

      {/* KPIs + common errors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GuideSection index="7" title="Performance standards (KPIs)" subtitle="What the QA program targets (§3.5).">
          <div className="divide-y divide-slate-100">
            {KPIS.map((k) => (
              <div key={k.kpi} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-600">{k.kpi}</span>
                <span className="text-sm font-bold text-indigo-700">{k.target}</span>
              </div>
            ))}
          </div>
        </GuideSection>

        <GuideSection index="8" title="Common errors to watch for" subtitle="These feed repeat-offender trends by driver and dispatcher (§3.7).">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-600">Driver errors</p>
              <ul className="space-y-1">
                {DRIVER_ERRORS.map((e) => (
                  <li key={e} className="text-sm text-slate-600">· {e}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-600">Dispatch errors</p>
              <ul className="space-y-1">
                {DISPATCH_ERRORS.map((e) => (
                  <li key={e} className="text-sm text-slate-600">· {e}</li>
                ))}
              </ul>
            </div>
          </div>
        </GuideSection>
      </div>

      {/* Running */}
      <GuideSection index="9" title="Running & maintenance" subtitle="For whoever starts the app in the office.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Backend (FastAPI)</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-200">
{`cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">
              The SQLite database (<code className="rounded bg-slate-100 px-1">backend/agl.db</code>) is created
              automatically and seeded with <b>demo data</b> (today's VA / MD / NC pickup sheets, audited
              records, SOP checklist statuses, charges and violations) so you can explore right away. Set{' '}
              <code className="rounded bg-slate-100 px-1">AGL_SEED_DEMO=0</code> to start completely empty instead.
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Frontend (React)</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-200">
{`cd frontend
npm install
npm run dev`}
            </pre>
            <p className="mt-2 text-sm text-slate-600">
              Open <code className="rounded bg-slate-100 px-1">http://localhost:5173</code>. The dev server proxies{' '}
              <code className="rounded bg-slate-100 px-1">/api</code> to the backend on port 8000. Delete{' '}
              <code className="rounded bg-slate-100 px-1">agl.db</code> and restart to start completely over.
            </p>
          </div>
        </div>
      </GuideSection>
    </div>
  );
}

function CutoffRow({ name, detail, per }: { name: string; detail: string; per: string }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{name}</p>
        <p className="mt-0.5 text-sm text-slate-600">{detail}</p>
      </div>
      <Badge tone="slate">{per}</Badge>
    </div>
  );
}
