import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Driver, Route, RouteInput, State } from '../types';
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
import { ROUTE_STATUS, fmtDate } from '../lib/format';

const empty: RouteInput = { driver_id: 0, state_id: null, route_date: '', notes: '' };

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RoutesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RouteInput>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [routeList, driverList, stateList] = await Promise.all([
        api.routes.list(),
        api.drivers.list(),
        api.states.list(),
      ]);
      setRows(routeList);
      setDrivers(driverList.filter((d) => d.active));
      setStates(stateList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load routes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...empty, driver_id: drivers[0]?.id ?? 0, route_date: todayStr() });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.driver_id) return;
    setSaving(true);
    setError(null);
    try {
      await api.routes.create({ ...form, notes: form.notes.trim() || null });
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await api.routes.remove(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Route>[] = [
    {
      key: 'id',
      header: 'Route #',
      render: (r) => (
        <Link
          to={`/routes/${r.id}`}
          className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          #{r.id}
        </Link>
      ),
    },
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.route_date) },
    {
      key: 'driver',
      header: 'Driver',
      render: (r) => <span className="font-medium text-slate-900">{r.driver_name ?? '—'}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (r) =>
        r.state_code ? (
          <span className="font-mono text-xs font-semibold text-slate-600">{r.state_code}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={ROUTE_STATUS[r.status].tone}>{ROUTE_STATUS[r.status].label}</Badge>,
    },
    {
      key: 'stops',
      header: 'Stops',
      render: (r) => <span className="text-slate-700">{r.stop_count}</span>,
    },
    {
      key: 'breach',
      header: 'Cutoff',
      render: (r) =>
        r.state_cutoff_breached ? <Badge tone="red">Breach</Badge> : <span className="text-slate-300">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Routes"
        subtitle="A driver's full run for the day — pickups and deliveries."
        actions={
          <Button onClick={openCreate}>
            <span className="text-base leading-none">+</span> New route
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading routes…" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          onEdit={(r) => navigate(`/routes/${r.id}`)}
          onDelete={setConfirm}
          emptyMessage="No routes yet — create the first one."
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New route"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.driver_id}>
              {saving ? 'Creating…' : 'Create route'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Driver" required>
              <Select
                value={form.driver_id || ''}
                onChange={(e) => setForm({ ...form, driver_id: Number(e.target.value) })}
              >
                <option value="" disabled>
                  Select driver…
                </option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Route date" required>
              <Input
                type="date"
                value={form.route_date}
                onChange={(e) => setForm({ ...form, route_date: e.target.value })}
              />
            </Field>
            <Field label="State" hint="Used for the state cutoff (Phase 3).">
              <Select
                value={form.state_id ?? ''}
                onChange={(e) =>
                  setForm({ ...form, state_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">—</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Dispatch notes, special instructions…"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete route"
        message={`Delete route #${confirm?.id ?? ''} and all its stops? This cannot be undone.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  );
}
