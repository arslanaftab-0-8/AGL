"""CRUD for dispatchers."""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import exc
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api/dispatchers", tags=["dispatchers"])


@router.get("", response_model=list[schemas.DispatcherOut])
def list_dispatchers(db: Session = Depends(get_db)):
    return db.query(models.Dispatcher).order_by(models.Dispatcher.name).all()


@router.post("", response_model=schemas.DispatcherOut, status_code=status.HTTP_201_CREATED)
def create_dispatcher(payload: schemas.DispatcherCreate, db: Session = Depends(get_db)):
    dispatcher = models.Dispatcher(**payload.model_dump())
    db.add(dispatcher)
    db.commit()
    db.refresh(dispatcher)
    return dispatcher


@router.get("/{dispatcher_id}", response_model=schemas.DispatcherOut)
def get_dispatcher(dispatcher_id: int, db: Session = Depends(get_db)):
    return get_or_404(db, models.Dispatcher, dispatcher_id)


@router.put("/{dispatcher_id}", response_model=schemas.DispatcherOut)
def update_dispatcher(
    dispatcher_id: int, payload: schemas.DispatcherUpdate, db: Session = Depends(get_db)
):
    dispatcher = get_or_404(db, models.Dispatcher, dispatcher_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dispatcher, key, value)
    db.commit()
    db.refresh(dispatcher)
    return dispatcher


@router.delete("/{dispatcher_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dispatcher(dispatcher_id: int, db: Session = Depends(get_db)):
    dispatcher = get_or_404(db, models.Dispatcher, dispatcher_id)
    try:
        db.delete(dispatcher)
        db.commit()
    except exc.IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: dispatcher is referenced by one or more stops.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
