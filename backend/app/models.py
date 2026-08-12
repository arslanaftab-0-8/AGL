"""Phase 1 ORM models.

All enums are stored as plain strings (SQLite-friendly). Allowed values are
documented below and enforced at the API layer via Pydantic Literal types.

Design notes (owner-approved decisions):
- Job fields are merged directly into Stop (no separate Job table).
- Clinic keeps a JSON `change_log` column instead of a separate table.
- Clinic/Carrier carry optional lat/lng for the Phase 3 map.
- Driver carries optional contact + vehicle fields.
- Phase 2 will add Photo / ChecklistItem / Violation tables referencing stop_id.
"""
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# ---------------------------------------------------------------------------
# Allowed enum values (string constants)
# ---------------------------------------------------------------------------

# Route.status
ROUTE_PLANNED = "planned"
ROUTE_ACTIVE = "active"
ROUTE_COMPLETED = "completed"
ROUTE_CLOSED = "closed"
ROUTE_STATUSES = (ROUTE_PLANNED, ROUTE_ACTIVE, ROUTE_COMPLETED, ROUTE_CLOSED)

# Stop.stop_type
STOP_PICKUP = "pickup"
STOP_DELIVERY = "delivery"
STOP_TYPES = (STOP_PICKUP, STOP_DELIVERY)

# Stop.location_type
LOC_CLINIC = "clinic"
LOC_CARRIER = "carrier"
LOCATION_TYPES = (LOC_CLINIC, LOC_CARRIER)

# Stop.status
STOP_PENDING = "pending"
STOP_ARRIVED = "arrived"
STOP_COMPLETED = "completed"
STOP_SKIPPED = "skipped"
STOP_STATUSES = (STOP_PENDING, STOP_ARRIVED, STOP_COMPLETED, STOP_SKIPPED)

# Stop.audit_status
AUDIT_NOT_STARTED = "not_started"
AUDIT_IN_PROGRESS = "in_progress"
AUDIT_PASSED = "passed"
AUDIT_FAILED = "failed"
AUDIT_STATUSES = (AUDIT_NOT_STARTED, AUDIT_IN_PROGRESS, AUDIT_PASSED, AUDIT_FAILED)

# Carrier.type
CARRIER_FEDEX = "fedex"
CARRIER_UPS = "ups"
CARRIER_AIRPORT = "airport"
CARRIER_LAB = "lab"
CARRIER_TYPES = (CARRIER_FEDEX, CARRIER_UPS, CARRIER_AIRPORT, CARRIER_LAB)

# ---------------------------------------------------------------------------
# Phase 2 — audit checklist enums
# ---------------------------------------------------------------------------

# Photo.photo_type
PHOTO_PICKUP = "pickup"
PHOTO_DELIVERY = "delivery"
PHOTO_BUILDING = "building"
PHOTO_LOCKBOX = "lockbox"
PHOTO_LABEL = "label"
PHOTO_RECEIPT = "receipt"
PHOTO_PROOF_SLIP = "proof_slip"
PHOTO_OTHER = "other"
# Pickup photo protocol (owner-defined): reviewed per pickup stop alongside
# the §3.3 items — lockbox set + reception set.
PHOTO_LOCKBOX_INSIDE = "lockbox_inside"
PHOTO_LOCKBOX_OUTSIDE = "lockbox_outside"
PHOTO_CLINIC_FRONT = "clinic_front"
PHOTO_SPECIMEN_COUNT = "specimen_count"
PHOTO_RECEPTION_AREA = "reception_area"
PHOTO_PACKAGE = "package"
PHOTO_CLINIC_ENTRANCE = "clinic_entrance"
PHOTO_TYPES = (
    PHOTO_PICKUP,
    PHOTO_DELIVERY,
    PHOTO_BUILDING,
    PHOTO_LOCKBOX,
    PHOTO_LABEL,
    PHOTO_RECEIPT,
    PHOTO_PROOF_SLIP,
    PHOTO_LOCKBOX_INSIDE,
    PHOTO_LOCKBOX_OUTSIDE,
    PHOTO_CLINIC_FRONT,
    PHOTO_SPECIMEN_COUNT,
    PHOTO_RECEPTION_AREA,
    PHOTO_PACKAGE,
    PHOTO_CLINIC_ENTRANCE,
    PHOTO_OTHER,
)

# Photo.quality_status
QUALITY_UNREVIEWED = "unreviewed"
QUALITY_GOOD = "good"
QUALITY_POOR = "poor"
QUALITY_STATUSES = (QUALITY_UNREVIEWED, QUALITY_GOOD, QUALITY_POOR)

# ChecklistItem.status
CHK_PASS = "pass"
CHK_FAIL = "fail"
CHK_NA = "na"
CHECKLIST_STATUSES = (CHK_PASS, CHK_FAIL, CHK_NA)

# Violation.severity (spec §3.2 — do not alter)
SEV_CRITICAL = "critical"
SEV_MAJOR = "major"
SEV_MINOR = "minor"
SEVERITIES = (SEV_CRITICAL, SEV_MAJOR, SEV_MINOR)

# Violation.source (spec §3.7 — driver vs dispatch error)
SRC_DRIVER = "driver"
SRC_DISPATCH = "dispatch"
SOURCES = (SRC_DRIVER, SRC_DISPATCH)


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[Optional[str]] = mapped_column(String(30))
    vehicle: Mapped[Optional[str]] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Phase 3 — manually-entered live location (dispatcher/auditor types it in)
    current_lat: Mapped[Optional[float]] = mapped_column(Float)
    current_lng: Mapped[Optional[float]] = mapped_column(Float)
    location_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    routes: Mapped[list["Route"]] = relationship(back_populates="driver")


class Dispatcher(Base):
    __tablename__ = "dispatchers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Clinic(Base):
    __tablename__ = "clinics"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    contact_phone: Mapped[Optional[str]] = mapped_column(String(30))
    address: Mapped[str] = mapped_column(String(300))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(2))  # 2-letter code
    zip: Mapped[Optional[str]] = mapped_column(String(10))
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    cutoff_time: Mapped[Optional[time]] = mapped_column(Time)  # Clinic cutoff
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # [{at, field, old, new, by}, ...] — appended chronologically, most recent
    # 200 entries kept (see routers/clinics.py)
    change_log: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )


class Carrier(Base):
    __tablename__ = "carriers"

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(20))  # fedex | ups | airport | lab
    name: Mapped[str] = mapped_column(String(120))
    location: Mapped[Optional[str]] = mapped_column(String(300))
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    cutoff_time: Mapped[Optional[time]] = mapped_column(Time)  # Carrier cutoff


class State(Base):
    __tablename__ = "states"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(2), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    cutoff_time: Mapped[Optional[time]] = mapped_column(Time)  # State cutoff


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"))
    state_id: Mapped[Optional[int]] = mapped_column(ForeignKey("states.id"))
    route_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default=ROUTE_PLANNED)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    state_cutoff_breached: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    driver: Mapped[Driver] = relationship(back_populates="routes")
    state: Mapped[Optional[State]] = relationship()
    stops: Mapped[list["Stop"]] = relationship(
        back_populates="route",
        cascade="all, delete-orphan",
        order_by="Stop.sequence",
    )
    violations: Mapped[list["Violation"]] = relationship(
        back_populates="route", cascade="all, delete-orphan"
    )


class Stop(Base):
    """A single clinic pickup or carrier delivery, carrying the (merged) Job fields."""

    __tablename__ = "stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    stop_type: Mapped[str] = mapped_column(String(10), default=STOP_PICKUP)
    location_type: Mapped[str] = mapped_column(String(10), default=LOC_CLINIC)
    clinic_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clinics.id"))
    carrier_id: Mapped[Optional[int]] = mapped_column(ForeignKey("carriers.id"))
    scheduled_start: Mapped[Optional[datetime]] = mapped_column(DateTime)
    scheduled_end: Mapped[Optional[datetime]] = mapped_column(DateTime)
    arrival_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    departure_time: Mapped[Optional[datetime]] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default=STOP_PENDING)
    # Pickup sheet fields (owner-defined): entered when the pickup row is
    # created, shown on the sheet, reflected in the daily report.
    fedex_cutoff: Mapped[Optional[time]] = mapped_column(Time)
    pickup_location: Mapped[Optional[str]] = mapped_column(String(200))
    # Free-typed clinic reference (owner-defined): the auditor can add a stop
    # by clinic ID/name without a pre-existing Clinic record. When the typed
    # value matches a known clinic, clinic_id is also set for map/cutoff use;
    # otherwise this is the plain label shown on the sheet.
    clinic_ref: Mapped[Optional[str]] = mapped_column(String(100))

    # ---- merged Job fields (owner decision: no separate Job table) ----
    dispatcher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("dispatchers.id"))
    package_count_portal: Mapped[Optional[int]] = mapped_column(Integer)
    package_count_bag: Mapped[Optional[int]] = mapped_column(Integer)
    package_count_photo: Mapped[Optional[int]] = mapped_column(Integer)
    driver_notes: Mapped[Optional[str]] = mapped_column(Text)
    dispatch_notes: Mapped[Optional[str]] = mapped_column(Text)
    audit_status: Mapped[str] = mapped_column(String(20), default=AUDIT_NOT_STARTED)
    audited_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    auditor_name: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    route: Mapped[Route] = relationship(back_populates="stops")
    clinic: Mapped[Optional[Clinic]] = relationship()
    carrier: Mapped[Optional[Carrier]] = relationship()
    dispatcher: Mapped[Optional[Dispatcher]] = relationship()
    photos: Mapped[list["Photo"]] = relationship(
        back_populates="stop", cascade="all, delete-orphan"
    )
    checklist_items: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="stop", cascade="all, delete-orphan"
    )
    violations: Mapped[list["Violation"]] = relationship(
        back_populates="stop", cascade="all, delete-orphan"
    )
    charge: Mapped[Optional["ChargeRecord"]] = relationship(
        back_populates="stop", cascade="all, delete-orphan", uselist=False
    )


class Photo(Base):
    """A photo attached to a stop, stored on the local filesystem."""

    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    stop_id: Mapped[int] = mapped_column(ForeignKey("stops.id"), index=True)
    photo_type: Mapped[str] = mapped_column(String(20), default=PHOTO_OTHER)
    file_path: Mapped[str] = mapped_column(String(300))  # filename under /photos
    original_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    quality_status: Mapped[str] = mapped_column(String(20), default=QUALITY_UNREVIEWED)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    stop: Mapped[Stop] = relationship(back_populates="photos")


class ChecklistItem(Base):
    """One row of the §3.3 per-stop checklist (seeded verbatim, do not alter)."""

    __tablename__ = "checklist_items"
    __table_args__ = (
        UniqueConstraint("stop_id", "item_name", name="uq_stop_checklist_item"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    stop_id: Mapped[int] = mapped_column(ForeignKey("stops.id"), index=True)
    item_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(10), default=CHK_NA)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    stop: Mapped[Stop] = relationship(back_populates="checklist_items")


class Violation(Base):
    """An SOP violation attached to a Stop or a Route (§6 note).

    stop_id is set for per-stop violations; route_id is used for whole-route
    findings such as the Phase 3 State Cutoff breach.
    """

    __tablename__ = "violations"

    id: Mapped[int] = mapped_column(primary_key=True)
    stop_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stops.id"), index=True)
    route_id: Mapped[Optional[int]] = mapped_column(ForeignKey("routes.id"), index=True)
    severity: Mapped[str] = mapped_column(String(10))
    category: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(10), default=SRC_DRIVER)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(120))
    # Local-naive on purpose: Phase 5 daily reports bucket violations by
    # created_at date, and the auditor's clock (like the UI's audited_at
    # stamps) is local time — UTC would misdate late-evening issues.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    stop: Mapped[Optional[Stop]] = relationship(back_populates="violations")
    route: Mapped[Optional[Route]] = relationship(back_populates="violations")


class ChargeRecord(Base):
    """Phase 4 — driver pay vs client billing for one stop (1:1 with Stop).

    `variance` is derived (client_billed − driver_pay) and computed at
    serialization time so it can never go stale.
    """

    __tablename__ = "charge_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    stop_id: Mapped[int] = mapped_column(
        ForeignKey("stops.id"), unique=True, index=True
    )
    driver_pay: Mapped[float] = mapped_column(Float)
    client_billed: Mapped[float] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )

    stop: Mapped[Stop] = relationship(back_populates="charge")


class DailyReport(Base):
    """Phase 5 — one auto-populated daily audit report per date (§3.4).

    The metrics are a snapshot computed from the day's audits + violations
    (see ..reporting.compute_report); regenerating overwrites the numbers.
    Auditor name and recommendations are free-text owned by the report.
    """

    __tablename__ = "daily_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    auditor_name: Mapped[Optional[str]] = mapped_column(String(120))
    # §3.4 metrics
    routes_audited: Mapped[int] = mapped_column(Integer, default=0)
    stops_reviewed: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    critical: Mapped[int] = mapped_column(Integer, default=0)
    major: Mapped[int] = mapped_column(Integer, default=0)
    minor: Mapped[int] = mapped_column(Integer, default=0)
    dispatch_errors: Mapped[int] = mapped_column(Integer, default=0)
    driver_errors: Mapped[int] = mapped_column(Integer, default=0)
    recommendations: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, onupdate=datetime.now
    )
