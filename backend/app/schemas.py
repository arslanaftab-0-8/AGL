"""Pydantic v2 schemas for the Phase 1 API."""
from __future__ import annotations  # lazy annotations: allows forward refs
# (e.g. ReportDetail / DriverDayStop reference ViolationOut, defined below)

from datetime import date, datetime, time
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

class DriverBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=30)
    vehicle: Optional[str] = Field(default=None, max_length=120)
    active: bool = True


class DriverCreate(DriverBase):
    pass


class DriverUpdate(DriverBase):
    pass


class DriverOut(DriverBase, ORMModel):
    id: int
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    location_updated_at: Optional[datetime] = None
    created_at: datetime


class DriverLocationUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# ---------------------------------------------------------------------------
# Dispatchers
# ---------------------------------------------------------------------------

class DispatcherBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    active: bool = True


class DispatcherCreate(DispatcherBase):
    pass


class DispatcherUpdate(DispatcherBase):
    pass


class DispatcherOut(DispatcherBase, ORMModel):
    id: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Clinics (change history kept as JSON in change_log)
# ---------------------------------------------------------------------------

class ClinicBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    address: str = Field(min_length=1, max_length=300)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=2)
    zip: Optional[str] = Field(default=None, max_length=10)
    lat: Optional[float] = None
    lng: Optional[float] = None
    cutoff_time: Optional[time] = None
    notes: Optional[str] = None


class ClinicCreate(ClinicBase):
    pass


class ClinicUpdate(ClinicBase):
    pass


class ClinicOut(ClinicBase, ORMModel):
    id: int
    change_log: list[dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Carriers
# ---------------------------------------------------------------------------

class CarrierBase(BaseModel):
    type: Literal["fedex", "ups", "airport", "lab"]
    name: str = Field(min_length=1, max_length=120)
    location: Optional[str] = Field(default=None, max_length=300)
    lat: Optional[float] = None
    lng: Optional[float] = None
    cutoff_time: Optional[time] = None


class CarrierCreate(CarrierBase):
    pass


class CarrierUpdate(CarrierBase):
    pass


class CarrierOut(CarrierBase, ORMModel):
    id: int


# ---------------------------------------------------------------------------
# States
# ---------------------------------------------------------------------------

class StateBase(BaseModel):
    code: str = Field(min_length=2, max_length=2)
    name: str = Field(min_length=1, max_length=100)
    cutoff_time: Optional[time] = None


class StateCreate(StateBase):
    pass


class StateUpdate(StateBase):
    pass


class StateOut(StateBase, ORMModel):
    id: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

class RouteBase(BaseModel):
    driver_id: int
    state_id: Optional[int] = None
    route_date: date
    notes: Optional[str] = None


class RouteCreate(RouteBase):
    pass


class RouteUpdate(BaseModel):
    driver_id: Optional[int] = None
    state_id: Optional[int] = None
    route_date: Optional[date] = None
    status: Optional[Literal["planned", "active", "completed", "closed"]] = None
    closed_at: Optional[datetime] = None
    state_cutoff_breached: Optional[bool] = None
    notes: Optional[str] = None


class SheetCreate(BaseModel):
    """Pickup Sheet (find-or-create): the driver + date IS the day's sheet.

    The driver can be given by id (existing record) or by a free-typed name
    (found by name, created on first use) — the auditor is never blocked by
    having to pre-add drivers. Returns the day's RouteDetail.
    """

    driver_id: Optional[int] = None
    driver_name: Optional[str] = Field(default=None, max_length=120)
    date: date
    state_id: Optional[int] = None


class RouteOut(BaseModel):
    id: int
    driver_id: int
    driver_name: Optional[str] = None
    state_id: Optional[int] = None
    state_code: Optional[str] = None
    route_date: date
    status: str
    closed_at: Optional[datetime] = None
    state_cutoff_breached: bool = False
    notes: Optional[str] = None
    stop_count: int = 0
    created_at: datetime


class StopBrief(BaseModel):
    id: int
    route_id: int
    sequence: int
    photo_count: int = 0
    violation_count: int = 0
    # Phase 3 — cutoff/ETA metadata (computed)
    lat: Optional[float] = None
    lng: Optional[float] = None
    clinic_cutoff: Optional[datetime] = None
    carrier_cutoff: Optional[datetime] = None
    cutoff_status: str = "na"
    projected_arrival: Optional[datetime] = None
    # Phase 4 — charge record (null when none)
    charge_id: Optional[int] = None
    driver_pay: Optional[float] = None
    client_billed: Optional[float] = None
    variance: Optional[float] = None
    # Pickup sheet fields
    fedex_cutoff: Optional[time] = None
    pickup_location: Optional[str] = None
    clinic_ref: Optional[str] = None
    # Checklist progress (computed) — reflected on the sheet
    checklist_total: int = 0
    checklist_passed: int = 0
    checklist_failed: int = 0
    stop_type: str
    location_type: str
    clinic_id: Optional[int] = None
    carrier_id: Optional[int] = None
    clinic_name: Optional[str] = None
    carrier_name: Optional[str] = None
    location_label: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    status: str
    dispatcher_id: Optional[int] = None
    dispatcher_name: Optional[str] = None
    package_count_portal: Optional[int] = None
    package_count_bag: Optional[int] = None
    package_count_photo: Optional[int] = None
    driver_notes: Optional[str] = None
    dispatch_notes: Optional[str] = None
    audit_status: str
    audited_at: Optional[datetime] = None
    auditor_name: Optional[str] = None
    notes: Optional[str] = None


class RouteDetail(RouteOut):
    state_cutoff: Optional[datetime] = None
    projected_final_eta: Optional[datetime] = None
    projected_state_cutoff_risk: bool = False
    next_stop_id: Optional[int] = None
    stops: list[StopBrief] = []


# ---------------------------------------------------------------------------
# Phase 3 — dispatch map
# ---------------------------------------------------------------------------

class MapDriver(BaseModel):
    id: int
    name: str
    vehicle: Optional[str] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    location_updated_at: Optional[datetime] = None


class DispatchMapRoute(BaseModel):
    route: RouteOut
    driver: MapDriver
    state_cutoff: Optional[datetime] = None
    projected_final_eta: Optional[datetime] = None
    projected_state_cutoff_risk: bool = False
    next_stop: Optional[StopBrief] = None
    stops: list[StopBrief] = []


class DispatchMapData(BaseModel):
    generated_at: datetime
    active_route_count: int
    at_risk_count: int
    routes: list[DispatchMapRoute]


# ---------------------------------------------------------------------------
# Phase 4 — charge records (driver pay vs client billing)
# ---------------------------------------------------------------------------

class ChargeBase(BaseModel):
    driver_pay: float = Field(ge=0)
    client_billed: float = Field(ge=0)
    notes: Optional[str] = None


class ChargeCreate(ChargeBase):
    pass


class ChargeUpdate(ChargeBase):
    pass


class ChargeOut(ChargeBase):
    id: int
    stop_id: int
    variance: float = 0.0
    created_at: datetime
    updated_at: datetime
    # context
    stop_sequence: Optional[int] = None
    stop_label: Optional[str] = None
    route_id: Optional[int] = None
    route_date: Optional[date] = None
    driver_name: Optional[str] = None


class ChargeSummary(BaseModel):
    count: int = 0
    total_pay: float = 0.0
    total_billed: float = 0.0
    total_variance: float = 0.0
    uncharged_completed_stops: int = 0


# ---------------------------------------------------------------------------
# Phase 5 — daily audit reports (§3.4)
# ---------------------------------------------------------------------------

class ReportUpdate(BaseModel):
    auditor_name: Optional[str] = None
    recommendations: Optional[str] = None


class ReportOut(BaseModel):
    id: int
    report_date: date
    auditor_name: Optional[str] = None
    routes_audited: int = 0
    stops_reviewed: int = 0
    passed: int = 0
    failed: int = 0
    critical: int = 0
    major: int = 0
    minor: int = 0
    dispatch_errors: int = 0
    driver_errors: int = 0
    recommendations: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ReportDetail(ReportOut):
    violations: list[ViolationOut] = []


# ---------------------------------------------------------------------------
# Driver day summary — per-driver flags + income for one date
# ---------------------------------------------------------------------------

class DriverDayStop(BaseModel):
    stop_id: int
    route_id: int
    sequence: int
    location_label: Optional[str] = None
    stop_type: str
    status: str
    arrival_time: Optional[datetime] = None
    flag_count: int = 0
    violations: list[ViolationOut] = []
    driver_pay: Optional[float] = None
    client_billed: Optional[float] = None
    variance: Optional[float] = None


class DriverDaySummary(BaseModel):
    driver_id: int
    driver_name: str
    date: date
    total_stops: int = 0
    total_flags: int = 0
    route_flags: int = 0
    total_pay: float = 0.0
    total_billed: float = 0.0
    stops: list[DriverDayStop] = []


# ---------------------------------------------------------------------------
# Phase 6 — monthly trend analysis (§3.6 step 9, §3.7)
# ---------------------------------------------------------------------------

class TrendCategory(BaseModel):
    category: str
    count: int = 0
    critical: int = 0
    major: int = 0
    minor: int = 0


class TrendEntity(BaseModel):
    """Repeat-offender aggregation for one driver / clinic / dispatcher."""

    id: int
    name: str
    total: int = 0
    critical: int = 0
    major: int = 0
    minor: int = 0
    driver_errors: int = 0
    dispatch_errors: int = 0
    repeat_flags: list[str] = []  # e.g. "Missing lockbox photo ×2"


class TrendDay(BaseModel):
    day: str  # ISO date
    total: int = 0
    critical: int = 0
    major: int = 0
    minor: int = 0


class TrendData(BaseModel):
    year: int
    month: int
    total: int = 0
    critical: int = 0
    major: int = 0
    minor: int = 0
    driver_errors: int = 0
    dispatch_errors: int = 0
    open: int = 0
    resolved: int = 0
    by_category: list[TrendCategory] = []
    by_driver: list[TrendEntity] = []
    by_clinic: list[TrendEntity] = []
    by_dispatcher: list[TrendEntity] = []
    by_day: list[TrendDay] = []


# ---------------------------------------------------------------------------
# Stops
# ---------------------------------------------------------------------------

class StopCreate(BaseModel):
    route_id: int
    sequence: Optional[int] = None  # defaults to max(sequence)+1 in the route
    stop_type: Literal["pickup", "delivery"] = "pickup"
    location_type: Literal["clinic", "carrier"] = "clinic"
    clinic_id: Optional[int] = None
    carrier_id: Optional[int] = None
    # Pickup sheet fields — entered when the row is created.
    fedex_cutoff: Optional[time] = None
    pickup_location: Optional[str] = Field(default=None, max_length=200)
    clinic_ref: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Free-typed clinic ID/name — no pre-existing Clinic record required.",
    )
    charge_amount: Optional[float] = Field(
        default=None, ge=0, description="Driver pay — auto-creates the charge record."
    )
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    dispatcher_id: Optional[int] = None
    notes: Optional[str] = None


class StopUpdate(BaseModel):
    sequence: Optional[int] = None
    stop_type: Optional[Literal["pickup", "delivery"]] = None
    location_type: Optional[Literal["clinic", "carrier"]] = None
    clinic_id: Optional[int] = None
    carrier_id: Optional[int] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    status: Optional[Literal["pending", "arrived", "completed", "skipped"]] = None
    fedex_cutoff: Optional[time] = None
    pickup_location: Optional[str] = Field(default=None, max_length=200)
    dispatcher_id: Optional[int] = None
    package_count_portal: Optional[int] = None
    package_count_bag: Optional[int] = None
    package_count_photo: Optional[int] = None
    driver_notes: Optional[str] = None
    dispatch_notes: Optional[str] = None
    audit_status: Optional[Literal["not_started", "in_progress", "passed", "failed"]] = None
    audited_at: Optional[datetime] = None
    auditor_name: Optional[str] = None
    notes: Optional[str] = None


class StopListItem(StopBrief):
    route_date: Optional[date] = None
    driver_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Phase 2 — photos, checklist items, violations
# ---------------------------------------------------------------------------

class PhotoOut(BaseModel):
    id: int
    stop_id: int
    photo_type: str
    file_path: str
    url: str
    original_name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    quality_status: str
    uploaded_at: datetime


class PhotoUpdate(BaseModel):
    photo_type: Optional[
        Literal[
            "pickup", "delivery", "building", "lockbox", "label", "receipt",
            "proof_slip", "lockbox_inside", "lockbox_outside", "clinic_front",
            "specimen_count", "reception_area", "package", "clinic_entrance",
            "other",
        ]
    ] = None
    quality_status: Optional[Literal["unreviewed", "good", "poor"]] = None


class ChecklistItemOut(BaseModel):
    id: int
    stop_id: int
    item_name: str
    status: str
    notes: Optional[str] = None


class ChecklistItemUpdate(BaseModel):
    status: Literal["pass", "fail", "na"]
    notes: Optional[str] = None


class ViolationBase(BaseModel):
    severity: Literal["critical", "major", "minor"]
    category: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=2000)
    source: Literal["driver", "dispatch"] = "driver"


class ViolationCreate(ViolationBase):
    pass


class ViolationUpdate(BaseModel):
    severity: Optional[Literal["critical", "major", "minor"]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    source: Optional[Literal["driver", "dispatch"]] = None
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


class ViolationOut(ViolationBase):
    id: int
    stop_id: Optional[int] = None
    route_id: Optional[int] = None
    escalated_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    created_at: datetime
    # context (joined in the router)
    stop_sequence: Optional[int] = None
    stop_label: Optional[str] = None
    route_date: Optional[date] = None
    driver_name: Optional[str] = None
