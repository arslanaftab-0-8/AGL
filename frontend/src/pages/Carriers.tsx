import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Carrier, CarrierInput, CarrierType } from '../types';
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
  type Column,
} from '../components/ui';
import { CARRIER_TYPE, fmtTime, toFloat, toTimeInput, fromTimeInput } from '../lib/format';

const empty: CarrierInput = {
  type: 'fedex',
  name: '',
  location: '',
  lat: null,
  lng: null,
  cutoff_time: null,
};

export default function CarriersPage() {
  const [rows, setRows] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [form, setForm] = useState<CarrierInput>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Carrier | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.carriers.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load carriers.');
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

  const openEdit = (c: Carrier) => {
    setEditing(c);
    setForm({
      type: c.type,
      name: c.name,
      location: c.location ?? '',
      lat: c.lat,
      lng: c.lng,
      cutoff_time: c.cutoff_time,
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: CarrierInput = {
        ...form,
        name: form.name.trim(),
        location: form.location.trim() || null,
      };
      if (editing) await api.carriers.update(editing.id, payload);
      else await api.carriers.create(payload);
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
      await api.carriers.remove(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Carrier>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (c) => <Badge tone={CARRIER_TYPE[c.type].tone}>{CARRIER_TYPE[c.type].label}</Badge>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (c) => <span className="font-medium text-slate-900">{c.name}</span>,
    },
    { key: 'location', header: 'Location', render: (c) => c.location || '—' },
    { key: 'cutoff', header: 'Carrier cutoff', render: (c) => fmtTime(c.cutoff_time) },
    {
      key: 'coords',
      header: 'Lat / Lng',
      render: (c) =>
        c.lat != null && c.lng != null ? `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}` : '—',
    },
  ];

  return (
    <div>
      <PageHeader
        title="Carriers"
        subtitle="Delivery destinations: FedEx, UPS, Airport Cargo, and Laboratories."
        actions={
          <Button onClick={openCreate}>
            <span className="text-base leading-none">+</span> Add carrier
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading carriers…" />
      ) : (
        <DataTable columns={columns} rows={rows} onEdit={openEdit} onDelete={setConfirm} />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit carrier' : 'Add carrier'}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Type" required>
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CarrierType })}
              >
                {(Object.keys(CARRIER_TYPE) as CarrierType[]).map((t) => (
                  <option key={t} value={t}>
                    {CARRIER_TYPE[t].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carrier cutoff time">
              <Input
                type="time"
                value={toTimeInput(form.cutoff_time)}
                onChange={(e) => setForm({ ...form, cutoff_time: fromTimeInput(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. FedEx Ground Drop"
              autoFocus
            />
          </Field>
          <Field label="Location" hint="Physical address of the drop location.">
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="6601 Midlothian Turnpike, Richmond, VA"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Latitude">
              <Input
                type="number"
                step="any"
                value={form.lat ?? ''}
                onChange={(e) => setForm({ ...form, lat: toFloat(e.target.value) })}
                placeholder="37.5010"
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="any"
                value={form.lng ?? ''}
                onChange={(e) => setForm({ ...form, lng: toFloat(e.target.value) })}
                placeholder="-77.5310"
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete carrier"
        message={`Delete ${confirm?.name ?? 'this carrier'}? Stops referencing it must be updated first.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  );
}
