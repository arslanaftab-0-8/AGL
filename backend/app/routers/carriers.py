"""CRUD for carriers (FedEx / UPS / Airport Cargo / Laboratory)."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api/carriers", tags=["carriers"])


@router.get("", response_model=list[schemas.CarrierOut])
def list_carriers(db: Session = Depends(get_db)):
    return db.query(models.Carrier).order_by(models.Carrier.name).all()


@router.post("", response_model=schemas.CarrierOut, status_code=status.HTTP_201_CREATED)
def create_carrier(payload: schemas.CarrierCreate, db: Session = Depends(get_db)):
    carrier = models.Carrier(**payload.model_dump())
    db.add(carrier)
    db.commit()
    db.refresh(carrier)
    return carrier


@router.get("/{carrier_id}", response_model=schemas.CarrierOut)
def get_carrier(carrier_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Carrier, carrier_id)


@router.put("/{carrier_id}", response_model=schemas.CarrierOut)
def update_carrier(
    carrier_id: int, payload: schemas.CarrierUpdate, db: Session = Depends(get_db)
):
    carrier = get_or_404(db, models.Carrier, carrier_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(carrier, key, value)
    db.commit()
    db.refresh(carrier)
    return carrier


@router.delete("/{carrier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_carrier(carrier_id: int, db: Session = Depends(get_db)):
    carrier = get_or_404(db, models.Carrier, carrier_id)
    try:
        db.delete(carrier)
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: carrier is referenced by one or more stops.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
