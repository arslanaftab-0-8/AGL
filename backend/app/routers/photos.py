"""Photo upload/storage for the audit checklist.

Files are stored on the local filesystem under backend/photos (gitignored) and
served at /photos. Uploads are size- and extension-limited; names are
randomized to avoid collisions and path traversal.
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import PHOTOS_PATH, get_db
from . import get_or_404

router = APIRouter(prefix="/api", tags=["photos"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".bmp"}
MAX_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


def _photo_out(photo: models.Photo) -> dict:
    return {
        "id": photo.id,
        "stop_id": photo.stop_id,
        "photo_type": photo.photo_type,
        "file_path": photo.file_path,
        "url": f"/photos/{photo.file_path}",
        "original_name": photo.original_name,
        "mime_type": photo.mime_type,
        "size_bytes": photo.size_bytes,
        "quality_status": photo.quality_status,
        "uploaded_at": photo.uploaded_at,
    }


@router.post(
    "/stops/{stop_id}/photos",
    response_model=schemas.PhotoOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    stop_id: int,
    file: UploadFile = File(...),
    photo_type: str = Form("other"),
    db: Session = Depends(get_db),
):
    get_or_404(db, models.Stop, stop_id)

    original = (file.filename or "photo").strip() or "photo"
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    if photo_type not in models.PHOTO_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown photo_type '{photo_type}'.")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="Empty file.")
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 15 MB limit.")

    PHOTOS_PATH.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (PHOTOS_PATH / filename).write_bytes(content)

    photo = models.Photo(
        stop_id=stop_id,
        photo_type=photo_type,
        file_path=filename,
        original_name=original[:255],
        mime_type=file.content_type,
        size_bytes=len(content),
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return _photo_out(photo)


@router.get("/stops/{stop_id}/photos", response_model=list[schemas.PhotoOut])
def list_photos(stop_id: int, db: Session = Depends(get_db)):
    get_or_404(db, models.Stop, stop_id)
    photos = (
        db.query(models.Photo)
        .filter(models.Photo.stop_id == stop_id)
        .order_by(models.Photo.uploaded_at.desc())
        .all()
    )
    return [_photo_out(p) for p in photos]


@router.put("/photos/{photo_id}", response_model=schemas.PhotoOut)
def update_photo(
    photo_id: int, payload: schemas.PhotoUpdate, db: Session = Depends(get_db)
):
    photo = get_or_404(db, models.Photo, photo_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(photo, key, value)
    db.commit()
    db.refresh(photo)
    return _photo_out(photo)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = get_or_404(db, models.Photo, photo_id)
    file_path = Path(PHOTOS_PATH) / photo.file_path
    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass  # missing file is not an error — DB row is the source of truth
    db.delete(photo)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
