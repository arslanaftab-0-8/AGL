"""CRUD for drivers + manual live-location updates (Phase 3) + the per-day
flags/income summary (Driver Day view)."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404
from .violations import _violation_out

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


@router.get("", response_model=list[schemas.DriverOut])
def list_drivers(db: Session = Depends(get_db)):
    return db.query(models.Driver).order_by(models.Driver.name).all()


@router.post("", response_model=schemas.DriverOut, status_code=status.HTTP_201_CREATED)
def create_driver(payload: schemas.DriverCreate, db: Session = Depends(get_db)):
    driver = models.Driver(**payload.model_dump())
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=schemas.DriverOut)
def get_driver(driver_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Driver, driver_id)


@router.put("/{driver_id}", response_model=schemas.DriverOut)
def update_driver(
    driver_id: int, payload: schemas.DriverUpdate, db: Session = Depends(get_db)
):
    driver = get_or_404(db, models.Driver, driver_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(driver, key, value)
    db.commit()
    db.refresh(driver)
    return driver


@router.put("/{driver_id}/location", response_model=schemas.DriverOut)
def update_driver_location(
    driver_id: int, payload: schemas.DriverLocationUpdate, db: Session = Depends(get_db)
):
    """Manually set the driver's current location (typed in / picked from a
    stop by the dispatcher or auditor). ETAs are recalculated from this."""
    driver = get_or_404(db, models.Driver, driver_id)
    driver.current_lat = payload.lat
    driver.current_lng = payload.lng
    driver.location_updated_at = datetime.now()  # local-naive, display-only
    db.commit()
    db.refresh(driver)
    return driver


@router.get("/{driver_id}/day", response_model=schemas.DriverDaySummary)
def driver_day(
    driver_id: int, day: date | None = None, db: Session = Depends(get_db)
):
    """One driver's day: every stop with the flags raised on it and its pay.

    flag_count = stop-level violations on the stop; route_flags counts
    whole-route violations (e.g. a State Cutoff breach) once per route.
    Income comes from the stop's charge record (driver_pay / client_billed).
    """
    driver = get_or_404(db, models.Driver, driver_id)
    d = day or date.today()

    routes = (
        db.query(models.Route)
        .filter(models.Route.driver_id == driver_id, models.Route.route_date == d)
        .order_by(models.Route.id)
        .all()
    )

    stops_out = []
    total_flags = 0
    route_flags = 0
    total_pay = 0.0
    total_billed = 0.0
    for route in routes:
        for v in route.violations:
            if v.stop_id is None:
                route_flags += 1  # whole-route finding, counted once per route
        for stop in sorted(route.stops, key=lambda s: s.sequence):
            vlist = stop.violations
            total_flags += len(vlist)
            pay = stop.charge.driver_pay if stop.charge else None
            billed = stop.charge.client_billed if stop.charge else None
            if pay is not None:
                total_pay += pay
            if billed is not None:
                total_billed += billed
            stops_out.append(
                schemas.DriverDayStop(
                    stop_id=stop.id,
                    route_id=route.id,
                    sequence=stop.sequence,
                    location_label=(
                        stop.clinic.name
                        if stop.clinic
                        else (
                            stop.clinic_ref
                            or (stop.carrier.name if stop.carrier else None)
                        )
                    ),
                    stop_type=stop.stop_type,
                    status=stop.status,
                    arrival_time=stop.arrival_time,
                    flag_count=len(vlist),
                    violations=[_violation_out(db, v) for v in vlist],
                    driver_pay=round(pay, 2) if pay is not None else None,
                    client_billed=round(billed, 2) if billed is not None else None,
                    variance=(
                        round(billed - pay, 2)
                        if pay is not None and billed is not None
                        else None
                    ),
                )
            )

    return schemas.DriverDaySummary(
        driver_id=driver.id,
        driver_name=driver.name,
        date=d,
        total_stops=len(stops_out),
        total_flags=total_flags + route_flags,
        route_flags=route_flags,
        total_pay=round(total_pay, 2),
        total_billed=round(total_billed, 2),
        stops=stops_out,
    )


@router.delete("/{driver_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = get_or_404(db, models.Driver, driver_id)
    try:
        db.delete(driver)
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: driver is assigned to one or more routes.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
