import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Clinic, Driver, Route, Stop, Violation } from '../types';
import { Badge, ErrorBanner, Spinner, StatCard } from '../components/ui';
import { ROUTE_STATUS, fmtDate } from '../lib/format';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [routeList, clinicList, driverList, stopList, violationList] = await Promise.all([
        api.routes.list(),
        api.clinics.list(),
        api.drivers.list(),
        api.stops.list(),
        api.violations.list(),
      ]);
      setRoutes(routeList);
      setClinics(clinicList);
      setDrivers(driverList);
      setStops(stopList);
      setViolations(violationList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading dashboard…" />;

  const activeRoutes = routes.filter((r) => r.status === 'active' || r.status === 'planned');
  const breached = routes.filter((r) => r.state_cutoff_breached);
  const recent = [...routes].slice(0, 5);
  const needsAudit = stops.filter((s) => s.status === 'completed' && s.audit_status === 'not_started');
  const openViolations = violations.filter((v) => !v.resolved_at);
  const criticalOpen = openViolations.filter((v) => v.severity === 'critical');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live view of routes, drivers, audit tracking, and open SOP violations.
        </p>
      </div>
      <ErrorBanner message={error} />

      {/* The main feature — one click away */}
      <Link
        to="/sheet"
        className="group mb-6 flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-5 text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:shadow-indigo-500/30"
      >
        <div>
          <p className="text-lg font-bold tracking-tight">Pickup Sheet</p>
          <p className="mt-0.5 text-sm text-indigo-100">
            Driver stops, clinic IDs, fares & the protocol checklist — open the day's sheet.
          </p>
        </div>
        <span className="shrink-0 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold transition group-hover:bg-white/25">
          Open today →
        </span>
      </Link>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clinics" value={clinics.length} tone="indigo" sub="client locations" />
        <StatCard label="Drivers" value={drivers.length} tone="sky" sub="active couriers" />
        <StatCard
          label="Open routes"
          value={activeRoutes.length}
          tone="amber"
          sub={`${routes.length} total`}
        />
        <StatCard
          label="Stops to audit"
          value={needsAudit.length}
          tone={needsAudit.length > 0 ? 'red' : 'emerald'}
          sub="completed, not yet audited"
        />
      </div>

      {criticalOpen.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">
            ⚠ {criticalOpen.length} open critical violation{criticalOpen.length === 1 ? '' : 's'} —
            notify the Dispatch Supervisor immediately (§3.6)
          </p>
          <ul className="mt-1 space-y-0.5">
            {criticalOpen.slice(0, 5).map((v) => (
              <li key={v.id} className="text-sm text-red-700">
                {v.category} · {v.stop_label ?? `Route #${v.route_id ?? '?'}`}
                {v.driver_name ? ` · ${v.driver_name}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent routes
            </h2>
            <Link to="/routes" className="text-sm font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="card px-6 py-10 text-center text-sm text-slate-500">
              No routes yet. Create one from the Routes page.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Date</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Stops</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/routes/${r.id}`)}>
                      <td className="font-mono font-semibold text-indigo-600">#{r.id}</td>
                      <td>{fmtDate(r.route_date)}</td>
                      <td className="font-medium text-slate-900">{r.driver_name ?? '—'}</td>
                      <td>
                        <Badge tone={ROUTE_STATUS[r.status].tone}>{ROUTE_STATUS[r.status].label}</Badge>
                      </td>
                      <td>{r.stop_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Route status summary
          </h2>
          <div className="card divide-y divide-slate-100">
            {(Object.keys(ROUTE_STATUS) as Array<keyof typeof ROUTE_STATUS>).map((s) => {
              const count = routes.filter((r) => r.status === s).length;
              return (
                <div key={s} className="flex items-center justify-between px-4 py-3">
                  <Badge tone={ROUTE_STATUS[s].tone}>{ROUTE_STATUS[s].label}</Badge>
                  <span className="text-lg font-bold text-slate-900">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="card mt-4 divide-y divide-slate-100">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-600">Open violations</span>
              <span className={openViolations.length > 0 ? 'text-lg font-bold text-red-600' : 'text-lg font-bold text-slate-900'}>
                {openViolations.length}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-600">Critical open</span>
              <span className={criticalOpen.length > 0 ? 'text-lg font-bold text-red-600' : 'text-lg font-bold text-slate-900'}>
                {criticalOpen.length}
              </span>
            </div>
            <Link to="/stops" className="block px-4 py-3 text-sm font-medium text-indigo-600 hover:bg-slate-50">
              Audit queue ({needsAudit.length} stops) →
            </Link>
          </div>
          {breached.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                ⚠ State cutoff breaches
              </p>
              <ul className="mt-1 space-y-0.5">
                {breached.map((r) => (
                  <li key={r.id} className="text-sm text-red-700">
                    <Link to={`/routes/${r.id}`} className="font-medium hover:underline">
                      Route #{r.id}
                    </Link>{' '}
                    · {fmtDate(r.route_date)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
