// Types mirroring backend/app/schemas.py (Phase 1).

export type Driver = {
  id: number;
  name: string;
  phone: string | null;
  vehicle: string | null;
  active: boolean;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  created_at: string;
};

export type DriverInput = {
  name: string;
  phone: string | null;
  vehicle: string | null;
  active: boolean;
};

export type Dispatcher = {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
};

export type DispatcherInput = {
  name: string;
  active: boolean;
};

export type ChangeEntry = {
  at: string;
  field: string;
  old: unknown;
  new: unknown;
  by: string;
};

export type Clinic = {
  id: number;
  name: string;
  contact_person: string | null;
  contact_phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  cutoff_time: string | null; // "HH:MM:SS"
  notes: string | null;
  change_log: ChangeEntry[];
  created_at: string;
  updated_at: string;
};

export type ClinicInput = {
  name: string;
  contact_person: string | null;
  contact_phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  cutoff_time: string | null;
  notes: string | null;
};

export type CarrierType = 'fedex' | 'ups' | 'airport' | 'lab';

export type Carrier = {
  id: number;
  type: CarrierType;
  name: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cutoff_time: string | null;
};

export type CarrierInput = {
  type: CarrierType;
  name: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cutoff_time: string | null;
};

export type State = {
  id: number;
  code: string;
  name: string;
  cutoff_time: string | null;
};

export type StateInput = {
  code: string;
  name: string;
  cutoff_time: string | null;
};

export type RouteStatus = 'planned' | 'active' | 'completed' | 'closed';

export type Route = {
  id: number;
  driver_id: number;
  driver_name: string | null;
  state_id: number | null;
  state_code: string | null;
  route_date: string; // YYYY-MM-DD
  status: RouteStatus;
  closed_at: string | null;
  state_cutoff_breached: boolean;
  notes: string | null;
  stop_count: number;
  created_at: string;
};

export type RouteInput = {
  driver_id: number;
  state_id: number | null;
  route_date: string;
  notes: string | null;
};

export type SheetInput = {
  driver_id?: number | null;
  driver_name?: string | null; // free-typed — found or created on first use
  date: string; // YYYY-MM-DD — the driver's day = the pickup sheet
  state_id: number | null;
};

export type RouteUpdateInput = {
  driver_id?: number;
  state_id?: number | null;
  route_date?: string;
  status?: RouteStatus;
  state_cutoff_breached?: boolean;
  notes?: string | null;
};

export type StopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';
export type AuditStatus = 'not_started' | 'in_progress' | 'passed' | 'failed';

export type CutoffStatus = 'ok' | 'at_risk' | 'breached' | 'na';

export type Stop = {
  id: number;
  route_id: number;
  route_date: string | null; // present on stop-list responses (StopListItem)
  driver_name: string | null;
  sequence: number;
  photo_count: number;
  violation_count: number;
  // Phase 3 — computed cutoff/ETA metadata
  lat: number | null;
  lng: number | null;
  clinic_cutoff: string | null;
  carrier_cutoff: string | null;
  cutoff_status: CutoffStatus;
  projected_arrival: string | null;
  // Phase 4 — charge record (null when none)
  charge_id: number | null;
  driver_pay: number | null;
  client_billed: number | null;
  variance: number | null;
  stop_type: 'pickup' | 'delivery';
  location_type: 'clinic' | 'carrier';
  clinic_id: number | null;
  carrier_id: number | null;
  clinic_name: string | null;
  carrier_name: string | null;
  location_label: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  status: StopStatus;
  // Pickup sheet fields
  fedex_cutoff: string | null; // "HH:MM:SS"
  pickup_location: string | null;
  clinic_ref: string | null; // free-typed clinic ID/name (no Clinic record needed)
  // Checklist progress (computed)
  checklist_total: number;
  checklist_passed: number;
  checklist_failed: number;
  dispatcher_id: number | null;
  dispatcher_name: string | null;
  package_count_portal: number | null;
  package_count_bag: number | null;
  package_count_photo: number | null;
  driver_notes: string | null;
  dispatch_notes: string | null;
  audit_status: AuditStatus;
  audited_at: string | null;
  auditor_name: string | null;
  notes: string | null;
};

export type RouteDetail = Route & {
  state_cutoff: string | null;
  projected_final_eta: string | null;
  projected_state_cutoff_risk: boolean;
  next_stop_id: number | null;
  stops: Stop[];
};

// ---- Phase 3: dispatch map ----

export type MapDriver = {
  id: number;
  name: string;
  vehicle: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
};

export type DispatchMapRoute = {
  route: Route;
  driver: MapDriver;
  state_cutoff: string | null;
  projected_final_eta: string | null;
  projected_state_cutoff_risk: boolean;
  next_stop: Stop | null;
  stops: Stop[];
};

export type DispatchMapData = {
  generated_at: string;
  active_route_count: number;
  at_risk_count: number;
  routes: DispatchMapRoute[];
};

export type StopInput = {
  route_id: number;
  sequence?: number;
  stop_type: 'pickup' | 'delivery';
  location_type: 'clinic' | 'carrier';
  clinic_id?: number | null;
  carrier_id?: number | null;
  fedex_cutoff?: string | null; // "HH:MM:SS"
  pickup_location?: string | null;
  clinic_ref?: string | null; // free-typed clinic ID/name
  charge_amount?: number | null; // auto-creates the charge record
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  dispatcher_id?: number | null;
  notes?: string | null;
};

// ---- Phase 2: audit checklist, photos, violations ----

export type PhotoType =
  | 'pickup'
  | 'delivery'
  | 'building'
  | 'lockbox'
  | 'label'
  | 'receipt'
  | 'proof_slip'
  | 'lockbox_inside'
  | 'lockbox_outside'
  | 'clinic_front'
  | 'specimen_count'
  | 'reception_area'
  | 'package'
  | 'clinic_entrance'
  | 'other';

export type QualityStatus = 'unreviewed' | 'good' | 'poor';

export type Photo = {
  id: number;
  stop_id: number;
  photo_type: PhotoType;
  file_path: string;
  url: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  quality_status: QualityStatus;
  uploaded_at: string;
};

export type PhotoUpdateInput = {
  photo_type?: PhotoType;
  quality_status?: QualityStatus;
};

export type ChecklistStatus = 'pass' | 'fail' | 'na';

export type ChecklistItem = {
  id: number;
  stop_id: number;
  item_name: string;
  status: ChecklistStatus;
  notes: string | null;
};

export type Severity = 'critical' | 'major' | 'minor';

export type ViolationSource = 'driver' | 'dispatch';

export type Violation = {
  id: number;
  stop_id: number | null;
  route_id: number | null;
  severity: Severity;
  category: string;
  description: string;
  source: ViolationSource;
  escalated_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  // context
  stop_sequence: number | null;
  stop_label: string | null;
  route_date: string | null;
  driver_name: string | null;
};

export type ViolationInput = {
  severity: Severity;
  category: string;
  description: string;
  source: ViolationSource;
};

export type ViolationUpdateInput = {
  severity?: Severity;
  category?: string;
  description?: string;
  source?: ViolationSource;
  escalated_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

// ---- Phase 4: charge records ----

export type ChargeRecord = {
  id: number;
  stop_id: number;
  driver_pay: number;
  client_billed: number;
  variance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  stop_sequence: number | null;
  stop_label: string | null;
  route_id: number | null;
  route_date: string | null;
  driver_name: string | null;
};

export type ChargeInput = {
  driver_pay: number;
  client_billed: number;
  notes: string | null;
};

export type ChargeSummary = {
  count: number;
  total_pay: number;
  total_billed: number;
  total_variance: number;
  uncharged_completed_stops: number;
};

// ---- Phase 5: daily audit reports ----

export type Report = {
  id: number;
  report_date: string; // YYYY-MM-DD
  auditor_name: string | null;
  routes_audited: number;
  stops_reviewed: number;
  passed: number;
  failed: number;
  critical: number;
  major: number;
  minor: number;
  dispatch_errors: number;
  driver_errors: number;
  recommendations: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportDetail = Report & { violations: Violation[] };

export type ReportInput = {
  auditor_name?: string | null;
  recommendations?: string | null;
};

// ---- Driver Day: per-driver flags + income for one date ----

export type DriverDayStop = {
  stop_id: number;
  route_id: number;
  sequence: number;
  location_label: string | null;
  stop_type: 'pickup' | 'delivery';
  status: StopStatus;
  arrival_time: string | null;
  flag_count: number;
  violations: Violation[];
  driver_pay: number | null;
  client_billed: number | null;
  variance: number | null;
};

export type DriverDaySummary = {
  driver_id: number;
  driver_name: string;
  date: string;
  total_stops: number;
  total_flags: number;
  route_flags: number;
  total_pay: number;
  total_billed: number;
  stops: DriverDayStop[];
};

// ---- Phase 6: monthly trends ----

export type TrendCategory = {
  category: string;
  count: number;
  critical: number;
  major: number;
  minor: number;
};

export type TrendEntity = {
  id: number;
  name: string;
  total: number;
  critical: number;
  major: number;
  minor: number;
  driver_errors: number;
  dispatch_errors: number;
  repeat_flags: string[]; // e.g. "Missing lockbox photo ×2"
};

export type TrendDay = {
  day: string; // ISO date
  total: number;
  critical: number;
  major: number;
  minor: number;
};

export type TrendData = {
  year: number;
  month: number;
  total: number;
  critical: number;
  major: number;
  minor: number;
  driver_errors: number;
  dispatch_errors: number;
  open: number;
  resolved: number;
  by_category: TrendCategory[];
  by_driver: TrendEntity[];
  by_clinic: TrendEntity[];
  by_dispatcher: TrendEntity[];
  by_day: TrendDay[];
};

export type StopUpdateInput = {
  sequence?: number;
  stop_type?: 'pickup' | 'delivery';
  location_type?: 'clinic' | 'carrier';
  clinic_id?: number | null;
  carrier_id?: number | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
  status?: StopStatus;
  dispatcher_id?: number | null;
  package_count_portal?: number | null;
  package_count_bag?: number | null;
  package_count_photo?: number | null;
  driver_notes?: string | null;
  dispatch_notes?: string | null;
  audit_status?: AuditStatus;
  audited_at?: string | null;
  auditor_name?: string | null;
  notes?: string | null;
};
