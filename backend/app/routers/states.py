"""CRUD for states (2-letter code + optional state cutoff time)."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api/states", tags=["states"])


@router.get("", response_model=list[schemas.StateOut])
def list_states(db: Session = Depends(get_db)):
    return db.query(models.State).order_by(models.State.code).all()


@router.post("", response_model=schemas.StateOut, status_code=status.HTTP_201_CREATED)
def create_state(payload: schemas.StateCreate, db: Session = Depends(get_db)):
    payload.code = payload.code.upper()
    state = models.State(**payload.model_dump())
    db.add(state)
    try:
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="State code already exists.")
    db.refresh(state)
    return state


@router.get("/{state_id}", response_model=schemas.StateOut)
def get_state(state_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.State, state_id)


@router.put("/{state_id}", response_model=schemas.StateOut)
def update_state(
    state_id: int, payload: schemas.StateUpdate, db: Session = Depends(get_db)
):
    state = get_or_404(db, models.State, state_id)
    data = payload.model_dump(exclude_unset=True)
    if "code" in data:
        data["code"] = data["code"].upper()
    for key, value in data.items():
        setattr(state, key, value)
    db.commit()
    db.refresh(state)
    return state


@router.delete("/{state_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_state(state_id: int, db: Session = Depends(get_db)):
    state = get_or_404(db, models.State, state_id)
    try:
        db.delete(state)
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: state is referenced by one or more routes.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
