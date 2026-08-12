import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  ChecklistItem,
  ChecklistStatus,
  RouteDetail,
  Severity,
  Stop,
  Violation,
  ViolationSource,
} from '../types';
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  cn,
} from '../components/ui';
import {
  AUDIT_STATUS,
  SEVERITY,
  SOURCE,
  fmtDateTime,
  fromDatetimeLocal,
  nowLocal,
} from '../lib/format';

// ---------------------------------------------------------------------------
// §3.3 checklist — item_name is the source of truth; group only for display.
// ---------------------------------------------------------------------------

const CHECKLIST_SECTIONS: Array<{ step: number; title: string; items: string[] }> = [
  { step: 2, title: 'Pickup & delivery documentation', items: ['Pickup Photo', 'Delivery Photo', 'Building Photo', 'Lockbox Photo', 'Proof Slip'] },
  { step: 3, title: 'Package count', items: ['Package Count Verified'] },
  { step: 4, title: 'Shipping labels', items: ['Shipping Label Visible', 'Barcode Readable'] },
  { step: 5, title: 'Timestamps', items: ['Timestamp Verified'] },
  { step: 8, title: 'Clinic & destination', items: ['Correct Clinic', 'Correct Destination'] },
  { step: 10, title: 'Driver notes', items: ['Driver Notes Reviewed'] },
  { step: 11, title: 'Dispatch review', items: ['Dispatch Verified'] },
  { step: 12, title: 'SOP compliance', items: ['SOP Followed'] },
];

// Suggested violations when a checklist item fails. Derived directly from the
// §3.2 severity-examples table — the auditor can edit before saving.
const FAIL_SUGGESTION: Record<string, { severity: Severity; category: string; description: string }> = {
  'Pickup Photo': { severity: 'critical', category: 'Missing pickup proof', description: 'No pickup photo on file for this stop.' },
  'Delivery Photo': { severity: 'critical', category: 'No delivery proof', description: 'No delivery photo on file for this stop.' },
  'Building Photo': { severity: 'major', category: 'Missing building photo', description: 'Building exterior photo missing.' },
  'Lockbox Photo': { severity: 'major', category: 'Missing lockbox photo', description: 'Lockbox photo missing for this pickup.' },
  'Proof Slip': { severity: 'major', category: 'Missing proof slip', description: 'Proof slip not documented.' },
  'Inside Lockbox Photo': { severity: 'major', category: 'Missing lockbox photo', description: 'Photo of the package inside the lockbox is missing.' },
  'Outside Lockbox Photo': { severity: 'major', category: 'Missing lockbox photo', description: 'Photo of the outside of the lockbox is missing.' },
  'Front of Clinic Photo': { severity: 'major', category: 'Missing building photo', description: 'Front-of-clinic photo is missing.' },
  'Specimen Count Photo': { severity: 'critical', category: 'Missing pickup proof', description: 'No specimen-count photo on file for this pickup.' },
  'Reception Area Photo': { severity: 'major', category: 'Missing building photo', description: 'Reception area photo is missing.' },
  'Package Photo': { severity: 'critical', category: 'Missing pickup proof', description: 'No photo of the package at reception on file.' },
  'Clinic Entrance Photo': { severity: 'major', category: 'Missing building photo', description: 'Clinic entrance photo is missing.' },
  'Shipping Label Visible': { severity: 'major', category: 'Missing shipping label photo', description: 'Shipping label not visible in photos.' },
  'Barcode Readable': { severity: 'major', category: 'Unreadable barcode', description: 'Barcode not readable in the photos.' },
  'Package Count Verified': { severity: 'critical', category: 'Package count mismatch', description: 'Portal / bag / photo counts do not reconcile.' },
  'Correct Clinic': { severity: 'critical', category: 'Wrong clinic visited', description: 'Location does not match the assigned clinic.' },
  'Correct Destination': { severity: 'critical', category: 'Wrong destination', description: 'Package went to the incorrect destination.' },
  'Timestamp Verified': { severity: 'major', category: 'Incorrect timestamps', description: 'Arrival/departure timestamps are inconsistent.' },
  'Dispatch Verified': { severity: 'major', category: 'Dispatch review incomplete', description: 'Job closed without complete dispatch review.' },
  'Driver Notes Reviewed': { severity: 'minor', category: 'Driver notes unsupported', description: 'Driver notes are not supported by photos.' },
  'SOP Followed': { severity: 'major', category: 'SOP not followed', description: 'SOP documentation is not complete.' },
};

// Pickup photo protocol (owner-defined): reviewed per pickup stop in addition
// to the §3.3 items. 'Lockbox Photo'/'Proof Slip' already live in §3.3.
const PICKUP_PHOTO_ITEMS = [
  'Inside Lockbox Photo',
  'Outside Lockbox Photo',
  'Front of Clinic Photo',
  'Specimen Count Photo',
  'Reception Area Photo',
  'Package Photo',
  'Clinic Entrance Photo',
];

const DELIVERY_REQUIREMENTS: Record<string, string> = {
  fedex: 'Shipment at counter/drop box · receipt (if available) · shipment photo.',
  ups: 'Shipment at counter · receipt · shipment photo.',
  airport: 'Cargo counter · acceptance receipt · shipment photo.',
  lab: 'Receiving area · staff acceptance (if applicable) · proof of delivery.',
};

const VIOLATION_CATEGORIES = [
  'Missing pickup proof', 'No delivery proof', 'Missing building photo', 'Missing lockbox photo',
  'Missing proof slip', 'Missing shipping label photo', 'Unreadable barcode', 'Package count mismatch',
  'Wrong clinic visited', 'Wrong destination', 'Incorrect timestamps', 'Dispatch review incomplete',
  'Driver notes unsupported', 'SOP not followed', 'Documentation', 'State cutoff breach', 'Other',
];

// Multiple categories can be selected at once — one violation is saved per
// selected category (each gets the same severity/description/source).
type ViolationDraft = {
  severity: Severity;
  categories: string[];
  description: string;
  source: ViolationSource;
};

const emptyDraft: ViolationDraft = {
  severity: 'major',
  categories: [],
  description: '',
  source: 'driver',
};

const stepCls = 'mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function AuditStopPage() {
  const { routeId: routeIdRaw, stopId: stopIdRaw } = useParams();
  const routeId = Number(routeIdRaw);
  const stopId = Number(stopIdRaw);
  const idValid = Number.isInteger(routeId) && routeId > 0 && Number.isInteger(stopId) && stopId > 0;

  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [auditorName, setAuditorName] = useState<string>(() => localStorage.getItem('agl.auditor') ?? '');
  const [completing, setCompleting] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<ViolationDraft>(emptyDraft);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmViolation, setConfirmViolation] = useState<Violation | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!idValid) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.routes.detail(routeId);
      const found = detail.stops.find((s) => s.id === stopId) ?? null;
      if (!found) throw new Error('Stop not found on this route.');
      const [items, violationList] = await Promise.all([
        api.checklist.get(stopId),
        api.violations.listForStop(stopId),
      ]);
      setRoute(detail);
      setStop(found);
      setChecklist(items);
      setViolations(violationList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit data.');
    } finally {
      setLoading(false);
    }
  }, [idValid, routeId, stopId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mark the stop as in-progress the first time the audit page is opened.
  useEffect(() => {
    if (stop && stop.audit_status === 'not_started') {
      void api.stops
        .update(stop.id, { audit_status: 'in_progress' })
        .then(() =>
          setStop((s) => (s && s.audit_status === 'not_started' ? { ...s, audit_status: 'in_progress' } : s)),
        )
        .catch(() => {
          /* non-fatal */
        });
    }
  }, [stop]);

  const setAuditor = (name: string) => {
    setAuditorName(name);
    localStorage.setItem('agl.auditor', name);
  };

  // ---- checklist ----

  const setItemStatus = async (item: ChecklistItem, status: ChecklistStatus) => {
    const previous = checklist;
    setChecklist((items) => items.map((it) => (it.id === item.id ? { ...it, status } : it)));
    try {
      const updated = await api.checklist.update(item.id, status, item.notes ?? undefined);
      setChecklist((items) => items.map((it) => (it.id === item.id ? updated : it)));
    } catch (e) {
      setChecklist(previous);
      setError(e instanceof Error ? e.message : 'Failed to update checklist item.');
    }
  };

  const saveItemNotes = async (item: ChecklistItem, notes: string) => {
    setChecklist((items) => items.map((it) => (it.id === item.id ? { ...it, notes } : it)));
    try {
      const updated = await api.checklist.update(item.id, item.status, notes || null);
      setChecklist((items) => items.map((it) => (it.id === item.id ? updated : it)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note.');
    }
  };

  const suggestViolation = (itemName: string) => {
    const suggestion = FAIL_SUGGESTION[itemName];
    setDraft(
      suggestion
        ? {
            severity: suggestion.severity,
            categories: [suggestion.category],
            description: suggestion.description,
            source: 'driver',
          }
        : {
            severity: 'major',
            categories: ['Other'],
            description: `Checklist item failed: ${itemName}`,
            source: 'driver',
          },
    );
    setDraftOpen(true);
  };

  // ---- violations ----

  const createViolation = async () => {
    if (!stop || draft.categories.length === 0 || !draft.description.trim()) return;
    setDraftSaving(true);
    setError(null);
    const created: Violation[] = [];
    let failed = false;
    for (const category of draft.categories) {
      try {
        const v = await api.violations.createForStop(stop.id, {
          severity: draft.severity,
          category: category.trim(),
          description: draft.description.trim(),
          source: draft.source,
        });
        created.push(v);
      } catch (e) {
        failed = true;
        setError(e instanceof Error ? e.message : 'Failed to save some violations.');
      }
    }
    if (created.length > 0) setViolations((list) => [...created, ...list]);
    if (failed) {
      // Keep the dialog open; drop categories that already saved so a retry
      // can't create duplicates.
      const saved = new Set(created.map((v) => v.category));
      setDraft((d) => ({ ...d, categories: d.categories.filter((c) => !saved.has(c.trim())) }));
    } else {
      setDraftOpen(false);
      setDraft(emptyDraft);
    }
    setDraftSaving(false);
  };

  const escalateViolation = async (v: Violation) => {
    try {
      const updated = await api.violations.update(v.id, { escalated_at: fromDatetimeLocal(nowLocal()) });
      setViolations((list) => list.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to escalate.');
    }
  };

  const resolveViolation = async (v: Violation) => {
    try {
      const updated = await api.violations.update(v.id, {
        resolved_at: fromDatetimeLocal(nowLocal()),
        resolved_by: auditorName || 'auditor',
      });
      setViolations((list) => list.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to resolve.');
    }
  };

  const doDeleteViolation = async () => {
    if (!confirmViolation) return;
    setBusy(true);
    setError(null);
    try {
      await api.violations.remove(confirmViolation.id);
      setViolations((list) => list.filter((v) => v.id !== confirmViolation.id));
      setConfirmViolation(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  // ---- completion ----

  const completeAudit = async (passed: boolean) => {
    if (!stop) return;
    setCompleting(true);
    setError(null);
    try {
      const updated = await api.stops.update(stop.id, {
        audit_status: passed ? 'passed' : 'failed',
        audited_at: fromDatetimeLocal(nowLocal()),
        auditor_name: auditorName || null,
      });
      setStop((s) => (s ? { ...s, ...updated } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete audit.');
    } finally {
      setCompleting(false);
    }
  };

  // ---- derived ----

  const summary = useMemo(() => {
    const counts = { pass: 0, fail: 0, na: 0 };
    for (const item of checklist) counts[item.status] += 1;
    return counts;
  }, [checklist]);

  const missingInfo = useMemo(() => {
    if (!stop || !route) return [] as string[];
    const missing: string[] = [];
    if (!route.driver_name) missing.push('Driver');
    if (!stop.location_label) missing.push('Clinic/Carrier');
    if (stop.stop_type === 'pickup' && !stop.arrival_time) missing.push('Pickup time');
    if (stop.stop_type === 'delivery' && !stop.departure_time) missing.push('Delivery time');
    if (!stop.dispatcher_name) missing.push('Dispatcher');
    return missing;
  }, [stop, route]);

  if (!idValid) {
    return (
      <div>
        <ErrorBanner message="Invalid route/stop id." />
        <Link to="/routes" className="text-sm font-medium text-indigo-600 hover:underline">← Back to routes</Link>
      </div>
    );
  }

  if (loading) return <Spinner label="Loading audit workspace…" />;
  if (!stop || !route) {
    return (
      <div>
        <ErrorBanner message={error ?? 'Stop not found.'} />
        <Link to="/routes" className="text-sm font-medium text-indigo-600 hover:underline">← Back to routes</Link>
      </div>
    );
  }

  const deliveryNote = route.stops.find(
    (s) => s.location_type === 'carrier' && s.carrier_name,
  )?.carrier_name;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Audit Stop #${stop.sequence} — ${stop.location_label ?? 'Unknown'}`}
        subtitle={
          <>
            Route #{route.id} · {route.driver_name ?? 'No driver'} ·{' '}
            <Link to={`/routes/${route.id}`} className="text-indigo-600 hover:underline">
              view route
            </Link>
          </>
        }
        actions={
          <Link to={`/routes/${route.id}`}>
            <Button variant="secondary">← Back to route</Button>
          </Link>
        }
      />
      <ErrorBanner message={error} />

      {/* Summary bar */}
      <div className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div>
          <p className={stepCls}>Audit status</p>
          <Badge tone={AUDIT_STATUS[stop.audit_status].tone}>{AUDIT_STATUS[stop.audit_status].label}</Badge>
        </div>
        <div>
          <p className={stepCls}>Checklist</p>
          <p className="text-sm font-semibold text-slate-800">
            {summary.pass}/{checklist.length} passed · <span className="text-red-600">{summary.fail} failed</span> · {summary.na} N/A
          </p>
        </div>
        <div>
          <p className={stepCls}>Violations</p>
          <p className="text-sm font-semibold text-slate-800">
            {violations.filter((v) => !v.resolved_at).length} open
            {violations.some((v) => v.severity === 'critical' && !v.resolved_at) && (
              <span className="ml-1 text-red-600">· critical!</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={auditorName}
            onChange={(e) => setAuditor(e.target.value)}
            placeholder="Auditor name"
            className="!w-40 !py-1.5 text-xs"
          />
          <Button
            variant="secondary"
            disabled={completing || stop.audit_status === 'passed'}
            onClick={() => void completeAudit(true)}
          >
            Complete — Pass
          </Button>
          <Button
            variant="danger"
            disabled={completing || stop.audit_status === 'failed'}
            onClick={() => void completeAudit(false)}
          >
            Complete — Fail
          </Button>
        </div>
      </div>

      {/* Step 1 — job information */}
      <Section step={1} title="Job information" hint="Verify driver, route #, clinic, pickup/delivery times, status, dispatcher.">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Info label="Driver" value={route.driver_name} />
          <Info label="Route #" value={`#${route.id}`} />
          <Info label="Location" value={stop.location_label} />
          <Info label="Type" value={stop.stop_type === 'pickup' ? 'Pickup' : 'Delivery'} />
          <Info label="Scheduled" value={`${fmtDateTime(stop.scheduled_start)} → ${fmtDateTime(stop.scheduled_end)}`} />
          <Info label="Arrival / Departure" value={`${fmtDateTime(stop.arrival_time)} / ${fmtDateTime(stop.departure_time)}`} />
          <Info label="Status" value={stop.status} />
          <Info label="Dispatcher" value={stop.dispatcher_name} />
        </div>
        {missingInfo.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ Missing info — flag for review: {missingInfo.join(', ')}
          </p>
        )}
      </Section>

      {/* Step 2 — pickup & delivery documentation checklist */}
      <Section
        step={2}
        title="Pickup & delivery documentation"
        hint="Lockbox: lockbox photo, package inside, empty lockbox after, proof slip, building exterior. Reception: reception area, package, proof slip, entrance. Mark Pass only when the evidence is present and clear."
      >
        <ChecklistRows
          items={CHECKLIST_SECTIONS.find((s) => s.items.includes('Pickup Photo'))!.items}
          checklist={checklist}
          onStatus={setItemStatus}
          onNotes={saveItemNotes}
          onSuggest={suggestViolation}
        />
      </Section>

      {/* Pickup photo protocol (pickup stops only) — lockbox + reception sets */}
      {stop.stop_type === 'pickup' && (
        <ChecklistSection
          section={{ step: 2, title: 'Pickup photo protocol', items: PICKUP_PHOTO_ITEMS }}
          checklist={checklist}
          onStatus={setItemStatus}
          onNotes={saveItemNotes}
          onSuggest={suggestViolation}
        />
      )}

      {/* Step 3 — package counts */}
      <Section step={3} title="Package count" hint="Reconcile Portal ↔ Bag ↔ Photo. Mismatch → flag immediately.">
        <div className="flex flex-wrap gap-6 text-sm">
          <Info label="Portal count" value={stop.package_count_portal} />
          <Info label="Clinic bag count" value={stop.package_count_bag} />
          <Info label="Driver photo count" value={stop.package_count_photo} />
        </div>
        {countsDiffer(stop) && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            ✕ Counts do not reconcile — mark "Package Count Verified" as failed and log a violation.
          </p>
        )}
        <ChecklistRows
          items={CHECKLIST_SECTIONS.find((s) => s.items.includes('Package Count Verified'))!.items}
          checklist={checklist}
          onStatus={setItemStatus}
          onNotes={saveItemNotes}
          onSuggest={suggestViolation}
        />
      </Section>

      {/* Step 4 — shipping labels */}
      <ChecklistSection
        section={CHECKLIST_SECTIONS.find((s) => s.items.includes('Shipping Label Visible'))!}
        checklist={checklist}
        onStatus={setItemStatus}
        onNotes={saveItemNotes}
        onSuggest={suggestViolation}
      />

      {/* Step 5 — arrival times */}
      <Section step={5} title="Arrival times" hint="Within scheduled window? Unusual delay → check driver notes.">
        <div className="flex flex-wrap gap-6 text-sm">
          <Info label="Scheduled" value={`${fmtDateTime(stop.scheduled_start)} → ${fmtDateTime(stop.scheduled_end)}`} />
          <Info label="Actual arrival" value={fmtDateTime(stop.arrival_time)} />
          <Info label="Actual departure" value={fmtDateTime(stop.departure_time)} />
        </div>
        <ChecklistRows
          items={CHECKLIST_SECTIONS.find((s) => s.items.includes('Timestamp Verified'))!.items}
          checklist={checklist}
          onStatus={setItemStatus}
          onNotes={saveItemNotes}
          onSuggest={suggestViolation}
        />
      </Section>

      {/* Step 6 — delivery documentation */}
      <Section step={6} title="Delivery documentation" hint="Per destination type.">
        {deliveryNote ? (
          <p className="text-sm text-slate-600">{deliveryNote}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(DELIVERY_REQUIREMENTS).map(([type, req]) => (
              <p key={type} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold uppercase">{type}:</span> {req}
              </p>
            ))}
          </div>
        )}
      </Section>

      {/* Step 8 — clinic & destination */}
      <ChecklistSection
        section={CHECKLIST_SECTIONS.find((s) => s.items.includes('Correct Clinic'))!}
        checklist={checklist}
        onStatus={setItemStatus}
        onNotes={saveItemNotes}
        onSuggest={suggestViolation}
      />

      {/* Step 9 — route sequence */}
      <Section step={9} title="Route sequence" hint="Proper order · no unexplained detours · no duplicates · no skipped clinics.">
        <ol className="space-y-1">
          {route.stops.map((s) => (
            <li
              key={s.id}
              className={
                s.id === stop.id
                  ? 'flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800'
                  : 'flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600'
              }
            >
              <span className="font-mono text-xs">{s.sequence}.</span>
              {s.location_label ?? '—'}
              <Badge tone={s.stop_type === 'pickup' ? 'sky' : 'violet'}>
                {s.stop_type === 'pickup' ? 'Pickup' : 'Delivery'}
              </Badge>
              {s.id === stop.id && <span className="text-xs font-bold uppercase">← auditing</span>}
            </li>
          ))}
        </ol>
      </Section>

      {/* Steps 10 + 11 — notes + dispatch */}
      <Section step={10} title="Driver notes" hint="Photos must support the stated explanation.">
        {stop.driver_notes ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{stop.driver_notes}</p>
        ) : (
          <p className="text-sm text-slate-400">No driver notes.</p>
        )}
      </Section>
      <Section step={11} title="Dispatch review" hint="Dispatcher verified job, updated status, reviewed photos, followed SOP.">
        {stop.dispatch_notes ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{stop.dispatch_notes}</p>
        ) : (
          <p className="text-sm text-slate-400">No dispatch notes.</p>
        )}
      </Section>

      {/* Checklist items for notes/dispatch/SOP */}
      {CHECKLIST_SECTIONS.filter((s) =>
        ['Driver Notes Reviewed', 'Dispatch Verified', 'SOP Followed'].some((n) => s.items.includes(n)),
      ).map((section) => (
        <ChecklistSection
          key={section.title}
          section={section}
          checklist={checklist}
          onStatus={setItemStatus}
          onNotes={saveItemNotes}
          onSuggest={suggestViolation}
        />
      ))}

      {/* Step 12 — SOP violations */}
      <Section step={12} title="SOP violations" hint="Critical → notify Dispatch Supervisor immediately. Major → request correction before end of shift.">
        <div className="space-y-2">
          {violations.length === 0 && (
            <p className="text-sm text-slate-400">No violations logged for this stop.</p>
          )}
          {violations.map((v) => (
            <ViolationRow
              key={v.id}
              violation={v}
              onEscalate={() => void escalateViolation(v)}
              onResolve={() => void resolveViolation(v)}
              onDelete={() => setConfirmViolation(v)}
            />
          ))}
          <Button variant="secondary" onClick={() => { setDraft(emptyDraft); setDraftOpen(true); }}>
            <span className="text-base leading-none">+</span> Log violation
          </Button>
        </div>
      </Section>

      {/* Violation draft modal */}
      <Modal
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title="Log SOP violation"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraftOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void createViolation()}
              disabled={draftSaving || draft.categories.length === 0 || !draft.description.trim()}
            >
              {draftSaving
                ? 'Saving…'
                : draft.categories.length > 1
                  ? `Log ${draft.categories.length} violations`
                  : 'Log violation'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Severity" required>
              <Select
                value={draft.severity}
                onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
              >
                {(Object.keys(SEVERITY) as Severity[]).map((s) => (
                  <option key={s} value={s}>{SEVERITY[s].label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Source">
              <Select
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value as ViolationSource })}
              >
                {(Object.keys(SOURCE) as ViolationSource[]).map((s) => (
                  <option key={s} value={s}>{SOURCE[s].label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Categories"
            required
            hint="Select one or more — a violation is saved for every category you pick."
          >
            <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
              {VIOLATION_CATEGORIES.map((c) => {
                const checked = draft.categories.includes(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition',
                      checked ? 'bg-indigo-50 font-medium text-indigo-800' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          categories: checked
                            ? draft.categories.filter((x) => x !== c)
                            : [...draft.categories, c],
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                    />
                    {c}
                  </label>
                );
              })}
            </div>
            {draft.categories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {draft.categories.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({ ...draft, categories: draft.categories.filter((x) => x !== c) })
                      }
                      className="text-indigo-400 transition hover:text-indigo-700"
                      aria-label={`Remove ${c}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>
          <Field label="Description" required>
            <TextArea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="What happened, what evidence was reviewed…"
            />
          </Field>
          <p className="text-xs text-slate-400">
            Escalation: Critical violations should be reported to the Dispatch Supervisor immediately (§3.6). You can mark this violation escalated from the list after saving.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmViolation !== null}
        title="Delete violation"
        message={`Delete this ${confirmViolation?.severity ?? ''} violation? Trend data for this stop will be removed.`}
        onConfirm={doDeleteViolation}
        onCancel={() => setConfirmViolation(null)}
        busy={busy}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card mb-5 p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {hint && <p className="mb-3 text-xs text-slate-400">{hint}</p>}
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={value ? 'font-medium text-slate-800' : 'text-slate-300'}>{value ?? '—'}</p>
    </div>
  );
}

function countsDiffer(s: Stop): boolean {
  const counts = [s.package_count_portal, s.package_count_bag, s.package_count_photo].filter(
    (c): c is number => c != null,
  );
  return counts.length > 1 && new Set(counts).size > 1;
}

function ChecklistRows({
  items,
  checklist,
  onStatus,
  onNotes,
  onSuggest,
}: {
  items: string[];
  checklist: ChecklistItem[];
  onStatus: (item: ChecklistItem, status: ChecklistStatus) => void;
  onNotes: (item: ChecklistItem, notes: string) => void;
  onSuggest: (itemName: string) => void;
}) {
  const rows = items
    .map((name) => checklist.find((it) => it.item_name === name))
    .filter((it): it is ChecklistItem => Boolean(it));

  return (
    <div className="space-y-2">
      {rows.map((item) => (
        <ChecklistRow
          key={item.id}
          item={item}
          onStatus={onStatus}
          onCommitNotes={onNotes}
          onSuggest={onSuggest}
        />
      ))}
    </div>
  );
}

function ChecklistSection({
  section,
  checklist,
  onStatus,
  onNotes,
  onSuggest,
}: {
  section: { step: number; title: string; items: string[] };
  checklist: ChecklistItem[];
  onStatus: (item: ChecklistItem, status: ChecklistStatus) => void;
  onNotes: (item: ChecklistItem, notes: string) => void;
  onSuggest: (itemName: string) => void;
}) {
  return (
    <Section step={section.step} title={section.title}>
      <ChecklistRows
        items={section.items}
        checklist={checklist}
        onStatus={onStatus}
        onNotes={onNotes}
        onSuggest={onSuggest}
      />
    </Section>
  );
}

function ChecklistRow({
  item,
  onStatus,
  onCommitNotes,
  onSuggest,
}: {
  item: ChecklistItem;
  onStatus: (item: ChecklistItem, status: ChecklistStatus) => void;
  onCommitNotes: (item: ChecklistItem, notes: string) => void;
  onSuggest: (itemName: string) => void;
}) {
  const [draft, setDraft] = useState(item.notes ?? '');
  useEffect(() => setDraft(item.notes ?? ''), [item.notes]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{item.item_name}</span>
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {(['pass', 'fail', 'na'] as ChecklistStatus[]).map((status, i) => (
          <button
            key={status}
            onClick={() => void onStatus(item, status)}
            className={`px-3 py-1 text-xs font-semibold transition ${
              i > 0 ? 'border-l border-slate-300' : ''
            } ${
              item.status === status
                ? status === 'pass'
                  ? 'bg-emerald-600 text-white'
                  : status === 'fail'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-400 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : 'N/A'}
          </button>
        ))}
      </div>
      {item.status === 'fail' && (
        <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600" onClick={() => onSuggest(item.item_name)}>
          Log violation
        </Button>
      )}
      <Input
        value={draft}
        placeholder="Notes…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommitNotes(item, draft)}
        className="!w-full !py-1 text-xs sm:!w-64"
      />
    </div>
  );
}

function ViolationRow({
  violation,
  onEscalate,
  onResolve,
  onDelete,
}: {
  violation: Violation;
  onEscalate: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY[violation.severity].tone}>{SEVERITY[violation.severity].label}</Badge>
        <span className="text-sm font-semibold text-slate-800">{violation.category}</span>
        <Badge tone={SOURCE[violation.source].tone}>{SOURCE[violation.source].label}</Badge>
        {violation.escalated_at && <Badge tone="red">Escalated {fmtDateTime(violation.escalated_at)}</Badge>}
        {violation.resolved_at && (
          <Badge tone="emerald">Resolved {fmtDateTime(violation.resolved_at)}{violation.resolved_by ? ` by ${violation.resolved_by}` : ''}</Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!violation.escalated_at && (
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={onEscalate}>Escalate</Button>
          )}
          {!violation.resolved_at && (
            <Button variant="ghost" className="!px-2 !py-1 text-xs text-emerald-700" onClick={onResolve}>Resolve</Button>
          )}
          <button onClick={onDelete} className="rounded-lg p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Delete violation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">{violation.description}</p>
    </div>
  );
}
