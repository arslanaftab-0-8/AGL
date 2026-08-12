"""Per-stop audit checklist (§3.3 of the spec).

The 14 canonical item names below are copied directly from the company's QA
Auditor Training Manual — do not alter them. Rows are auto-seeded for a stop
the first time its checklist is opened, then updated in place.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from . import get_or_404

router = APIRouter(prefix="/api", tags=["checklist"])

# §3.3 — source of truth, do not alter.
CHECKLIST_ITEMS = [
    "Pickup Photo",
    "Delivery Photo",
    "Building Photo",
    "Lockbox Photo",
    "Proof Slip",
    "Shipping Label Visible",
    "Barcode Readable",
    "Package Count Verified",
    "Correct Clinic",
    "Correct Destination",
    "Timestamp Verified",
    "Dispatch Verified",
    "Driver Notes Reviewed",
    "SOP Followed",
]

# Pickup photo protocol (owner-defined extension, flagged per §3 — the 14
# §3.3 items above are untouched; these are ADDITIONAL documentation items
# reviewed per pickup stop). Lockbox pickup: lockbox, inside, outside, clinic
# front, specimen count. Reception pickup: reception area, package, clinic
# entrance. Items that don't apply to the pickup method are marked N/A.
# 'Lockbox Photo' and 'Proof Slip' already exist in the §3.3 list above.
PICKUP_PHOTO_ITEMS = [
    "Inside Lockbox Photo",
    "Outside Lockbox Photo",
    "Front of Clinic Photo",
    "Specimen Count Photo",
    "Reception Area Photo",
    "Package Photo",
    "Clinic Entrance Photo",
]


def _item_out(item: models.ChecklistItem) -> dict:
    return {
        "id": item.id,
        "stop_id": item.stop_id,
        "item_name": item.item_name,
        "status": item.status,
        "notes": item.notes,
    }


@router.get("/stops/{stop_id}/checklist", response_model=list[schemas.ChecklistItemOut])
def get_checklist(stop_id: int, db: Session = Depends(get_db)):
    stop = get_or_404(db, models.Stop, stop_id)

    # Idempotent + additive: seed any missing items from the template for this
    # stop (pickup stops also get the pickup photo protocol items). Existing
    # rows are untouched, so pre-existing stops pick up the new items on next
    # open without re-seeding anything.
    template = CHECKLIST_ITEMS + (
        PICKUP_PHOTO_ITEMS if stop.stop_type == models.STOP_PICKUP else []
    )
    items = (
        db.query(models.ChecklistItem)
        .filter(models.ChecklistItem.stop_id == stop_id)
        .all()
    )
    existing = {it.item_name for it in items}
    missing = [name for name in template if name not in existing]
    if missing:
        db.add_all(
            [
                models.ChecklistItem(
                    stop_id=stop_id, item_name=name, status=models.CHK_NA
                )
                for name in missing
            ]
        )
        db.commit()
        items = (
            db.query(models.ChecklistItem)
            .filter(models.ChecklistItem.stop_id == stop_id)
            .all()
        )

    order = {name: i for i, name in enumerate(template)}
    items.sort(key=lambda it: order.get(it.item_name, 99))
    return [_item_out(it) for it in items]


@router.put("/checklist-items/{item_id}", response_model=schemas.ChecklistItemOut)
def update_checklist_item(
    item_id: int, payload: schemas.ChecklistItemUpdate, db: Session = Depends(get_db)
):
    item = get_or_404(db, models.ChecklistItem, item_id)
    item.status = payload.status
    item.notes = payload.notes or None
    db.commit()
    db.refresh(item)
    return _item_out(item)
