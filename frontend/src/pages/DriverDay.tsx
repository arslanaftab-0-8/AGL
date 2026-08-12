import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Driver, DriverDaySummary, DriverDayStop } from '../types';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  type Column,
} from '../components/ui';
import { SEVERITY, fmtDate, fmtDateTime, fmtMoney } from '../lib/format';

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DriverDayPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [day, setDay] = useState(todayLocal());
  const [data, setData] = useState<DriverDaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.drivers
      .list()
      .then((list) => {
        setDrivers(list);
        if (list.length > 0) setDriverId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load drivers.'));
  }, []);

  const load = useCallback(async () => {
    if (driverId == null) {
      setLoading(false); // no driver selected (yet) — show the empty state, not a spinner
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await api.drivers.day(driverId, day));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load driver day.');
    } finally {
      setLoading(false);
    }
  }, [driverId, day]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<DriverDayStop>[] = [
    {
      key: 'route',
      header: 'Route',
      render: (s) => (
        <Link to={`/routes/${s.route_id}`} className="font-mono text-sm font-semibold text-indigo-600 hover:underline">
          #{s.route_id}
        </Link>
      ),
    },
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
      header: 'Stop',
      render: (s) => (
        <span className="font-medium text-slate-900">{s.location_label ?? '—'}</span>
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
      key: 'arrival',
      header: 'Arrival',
      render: (s) => <span className="text-xs text-slate-600">{fmtDateTime(s.arrival_time)}</span>,
    },
    {
      key: 'flags',
      header: 'Flags raised',
      render: (s) =>
        s.flag_count === 0 ? (
          <span className="text-slate-300">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {s.violations.slice(0, 3).map((v) => (
              <Badge key={v.id} tone={SEVERITY[v.severity].tone}>
                {v.category}
              </Badge>
            ))}
            {s.flag_count > 3 && (
              <span className="text-xs font-medium text-slate-500">+{s.flag_count - 3} more</span>
            )}
          </div>
        ),
    },
    {
      key: 'pay',
      header: 'Pay',
      render: (s) =>
        s.driver_pay != null ? (
          <span className="font-semibold text-slate-900">{fmtMoney(s.driver_pay)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'billed',
      header: 'Billed',
      render: (s) =>
        s.client_billed != null ? (
          <span className="text-slate-700">{fmtMoney(s.client_billed)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: 'variance',
      header: 'Variance',
      render: (s) =>
        s.variance != null ? (
          <Badge tone={s.variance < 0 ? 'red' : s.variance > 0 ? 'emerald' : 'slate'}>
            {s.variance < 0
              ? `-$${Math.abs(s.variance).toFixed(2)}`
              : s.variance > 0
                ? `+$${s.variance.toFixed(2)}`
                : '$0.00'}
          </Badge>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Driver Day"
        subtitle="Per-driver flags raised and income for one date — every stop, its violations, and its pay."
      />
      <ErrorBanner message={error} />

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Driver">
          <Select
            value={driverId ?? ''}
            onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : null)}
            disabled={drivers.length === 0}
          >
            {drivers.length === 0 && <option value="">No drivers</option>}
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>

      {loading ? (
        <Spinner label="Loading driver day…" />
      ) : !data ? (
        <EmptyState message="Select a driver to see their day." />
      ) : data.total_stops === 0 ? (
        <EmptyState message={`No stops for ${data.driver_name} on ${fmtDate(data.day)}.`} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Stops" value={data.total_stops} tone="indigo" sub={fmtDate(data.day)} />
            <StatCard
              label="Flags raised"
              value={data.total_flags}
              tone={data.total_flags > 0 ? 'red' : 'emerald'}
              sub={data.route_flags > 0 ? `${data.route_flags} route-level` : 'no violations'}
            />
            <StatCard label="Income (today)" value={fmtMoney(data.total_pay)} tone="emerald" sub="driver pay, all stops" />
            <StatCard label="Client billed" value={fmtMoney(data.total_billed)} tone="sky" sub="billed for the day" />
          </div>
          <DataTable columns={columns} rows={data.stops} emptyMessage="No stops." />
        </div>
      )}
    </div>
  );
}
