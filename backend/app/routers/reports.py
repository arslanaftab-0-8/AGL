"""Phase 5 — daily audit reports (§3.4).

`POST /api/reports/generate` recomputes the day's metrics from the actual
audits + violations and upserts the report row (idempotent — re-run any time
to refresh the snapshot). The xlsx export renders the §3.4 layout via
openpyxl. Auditor name + recommendations are editable on the report.
"""
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..reporting import (
    build_pickup_sheet_xlsx,
    build_xlsx,
    compute_report,
    violations_for_date,
)
from . import get_or_404
from .violations import _violation_out

router = APIRouter(prefix="/api/reports", tags=["reports"])

XLSX_MIME = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


def _report_out(r: models.DailyReport) -> dict:
    return {
        "id": r.id,
        "report_date": r.report_date,
        "auditor_name": r.auditor_name,
        "routes_audited": r.routes_audited,
        "stops_reviewed": r.stops_reviewed,
        "passed": r.passed,
        "failed": r.failed,
        "critical": r.critical,
        "major": r.major,
        "minor": r.minor,
        "dispatch_errors": r.dispatch_errors,
        "driver_errors": r.driver_errors,
        "recommendations": r.recommendations,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


@router.get("", response_model=list[schemas.ReportOut])
def list_reports(db: Session = Depends(get_db)):
    rows = (
        db.query(models.DailyReport)
        .order_by(models.DailyReport.report_date.desc())
        .limit(90)
        .all()
    )
    return [_report_out(r) for r in rows]


@router.get("/pickup-sheet.xlsx")
def export_pickup_sheet(
    report_date: date, db: Session = Depends(get_db)
):
    """Export the day's pickup sheets for ALL drivers, organized by state:
    state headings on top, beneath each the driver ID, clinic ID and every
    pickup-sheet column plus one column per SOP, color-coded by audit outcome
    (green = passed, orange = minor flag, red = major/critical flag)."""
    buf = build_pickup_sheet_xlsx(db, report_date)
    filename = f"agl_pickup_sheet_{report_date.isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}", response_model=schemas.ReportDetail)
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = get_or_404(db, models.DailyReport, report_id)
    out = _report_out(report)
    out["violations"] = [
        _violation_out(db, v) for v in violations_for_date(db, report.report_date)
    ]
    return out


@router.post("/generate", response_model=schemas.ReportOut)
def generate_report(
    report_date: date | None = None, db: Session = Depends(get_db)
):
    """(Re)compute the §3.4 snapshot for a date and upsert the report row."""
    d = report_date or date.today()
    metrics = compute_report(db, d)
    report = (
        db.query(models.DailyReport)
        .filter(models.DailyReport.report_date == d)
        .first()
    )
    if report is None:
        report = models.DailyReport(report_date=d, **metrics)
        db.add(report)
    else:
        for key, value in metrics.items():
            setattr(report, key, value)
    db.commit()
    db.refresh(report)
    return _report_out(report)


@router.put("/{report_id}", response_model=schemas.ReportOut)
def update_report(
    report_id: int, payload: schemas.ReportUpdate, db: Session = Depends(get_db)
):
    report = get_or_404(db, models.DailyReport, report_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(report, key, value)
    db.commit()
    db.refresh(report)
    return _report_out(report)


@router.get("/{report_id}/export.xlsx")
def export_report(report_id: int, db: Session = Depends(get_db)):
    report = get_or_404(db, models.DailyReport, report_id)
    payload = _report_out(report)
    violations = [
        _violation_out(db, v) for v in violations_for_date(db, report.report_date)
    ]
    buf = build_xlsx(payload, violations)
    filename = f"agl_daily_report_{report.report_date.isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type=XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
