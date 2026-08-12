import type {
  AuditStatus,
  CarrierType,
  CutoffStatus,
  PhotoType,
  QualityStatus,
  RouteStatus,
  Severity,
  StopStatus,
  ViolationSource,
} from '../types';

export type Tone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'red' | 'sky' | 'violet';

export const toneClasses: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export const ROUTE_STATUS: Record<RouteStatus, { label: string; tone: Tone }> = {
  planned: { label: 'Planned', tone: 'slate' },
  active: { label: 'Active', tone: 'indigo' },
  completed: { label: 'Completed', tone: 'sky' },
  closed: { label: 'Closed', tone: 'emerald' },
};

export const STOP_STATUS: Record<StopStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'slate' },
  arrived: { label: 'Arrived', tone: 'sky' },
  completed: { label: 'Completed', tone: 'emerald' },
  skipped: { label: 'Skipped', tone: 'amber' },
};

export const AUDIT_STATUS: Record<AuditStatus, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'slate' },
  in_progress: { label: 'In progress', tone: 'indigo' },
  passed: { label: 'Passed', tone: 'emerald' },
  failed: { label: 'Failed', tone: 'red' },
};

export const CARRIER_TYPE: Record<CarrierType, { label: string; tone: Tone }> = {
  fedex: { label: 'FedEx', tone: 'violet' },
  ups: { label: 'UPS', tone: 'amber' },
  airport: { label: 'Airport Cargo', tone: 'sky' },
  lab: { label: 'Laboratory', tone: 'emerald' },
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  critical: { label: 'Critical', tone: 'red' },
  major: { label: 'Major', tone: 'amber' },
  minor: { label: 'Minor', tone: 'slate' },
};

export const SOURCE: Record<ViolationSource, { label: string; tone: Tone }> = {
  driver: { label: 'Driver', tone: 'sky' },
  dispatch: { label: 'Dispatch', tone: 'violet' },
};

export const PHOTO_TYPE_LABEL: Record<PhotoType, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  building: 'Building',
  lockbox: 'Lockbox',
  label: 'Shipping label',
  receipt: 'Receipt',
  proof_slip: 'Proof slip',
  lockbox_inside: 'Inside lockbox',
  lockbox_outside: 'Outside lockbox',
  clinic_front: 'Front of clinic',
  specimen_count: 'Specimen count',
  reception_area: 'Reception area',
  package: 'Package',
  clinic_entrance: 'Clinic entrance',
  other: 'Other',
};

export const QUALITY: Record<QualityStatus, { label: string; tone: Tone }> = {
  unreviewed: { label: 'Unreviewed', tone: 'slate' },
  good: { label: 'Good', tone: 'emerald' },
  poor: { label: 'Poor', tone: 'red' },
};

export const CUTOFF_STATUS: Record<CutoffStatus, { label: string; tone: Tone }> = {
  ok: { label: 'On time', tone: 'emerald' },
  at_risk: { label: 'At risk', tone: 'amber' },
  breached: { label: 'Breached', tone: 'red' },
  na: { label: 'No cutoff', tone: 'slate' },
};

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return v;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtClock(v: string | null | undefined): string {
  if (!v) return '—';
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return v;
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtTime(v: string | null | undefined): string {
  if (!v) return '—';
  const [h, m] = v.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return v;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---- input helpers (HTML <input type="time"> / "datetime-local" values) ----

export function toTimeInput(v: string | null | undefined): string {
  return v ? v.slice(0, 5) : '';
}

export function fromTimeInput(v: string): string | null {
  return v ? `${v}:00` : null;
}

export function toDatetimeLocal(v: string | null | undefined): string {
  return v ? v.slice(0, 16) : '';
}

export function fromDatetimeLocal(v: string): string | null {
  return v ? `${v}:00` : null;
}

export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function toFloat(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
