"""Phase 6 — monthly trend analysis (§3.6 step 9, §3.7).

Read-only aggregation over violations within a calendar month:
- totals by severity, source (driver/dispatch errors), open vs resolved
- per-day activity for the month
- recurring violation categories
- repeat-offender tables by driver / clinic / dispatcher

An entity gets a training-opportunity flag when the same violation category
recurs >= FLAG_THRESHOLD times within the month.
"""
import calendar
from collections import Counter, defaultdict
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api", tags=["trends"])

FLAG_THRESHOLD = 2
MAX_ENTITIES = 20


def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    return (
        datetime.combine(start, time.min),
        datetime.combine(date(year, month, last_day), time.max),
    )


def _new_acc(entity_id: int, name: str) -> dict:
    return {
        "id": entity_id,
        "name": name,
        "total": 0,
        "sev": Counter(),
        "src": Counter(),
        "cats": Counter(),
    }


def _entity_out(acc: dict) -> schemas.TrendEntity:
    flags = sorted(
        (
            f"{cat} ×{n}"
            for cat, n in acc["cats"].items()
            if n >= FLAG_THRESHOLD
        ),
        # most-repeated first
        key=lambda f: int(f.rsplit("×", 1)[1]),
        reverse=True,
    )
    return schemas.TrendEntity(
        id=acc["id"],
        name=acc["name"],
        total=acc["total"],
        critical=acc["sev"].get("critical", 0),
        major=acc["sev"].get("major", 0),
        minor=acc["sev"].get("minor", 0),
        driver_errors=acc["src"].get("driver", 0),
        dispatch_errors=acc["src"].get("dispatch", 0),
        repeat_flags=flags,
    )


@router.get("/trends", response_model=schemas.TrendData)
def trends(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    start_dt, end_dt = _month_bounds(year, month)
    violations = (
        db.query(models.Violation)
        .filter(
            models.Violation.created_at >= start_dt,
            models.Violation.created_at <= end_dt,
        )
        .all()
    )

    sev_total = Counter(v.severity for v in violations)
    src_total = Counter(v.source for v in violations)
    resolved = sum(1 for v in violations if v.resolved_at)

    # Per-day activity (all days of the month, so the strip shows gaps).
    days: dict[date, Counter] = defaultdict(Counter)
    for v in violations:
        days[v.created_at.date()][v.severity] += 1
    by_day = []
    for day in range(1, calendar.monthrange(year, month)[1] + 1):
        d = date(year, month, day)
        c = days.get(d, Counter())
        by_day.append(
            schemas.TrendDay(
                day=d.isoformat(),
                total=sum(c.values()),
                critical=c.get("critical", 0),
                major=c.get("major", 0),
                minor=c.get("minor", 0),
            )
        )

    # Recurring categories.
    cats: dict[str, Counter] = defaultdict(Counter)
    for v in violations:
        cats[v.category][v.severity] += 1
    by_category = sorted(
        (
            schemas.TrendCategory(
                category=cat,
                count=sum(sev.values()),
                critical=sev.get("critical", 0),
                major=sev.get("major", 0),
                minor=sev.get("minor", 0),
            )
            for cat, sev in cats.items()
        ),
        key=lambda c: c.count,
        reverse=True,
    )[:12]

    # Repeat-offender buckets. Context resolution:
    # - driver comes from the route (a stop's route, or the route itself for
    #   route-level violations like the State Cutoff breach)
    # - clinic / dispatcher come from the stop
    drivers: dict[int, dict] = {}
    clinics: dict[int, dict] = {}
    dispatchers: dict[int, dict] = {}

    for v in violations:
        stop = db.get(models.Stop, v.stop_id) if v.stop_id else None
        route = (
            stop.route
            if stop
            else (db.get(models.Route, v.route_id) if v.route_id else None)
        )
        if route and route.driver_id:
            acc = drivers.setdefault(
                route.driver_id,
                _new_acc(
                    route.driver_id,
                    route.driver.name if route.driver else f"Driver {route.driver_id}",
                ),
            )
            acc["total"] += 1
            acc["sev"][v.severity] += 1
            acc["src"][v.source] += 1
            # Repeat flags attribute only the entity's OWN source (§3.7): a
            # driver shouldn't be flagged for dispatch errors on their stops.
            if v.source == models.SRC_DRIVER:
                acc["cats"][v.category] += 1
        if stop and stop.clinic_id:
            clinic = stop.clinic
            acc = clinics.setdefault(
                stop.clinic_id,
                _new_acc(
                    stop.clinic_id,
                    clinic.name if clinic else f"Clinic {stop.clinic_id}",
                ),
            )
            acc["total"] += 1
            acc["sev"][v.severity] += 1
            acc["src"][v.source] += 1
            acc["cats"][v.category] += 1  # clinics have no source identity
        if stop and stop.dispatcher_id:
            disp = stop.dispatcher
            acc = dispatchers.setdefault(
                stop.dispatcher_id,
                _new_acc(
                    stop.dispatcher_id,
                    disp.name if disp else f"Dispatcher {stop.dispatcher_id}",
                ),
            )
            acc["total"] += 1
            acc["sev"][v.severity] += 1
            acc["src"][v.source] += 1
            if v.source == models.SRC_DISPATCH:
                acc["cats"][v.category] += 1

    def _sorted(accs: dict[int, dict]) -> list[schemas.TrendEntity]:
        return sorted(
            (_entity_out(a) for a in accs.values()),
            key=lambda e: e.total,
            reverse=True,
        )[:MAX_ENTITIES]

    return schemas.TrendData(
        year=year,
        month=month,
        total=len(violations),
        critical=sev_total.get("critical", 0),
        major=sev_total.get("major", 0),
        minor=sev_total.get("minor", 0),
        driver_errors=src_total.get("driver", 0),
        dispatch_errors=src_total.get("dispatch", 0),
        open=len(violations) - resolved,
        resolved=resolved,
        by_category=by_category,
        by_driver=_sorted(drivers),
        by_clinic=_sorted(clinics),
        by_dispatcher=_sorted(dispatchers),
        by_day=by_day,
    )
