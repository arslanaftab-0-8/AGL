import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { State, StateInput } from '../types';
import {
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
import { fmtTime, toTimeInput, fromTimeInput } from '../lib/format';

const empty: StateInput = { code: '', name: '', cutoff_time: null };

export default function StatesPage() {
  const [rows, setRows] = useState<State[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<State | null>(null);
  const [form, setForm] = useState<StateInput>(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.states.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load states.');
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

  const openEdit = (s: State) => {
    setEditing(s);
    setForm({ code: s.code, name: s.name, cutoff_time: s.cutoff_time });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: StateInput = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        cutoff_time: form.cutoff_time,
      };
      if (editing) await api.states.update(editing.id, payload);
      else await api.states.create(payload);
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
      await api.states.remove(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<State>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (s) => (
        <span className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md bg-slate-100 px-2 font-mono text-xs font-bold text-slate-700">
          {s.code}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (s) => <span className="font-medium text-slate-900">{s.name}</span>,
    },
    {
      key: 'cutoff',
      header: 'State cutoff',
      render: (s) =>
        s.cutoff_time ? (
          <span className="font-medium text-slate-700">{fmtTime(s.cutoff_time)}</span>
        ) : (
          <span className="text-slate-400">Not set</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="States"
        subtitle="State-level cutoff times (evaluated per whole route from Phase 3)."
        actions={
          <Button onClick={openCreate}>
            <span className="text-base leading-none">+</span> Add state
          </Button>
        }
      />
      <ErrorBanner message={error} />
      {loading ? (
        <Spinner label="Loading states…" />
      ) : (
        <DataTable columns={columns} rows={rows} onEdit={openEdit} onDelete={setConfirm} />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit state' : 'Add state'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.code.trim() || !form.name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Code" required hint="2-letter abbreviation, e.g. VA">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                maxLength={2}
                placeholder="VA"
                autoFocus
                className="font-mono uppercase"
              />
            </Field>
            <Field label="State cutoff time">
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
              placeholder="Virginia"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete state"
        message={`Delete ${confirm?.name ?? 'this state'}? Routes referencing it must be updated first.`}
        onConfirm={doDelete}
        onCancel={() => setConfirm(null)}
        busy={busy}
      />
    </div>
  );
}
