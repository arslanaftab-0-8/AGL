"""Standalone stop endpoints: list all stops, update, delete.

Stop creation lives on the route resource (POST /api/routes/{id}/stops) so
sequence handling stays centralized. Updating a stop covers arrival/departure
times, status, package counts, notes, and the audit fields (Phase 2 uses the
same endpoint to mark audit progress on a stop).

Listing accepts an optional `date` filter: every stop across ALL drivers for
that route date (used by the pickup sheet's per-day duplicate search).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404
from .routes import _stop_out

router = APIRouter(prefix="/api/stops", tags=["stops"])


@router.get("", response_model=list[schemas.StopListItem])
def list_stops(
    route_id: int | None = None,
    audit_status: str | None = None,
    stop_status: str | None = None,
    date: date | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Stop)
    if route_id is not None:
        query = query.filter(models.Stop.route_id == route_id)
    if audit_status:
        query = query.filter(models.Stop.audit_status == audit_status)
    if stop_status:
        query = query.filter(models.Stop.status == stop_status)
    if date:
        query = query.join(models.Route, models.Route.id == models.Stop.route_id).filter(
            models.Route.route_date == date
        )
    stops = query.order_by(models.Stop.route_id, models.Stop.sequence).all()

    result = []
    for stop in stops:
        item = _stop_out(stop, db)
        route = stop.route
        item["route_date"] = route.route_date if route else None
        item["driver_name"] = route.driver.name if route and route.driver else None
        result.append(item)
    return result


@router.get("/{stop_id}", response_model=schemas.StopListItem)
def get_stop(stop_id: int, db: Session = Depends(get_db)):
    stop = get_or_404(db, models.Stop, stop_id)
    item = _stop_out(stop, db)
    route = stop.route
    item["route_date"] = route.route_date if route else None
    item["driver_name"] = route.driver.name if route and route.driver else None
    return item


@router.put("/{stop_id}", response_model=schemas.StopListItem)
def update_stop(stop_id: int, payload: schemas.StopUpdate, db: Session = Depends(get_db)):
    stop = get_or_404(db, models.Stop, stop_id)
    updates = payload.model_dump(exclude_unset=True)

    # Location consistency (same rules as creation).
    if "location_type" in updates or "clinic_id" in updates or "carrier_id" in updates:
        location_type = updates.get("location_type", stop.location_type)
        clinic_id = updates.get("clinic_id", stop.clinic_id)
        carrier_id = updates.get("carrier_id", stop.carrier_id)
        if location_type == models.LOC_CLINIC and not clinic_id:
            raise HTTPException(
                status_code=422, detail="location_type 'clinic' requires clinic_id"
            )
        if location_type == models.LOC_CARRIER and not carrier_id:
            raise HTTPException(
                status_code=422, detail="location_type 'carrier' requires carrier_id"
            )

    if updates.get("dispatcher_id") is not None:
        get_or_404(db, models.Dispatcher, updates["dispatcher_id"])

    for key, value in updates.items():
        setattr(stop, key, value)
    db.commit()
    db.refresh(stop)
    return _stop_out(stop, db)


@router.delete("/{stop_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stop(stop_id: int, db: Session = Depends(get_db)):
    stop = get_or_404(db, models.Stop, stop_id)
    db.delete(stop)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
