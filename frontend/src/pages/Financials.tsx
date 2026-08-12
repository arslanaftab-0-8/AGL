import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { ChargeInput, ChargeRecord, ChargeSummary, Driver, Route, Stop } from '../types';
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
  StatCard,
  TextArea,
  type Column,
} from '../components/ui';
import { fmtDate, fmtMoney, toFloat } from '../lib/format';

type Filters = { route_id: number | null; driver_id: number | null; date_from: string; date_to: string };

type ChargeForm = { driver_pay: string; client_billed: string; notes: string };

const emptyForm: ChargeForm = { driver_pay: '', client_billed: '', notes: '' };

export default function FinancialsPage() {
  const [rows, setRows] = useState<ChargeRecord[]>([]);
  const [summary, setSummary] = useState<ChargeSummary | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [unchargedStops, setUnchargedStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({ route_id: null, driver_id: null, date_from: '', date_to: '' });

  const [addOpen, setAddOpen] = useState(false);
  const [editCharge, setEditCharge] = useState<ChargeRecord | null>(null);
  const [deleteCharge, setDeleteCharge] = useState<ChargeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopId, setStopId] = useState('');
  const [form, setForm] = useState<ChargeForm>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = {
      route_id: filters.route_id ?? undefined,
      driver_id: filters.driver_id ?? undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
    };
    try {
      const [chargeList, summaryData, routeList, driverList] = await Promise.all([
        api.charges.list(params),
        api.charges.summary(params),
        api.routes.list(),
        api.drivers.list(),
      ]);
      setRows(chargeList);
      setSummary(summaryData);
      setRoutes(routeList);
      setDrivers(driverList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load financials.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAdd = async () => {
    setForm(emptyForm);
    setStopId('');
    setAddOpen(true);
    try {
      const stops = await api.stops.list({ stop_status: 'completed' });
      setUnchargedStops(stops.filter((s) => s.driver_pay == null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stops.');
    }
  };

  const openEdit = (c: ChargeRecord) => {
    setEditCharge(c);
    setForm({ driver_pay: String(c.driver_pay), client_billed: String(c.client_billed), notes: c.notes ?? '' });
  };

  const save = async () => {
    const pay = toFloat(form.driver_pay);
    const billed = toFloat(form.client_billed);
    if (pay == null || billed == null || pay < 0 || billed < 0) {
      setError('Enter valid dollar amounts.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: ChargeInput = {
        driver_pay: pay,
        client_billed: billed,
        notes: form.notes.trim() || null,
      };
      if (editCharge) {
        await api.charges.update(editCharge.id, payload);
        setEditCharge(null);
      } else {
        if (!stopId) {
          setError('Select a stop.');
          return;
        }
        await api.charges.createForStop(Number(stopId), payload);
        setAddOpen(false);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteCharge) return;
    setBusy(true);
    setError(null);
    try {
      await api.charges.remove(deleteCharge.id);
      setDeleteCharge(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<ChargeRecord>[] = [
    {
      key: 'route',
      header: 'Route',
      render: (c) =>
        c.route_id != null ? (
          <Link
            to={`/routes/${c.route_id}`}
            className="font-mono text-sm font-semibold text-indigo-600 hover:underline"
          >
            #{c.route_id}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'date', header: 'Date', render: (c) => fmtDate(c.route_date) },
    { key: 'driver', header: 'Driver', render: (c) => c.driver_name ?? '—' },
    {
      key: 'stop',
      header: 'Stop',
      render: (c) => (
        <div>
          <p className="font-medium text-slate-900">
            {c.stop_sequence != null ? `${c.stop_sequence}. ` : ''}
            {c.stop_label ?? '—'}
          </p>
        </div>
      ),
    },
    { key: 'pay', header: 'Driver pay', render: (c) => <span className="font-medium text-slate-800">{fmtMoney(c.driver_pay)}</span> },
    { key: 'billed', header: 'Client billed', render: (c) => <span className="text-slate-700">{fmtMoney(c.client_billed)}</span> },
    {
      key: 'variance',
      header: 'Variance',
      render: (c) => (
        <Badge tone={c.variance < 0 ? 'red' : c.variance > 0 ? 'emerald' : 'slate'}>
          {c.variance < 0
            ? `-$${Math.abs(c.variance).toFixed(2)}`
            : c.variance > 0
              ? `+$${c.variance.toFixed(2)}`
              : '$0.00'}
        </Badge>
      ),
    },
    { key: 'notes', header: 'Notes', render: (c) => <span className="text-xs text-slate-500">{c.notes ?? '—'}</span> },
  ];

  const varianceTone = summary && summary.total_variance < 0 ? 'red' : summary && summary.total_variance > 0 ? 'emerald' : 'slate';

  return (
    <div>
      <PageHeader
        title="Financials"
        subtitle="Driver pay per stop vs client billing — pickup/delivery timestamps live on each stop."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                api.charges
                  .exportPdf({
                    route_id: filters.route_id ?? undefined,
                    driver_id: filters.driver_id ?? undefined,
                    date_from: filters.date_from || undefined,
                    date_to: filters.date_to || undefined,
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : 'Failed to download the PDF.'),
                  )
              }
            >
              Download PDF
            </Button>
            <Button onClick={() => void openAdd()}>
              <span className="text-base leading-none">+</span> Add charge
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Client billed" value={fmtMoney(summary?.total_billed ?? 0)} tone="indigo" sub={`${summary?.count ?? 0} records`} />
        <StatCard label="Driver pay" value={fmtMoney(summary?.total_pay ?? 0)} tone="sky" sub="total paid to drivers" />
        <StatCard
          label="Net variance"
          value={fmtMoney(summary?.total_variance ?? 0)}
          tone={varianceTone}
          sub="billed − paid"
        />
        <StatCard
          label="Uncharged stops"
          value={summary?.uncharged_completed_stops ?? 0}
          tone={(summary?.uncharged_completed_stops ?? 0) > 0 ? 'amber' : 'emerald'}
          sub="completed, missing a charge"
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Route">
          <Select
            value={filters.route_id ?? ''}
            onChange={(e) =>
              setFilters({ ...filters, route_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">All routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {fmtDate(r.route_date)} · {r.driver_name ?? ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Driver">
          <Select
            value={filters.driver_id ?? ''}
            onChange={(e) =>
              setFilters({ ...filters, driver_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">All drivers</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          />
        </Field>
      </div>

      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading financials…" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          onEdit={openEdit}
          onDelete={setDeleteCharge}
          emptyMessage="No charge records match. Add one for a completed stop."
        />
      )}

      {/* Add charge modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add charge record"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !stopId}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Stop" required hint="Completed stops without a charge record.">
            <Select value={stopId} onChange={(e) => setStopId(e.target.value)}>
              <option value="">Select stop…</option>
              {unchargedStops.map((s) => (
                <option key={s.id} value={s.id}>
                  Route #{s.route_id} · {s.sequence}. {s.location_label ?? '—'} · {fmtDate(s.route_date)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Driver pay" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.driver_pay}
                onChange={(e) => setForm({ ...form, driver_pay: e.target.value })}
              />
            </Field>
            <Field label="Client billed" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.client_billed}
                onChange={(e) => setForm({ ...form, client_billed: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Billing notes, disputed counts, adjustments…"
            />
          </Field>
        </div>
      </Modal>

      {/* Edit charge modal */}
      <Modal
        open={editCharge !== null}
        onClose={() => setEditCharge(null)}
        title={`Edit charge — stop ${editCharge?.stop_sequence ?? ''} ${editCharge?.stop_label ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditCharge(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Driver pay" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.driver_pay}
                onChange={(e) => setForm({ ...form, driver_pay: e.target.value })}
              />
            </Field>
            <Field label="Client billed" required>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.client_billed}
                onChange={(e) => setForm({ ...form, client_billed: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteCharge !== null}
        title="Delete charge record"
        message={`Delete the charge for ${deleteCharge?.stop_label ?? 'this stop'}? This cannot be undone.`}
        onConfirm={doDelete}
        onCancel={() => setDeleteCharge(null)}
        busy={busy}
      />
    </div>
  );
}
