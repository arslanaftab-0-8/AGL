import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AuditStatus, Route, Stop, StopStatus } from '../types';
import {
  Badge,
  DataTable,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  type Column,
} from '../components/ui';
import { AUDIT_STATUS, STOP_STATUS, fmtDate, fmtDateTime } from '../lib/format';

export default function StopsPage() {
  const [rows, setRows] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeFilter, setRouteFilter] = useState('');
  const [stopStatus, setStopStatus] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stopList, routeList] = await Promise.all([
        api.stops.list({
          route_id: routeFilter ? Number(routeFilter) : undefined,
          stop_status: stopStatus || undefined,
          audit_status: auditStatus || undefined,
        }),
        api.routes.list(),
      ]);
      setRows(stopList);
      setRoutes(routeList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stops.');
    } finally {
      setLoading(false);
    }
  }, [routeFilter, stopStatus, auditStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<Stop>[] = [
    {
      key: 'route',
      header: 'Route',
      render: (s) => (
        <Link
          to={`/routes/${s.route_id}`}
          className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          #{s.route_id}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (s) => fmtDate(s.route_date),
    },
    { key: 'driver', header: 'Driver', render: (s) => s.driver_name ?? '—' },
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
      render: (s) => <span className="font-medium text-slate-900">{s.location_label ?? '—'}</span>,
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
      key: 'status',
      header: 'Status',
      render: (s) => <Badge tone={STOP_STATUS[s.status].tone}>{STOP_STATUS[s.status].label}</Badge>,
    },
    {
      key: 'audit',
      header: 'Audit',
      render: (s) => <Badge tone={AUDIT_STATUS[s.audit_status].tone}>{AUDIT_STATUS[s.audit_status].label}</Badge>,
    },
    {
      key: 'arrival',
      header: 'Arrival',
      render: (s) => fmtDateTime(s.arrival_time),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stops"
        subtitle="Every pickup and delivery across all routes. Click a route number to edit."
      />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Route">
          <Select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)}>
            <option value="">All routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {fmtDate(r.route_date)} · {r.driver_name ?? ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stop status">
          <Select value={stopStatus} onChange={(e) => setStopStatus(e.target.value)}>
            <option value="">All</option>
            {(Object.keys(STOP_STATUS) as StopStatus[]).map((s) => (
              <option key={s} value={s}>
                {STOP_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Audit status">
          <Select value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
            <option value="">All</option>
            {(Object.keys(AUDIT_STATUS) as AuditStatus[]).map((s) => (
              <option key={s} value={s}>
                {AUDIT_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading stops…" />
      ) : (
        <DataTable columns={columns} rows={rows} emptyMessage="No stops match the filters." />
      )}
    </div>
  );
}
