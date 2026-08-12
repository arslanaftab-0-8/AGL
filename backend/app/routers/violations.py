"""SOP violation tracking (§3.2, §3.6).

Severities are exactly Critical / Major / Minor from the manual. A violation
attaches to either a Stop (most violations) or a Route (State Cutoff breach,
wired up in Phase 3). Escalation records `escalated_at`; resolution records
`resolved_at` + `resolved_by`.
"""
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api", tags=["violations"])


def _stop_label(db: Session, stop_id: int | None) -> str | None:
    if stop_id is None:
        return None
    stop = db.get(models.Stop, stop_id)
    if stop is None:
        return None
    if stop.clinic_id:
        clinic = db.get(models.Clinic, stop.clinic_id)
        if clinic:
            return clinic.name
        return stop.clinic_ref or None  # linked clinic deleted → typed ref
    if stop.carrier_id:
        carrier = db.get(models.Carrier, stop.carrier_id)
        return carrier.name if carrier else None
    return stop.clinic_ref or None  # free-typed clinic (no Clinic record)


def _violation_out(db: Session, v: models.Violation) -> dict:
    stop = db.get(models.Stop, v.stop_id) if v.stop_id else None
    route = db.get(models.Route, v.route_id) if v.route_id else None
    return {
        "id": v.id,
        "stop_id": v.stop_id,
        "route_id": v.route_id,
        "severity": v.severity,
        "category": v.category,
        "description": v.description,
        "source": v.source,
        "escalated_at": v.escalated_at,
        "resolved_at": v.resolved_at,
        "resolved_by": v.resolved_by,
        "created_at": v.created_at,
        "stop_sequence": stop.sequence if stop else None,
        "stop_label": _stop_label(db, v.stop_id),
        "route_date": route.route_date if route else None,
        "driver_name": route.driver.name if route and route.driver else None,
    }


@router.get("/violations", response_model=list[schemas.ViolationOut])
def list_violations(
    severity: str | None = None,
    resolved: bool | None = None,
    escalated: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Violation)
    if severity:
        query = query.filter(models.Violation.severity == severity)
    if resolved is not None:
        if resolved:
            query = query.filter(models.Violation.resolved_at.isnot(None))
        else:
            query = query.filter(models.Violation.resolved_at.is_(None))
    if escalated is not None:
        if escalated:
            query = query.filter(models.Violation.escalated_at.isnot(None))
        else:
            query = query.filter(models.Violation.escalated_at.is_(None))
    rows = query.order_by(models.Violation.created_at.desc()).limit(500).all()
    return [_violation_out(db, v) for v in rows]


@router.get("/stops/{stop_id}/violations", response_model=list[schemas.ViolationOut])
def list_stop_violations(stop_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Stop, stop_id)
    rows = (
        db.query(models.Violation)
        .filter(models.Violation.stop_id == stop_id)
        .order_by(models.Violation.created_at.desc())
        .all()
    )
    return [_violation_out(db, v) for v in rows]


@router.post(
    "/stops/{stop_id}/violations",
    response_model=schemas.ViolationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_stop_violation(
    stop_id: int, payload: schemas.ViolationCreate, db: Session = Depends(get_db)
):
    get_or_404(db, models.Stop, stop_id)
    violation = models.Violation(
        stop_id=stop_id, **payload.model_dump(exclude={"stop_id", "route_id"})
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return _violation_out(db, violation)


@router.post(
    "/routes/{route_id}/violations",
    response_model=schemas.ViolationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_route_violation(
    route_id: int, payload: schemas.ViolationCreate, db: Session = Depends(get_db)
):
    """Route-level violations (e.g. the Phase 3 State Cutoff breach)."""
    get_or_404(db, models.Route, route_id)
    violation = models.Violation(
        route_id=route_id, **payload.model_dump(exclude={"stop_id", "route_id"})
    )
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return _violation_out(db, violation)


@router.put("/violations/{violation_id}", response_model=schemas.ViolationOut)
def update_violation(
    violation_id: int, payload: schemas.ViolationUpdate, db: Session = Depends(get_db)
):
    violation = get_or_404(db, models.Violation, violation_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(violation, key, value)
    db.commit()
    db.refresh(violation)
    return _violation_out(db, violation)


@router.delete("/violations/{violation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_violation(violation_id: int, db: Session = Depends(get_db)):
    violation = get_or_404(db, models.Violation, violation_id)
    db.delete(violation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
