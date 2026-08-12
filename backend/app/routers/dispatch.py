"""Dispatch Map data (Phase 3) — one payload for the US-wide live view.

Returns every planned/active route with its driver's manually-entered location,
per-stop cutoff/ETA metadata, the projected final ETA, and the projected State
Cutoff at-risk warning (a live UI warning only — the formal Major violation is
written by routers/routes.py when the route actually closes late).
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..eta import build_route_projection
from .routes import _route_out, _stop_out

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])


@router.get("/map", response_model=schemas.DispatchMapData)
def dispatch_map(db: Session = Depends(get_db)):
    routes = (
        db.query(models.Route)
        .filter(models.Route.status.in_([models.ROUTE_PLANNED, models.ROUTE_ACTIVE]))
        .order_by(models.Route.route_date.asc(), models.Route.id.asc())
        .all()
    )

    out = []
    at_risk_count = 0
    for route in routes:
        projection = build_route_projection(db, route)
        driver = route.driver
        if projection["projected_state_cutoff_risk"]:
            at_risk_count += 1

        next_stop = None
        next_stop_id = projection["next_stop_id"]
        if next_stop_id is not None:
            found = next((s for s in route.stops if s.id == next_stop_id), None)
            if found is not None:
                next_stop = _stop_out(
                    found, db, projection["stops"].get(next_stop_id)
                )

        out.append(
            {
                "route": _route_out(route, db),
                "driver": {
                    "id": driver.id,
                    "name": driver.name,
                    "vehicle": driver.vehicle,
                    "current_lat": driver.current_lat,
                    "current_lng": driver.current_lng,
                    "location_updated_at": driver.location_updated_at,
                },
                "state_cutoff": projection["state_cutoff"],
                "projected_final_eta": projection["projected_final_eta"],
                "projected_state_cutoff_risk": projection["projected_state_cutoff_risk"],
                "next_stop": next_stop,
                "stops": [
                    _stop_out(s, db, projection["stops"].get(s.id))
                    for s in sorted(route.stops, key=lambda s: s.sequence)
                ],
            }
        )

    return {
        "generated_at": datetime.now(),  # local-naive, same clock as ETAs (see eta.py)
        "active_route_count": len(out),
        "at_risk_count": at_risk_count,
        "routes": out,
    }
