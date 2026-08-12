import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Driver, DriverInput } from '../types';
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
  Spinner,
  type Column,
} from '../components/ui';

const empty: DriverInput = { name: '', phone: '', vehicle: '', active: true };

export default function DriversPage() {
  const [rows, setRows] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverInput>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Driver | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.drivers.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load drivers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFormOpen(true);
  };

  const openEdit = (d: Driver) => {
    setEditing(d);
    setForm({
      name: d.name,
      phone: d.phone ?? '',
      vehicle: d.vehicle ?? '',
      active: d.active,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: DriverInput = {
        ...form,
        phone: form.phone.trim() || null,
        vehicle: form.vehicle.trim() || null,
      };
      if (editing) await api.drivers.update(editing.id, payload);
      else await api.drivers.create(payload);
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
      await api.drivers.remove(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Driver>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (d) => <span className="font-medium text-slate-900">{d.name}</span>,
    },
    { key: 'phone', header: 'Phone', render: (d) => d.phone || '—' },
    { key: 'vehicle', header: 'Vehicle', render: (d) => d.vehicle || '—' },
    {
      key: 'active',
      header: 'Status',
      render: (d) => <Badge tone={d.active ? 'emerald' : 'slate'}>{d.active ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Drivers"
        subtitle="Couriers assigned to routes."
        actions={
          <Button onClick={openCreate}>
            <span className="text-base leading-none">+</span> Add driver
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading drivers…" />
      ) : (
        <DataTable columns={columns} rows={rows} onEdit={openEdit} onDelete={setConfirm} />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit driver' : 'Add driver'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Michael Hartman"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(804) 555-0000"
              />
            </Field>
            <Field label="Vehicle">
              <Input
                value={form.vehicle}
                onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                placeholder="e.g. Ford Transit Van"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Active (can be assigned routes)
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete driver"
        message={`Delete ${confirm?.name ?? 'this driver'}? Their routes are kept, but the driver will be unlinked.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  );
}
