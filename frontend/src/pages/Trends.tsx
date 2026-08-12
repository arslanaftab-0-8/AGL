import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { TrendData, TrendEntity } from '../types';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  type Column,
} from '../components/ui';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return new Date(2000, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SevBadges({ c, m, j }: { c: number; m: number; j: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {c > 0 && <Badge tone="red">{c}C</Badge>}
      {m > 0 && <Badge tone="amber">{m}M</Badge>}
      {j > 0 && <Badge tone="slate">{j}m</Badge>}
    </span>
  );
}

function FlagChips({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <span className="text-xs text-slate-300">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone="amber">Training opportunity</Badge>
      <span className="text-xs text-amber-700">{flags.join(' · ')}</span>
    </span>
  );
}

export default function TrendsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.trends.data(year, month));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trends.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => currentYear - 2 + i);

  const maxDay = useMemo(
    () => Math.max(1, ...(data?.by_day.map((d) => d.total) ?? [1])),
    [data],
  );

  const entityColumns = (title: 'Driver' | 'Clinic' | 'Dispatcher'): Column<TrendEntity>[] => [
    {
      key: 'name',
      header: title,
      render: (e) => <span className="font-medium text-slate-900">{e.name}</span>,
    },
    { key: 'total', header: 'Issues', render: (e) => <span className="font-semibold text-slate-900">{e.total}</span> },
    { key: 'sev', header: 'Severity', render: (e) => <SevBadges c={e.critical} m={e.major} j={e.minor} /> },
    {
      key: 'src',
      header: 'Errors',
      render: (e) => (
        <span className="text-xs text-slate-500">
          {e.driver_errors}D · {e.dispatch_errors}P
        </span>
      ),
    },
    { key: 'flags', header: 'Repeat patterns', render: (e) => <FlagChips flags={e.repeat_flags} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Monthly Trend Analysis"
        subtitle="Recurring SOP violations by driver, clinic and dispatcher — repeat patterns flag training opportunities (§3.6)."
      />

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Month">
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Crunching the month's violations…" />
      ) : !data || data.total === 0 ? (
        <EmptyState message={`No violations logged in ${MONTHS[data?.month ?? month - 1]} ${data?.year ?? year}.`} />
      ) : (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total issues" value={data.total} tone="indigo" sub={`${data.open} open · ${data.resolved} resolved`} />
            <StatCard label="Critical" value={data.critical} tone={data.critical > 0 ? 'red' : 'slate'} sub="immediate escalation" />
            <StatCard label="Major" value={data.major} tone={data.major > 0 ? 'amber' : 'slate'} sub="fix before EOS" />
            <StatCard label="Minor" value={data.minor} tone="slate" sub="documentation" />
            <StatCard label="Driver errors" value={data.driver_errors} tone={data.driver_errors > 0 ? 'sky' : 'slate'} sub="courier-side issues" />
            <StatCard label="Dispatch errors" value={data.dispatch_errors} tone={data.dispatch_errors > 0 ? 'violet' : 'slate'} sub="office-side issues" />
            <StatCard label="Open" value={data.open} tone={data.open > 0 ? 'amber' : 'emerald'} sub="not yet resolved" />
            <StatCard label="Resolved" value={data.resolved} tone="emerald" sub="closed out" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Daily activity */}
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Activity by day</h2>
              <ul className="space-y-1">
                {data.by_day
                  .filter((d) => d.total > 0)
                  .map((d) => (
                    <li key={d.day} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 text-right font-medium text-slate-500">{fmtDay(d.day)}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${Math.max(6, (d.total / maxDay) * 100)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 font-mono text-slate-600">{d.total} logged</span>
                      <SevBadges c={d.critical} m={d.major} j={d.minor} />
                    </li>
                  ))}
              </ul>
            </div>

            {/* Recurring categories */}
            <div className="card p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Most common violation categories</h2>
              {data.by_category.length === 0 ? (
                <p className="text-sm text-slate-400">No categories to show.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.by_category.map((cat) => (
                    <li key={cat.category} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{cat.category}</p>
                        <SevBadges c={cat.critical} m={cat.major} j={cat.minor} />
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-sm font-bold text-slate-700">
                        {cat.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Repeat offenders */}
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">By driver</h2>
              {data.by_driver.length === 0 ? (
                <EmptyState message="No violations tied to drivers this month." />
              ) : (
                <DataTable columns={entityColumns('Driver')} rows={data.by_driver} />
              )}
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">By clinic</h2>
              {data.by_clinic.length === 0 ? (
                <EmptyState message="No violations tied to clinics this month." />
              ) : (
                <DataTable columns={entityColumns('Clinic')} rows={data.by_clinic} />
              )}
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">By dispatcher</h2>
              {data.by_dispatcher.length === 0 ? (
                <EmptyState message="No violations tied to dispatchers this month." />
              ) : (
                <DataTable columns={entityColumns('Dispatcher')} rows={data.by_dispatcher} />
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Severity legend: <Badge tone="red">Critical</Badge> immediate escalation ·{' '}
            <Badge tone="amber">Major</Badge> fix before EOS · <Badge tone="slate">Minor</Badge> documentation.
            A <Badge tone="amber">Training opportunity</Badge> flag appears when the same category recurs{' '}
            <span className="font-semibold text-slate-600">2+</span> times in the month (threshold: 2).
          </p>
        </div>
      )}
    </div>
  );
}
