import type {
  Carrier,
  CarrierInput,
  ChargeInput,
  ChargeRecord,
  ChargeSummary,
  ChecklistItem,
  Clinic,
  ClinicInput,
  DispatchMapData,
  Dispatcher,
  DispatcherInput,
  Driver,
  DriverDaySummary,
  DriverInput,
  Photo,
  PhotoType,
  PhotoUpdateInput,
  Report,
  ReportDetail,
  ReportInput,
  Route,
  RouteDetail,
  RouteInput,
  RouteUpdateInput,
  SheetInput,
  State,
  StateInput,
  Stop,
  TrendData,
  StopInput,
  StopUpdateInput,
  Violation,
  ViolationInput,
  ViolationUpdateInput,
} from '../types';

// API base URL. Local dev: Vite proxies /api → localhost:8000, so BASE stays
// relative. Production (Vercel): set VITE_API_URL to the Render backend URL
// (e.g. https://agl-api.onrender.com) in the Vercel project env vars — the
// /api prefix is appended here automatically.
const API_HOST = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const BASE = `${API_HOST}/api`;

async function parseError(res: Response): Promise<string> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof body.detail === 'string') {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail.map((d) => d.msg ?? '').join('; ') || message;
    }
  } catch {
    /* keep status text */
  }
  return message;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(params?: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : '';
}

async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

// Trigger a browser download for a GET endpoint (Excel/PDF exports). The
// response is fetched first so a server error (e.g. a 500 during export)
// surfaces as a readable error instead of silently downloading an error page.
async function download(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  a.download =
    res.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  drivers: {
    list: () => request<Driver[]>('/drivers'),
    create: (input: DriverInput) => request<Driver>('/drivers', json('POST', input)),
    update: (id: number, input: DriverInput) =>
      request<Driver>(`/drivers/${id}`, json('PUT', input)),
    updateLocation: (id: number, lat: number, lng: number) =>
      request<Driver>(`/drivers/${id}/location`, json('PUT', { lat, lng })),
    day: (id: number, day: string) =>
      request<DriverDaySummary>(`/drivers/${id}/day?day=${day}`),
    remove: (id: number) => request<void>(`/drivers/${id}`, json('DELETE')),
  },
  dispatch: {
    map: () => request<DispatchMapData>('/dispatch/map'),
  },
  dispatchers: {
    list: () => request<Dispatcher[]>('/dispatchers'),
    create: (input: DispatcherInput) =>
      request<Dispatcher>('/dispatchers', json('POST', input)),
    update: (id: number, input: DispatcherInput) =>
      request<Dispatcher>(`/dispatchers/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/dispatchers/${id}`, json('DELETE')),
  },
  clinics: {
    list: (params?: { q?: string; state?: string }) => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set('q', params.q);
      if (params?.state) qs.set('state', params.state);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Clinic[]>(`/clinics${suffix}`);
    },
    create: (input: ClinicInput) => request<Clinic>('/clinics', json('POST', input)),
    update: (id: number, input: ClinicInput) =>
      request<Clinic>(`/clinics/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/clinics/${id}`, json('DELETE')),
  },
  carriers: {
    list: () => request<Carrier[]>('/carriers'),
    create: (input: CarrierInput) => request<Carrier>('/carriers', json('POST', input)),
    update: (id: number, input: CarrierInput) =>
      request<Carrier>(`/carriers/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/carriers/${id}`, json('DELETE')),
  },
  states: {
    list: () => request<State[]>('/states'),
    create: (input: StateInput) => request<State>('/states', json('POST', input)),
    update: (id: number, input: StateInput) =>
      request<State>(`/states/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/states/${id}`, json('DELETE')),
  },
  routes: {
    list: () => request<Route[]>('/routes'),
    detail: (id: number) => request<RouteDetail>(`/routes/${id}`),
    create: (input: RouteInput) => request<Route>('/routes', json('POST', input)),
    sheet: (input: SheetInput) =>
      request<RouteDetail>('/routes/sheet', json('POST', input)),
    // Day-end: close every driver's route for a date in one action.
    closeDay: (date: string) =>
      request<Route[]>(`/routes/close-day?date=${encodeURIComponent(date)}`, json('POST')),
    update: (id: number, input: RouteUpdateInput) =>
      request<Route>(`/routes/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/routes/${id}`, json('DELETE')),
    addStop: (routeId: number, input: StopInput) =>
      request<Stop>(`/routes/${routeId}/stops`, json('POST', input)),
    removeStop: (routeId: number, stopId: number) =>
      request<void>(`/routes/${routeId}/stops/${stopId}`, json('DELETE')),
  },
  stops: {
    list: (params?: { route_id?: number; audit_status?: string; stop_status?: string; date?: string }) => {
      const qs = new URLSearchParams();
      if (params?.route_id != null) qs.set('route_id', String(params.route_id));
      if (params?.audit_status) qs.set('audit_status', params.audit_status);
      if (params?.stop_status) qs.set('stop_status', params.stop_status);
      if (params?.date) qs.set('date', params.date);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Stop[]>(`/stops${suffix}`);
    },
    update: (id: number, input: StopUpdateInput) =>
      request<Stop>(`/stops/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/stops/${id}`, json('DELETE')),
  },
  checklist: {
    get: (stopId: number) => request<ChecklistItem[]>(`/stops/${stopId}/checklist`),
    update: (itemId: number, status: ChecklistItem['status'], notes?: string) =>
      request<ChecklistItem>(`/checklist-items/${itemId}`, json('PUT', { status, notes: notes || null })),
  },
  photos: {
    list: (stopId: number) => request<Photo[]>(`/stops/${stopId}/photos`),
    upload: (stopId: number, file: File, photoType: PhotoType) => {
      const form = new FormData();
      form.append('file', file);
      form.append('photo_type', photoType);
      return upload<Photo>(`/stops/${stopId}/photos`, form);
    },
    update: (id: number, input: PhotoUpdateInput) =>
      request<Photo>(`/photos/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/photos/${id}`, json('DELETE')),
  },
  charges: {
    list: (params?: { route_id?: number; driver_id?: number; date_from?: string; date_to?: string }) =>
      request<ChargeRecord[]>(`/charges${qs(params)}`),
    summary: (params?: { route_id?: number; driver_id?: number; date_from?: string; date_to?: string }) =>
      request<ChargeSummary>(`/charges/summary${qs(params)}`),
    createForStop: (stopId: number, input: ChargeInput) =>
      request<ChargeRecord>(`/stops/${stopId}/charge`, json('POST', input)),
    update: (id: number, input: ChargeInput) =>
      request<ChargeRecord>(`/charges/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/charges/${id}`, json('DELETE')),
    exportPdf: (params?: { route_id?: number; driver_id?: number; date_from?: string; date_to?: string }) =>
      download(`/charges/export.pdf${qs(params)}`),
  },
  reports: {
    list: () => request<Report[]>('/reports'),
    get: (id: number) => request<ReportDetail>(`/reports/${id}`),
    generate: (date: string) => request<Report>(`/reports/generate?date=${date}`, json('POST')),
    update: (id: number, input: ReportInput) =>
      request<Report>(`/reports/${id}`, json('PUT', input)),
    // All drivers for a date, organized by state with SOP columns + colors.
    pickupSheetXlsx: (date: string) =>
      download(`/reports/pickup-sheet.xlsx?report_date=${encodeURIComponent(date)}`),
  },
  trends: {
    data: (year: number, month: number) =>
      request<TrendData>(`/trends?year=${year}&month=${month}`),
  },
  violations: {
    list: (params?: { severity?: string; resolved?: boolean; escalated?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.severity) qs.set('severity', params.severity);
      if (params?.resolved != null) qs.set('resolved', String(params.resolved));
      if (params?.escalated != null) qs.set('escalated', String(params.escalated));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return request<Violation[]>(`/violations${suffix}`);
    },
    listForStop: (stopId: number) => request<Violation[]>(`/stops/${stopId}/violations`),
    createForStop: (stopId: number, input: ViolationInput) =>
      request<Violation>(`/stops/${stopId}/violations`, json('POST', input)),
    update: (id: number, input: ViolationUpdateInput) =>
      request<Violation>(`/violations/${id}`, json('PUT', input)),
    remove: (id: number) => request<void>(`/violations/${id}`, json('DELETE')),
  },
};
