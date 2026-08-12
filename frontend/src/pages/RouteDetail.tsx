import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  AuditStatus,
  Carrier,
  Clinic,
  Dispatcher,
  RouteDetail,
  RouteStatus,
  Stop,
  StopStatus,
  StopUpdateInput,
} from '../types';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  type Column,
} from '../components/ui';
import {
  AUDIT_STATUS,
  CUTOFF_STATUS,
  ROUTE_STATUS,
  STOP_STATUS,
  fmtClock,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtTime,
  fromDatetimeLocal,
  fromTimeInput,
  nowLocal,
  toDatetimeLocal,
  toFloat,
  toInt,
  toTimeInput,
} from '../lib/format';

type StopForm = {
  stop_type: 'pickup' | 'delivery';
  location_type: 'clinic' | 'carrier';
  clinic_id: string;
  carrier_id: string;
  fedex_cutoff: string;
  pickup_location: string;
  charge_amount: string;
  scheduled_start: string;
  scheduled_end: string;
  arrival_time: string;
  departure_time: string;
  status: StopStatus;
  dispatcher_id: string;
  package_count_portal: string;
  package_count_bag: string;
  package_count_photo: string;
  driver_notes: string;
  dispatch_notes: string;
  audit_status: AuditStatus;
  auditor_name: string;
  audited_at: string;
  notes: string;
};

const emptyForm: StopForm = {
  stop_type: 'pickup',
  location_type: 'clinic',
  clinic_id: '',
  carrier_id: '',
  fedex_cutoff: '',
  pickup_location: '',
  charge_amount: '',
  scheduled_start: '',
  scheduled_end: '',
  arrival_time: '',
  departure_time: '',
  status: 'pending',
  dispatcher_id: '',
  package_count_portal: '',
  package_count_bag: '',
  package_count_photo: '',
  driver_notes: '',
  dispatch_notes: '',
  audit_status: 'not_started',
  auditor_name: '',
  audited_at: '',
  notes: '',
};

function formFromStop(s: Stop): StopForm {
  return {
    stop_type: s.stop_type,
    location_type: s.location_type,
    clinic_id: s.clinic_id != null ? String(s.clinic_id) : '',
    carrier_id: s.carrier_id != null ? String(s.carrier_id) : '',
    fedex_cutoff: toTimeInput(s.fedex_cutoff),
    pickup_location: s.pickup_location ?? '',
    charge_amount: '',
    scheduled_start: toDatetimeLocal(s.scheduled_start),
    scheduled_end: toDatetimeLocal(s.scheduled_end),
    arrival_time: toDatetimeLocal(s.arrival_time),
    departure_time: toDatetimeLocal(s.departure_time),
    status: s.status,
    dispatcher_id: s.dispatcher_id != null ? String(s.dispatcher_id) : '',
    package_count_portal: s.package_count_portal != null ? String(s.package_count_portal) : '',
    package_count_bag: s.package_count_bag != null ? String(s.package_count_bag) : '',
    package_count_photo: s.package_count_photo != null ? String(s.package_count_photo) : '',
    driver_notes: s.driver_notes ?? '',
    dispatch_notes: s.dispatch_notes ?? '',
    audit_status: s.audit_status,
    auditor_name: s.auditor_name ?? '',
    audited_at: toDatetimeLocal(s.audited_at),
    notes: s.notes ?? '',
  };
}

export default function RouteDetailPage() {
  const { id } = useParams();
  const routeId = Number(id);
  const [route, setRoute] = useState<RouteDetail | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editStop, setEditStop] = useState<Stop | null>(null);
  const [form, setForm] = useState<StopForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmStop, setConfirmStop] = useState<Stop | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, clinicList, carrierList, dispatcherList] = await Promise.all([
        api.routes.detail(routeId),
        api.clinics.list(),
        api.carriers.list(),
        api.dispatchers.list(),
      ]);
      setRoute(detail);
      setClinics(clinicList);
      setCarriers(carrierList);
      setDispatchers(dispatcherList.filter((d) => d.active));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load route.');
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: RouteStatus) => {
    if (!route || status === route.status) return;
    setStatusBusy(true);
    setError(null);
    try {
      await api.routes.update(route.id, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, dispatcher_id: dispatchers[0]?.id ? String(dispatchers[0].id) : '' });
    setAddOpen(true);
  };

  const openEdit = (s: Stop) => {
    setForm(formFromStop(s));
    setEditStop(s);
  };

  const buildUpdatePayload = (): StopUpdateInput => ({
    stop_type: form.stop_type,
    location_type: form.location_type,
    clinic_id: form.location_type === 'clinic' ? toInt(form.clinic_id) : null,
    carrier_id: form.location_type === 'carrier' ? toInt(form.carrier_id) : null,
    fedex_cutoff: fromTimeInput(form.fedex_cutoff),
    pickup_location: form.pickup_location.trim() || null,
    scheduled_start: fromDatetimeLocal(form.scheduled_start),
    scheduled_end: fromDatetimeLocal(form.scheduled_end),
    arrival_time: fromDatetimeLocal(form.arrival_time),
    departure_time: fromDatetimeLocal(form.departure_time),
    status: form.status,
    dispatcher_id: toInt(form.dispatcher_id),
    package_count_portal: toInt(form.package_count_portal),
    package_count_bag: toInt(form.package_count_bag),
    package_count_photo: toInt(form.package_count_photo),
    driver_notes: form.driver_notes.trim() || null,
    dispatch_notes: form.dispatch_notes.trim() || null,
    audit_status: form.audit_status,
    auditor_name: form.auditor_name.trim() || null,
    notes: form.notes.trim() || null,
  });

  const saveStop = async () => {
    if (!route) return;
    if (
      (form.location_type === 'clinic' && !form.clinic_id) ||
      (form.location_type === 'carrier' && !form.carrier_id)
    ) {
      setError('Select a location for the stop.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const base = buildUpdatePayload();
      if (editStop) {
        let auditedAt = form.audited_at;
        if (!auditedAt && (form.audit_status === 'passed' || form.audit_status === 'failed')) {
          auditedAt = nowLocal();
        }
        const payload: StopUpdateInput = {
          ...base,
          audited_at: fromDatetimeLocal(auditedAt),
        };
        await api.stops.update(editStop.id, payload);
        setEditStop(null);
      } else {
        await api.routes.addStop(route.id, {
          route_id: route.id,
          stop_type: form.stop_type,
          location_type: form.location_type,
          clinic_id: form.location_type === 'clinic' ? toInt(form.clinic_id) : null,
          carrier_id: form.location_type === 'carrier' ? toInt(form.carrier_id) : null,
          fedex_cutoff: fromTimeInput(form.fedex_cutoff),
          pickup_location: form.pickup_location.trim() || null,
          charge_amount: toFloat(form.charge_amount),
          scheduled_start: fromDatetimeLocal(form.scheduled_start),
          scheduled_end: fromDatetimeLocal(form.scheduled_end),
          dispatcher_id: toInt(form.dispatcher_id),
          notes: form.notes.trim() || null,
        });
        setAddOpen(false);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const doDeleteStop = async () => {
    if (!route || !confirmStop) return;
    setBusy(true);
    setError(null);
    try {
      await api.routes.removeStop(route.id, confirmStop.id);
      setConfirmStop(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  // Pickup sheet one-click action: mark the stop as done, stamping the times.
  const markDone = async (s: Stop) => {
    setStatusBusy(true);
    setError(null);
    try {
      const now = fromDatetimeLocal(nowLocal());
      await api.stops.update(s.id, {
        status: 'completed',
        arrival_time: s.arrival_time ?? now,
        departure_time: s.departure_time ?? now,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update stop.');
    } finally {
      setStatusBusy(false);
    }
  };

  const countsMismatch = useMemo(() => {
    if (!route) return 0;
    // Reconcile Portal ↔ Bag ↔ Photo per §3.3: any two non-empty counts that
    // disagree count as a mismatch.
    return route.stops.filter((s) => {
      const counts = [s.package_count_portal, s.package_count_bag, s.package_count_photo].filter(
        (c): c is number => c != null,
      );
      return counts.length > 1 && new Set(counts).size > 1;
    }).length;
  }, [route]);

  const routeIdValid = Number.isInteger(routeId) && routeId > 0;
  if (!routeIdValid) {
    return (
      <div>
        <ErrorBanner message="Invalid route id." />
        <Link to="/routes" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to routes
        </Link>
      </div>
    );
  }

  if (loading) return <Spinner label="Loading route…" />;
  if (!route) {
    return (
      <div>
        <ErrorBanner message={error ?? 'Route not found.'} />
        <Link to="/routes" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to routes
        </Link>
      </div>
    );
  }

  const columns: Column<Stop>[] = [
    {
      key: 'seq',
      header: '#',
      render: (s) => (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 font-mono text-xs font-bold text-slate-600">
          {s.sequence}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{s.location_label ?? '—'}</p>
          <p className="text-xs text-slate-400">{s.clinic_name ? 'Clinic pickup' : s.carrier_name ? 'Carrier delivery' : ''}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (s) => (
        <Badge tone={s.stop_type === 'pickup' ? 'sky' : 'violet'}>
          {s.stop_type === 'pickup' ? 'Pickup' : 'Delivery'}
        </Badge>
      ),
    },
    {
      key: 'pickup_loc',
      header: 'Pickup location',
      render: (s) =>
        s.pickup_location ? (
          <span className="text-xs text-slate-600">{s.pickup_location}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'fedex_cutoff',
      header: 'FedEx cutoff',
      render: (s) =>
        s.fedex_cutoff ? (
          <span className="font-mono text-xs font-semibold text-slate-700">
            {fmtTime(s.fedex_cutoff)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'scheduled',
      header: 'Scheduled',
      render: (s) => (
        <div className="text-xs">
          <p className="text-slate-700">{fmtDateTime(s.scheduled_start)}</p>
          <p className="text-slate-400">→ {fmtDateTime(s.scheduled_end)}</p>
        </div>
      ),
    },
    {
      key: 'arrival',
      header: 'Arr / Dep',
      render: (s) => (
        <div className="text-xs">
          <p className={s.arrival_time ? 'text-slate-700' : 'text-slate-300'}>
            {fmtDateTime(s.arrival_time)}
          </p>
          <p className={s.departure_time ? 'text-slate-700' : 'text-slate-300'}>
            {fmtDateTime(s.departure_time)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        <div className="flex items-center gap-2">
          <Badge tone={STOP_STATUS[s.status].tone}>{STOP_STATUS[s.status].label}</Badge>
          {s.status !== 'completed' && s.status !== 'skipped' && (
            <button
              onClick={() => void markDone(s)}
              disabled={statusBusy}
              className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
              title="Mark this stop as done — stamps the time"
            >
              {s.stop_type === 'pickup' ? '✓ Mark picked up' : '✓ Mark delivered'}
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'audit',
      header: 'Audit',
      render: (s) => (
        <div className="flex items-center gap-1.5">
          <Link
            to={`/routes/${route.id}/stops/${s.id}/audit`}
            className="transition hover:opacity-80"
            title="Open audit workspace"
          >
            <Badge tone={AUDIT_STATUS[s.audit_status].tone}>{AUDIT_STATUS[s.audit_status].label}</Badge>
          </Link>
          {s.violation_count > 0 && (
            <Badge tone="red">{s.violation_count} viol.</Badge>
          )}
          {s.photo_count > 0 && (
            <Badge tone="indigo">{s.photo_count} photo{s.photo_count === 1 ? '' : 's'}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'counts',
      header: 'Counts P/B/Ph',
      render: (s) => (
        <span className="font-mono text-xs text-slate-600">
          {s.package_count_portal ?? '–'} / {s.package_count_bag ?? '–'} / {s.package_count_photo ?? '–'}
        </span>
      ),
    },
    {
      key: 'pay',
      header: 'Pay',
      render: (s) =>
        s.driver_pay != null ? (
          <div className="text-xs">
            <p className="font-medium text-slate-800">{fmtMoney(s.driver_pay)}</p>
            <p className={s.variance != null && s.variance < 0 ? 'text-red-600' : 'text-slate-400'}>
              billed {fmtMoney(s.client_billed)}
            </p>
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'cutoffs',
      header: 'Cutoffs',
      render: (s) => {
        const cutoff = s.stop_type === 'pickup' ? s.clinic_cutoff : s.carrier_cutoff;
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={CUTOFF_STATUS[s.cutoff_status].tone}>{CUTOFF_STATUS[s.cutoff_status].label}</Badge>
            <span className="text-xs text-slate-500">{fmtClock(cutoff)}</span>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Route #${route.id}`}
        subtitle={`${fmtDate(route.route_date)} · ${route.driver_name ?? 'No driver'} · ${
          route.state_code ?? 'No state'
        }`}
        actions={
          <>
            <Link to="/routes">
              <Button variant="secondary">← Routes</Button>
            </Link>
            <Button onClick={openAdd} disabled={route.status === 'closed'}>
              <span className="text-base leading-none">+</span> Add stop
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={ROUTE_STATUS[route.status].tone}>{ROUTE_STATUS[route.status].label}</Badge>
            <Select
              className="!w-auto !py-1 text-xs"
              value={route.status}
              disabled={statusBusy}
              onChange={(e) => void changeStatus(e.target.value as RouteStatus)}
            >
              {(Object.keys(ROUTE_STATUS) as RouteStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ROUTE_STATUS[s].label}
                </option>
              ))}
            </Select>
          </div>
          {route.closed_at && (
            <p className="mt-2 text-xs text-slate-400">Closed {fmtDateTime(route.closed_at)}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stops</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{route.stops.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Count mismatches
          </p>
          <p className={countsMismatch > 0 ? 'mt-1 text-2xl font-bold text-red-600' : 'mt-1 text-2xl font-bold text-slate-900'}>
            {countsMismatch}
          </p>
          <p className="mt-1 text-xs text-slate-400">Portal / bag / photo reconcile</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            State cutoff
          </p>
          {route.state_cutoff ? (
            <>
              <p className="mt-1 text-lg font-bold text-slate-900">{fmtClock(route.state_cutoff)}</p>
              {route.projected_state_cutoff_risk ? (
                <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  ⚠ Projected to miss — final ETA {fmtClock(route.projected_final_eta)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  Final ETA {fmtClock(route.projected_final_eta)}
                </p>
              )}
              {route.state_cutoff_breached && (
                <p className="mt-1 text-xs font-semibold text-red-600">
                  Breached — Major violation logged on close
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-500">No state cutoff set</p>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={route.stops}
        onEdit={openEdit}
        onDelete={setConfirmStop}
        emptyMessage="No stops on this route yet — add the first one."
      />

      {/* Add / edit stop modal */}
      <Modal
        open={addOpen || editStop !== null}
        onClose={() => {
          setAddOpen(false);
          setEditStop(null);
        }}
        title={editStop ? `Edit stop #${editStop.sequence}` : 'Add stop'}
        wide
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setAddOpen(false);
                setEditStop(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveStop} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={form.stop_type}
              onChange={(e) =>
                setForm({ ...form, stop_type: e.target.value as 'pickup' | 'delivery' })
              }
            >
              <option value="pickup">Pickup (clinic)</option>
              <option value="delivery">Delivery (carrier)</option>
            </Select>
          </Field>
          <Field label="Location type">
            <Select
              value={form.location_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  location_type: e.target.value as 'clinic' | 'carrier',
                  clinic_id: '',
                  carrier_id: '',
                })
              }
            >
              <option value="clinic">Clinic</option>
              <option value="carrier">Carrier</option>
            </Select>
          </Field>
          {form.location_type === 'clinic' ? (
            <Field label="Clinic" required className="sm:col-span-2">
              <Select
                value={form.clinic_id}
                onChange={(e) => setForm({ ...form, clinic_id: e.target.value })}
              >
                <option value="">Select clinic…</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.city ?? ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Carrier" required className="sm:col-span-2">
              <Select
                value={form.carrier_id}
                onChange={(e) => setForm({ ...form, carrier_id: e.target.value })}
              >
                <option value="">Select carrier…</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.stop_type === 'pickup' && (
            <>
              <Field label="Pickup location" hint="e.g. rear lockbox, reception desk, suite 210">
                <Input
                  value={form.pickup_location}
                  onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
                  placeholder="Rear lockbox"
                />
              </Field>
              <Field label="FedEx cutoff time">
                <Input
                  type="time"
                  value={form.fedex_cutoff}
                  onChange={(e) => setForm({ ...form, fedex_cutoff: e.target.value })}
                />
              </Field>
              {!editStop && (
                <Field label="Charge amount ($)" hint="Driver pay — auto-creates the charge record">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.charge_amount}
                    onChange={(e) => setForm({ ...form, charge_amount: e.target.value })}
                    placeholder="7.50"
                  />
                </Field>
              )}
            </>
          )}
          <Field label="Scheduled start">
            <Input
              type="datetime-local"
              value={form.scheduled_start}
              onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
            />
          </Field>
          <Field label="Scheduled end">
            <Input
              type="datetime-local"
              value={form.scheduled_end}
              onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
            />
          </Field>
          <Field label="Arrival time">
            <Input
              type="datetime-local"
              value={form.arrival_time}
              onChange={(e) => setForm({ ...form, arrival_time: e.target.value })}
            />
          </Field>
          <Field label="Departure time">
            <Input
              type="datetime-local"
              value={form.departure_time}
              onChange={(e) => setForm({ ...form, departure_time: e.target.value })}
            />
          </Field>
          <Field label="Stop status">
            <Select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as StopStatus })}
            >
              {(Object.keys(STOP_STATUS) as StopStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STOP_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dispatcher">
            <Select
              value={form.dispatcher_id}
              onChange={(e) => setForm({ ...form, dispatcher_id: e.target.value })}
            >
              <option value="">—</option>
              {dispatchers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="border-t border-slate-100 pt-3 sm:col-span-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Package counts
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Portal count">
                <Input
                  type="number"
                  value={form.package_count_portal}
                  onChange={(e) => setForm({ ...form, package_count_portal: e.target.value })}
                />
              </Field>
              <Field label="Bag count">
                <Input
                  type="number"
                  value={form.package_count_bag}
                  onChange={(e) => setForm({ ...form, package_count_bag: e.target.value })}
                />
              </Field>
              <Field label="Photo count">
                <Input
                  type="number"
                  value={form.package_count_photo}
                  onChange={(e) => setForm({ ...form, package_count_photo: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {editStop && (
            <div className="border-t border-slate-100 pt-3 sm:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Audit status
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Audit result">
                  <Select
                    value={form.audit_status}
                    onChange={(e) =>
                      setForm({ ...form, audit_status: e.target.value as AuditStatus })
                    }
                  >
                    {(Object.keys(AUDIT_STATUS) as AuditStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {AUDIT_STATUS[s].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Auditor">
                  <Input
                    value={form.auditor_name}
                    onChange={(e) => setForm({ ...form, auditor_name: e.target.value })}
                    placeholder="e.g. M. Carter"
                  />
                </Field>
                <Field label="Audited at">
                  <Input
                    type="datetime-local"
                    value={form.audited_at}
                    onChange={(e) => setForm({ ...form, audited_at: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          )}

          <Field label="Driver notes" className="sm:col-span-2">
            <TextArea
              value={form.driver_notes}
              onChange={(e) => setForm({ ...form, driver_notes: e.target.value })}
              placeholder="Lockbox missing, clinic closed, staff unavailable…"
            />
          </Field>
          <Field label="Dispatch notes" className="sm:col-span-2">
            <TextArea
              value={form.dispatch_notes}
              onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })}
              placeholder="Requests for missing photos, status corrections…"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="General notes for this stop"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmStop !== null}
        title="Delete stop"
        message={`Delete stop #${confirmStop?.sequence ?? ''} (${confirmStop?.location_label ?? ''})? This cannot be undone.`}
        onConfirm={doDeleteStop}
        onCancel={() => setConfirmStop(null)}
        busy={busy}
      />
    </div>
  );
}
