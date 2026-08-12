import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type {
  Carrier,
  Clinic,
  Driver,
  RouteDetail,
  RouteStatus,
  State,
  Stop,
} from '../types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  TrashIcon,
  cn,
} from '../components/ui';
import {
  AUDIT_STATUS,
  ROUTE_STATUS,
  STOP_STATUS,
  fmtDate,
  fmtMoney,
  fmtTime,
  fromDatetimeLocal,
  fromTimeInput,
  nowLocal,
  toFloat,
  toInt,
} from '../lib/format';

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 1st, 2nd, 3rd, 4th, 5th… — the sheet's stops are the driver's 1st/2nd/3rd stops.
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

type QuickForm = {
  stop_type: 'pickup' | 'delivery';
  clinic_ref: string; // free-typed clinic ID or name
  carrier_id: string;
  pickup_location: string;
  fedex_cutoff: string;
  fare: string;
};

const emptyQuick: QuickForm = {
  stop_type: 'pickup',
  clinic_ref: '',
  carrier_id: '',
  pickup_location: '',
  fedex_cutoff: '',
  fare: '',
};

export default function PickupSheetPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [driverText, setDriverText] = useState(''); // typed driver name
  const [driverQuery, setDriverQuery] = useState(''); // committed on blur/Enter
  const [day, setDay] = useState(todayStr());
  const [stateSel, setStateSel] = useState<number | null>(null);
  const [data, setData] = useState<RouteDetail | null>(null);
  // Every stop on the selected day, across ALL drivers — the duplicate search
  // runs against this whole-day list, so a clinic added by any driver today
  // blocks a second entry today, while a new day is a fresh sheet.
  const [dayStops, setDayStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quick, setQuick] = useState<QuickForm>(emptyQuick);
  const [adding, setAdding] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState<Stop | null>(null);
  const [confirmEndDay, setConfirmEndDay] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reference data once (drivers, clinics, carriers, states).
  useEffect(() => {
    Promise.all([api.drivers.list(), api.clinics.list(), api.carriers.list(), api.states.list()])
      .then(([driverList, clinicList, carrierList, stateList]) => {
        setDrivers(driverList);
        setClinics(clinicList);
        setCarriers(carrierList);
        setStates(stateList);
        const first = driverList.find((d) => d.active) ?? driverList[0];
        if (first) {
          setDriverText(first.name);
          setDriverQuery(first.name);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the pickup sheet.'));
  }, []);

  // Find (or create) the day's route for the selected driver.
  const loadSheet = useCallback(async () => {
    const name = driverQuery.trim();
    if (!name) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await api.routes.sheet({
        driver_id: null,
        driver_name: name,
        date: day,
        state_id: stateSel,
      });
      setData(detail);
      // Adopt the route's state once, unless the user already picked one.
      if (stateSel === null && detail.state_id != null) setStateSel(detail.state_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the pickup sheet.');
    } finally {
      setLoading(false);
    }
  }, [driverQuery, day, stateSel]);

  useEffect(() => {
    void loadSheet();
  }, [loadSheet]);

  // Load the whole day's stops (all drivers) so the duplicate search always
  // reflects what was already added on this date.
  const loadDayStops = useCallback(async () => {
    try {
      const stops = await api.stops.list({ date: day });
      setDayStops(stops);
    } catch {
      /* non-fatal — the current sheet still works */
    }
  }, [day]);

  useEffect(() => {
    void loadDayStops();
  }, [loadDayStops]);

  // Commit the typed driver name on blur/Enter (so every keystroke doesn't
  // hit the server). A new driver resets the state cutoff selection.
  const commitDriver = () => {
    const name = driverText.trim();
    if (name === driverQuery) return;
    if (data?.driver_name && data.driver_name.toLowerCase() !== name.toLowerCase()) {
      setStateSel(null);
    }
    setDriverQuery(name);
  };

  const changeDay = (d: string) => {
    setDay(d);
    setStateSel(null);
  };

  // The day after the currently-viewed date — "Start next day" jumps there
  // (the backend finds-or-creates a fresh empty sheet for it).
  const nextDayStr = (): string => {
    const [y, m, d] = day.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };

  // Day-end: close EVERY driver's route for this date. The data stays saved
  // (Daily Audit Report / Excel / Financials / Trends keep reading it) but
  // the day is locked — the next day starts with a fresh empty sheet.
  const endDay = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      await api.routes.closeDay(day);
      await Promise.all([loadSheet(), loadDayStops()]);
      setConfirmEndDay(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end the day.');
    } finally {
      setBusy(false);
    }
  };

  const changeRouteStatus = async (status: RouteStatus) => {
    if (!data || status === data.status) return;
    setStatusBusy(true);
    setError(null);
    try {
      await api.routes.update(data.id, { status });
      await loadSheet();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update the route status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const addStop = async () => {
    if (!data) return;
    if (data.status === 'closed') {
      setError('This day is closed — reopen it (route status) to add stops.');
      return;
    }
    if (quick.stop_type === 'pickup' && !quick.clinic_ref.trim()) {
      setError('Enter a clinic ID or name for the stop.');
      return;
    }
    if (duplicateRef) {
      setError(
        `${duplicateRef.reason} was already added on ${fmtDate(day)} (${duplicateRef.stop.driver_name ?? 'another driver'}'s stop ${duplicateRef.stop.sequence} — ${duplicateRef.stop.location_label ?? 'unknown'}). Pickups are unique per day — remove the duplicate or add it on a new day.`,
      );
      return;
    }
    if (quick.stop_type === 'delivery' && !quick.carrier_id) {
      setError('Select a carrier for the stop.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.routes.addStop(data.id, {
        route_id: data.id,
        stop_type: quick.stop_type,
        location_type: quick.stop_type === 'pickup' ? 'clinic' : 'carrier',
        clinic_id: null,
        clinic_ref: quick.stop_type === 'pickup' ? quick.clinic_ref.trim() || null : null,
        carrier_id: quick.stop_type === 'delivery' ? toInt(quick.carrier_id) : null,
        fedex_cutoff: fromTimeInput(quick.fedex_cutoff),
        pickup_location: quick.pickup_location.trim() || null,
        charge_amount: toFloat(quick.fare),
        scheduled_start: null,
        scheduled_end: null,
        dispatcher_id: null,
        notes: null,
      });
      setQuick({ ...emptyQuick, stop_type: quick.stop_type });
      await Promise.all([loadSheet(), loadDayStops()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add the stop.');
    } finally {
      setAdding(false);
    }
  };

  // One-click picked up / delivered — stamps the times (§ pickup sheet flow).
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
      await loadSheet();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update the stop.');
    } finally {
      setStatusBusy(false);
    }
  };

  const doDeleteStop = async () => {
    if (!data || !confirmStop) return;
    setBusy(true);
    setError(null);
    try {
      await api.routes.removeStop(data.id, confirmStop.id);
      setConfirmStop(null);
      await Promise.all([loadSheet(), loadDayStops()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete the stop.');
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    let fare = 0;
    let flags = 0;
    let audited = 0;
    let pickedUp = 0;
    for (const s of data?.stops ?? []) {
      if (s.driver_pay != null) fare += s.driver_pay;
      flags += s.violation_count;
      if (s.audit_status === 'passed' || s.audit_status === 'failed') audited += 1;
      if (s.status === 'completed') pickedUp += 1;
    }
    return {
      stops: data?.stops.length ?? 0,
      fare,
      flags,
      audited,
      pickedUp,
    };
  }, [data]);

  const nextStopNumber = (data?.stops.length ?? 0) + 1;

  // Duplicate guard (per-day): if this clinic ID/name was added by ANY driver
  // on the selected date, block it. A new day is a new sheet — the same clinic
  // can be added again there without a conflict.
  const duplicateRef = useMemo(() => {
    if (quick.stop_type !== 'pickup') return null;
    const ref = quick.clinic_ref.trim();
    if (!ref) return null;
    const lower = ref.toLowerCase();
    for (const s of dayStops) {
      if (s.clinic_id != null && s.clinic_id.toString() === ref) {
        return { stop: s, reason: `Clinic #${s.clinic_id}` };
      }
      if (s.clinic_ref && s.clinic_ref.trim().toLowerCase() === lower) {
        return { stop: s, reason: `Clinic "${s.clinic_ref}"` };
      }
      if (s.clinic_id != null) {
        const known = clinics.find((c) => c.id === s.clinic_id);
        if (known && known.name.toLowerCase() === lower) {
          return { stop: s, reason: known.name };
        }
      }
    }
    return null;
  }, [quick.clinic_ref, quick.stop_type, dayStops, clinics]);

  return (
    <div>
      <PageHeader
        title="Pickup Sheet"
        subtitle="One driver's day: clinic IDs, stops in order, fares, and the protocol checklist — everything flows to the report."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                api.reports.pickupSheetXlsx(day).catch((e) =>
                  setError(e instanceof Error ? e.message : 'Failed to download the Excel file.'),
                )
              }
            >
              Download Excel
            </Button>
            {data && (
              <Link to={`/routes/${data.id}`}>
                <Button variant="secondary">Open route →</Button>
              </Link>
            )}
          </>
        }
      />
      <ErrorBanner message={error} />

      {/* Driver + date = the sheet */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Driver" hint="Type a name — existing drivers appear as suggestions.">
          <Input
            list="drivers-datalist"
            value={driverText}
            onChange={(e) => setDriverText(e.target.value)}
            onBlur={() => commitDriver()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Driver name…"
          />
          <datalist id="drivers-datalist">
            {drivers.map((d) => (
              <option key={d.id} value={d.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Date">
          <Input type="date" value={day} onChange={(e) => changeDay(e.target.value)} />
        </Field>
        <Field
          label="Driver state"
          hint="The driver's state — used for the state cutoff, and the Excel export groups drivers under a heading per state."
        >
          <Select
            value={stateSel ?? ''}
            onChange={(e) => setStateSel(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">—</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {data && (
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={ROUTE_STATUS[data.status].tone}>{ROUTE_STATUS[data.status].label}</Badge>
            <Select
              className="!w-auto !py-1 text-xs"
              value={data.status}
              disabled={statusBusy}
              onChange={(e) => void changeRouteStatus(e.target.value as RouteStatus)}
            >
              {(Object.keys(ROUTE_STATUS) as RouteStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ROUTE_STATUS[s].label}
                </option>
              ))}
            </Select>
            <span className="text-xs text-slate-400">Route #{data.id}</span>
            {data.status !== 'closed' && (
              <Button
                variant="secondary"
                className="!py-1.5 text-xs"
                onClick={() => setConfirmEndDay(true)}
                disabled={busy || statusBusy}
                title="Close every driver's route for this date — the next day starts fresh"
              >
                End Day
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Reminder: pick the driver's state so the Excel export gets a
          per-state heading (otherwise the driver lands under 'No state
          assigned'). */}
      {data && stateSel === null && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
          ⚠ No driver state selected — pick one above so the Excel export groups this
          driver under its own state heading.
        </p>
      )}

      {/* Day complete — locked for reports, offer to start the next day */}
      {data && data.status === 'closed' && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">
              ✓ Day complete — locked and saved for the Daily Audit Report.
            </p>
            <p className="text-xs text-emerald-700">Start the next day with a fresh empty sheet.</p>
          </div>
          <Button variant="secondary" className="ml-auto" onClick={() => changeDay(nextDayStr())}>
            Start next day →
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner label="Loading pickup sheet…" />
      ) : !data ? (
        <EmptyState message="Pick a driver to open (or create) their day's pickup sheet." />
      ) : (
        <>
          {/* Quick add — the five data points on one row (hidden once the day
              is complete — the day is locked and the next day starts fresh) */}
          {data.status === 'closed' ? (
            <p className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              This day is complete — no more stops can be added. Data stays saved for the Daily
              Audit Report, Excel export, Financials and Trends.
            </p>
          ) : (
          <div className="card mb-6 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {data.stops.length === 0
                ? 'Start the sheet — add the 1st stop'
                : `Add stop — the ${ordinal(nextStopNumber)} stop`}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
              <Field label="Type" className="lg:col-span-1">
                <Select
                  value={quick.stop_type}
                  onChange={(e) =>
                    setQuick({
                      ...quick,
                      stop_type: e.target.value as 'pickup' | 'delivery',
                      clinic_ref: '',
                      carrier_id: '',
                    })
                  }
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </Select>
              </Field>
              <Field
                label={quick.stop_type === 'pickup' ? 'Clinic (ID)' : 'Carrier'}
                required
                className="lg:col-span-4"
              >
                {quick.stop_type === 'pickup' ? (
                  <>
                    <Input
                      list="clinics-datalist"
                      value={quick.clinic_ref}
                      onChange={(e) => setQuick({ ...quick, clinic_ref: e.target.value })}
                      placeholder="Clinic ID or name — e.g. 12"
                      className={duplicateRef ? '!border-amber-400 !ring-amber-200' : undefined}
                    />
                    <datalist id="clinics-datalist">
                      {clinics.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          #{c.id} · {c.name}
                          {c.city ? ` — ${c.city}` : ''}
                        </option>
                      ))}
                    </datalist>
                    {duplicateRef && (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        ⚠ Already added today — {duplicateRef.stop.driver_name ?? 'another driver'} ·
                        stop {duplicateRef.stop.sequence} · {duplicateRef.stop.location_label ?? '—'}
                      </span>
                    )}
                  </>
                ) : (
                  <Select
                    value={quick.carrier_id}
                    onChange={(e) => setQuick({ ...quick, carrier_id: e.target.value })}
                  >
                    <option value="">Select carrier…</option>
                    {carriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {quick.stop_type === 'pickup' && (
                <>
                  <Field label="Pickup location" className="lg:col-span-2">
                    <Input
                      value={quick.pickup_location}
                      onChange={(e) => setQuick({ ...quick, pickup_location: e.target.value })}
                      placeholder="Rear lockbox"
                    />
                  </Field>
                  <Field label="FedEx cutoff" className="lg:col-span-2">
                    <Input
                      type="time"
                      value={quick.fedex_cutoff}
                      onChange={(e) => setQuick({ ...quick, fedex_cutoff: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label="Fare ($)" required className="lg:col-span-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quick.fare}
                  onChange={(e) => setQuick({ ...quick, fare: e.target.value })}
                  placeholder="7.50"
                />
              </Field>
              <div className="flex items-end lg:col-span-1">
                <Button
                  onClick={() => void addStop()}
                  disabled={adding || data.status === 'closed' || Boolean(duplicateRef)}
                  className="w-full lg:w-auto"
                >
                  {adding ? 'Adding…' : '+ Add'}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Tip: type any clinic ID or name — no need to add it to the Clinics page first. Known
              clinics appear as suggestions as you type. Duplicates are checked per day: a clinic
              already added by any driver on {fmtDate(day)} is flagged, and the same clinic is
              free to add again on a new day.
            </p>
          </div>
          )}

          {/* Day totals */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Stops" value={totals.stops} tone="indigo" sub={fmtDate(data.route_date)} />
            <StatCard label="Total fare" value={fmtMoney(totals.fare)} tone="emerald" sub="driver income for the day" />
            <StatCard
              label="Flags raised"
              value={totals.flags}
              tone={totals.flags > 0 ? 'red' : 'slate'}
              sub="issues raised this day"
            />
            <StatCard
              label="Audited"
              value={`${totals.audited}/${totals.stops}`}
              tone={totals.audited === totals.stops && totals.stops > 0 ? 'emerald' : 'amber'}
              sub={`${totals.pickedUp} picked up · ${totals.stops - totals.audited} to audit`}
            />
          </div>

          {/* The sheet */}
          {data.stops.length === 0 ? (
            <EmptyState message="No stops on this sheet yet — add the 1st stop above." />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Stop</th>
                      <th>Clinic / Carrier</th>
                      <th>Pickup location</th>
                      <th>FedEx cutoff</th>
                      <th>Fare</th>
                      <th>Status</th>
                      <th>Protocol checklist</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stops.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 font-mono text-xs font-bold text-indigo-700">
                            {ordinal(s.sequence)}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            {s.clinic_id != null && <Badge tone="indigo">#{s.clinic_id}</Badge>}
                            <div>
                              <p className="font-medium text-slate-900">{s.location_label ?? '—'}</p>
                              <p className="text-xs text-slate-400">
                                {s.stop_type === 'pickup' ? 'Pickup' : 'Delivery'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {s.pickup_location ? (
                            <span className="text-xs text-slate-600">{s.pickup_location}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td>
                          {s.fedex_cutoff ? (
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {fmtTime(s.fedex_cutoff)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td>
                          <FareCell
                            stop={s}
                            disabled={data.status === 'closed'}
                            onChanged={() => void loadSheet()}
                            onError={(m) => setError(m)}
                          />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Badge tone={STOP_STATUS[s.status].tone}>{STOP_STATUS[s.status].label}</Badge>
                            {data.status !== 'closed' && s.status !== 'completed' && s.status !== 'skipped' && (
                              <button
                                onClick={() => void markDone(s)}
                                disabled={statusBusy}
                                className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                                title="Mark done — stamps the arrival/departure times"
                              >
                                {s.stop_type === 'pickup' ? '✓ Picked up' : '✓ Delivered'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/routes/${data.id}/stops/${s.id}/audit`}
                              className="transition hover:opacity-80"
                              title="Open the protocol checklist for this stop"
                            >
                              <Badge tone={AUDIT_STATUS[s.audit_status].tone}>
                                {AUDIT_STATUS[s.audit_status].label}
                              </Badge>
                            </Link>
                            {s.checklist_passed + s.checklist_failed > 0 && (
                              <span
                                className="text-[11px] font-medium text-slate-500"
                                title="Protocol checklist: passed / failed"
                              >
                                {s.checklist_passed}✓ {s.checklist_failed}✕
                              </span>
                            )}
                            {s.violation_count > 0 && (
                              <Badge tone="red">
                                {s.violation_count} flag{s.violation_count === 1 ? '' : 's'}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-right">
                          {data.status !== 'closed' && (
                            <button
                              onClick={() => setConfirmStop(s)}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Delete stop"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Tap a stop's audit badge to run the protocol checklist (lockbox / reception photos, package
            count, labels, SOP). A failed item raises a flag — everything on this sheet is reflected in
            the Daily Audit Report, Driver Day, Financials, and Trends.
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirmStop !== null}
        title="Delete stop"
        message={`Delete the ${ordinal(confirmStop?.sequence ?? 0)} stop (${confirmStop?.location_label ?? ''})? This cannot be undone.`}
        onConfirm={doDeleteStop}
        onCancel={() => setConfirmStop(null)}
        busy={busy}
      />

      <ConfirmDialog
        open={confirmEndDay}
        title="End the day"
        confirmLabel="End day"
        message={`Close every driver's route for ${fmtDate(day)}? The day is locked and stays saved for the Daily Audit Report, Excel export, Financials and Trends. The next day starts with a fresh empty sheet.`}
        onConfirm={endDay}
        onCancel={() => setConfirmEndDay(false)}
        busy={busy}
      />
    </div>
  );
}

// Inline fare editor — the fare is a must-have, so it can be corrected right
// on the row: creates the charge record when none exists, updates it otherwise.
function FareCell({
  stop,
  disabled,
  onChanged,
  onError,
}: {
  stop: Stop;
  disabled: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState(stop.driver_pay != null ? String(stop.driver_pay) : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(stop.driver_pay != null ? String(stop.driver_pay) : '');
    setSaved(false);
  }, [stop.driver_pay]);

  const commit = async () => {
    const fare = toFloat(value);
    if (fare == null || fare === stop.driver_pay) return;
    setSaving(true);
    try {
      if (stop.charge_id != null) {
        await api.charges.update(stop.charge_id, {
          driver_pay: fare,
          client_billed: stop.client_billed ?? fare,
          notes: null,
        });
      } else {
        await api.charges.createForStop(stop.id, {
          driver_pay: fare,
          client_billed: fare,
          notes: null,
        });
      }
      setSaved(true);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Failed to save the fare.');
    } finally {
      setSaving(false);
    }
  };

  // Archived days are read-only: show the fare as plain text instead of an
  // editor so a closed day can't be changed.
  if (disabled) {
    return <span className="text-sm font-semibold text-slate-700">{stop.driver_pay != null ? fmtMoney(stop.driver_pay) : '—'}</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        placeholder={stop.driver_pay == null ? 'fare' : undefined}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className={cn(
          'w-20 rounded-md border px-2 py-1 text-right text-sm font-semibold focus:outline-none',
          stop.driver_pay == null
            ? 'border-dashed border-slate-300 text-slate-400'
            : 'border-slate-200 text-slate-900 focus:border-indigo-400',
        )}
        title="Fare — edit and click away to save"
      />
      {saved && <span className="text-xs font-medium text-emerald-600">✓</span>}
      {saving && <span className="text-xs text-slate-400">…</span>}
    </div>
  );
}
