"""Phase 4 — financial tracking: driver pay vs client billing per stop.

One ChargeRecord per stop (unique stop_id). `variance` is derived
(client_billed − driver_pay) and computed at serialization time. Pickup and
delivery timestamps live on the stop itself (arrival_time / departure_time).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..financial_pdf import build_financial_pdf
from . import get_or_404
from .violations import _stop_label

PDF_MIME = "application/pdf"

router = APIRouter(prefix="/api", tags=["charges"])


def _charge_out(db: Session, charge: models.ChargeRecord) -> dict:
    stop = db.get(models.Stop, charge.stop_id)
    route = stop.route if stop else None
    return {
        "id": charge.id,
        "stop_id": charge.stop_id,
        "driver_pay": round(charge.driver_pay, 2),
        "client_billed": round(charge.client_billed, 2),
        "variance": round(charge.client_billed - charge.driver_pay, 2),
        "notes": charge.notes,
        "created_at": charge.created_at,
        "updated_at": charge.updated_at,
        "stop_sequence": stop.sequence if stop else None,
        "stop_label": _stop_label(db, charge.stop_id),
        "route_id": route.id if route else None,
        "route_date": route.route_date if route else None,
        "driver_name": route.driver.name if route and route.driver else None,
    }


def _route_filters(
    query,
    route_id: int | None,
    driver_id: int | None,
    date_from: date | None,
    date_to: date | None,
):
    """Join Stop (+ Route when needed) and apply shared filters."""
    need_route = any([driver_id, date_from, date_to])
    query = query.join(models.Stop, models.Stop.id == models.ChargeRecord.stop_id)
    if need_route:
        query = query.join(models.Route, models.Route.id == models.Stop.route_id)
    if route_id:
        query = query.filter(models.Stop.route_id == route_id)
    if driver_id:
        query = query.filter(models.Route.driver_id == driver_id)
    if date_from:
        query = query.filter(models.Route.route_date >= date_from)
    if date_to:
        query = query.filter(models.Route.route_date <= date_to)
    return query


@router.get("/charges", response_model=list[schemas.ChargeOut])
def list_charges(
    route_id: int | None = None,
    driver_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.ChargeRecord)
    if any([route_id, driver_id, date_from, date_to]):
        query = _route_filters(query, route_id, driver_id, date_from, date_to)
    rows = query.order_by(models.ChargeRecord.id.desc()).limit(1000).all()
    return [_charge_out(db, c) for c in rows]


@router.get("/charges/summary", response_model=schemas.ChargeSummary)
def charge_summary(
    route_id: int | None = None,
    driver_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.ChargeRecord)
    if any([route_id, driver_id, date_from, date_to]):
        query = _route_filters(query, route_id, driver_id, date_from, date_to)
    rows = query.all()
    summary = schemas.ChargeSummary(
        count=len(rows),
        total_pay=round(sum(c.driver_pay for c in rows), 2),
        total_billed=round(sum(c.client_billed for c in rows), 2),
        total_variance=round(sum(c.client_billed - c.driver_pay for c in rows), 2),
    )

    # Uncharged completed stops under the same filters (audit gap check).
    stop_query = db.query(models.Stop).filter(models.Stop.status == models.STOP_COMPLETED)
    stop_query = stop_query.outerjoin(
        models.ChargeRecord, models.ChargeRecord.stop_id == models.Stop.id
    ).filter(models.ChargeRecord.id.is_(None))
    if any([route_id, driver_id, date_from, date_to]):
        stop_query = stop_query.join(
            models.Route, models.Route.id == models.Stop.route_id
        )
        if route_id:
            stop_query = stop_query.filter(models.Stop.route_id == route_id)
        if driver_id:
            stop_query = stop_query.filter(models.Route.driver_id == driver_id)
        if date_from:
            stop_query = stop_query.filter(models.Route.route_date >= date_from)
        if date_to:
            stop_query = stop_query.filter(models.Route.route_date <= date_to)
    summary.uncharged_completed_stops = stop_query.count()
    return summary


@router.get("/charges/export.pdf")
def export_charges_pdf(
    route_id: int | None = None,
    driver_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    """Download the current Financials view as an organized PDF: summary block
    up top, charge records grouped by driver with per-driver subtotals, and a
    grand-total row."""
    query = db.query(models.ChargeRecord)
    if any([route_id, driver_id, date_from, date_to]):
        query = _route_filters(query, route_id, driver_id, date_from, date_to)
    rows = query.order_by(models.ChargeRecord.id.desc()).limit(1000).all()

    summary = charge_summary(route_id, driver_id, date_from, date_to, db)
    filters = {
        "route_id": route_id,
        "driver_id": driver_id,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "driver_label": (
            db.get(models.Driver, driver_id).name if driver_id else None
        ),
    }
    buf = build_financial_pdf(
        [_charge_out(db, c) for c in rows], summary.model_dump(), filters
    )
    filename = f"agl_financial_report_{date.today().isoformat()}.pdf"
    return StreamingResponse(
        buf,
        media_type=PDF_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/stops/{stop_id}/charge",
    response_model=schemas.ChargeOut,
    status_code=status.HTTP_201_CREATED,
)
def create_charge(
    stop_id: int, payload: schemas.ChargeCreate, db: Session = Depends(get_db)
):
    stop = get_or_404(db, models.Stop, stop_id)
    if stop.status != models.STOP_COMPLETED:
        raise HTTPException(
            status_code=422,
            detail="Charge records can only be added to completed stops.",
        )
    if stop.charge is not None:
        raise HTTPException(
            status_code=409, detail="A charge record already exists for this stop."
        )
    charge = models.ChargeRecord(stop_id=stop_id, **payload.model_dump())
    db.add(charge)
    db.commit()
    db.refresh(charge)
    return _charge_out(db, charge)


@router.put("/charges/{charge_id}", response_model=schemas.ChargeOut)
def update_charge(
    charge_id: int, payload: schemas.ChargeUpdate, db: Session = Depends(get_db)
):
    charge = get_or_404(db, models.ChargeRecord, charge_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(charge, key, value)
    db.commit()
    db.refresh(charge)
    return _charge_out(db, charge)


@router.delete("/charges/{charge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_charge(charge_id: int, db: Session = Depends(get_db)):
    charge = get_or_404(db, models.ChargeRecord, charge_id)
    db.delete(charge)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
