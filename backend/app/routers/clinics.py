"""CRUD for clinics, including the JSON change-log on every edit."""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api/clinics", tags=["clinics"])

CHANGE_LOG_CAP = 200


def _jsonable(value):
    """Normalize values so they survive JSON serialization inside change_log."""
    if isinstance(value, time):
        return value.strftime("%H:%M")
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    return value


@router.get("", response_model=list[schemas.ClinicOut])
def list_clinics(
    q: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Clinic)
    if q:
        like = f"%{q}%"
        query = query.filter(
            models.Clinic.name.ilike(like)
            | models.Clinic.address.ilike(like)
            | models.Clinic.city.ilike(like)
        )
    if state:
        query = query.filter(models.Clinic.state == state.upper())
    return query.order_by(models.Clinic.name).all()


@router.post("", response_model=schemas.ClinicOut, status_code=status.HTTP_201_CREATED)
def create_clinic(payload: schemas.ClinicCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data.get("state"):
        data["state"] = data["state"].upper()
    clinic = models.Clinic(**data)
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic


@router.get("/{clinic_id}", response_model=schemas.ClinicOut)
def get_clinic(clinic_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Clinic, clinic_id)


@router.put("/{clinic_id}", response_model=schemas.ClinicOut)
def update_clinic(
    clinic_id: int, payload: schemas.ClinicUpdate, db: Session = Depends(get_db)
):
    clinic = get_or_404(db, models.Clinic, clinic_id)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("state"):
        updates["state"] = updates["state"].upper()

    log: list = list(clinic.change_log or [])
    for field, new_value in updates.items():
        old_value = getattr(clinic, field)
        if field == "change_log" or old_value == new_value:
            continue
        log.append(
            {
                "at": datetime.now().isoformat(timespec="seconds"),  # local-naive
                "field": field,
                "old": _jsonable(old_value),
                "new": _jsonable(new_value),
                "by": "auditor",
            }
        )

    for key, value in updates.items():
        setattr(clinic, key, value)
    clinic.change_log = log[-CHANGE_LOG_CAP:]
    db.commit()
    db.refresh(clinic)
    return clinic


@router.delete("/{clinic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clinic(clinic_id: int, db: Session = Depends(get_db)):
    clinic = get_or_404(db, models.Clinic, clinic_id)
    try:
        db.delete(clinic)
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: clinic is referenced by one or more stops.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
