import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Report, ReportDetail } from '../types';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatCard,
  TextArea,
} from '../components/ui';
import { SEVERITY, SOURCE, fmtDate, fmtDateTime } from '../lib/format';

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ReportsPage() {
  const [date, setDate] = useState(todayLocal());
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [history, setHistory] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditorName, setAuditorName] = useState('');
  const [recommendations, setRecommendations] = useState('');

  const initialized = useRef(false);

  const loadHistory = useCallback(async () => {
    // Only the first load shows the full-page spinner; refreshes after
    // generate/save keep the current report visible.
    if (!initialized.current) setLoading(true);
    setError(null);
    try {
      const rows = await api.reports.list();
      setHistory(rows);
      // Auto-open the most recent report once, on first load.
      if (!initialized.current && rows.length > 0) {
        initialized.current = true;
        const detail = await api.reports.get(rows[0].id);
        setReport(detail);
        setDate(detail.report_date);
        setAuditorName(detail.auditor_name ?? '');
        setRecommendations(detail.recommendations ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const generate = async () => {
    if (!date) return;
    setGenerating(true);
    setError(null);
    try {
      const created = await api.reports.generate(date);
      const detail = await api.reports.get(created.id);
      setReport(detail);
      setAuditorName(detail.auditor_name ?? '');
      setRecommendations(detail.recommendations ?? '');
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  const openReport = async (id: number) => {
    setError(null);
    try {
      const detail = await api.reports.get(id);
      setReport(detail);
      setDate(detail.report_date);
      setAuditorName(detail.auditor_name ?? '');
      setRecommendations(detail.recommendations ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report.');
    }
  };

  const save = async () => {
    if (!report) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.reports.update(report.id, {
        auditor_name: auditorName.trim() || null,
        recommendations: recommendations.trim() || null,
      });
      setReport({ ...report, ...updated });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const exportUrl = report ? `/api/reports/${report.id}/export.xlsx` : null;

  return (
    <div>
      <PageHeader
        title="Daily Audit Reports"
        subtitle="Auto-populated from the day's audits — matches the §3.4 report format, exportable to Excel."
      />
      <ErrorBanner message={error} />

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Report date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button onClick={() => void generate()} disabled={generating || !date}>
          {generating ? 'Generating…' : report && report.report_date === date ? 'Refresh report' : 'Generate report'}
        </Button>
        {exportUrl && (
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Export .xlsx
          </a>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading reports…" />
      ) : report ? (
        <div className="space-y-6">
          {/* §3.4 summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Routes audited" value={report.routes_audited} tone="indigo" sub={fmtDate(report.report_date)} />
            <StatCard label="Stops reviewed" value={report.stops_reviewed} tone="sky" sub={`${report.passed} passed · ${report.failed} failed`} />
            <StatCard label="Total passed" value={report.passed} tone="emerald" />
            <StatCard label="Total failed" value={report.failed} tone={report.failed > 0 ? 'red' : 'emerald'} />
            <StatCard label="Critical issues" value={report.critical} tone={report.critical > 0 ? 'red' : 'slate'} sub="immediate escalation" />
            <StatCard label="Major issues" value={report.major} tone={report.major > 0 ? 'amber' : 'slate'} sub="fix before EOS" />
            <StatCard label="Minor issues" value={report.minor} tone="slate" sub="documentation" />
            <StatCard
              label="Errors"
              value={`${report.driver_errors}D / ${report.dispatch_errors}P`}
              tone={(report.driver_errors + report.dispatch_errors) > 0 ? 'violet' : 'slate'}
              sub="driver / dispatch"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Recommendations */}
            <div className="card space-y-3 p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold text-slate-900">Recommendations</h2>
              <Field label="Auditor">
                <Input
                  value={auditorName}
                  onChange={(e) => setAuditorName(e.target.value)}
                  placeholder="e.g. M. Carter"
                />
              </Field>
              <Field label="Notes for the day">
                <TextArea
                  rows={5}
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Recommendations, follow-ups, training opportunities…"
                />
              </Field>
              <div className="flex items-center gap-2">
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save recommendations'}
                </Button>
                {report.updated_at && (
                  <span className="text-xs text-slate-400">Updated {fmtDateTime(report.updated_at)}</span>
                )}
              </div>
            </div>

            {/* Day's violations */}
            <div className="card p-5 lg:col-span-3">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Violations logged this day
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {report.violations.length}
                </span>
              </h2>
              {report.violations.length === 0 ? (
                <p className="text-sm text-slate-400">No SOP violations logged on this date.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {report.violations.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 py-3">
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone={SEVERITY[v.severity].tone}>{SEVERITY[v.severity].label}</Badge>
                        <Badge tone={SOURCE[v.source].tone}>{SOURCE[v.source].label}</Badge>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{v.category}</p>
                        <p className="text-sm text-slate-600">{v.description}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {v.route_id != null && (
                            <Link to={`/routes/${v.route_id}`} className="font-medium text-indigo-600 hover:underline">
                              Route #{v.route_id}
                            </Link>
                          )}
                          {v.stop_label ? ` · ${v.stop_label}` : ''}
                          {' · '}
                          {fmtDateTime(v.created_at)}
                          {v.escalated_at && ' · escalated'}
                          {v.resolved_at && ' · resolved'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center">
          <p className="text-sm text-slate-500">
            No report yet for {fmtDate(date)}. Click <span className="font-semibold text-slate-700">Generate report</span> to
            compute today's metrics from the audits and violations.
          </p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Report history</h2>
          <div className="flex flex-wrap gap-2">
            {history.map((r) => (
              <button
                key={r.id}
                onClick={() => void openReport(r.id)}
                className={
                  report?.id === r.id
                    ? 'rounded-lg bg-indigo-600 px-3 py-2 text-left text-xs font-semibold text-white shadow-sm'
                    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600'
                }
              >
                {fmtDate(r.report_date)}
                <span className="block font-normal opacity-75">
                  {r.stops_reviewed} stops · {r.passed}P/{r.failed}F · {r.critical}C/{r.major}M/{r.minor}m
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
