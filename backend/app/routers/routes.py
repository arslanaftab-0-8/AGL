"""Routes + stop management: create routes, add/remove stops, close out.

Phase 3: closing a route late against the state cutoff flags it and logs a
Major 'State cutoff breach' violation (§4); route detail carries per-stop
cutoff/ETA metadata computed by ..eta.build_route_projection.
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..eta import build_route_projection, cutoff_status, cutoff_times
from . import get_or_404

router = APIRouter(prefix="/api/routes", tags=["routes"])


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _route_out(route: models.Route, db: Session) -> dict:
    return {
        "id": route.id,
        "driver_id": route.driver_id,
        "driver_name": route.driver.name if route.driver else None,
        "state_id": route.state_id,
        "state_code": route.state.code if route.state else None,
        "route_date": route.route_date,
        "status": route.status,
        "closed_at": route.closed_at,
        "state_cutoff_breached": route.state_cutoff_breached,
        "notes": route.notes,
        "stop_count": len(route.stops),
        "created_at": route.created_at,
    }


def _stop_out(stop: models.Stop, db: Session, meta: dict | None = None) -> dict:
    clinic = db.get(models.Clinic, stop.clinic_id) if stop.clinic_id else None
    carrier = db.get(models.Carrier, stop.carrier_id) if stop.carrier_id else None
    dispatcher = (
        db.get(models.Dispatcher, stop.dispatcher_id) if stop.dispatcher_id else None
    )

    # Phase 3 cutoff/ETA metadata: use the route projection when provided,
    # otherwise compute what is derivable without ETA (lat/lng + actual-cutoff
    # status only).
    if meta is None:
        lat = clinic.lat if clinic else (carrier.lat if carrier else None)
        lng = clinic.lng if clinic else (carrier.lng if carrier else None)
        clinic_cutoff, carrier_cutoff = cutoff_times(db, stop)
        status = cutoff_status(stop, clinic_cutoff, carrier_cutoff, None)
        projected = None
    else:
        lat = meta.get("lat")
        lng = meta.get("lng")
        clinic_cutoff = meta.get("clinic_cutoff")
        carrier_cutoff = meta.get("carrier_cutoff")
        status = meta.get("cutoff_status", "na")
        projected = meta.get("projected_arrival")

    return {
        "id": stop.id,
        "route_id": stop.route_id,
        "sequence": stop.sequence,
        "photo_count": len(stop.photos),
        "violation_count": len(stop.violations),
        "lat": lat,
        "lng": lng,
        "clinic_cutoff": clinic_cutoff,
        "carrier_cutoff": carrier_cutoff,
        "cutoff_status": status,
        "projected_arrival": projected,
        "charge_id": stop.charge.id if stop.charge else None,
        "driver_pay": round(stop.charge.driver_pay, 2) if stop.charge else None,
        "client_billed": round(stop.charge.client_billed, 2) if stop.charge else None,
        "variance": (
            round(stop.charge.client_billed - stop.charge.driver_pay, 2)
            if stop.charge
            else None
        ),
        "stop_type": stop.stop_type,
        "location_type": stop.location_type,
        "clinic_id": stop.clinic_id,
        "carrier_id": stop.carrier_id,
        "clinic_name": clinic.name if clinic else None,
        "carrier_name": carrier.name if carrier else None,
        "clinic_ref": stop.clinic_ref,
        # Checklist progress (computed) — reflected on the pickup sheet
        "checklist_total": len(stop.checklist_items),
        "checklist_passed": sum(1 for it in stop.checklist_items if it.status == models.CHK_PASS),
        "checklist_failed": sum(1 for it in stop.checklist_items if it.status == models.CHK_FAIL),
        "location_label": (
            clinic.name
            if clinic
            else (stop.clinic_ref or (carrier.name if carrier else None))
        ),
        "scheduled_start": stop.scheduled_start,
        "scheduled_end": stop.scheduled_end,
        "arrival_time": stop.arrival_time,
        "departure_time": stop.departure_time,
        "status": stop.status,
        "fedex_cutoff": stop.fedex_cutoff,
        "pickup_location": stop.pickup_location,
        "dispatcher_id": stop.dispatcher_id,
        "dispatcher_name": dispatcher.name if dispatcher else None,
        "package_count_portal": stop.package_count_portal,
        "package_count_bag": stop.package_count_bag,
        "package_count_photo": stop.package_count_photo,
        "driver_notes": stop.driver_notes,
        "dispatch_notes": stop.dispatch_notes,
        "audit_status": stop.audit_status,
        "audited_at": stop.audited_at,
        "auditor_name": stop.auditor_name,
        "notes": stop.notes,
    }


def _validate_stop_location(payload):
    """A stop must point at a clinic (id or free-typed ref) or a carrier."""
    if payload.location_type == models.LOC_CLINIC and not payload.clinic_id and not (payload.clinic_ref or "").strip():
        raise HTTPException(
            status_code=422,
            detail="location_type 'clinic' requires clinic_id or clinic_ref",
        )
    if payload.location_type == models.LOC_CARRIER and not payload.carrier_id:
        raise HTTPException(status_code=422, detail="location_type 'carrier' requires carrier_id")
    if payload.location_type == models.LOC_CLINIC and payload.carrier_id:
        raise HTTPException(status_code=422, detail="clinic stops cannot set carrier_id")
    if payload.location_type == models.LOC_CARRIER and payload.clinic_id:
        raise HTTPException(status_code=422, detail="carrier stops cannot set clinic_id")


def _resolve_clinic(db: Session, ref: str) -> models.Clinic | None:
    """Link a free-typed clinic reference to a known clinic when possible:
    exact id if the reference is numeric, else a case-insensitive name match.
    Returns None when there's no match — the stop is kept as plain text."""
    ref = ref.strip()
    if not ref:
        return None
    if ref.isdigit():
        clinic = db.get(models.Clinic, int(ref))
        if clinic is not None:
            return clinic
    return (
        db.query(models.Clinic)
        .filter(func.lower(models.Clinic.name) == ref.lower())
        .first()
    )


def _resolve_driver(
    db: Session, driver_id: int | None, driver_name: str | None
) -> models.Driver:
    """Resolve the sheet's driver: by id, else by name (case-insensitive),
    creating the Driver record on first use so a typed name always works."""
    if driver_id is not None:
        return get_or_404(db, models.Driver, driver_id)
    name = (driver_name or "").strip()
    if not name:
        raise HTTPException(
            status_code=422, detail="driver_id or driver_name is required"
        )
    driver = (
        db.query(models.Driver)
        .filter(func.lower(models.Driver.name) == name.lower())
        .first()
    )
    if driver is None:
        driver = models.Driver(name=name)
        db.add(driver)
        db.commit()
        db.refresh(driver)
    return driver


# ---------------------------------------------------------------------------
# Route CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[schemas.RouteOut])
def list_routes(
    date_from: date | None = None,
    date_to: date | None = None,
    driver_id: int | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Route)
    if date_from:
        query = query.filter(models.Route.route_date >= date_from)
    if date_to:
        query = query.filter(models.Route.route_date <= date_to)
    if driver_id:
        query = query.filter(models.Route.driver_id == driver_id)
    if status_filter:
        query = query.filter(models.Route.status == status_filter)
    routes = query.order_by(models.Route.route_date.desc(), models.Route.id.desc()).all()
    return [_route_out(r, db) for r in routes]


@router.post("", response_model=schemas.RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(payload: schemas.RouteCreate, db: Session = Depends(get_db)):
    get_or_404(db, models.Driver, payload.driver_id)
    route = models.Route(**payload.model_dump())
    db.add(route)
    db.commit()
    db.refresh(route)
    return _route_out(route, db)


@router.post("/sheet", response_model=schemas.RouteDetail)
def pickup_sheet(payload: schemas.SheetCreate, db: Session = Depends(get_db)):
    """Pickup Sheet: the driver+date IS the sheet. The driver may be given by
    id or typed by name (found or created on first use). Find the day's route
    for the driver, creating it if it doesn't exist yet (no separate
    create-route step), then return the full RouteDetail so the sheet can be
    worked in place: numbered stops, fares, one-click picked-up, audit links.
    """
    driver = _resolve_driver(db, payload.driver_id, payload.driver_name)
    if payload.state_id is not None:
        get_or_404(db, models.State, payload.state_id)
    route = (
        db.query(models.Route)
        .filter(
            models.Route.driver_id == driver.id,
            models.Route.route_date == payload.date,
        )
        .order_by(models.Route.id)
        .first()
    )
    if route is None:
        route = models.Route(
            driver_id=driver.id,
            route_date=payload.date,
            state_id=payload.state_id,
            status=models.ROUTE_PLANNED,
        )
        db.add(route)
        db.commit()
        db.refresh(route)
    elif payload.state_id is not None and route.state_id != payload.state_id:
        # The sheet carries an optional state (used for the state cutoff).
        route.state_id = payload.state_id
        db.commit()
        db.refresh(route)
    return get_route(route.id, db)


@router.post("/close-day", response_model=list[schemas.RouteOut])
def close_day(date: date, db: Session = Depends(get_db)):
    """Day-end: close EVERY driver's route for the date in one action. The
    routes stay saved (Daily Audit Report, Excel export, Financials and Trends
    keep reading them) but are locked against further edits; the state cutoff
    is evaluated for each route exactly like closing it individually."""
    routes = (
        db.query(models.Route)
        .filter(
            models.Route.route_date == date,
            models.Route.status != models.ROUTE_CLOSED,
        )
        .all()
    )
    now = datetime.now()  # local-naive, see clock convention
    for route in routes:
        route.status = models.ROUTE_CLOSED
        route.closed_at = now
        _evaluate_state_cutoff(db, route, now)
    db.commit()
    closed = (
        db.query(models.Route)
        .filter(models.Route.route_date == date)
        .order_by(models.Route.id)
        .all()
    )
    return [_route_out(r, db) for r in closed]


@router.get("/{route_id}", response_model=schemas.RouteDetail)
def get_route(route_id: int, db: Session = Depends(get_db)):
    route = get_or_404(db, models.Route, route_id)
    projection = build_route_projection(db, route)
    detail = _route_out(route, db)
    detail["state_cutoff"] = projection["state_cutoff"]
    detail["projected_final_eta"] = projection["projected_final_eta"]
    detail["projected_state_cutoff_risk"] = projection["projected_state_cutoff_risk"]
    detail["next_stop_id"] = projection["next_stop_id"]
    detail["stops"] = [
        _stop_out(s, db, projection["stops"].get(s.id))
        for s in sorted(route.stops, key=lambda s: s.sequence)
    ]
    return detail


@router.put("/{route_id}", response_model=schemas.RouteOut)
def update_route(
    route_id: int, payload: schemas.RouteUpdate, db: Session = Depends(get_db)
):
    route = get_or_404(db, models.Route, route_id)
    updates = payload.model_dump(exclude_unset=True)

    # Auto-set closed_at the moment a route is closed (unless one is supplied);
    # clear it again if a closed route is reopened.
    if "status" in updates:
        if updates["status"] == models.ROUTE_CLOSED and route.status != models.ROUTE_CLOSED:
            updates.setdefault("closed_at", datetime.now())  # local-naive, see clock convention
        elif updates["status"] != models.ROUTE_CLOSED:
            updates["closed_at"] = None

    if updates.get("driver_id") is not None:
        get_or_404(db, models.Driver, updates["driver_id"])
    if updates.get("state_id") is not None:
        get_or_404(db, models.State, updates["state_id"])

    for key, value in updates.items():
        setattr(route, key, value)
    db.commit()
    db.refresh(route)

    # Spec §4: the formal State Cutoff breach is confirmed when the route
    # actually closes late → log a Major violation against the route.
    if route.status == models.ROUTE_CLOSED and route.closed_at:
        _evaluate_state_cutoff(db, route, route.closed_at)
        db.commit()
        db.refresh(route)

    return _route_out(route, db)


def _evaluate_state_cutoff(db: Session, route: models.Route, closed_at: datetime) -> None:
    """Idempotent: flag the route and write ONE Major 'State cutoff breach'
    violation when it closed past the state cutoff (§4, §3.2)."""
    state = route.state
    if not state or not state.cutoff_time:
        return
    cutoff_dt = datetime.combine(route.route_date, state.cutoff_time)
    if closed_at <= cutoff_dt:
        return

    route.state_cutoff_breached = True
    existing = (
        db.query(models.Violation)
        .filter(
            models.Violation.route_id == route.id,
            models.Violation.stop_id.is_(None),
            models.Violation.category == "State cutoff breach",
        )
        .first()
    )
    if existing is None:
        db.add(
            models.Violation(
                route_id=route.id,
                severity=models.SEV_MAJOR,
                category="State cutoff breach",
                description=(
                    f"Route #{route.id} closed at {closed_at.strftime('%H:%M')}, past the "
                    f"{state.code} state cutoff of {state.cutoff_time.strftime('%H:%M')}."
                ),
                source=models.SRC_DRIVER,
            )
        )


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(route_id: int, db: Session = Depends(get_db)):
    route = get_or_404(db, models.Route, route_id)
    db.delete(route)  # stops cascade via relationship
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Stop management on a route
# ---------------------------------------------------------------------------

@router.post(
    "/{route_id}/stops",
    response_model=schemas.StopListItem,
    status_code=status.HTTP_201_CREATED,
)
def add_stop(route_id: int, payload: schemas.StopCreate, db: Session = Depends(get_db)):
    route = get_or_404(db, models.Route, route_id)
    if route.status == models.ROUTE_CLOSED:
        raise HTTPException(
            status_code=422,
            detail="This day is closed — reopen the route before adding stops.",
        )
    _validate_stop_location(payload)

    data = payload.model_dump(
        exclude={"route_id", "sequence", "charge_amount"}
    )
    if payload.sequence is None:
        data["sequence"] = max((s.sequence for s in route.stops), default=0) + 1
    else:
        data["sequence"] = payload.sequence
    if payload.dispatcher_id is not None:
        get_or_404(db, models.Dispatcher, payload.dispatcher_id)

    # Free-typed clinic: keep what was typed (the sheet label), and link a
    # known clinic when the reference matches one (id or name) so map/cutoff
    # features still work for recognized clinics.
    if payload.location_type == models.LOC_CLINIC:
        ref = (payload.clinic_ref or "").strip() or None
        data["clinic_ref"] = ref
        if payload.clinic_id is not None:
            get_or_404(db, models.Clinic, payload.clinic_id)
        elif ref:
            resolved = _resolve_clinic(db, ref)
            if resolved is not None:
                data["clinic_id"] = resolved.id

    stop = models.Stop(route_id=route_id, **data)
    db.add(stop)
    db.flush()  # get stop.id
    # Pickup sheet: entering an amount on the row auto-creates the charge record.
    # client_billed defaults to the same amount (variance starts at $0); the
    # auditor can adjust billing later in Financials.
    if payload.charge_amount is not None:
        db.add(
            models.ChargeRecord(
                stop_id=stop.id,
                driver_pay=payload.charge_amount,
                client_billed=payload.charge_amount,
                notes="Auto-created from the pickup sheet.",
            )
        )
    db.commit()
    db.refresh(stop)
    return _stop_out(stop, db)


@router.delete("/{route_id}/stops/{stop_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_stop(route_id: int, stop_id: int, db: Session = Depends(get_db)):
    route = get_or_404(db, models.Route, route_id)
    if route.status == models.ROUTE_CLOSED:
        raise HTTPException(
            status_code=422,
            detail="This day is closed — reopen the route before removing stops.",
        )
    stop = (
        db.query(models.Stop)
        .filter(models.Stop.id == stop_id, models.Stop.route_id == route_id)
        .first()
    )
    if stop is None:
        raise HTTPException(
            status_code=404, detail=f"Stop {stop_id} not found on route {route_id}"
        )
    db.delete(stop)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
