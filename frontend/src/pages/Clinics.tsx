import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ChangeEntry, Clinic, ClinicInput } from '../types';
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
import {
  fmtDateTime,
  fmtTime,
  fromTimeInput,
  toFloat,
  toTimeInput,
} from '../lib/format';

const empty: ClinicInput = {
  name: '',
  contact_person: '',
  contact_phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  lat: null,
  lng: null,
  cutoff_time: null,
  notes: '',
};

export default function ClinicsPage() {
  const [rows, setRows] = useState<Clinic[]>([]);
  const [states, setStates] = useState<Array<{ code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [form, setForm] = useState<ClinicInput>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Clinic | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clinicList, stateList] = await Promise.all([
        api.clinics.list(search ? { q: search } : undefined),
        api.states.list(),
      ]);
      setRows(clinicList);
      setStates(stateList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clinics.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFormOpen(true);
  };

  const openEdit = (c: Clinic) => {
    setEditing(c);
    setForm({
      name: c.name,
      contact_person: c.contact_person ?? '',
      contact_phone: c.contact_phone ?? '',
      address: c.address,
      city: c.city ?? '',
      state: c.state ?? '',
      zip: c.zip ?? '',
      lat: c.lat,
      lng: c.lng,
      cutoff_time: c.cutoff_time,
      notes: c.notes ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.address.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: ClinicInput = {
        ...form,
        name: form.name.trim(),
        address: form.address.trim(),
        contact_person: form.contact_person.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) await api.clinics.update(editing.id, payload);
      else await api.clinics.create(payload);
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
      await api.clinics.remove(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<Clinic>[] = [
    {
      key: 'name',
      header: 'Clinic',
      render: (c) => (
        <div>
          <p className="font-medium text-slate-900">{c.name}</p>
          <p className="text-xs text-slate-400">
            {[c.address, c.city].filter(Boolean).join(', ')}
          </p>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (c) =>
        c.state ? (
          <span className="font-mono text-xs font-semibold text-slate-600">{c.state}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'cutoff',
      header: 'Clinic cutoff',
      render: (c) => (c.cutoff_time ? fmtTime(c.cutoff_time) : '—'),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (c) =>
        c.contact_person ? (
          <div>
            <p className="text-slate-700">{c.contact_person}</p>
            <p className="text-xs text-slate-400">{c.contact_phone ?? ''}</p>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (c) =>
        c.change_log.length > 0 ? (
          <Badge tone="indigo">{c.change_log.length} logged</Badge>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clinics"
        subtitle="Client database with cutoff times, contacts, and full change history."
        actions={
          <Button onClick={openCreate}>
            <span className="text-base leading-none">+</span> Add clinic
          </Button>
        }
      />
      <div className="mb-4 max-w-md">
        <Input
          type="search"
          placeholder="Search name, address, or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading clinics…" />
      ) : (
        <DataTable columns={columns} rows={rows} onEdit={openEdit} onDelete={setConfirm} />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit clinic' : 'Add clinic'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || !form.name.trim() || !form.address.trim()}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Clinic name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Lakeside Family Medicine"
              autoFocus
            />
          </Field>
          <Field label="Clinic cutoff time" hint="Driver should arrive after this time.">
            <Input
              type="time"
              value={toTimeInput(form.cutoff_time)}
              onChange={(e) => setForm({ ...form, cutoff_time: fromTimeInput(e.target.value) })}
            />
          </Field>
          <Field label="Address" required className="sm:col-span-2">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="5001 Lakeside Avenue"
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="Richmond"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State">
              <Select
                value={form.state ?? ''}
                onChange={(e) => setForm({ ...form, state: e.target.value || null })}
              >
                <option value="">—</option>
                {states.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ZIP">
              <Input
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value })}
                placeholder="23228"
              />
            </Field>
          </div>
          <Field label="Contact person">
            <Input
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
              placeholder="Dr. A. Reyes"
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="(804) 555-0000"
            />
          </Field>
          <Field label="Latitude">
            <Input
              type="number"
              step="any"
              value={form.lat ?? ''}
              onChange={(e) => setForm({ ...form, lat: toFloat(e.target.value) })}
              placeholder="37.6136"
            />
          </Field>
          <Field label="Longitude">
            <Input
              type="number"
              step="any"
              value={form.lng ?? ''}
              onChange={(e) => setForm({ ...form, lng: toFloat(e.target.value) })}
              placeholder="-77.4477"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Lockbox code, access instructions, cold-chain notes…"
            />
          </Field>
        </div>

        {editing && editing.change_log.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Change history
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {editing.change_log.map((entry: ChangeEntry, i: number) => (
                <div
                  key={`${entry.at}-${i}`}
                  className="flex items-start gap-2 text-xs text-slate-600"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <div>
                    <span className="font-medium text-slate-800">
                      {entry.field.replace(/_/g, ' ')}
                    </span>{' '}
                    changed {fmtValue(entry.old)} → {fmtValue(entry.new)}
                    <span className="text-slate-400"> · {fmtDateTime(entry.at)} by {entry.by}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete clinic"
        message={`Delete ${confirm?.name ?? 'this clinic'}? Its change history is lost and stops referencing it must be updated first.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  );
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
