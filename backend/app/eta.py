"""Phase 3 — ETA and cutoff computation.

Semantics (spec §4, finalized):
- Carrier cutoff: driver must arrive BEFORE it (per delivery stop).
- Clinic cutoff: driver must visit AFTER it (per pickup stop).
- State cutoff: whole-route deadline; the formal Major violation is written on
  route close (see routers/routes.py); the live map shows a projected at-risk
  warning instead (UI only).

ETA model: straight-line distance (haversine) x road factor / historical
average speed, plus a historical dwell time at each stop. Historical values
are learned from completed stops on closed routes; sensible defaults are used
until history exists.

Clock convention: naive LOCAL time throughout (datetime.now()), matching
scheduled times, cutoffs, and the UI's audited_at stamps — Phase 5 made this
the app-wide rule so daily reports and cutoff comparisons land on the right
day.
"""
import math
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from . import models

DEFAULT_AVG_SPEED_KMH = 55.0
DEFAULT_DWELL_MIN = 10.0
ROAD_FACTOR = 1.3  # straight-line → road distance multiplier
SPEED_CLAMP = (20.0, 110.0)
TRAVEL_CLAMP_MIN = 2  # minutes, filter absurd pairs
TRAVEL_CLAMP_MAX = 360
DWELL_CLAMP = (1, 120)
MIN_SEGMENT_KM = 0.5


def haversine_km(lat1, lng1, lat2, lng2) -> float | None:
    if None in (lat1, lng1, lat2, lng2):
        return None
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lam / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _stop_coords(db: Session, stop: models.Stop) -> tuple[float | None, float | None]:
    if stop.clinic_id:
        clinic = db.get(models.Clinic, stop.clinic_id)
        return (clinic.lat, clinic.lng) if clinic else (None, None)
    if stop.carrier_id:
        carrier = db.get(models.Carrier, stop.carrier_id)
        return (carrier.lat, carrier.lng) if carrier else (None, None)
    return (None, None)


def historical_speed_dwell(db: Session) -> tuple[float, float]:
    """Average road speed (km/h) and dwell (minutes) from closed routes."""
    speeds: list[float] = []
    dwells: list[float] = []
    routes = db.query(models.Route).filter(models.Route.status == models.ROUTE_CLOSED).all()
    for route in routes:
        stops = [
            s
            for s in sorted(route.stops, key=lambda s: s.sequence)
            if s.status == models.STOP_COMPLETED and s.arrival_time and s.departure_time
        ]
        for prev, nxt in zip(stops, stops[1:]):
            travel_min = (nxt.arrival_time - prev.departure_time).total_seconds() / 60.0
            if not (TRAVEL_CLAMP_MIN <= travel_min <= TRAVEL_CLAMP_MAX):
                continue
            p1 = _stop_coords(db, prev)
            p2 = _stop_coords(db, nxt)
            distance = haversine_km(p1[0], p1[1], p2[0], p2[1])
            if distance is None or distance < MIN_SEGMENT_KM:
                continue
            speeds.append(distance / (travel_min / 60.0))
        for s in stops:
            dwell = (s.departure_time - s.arrival_time).total_seconds() / 60.0
            if DWELL_CLAMP[0] <= dwell <= DWELL_CLAMP[1]:
                dwells.append(dwell)

    speed = (sum(speeds) / len(speeds)) if speeds else DEFAULT_AVG_SPEED_KMH
    speed = min(max(speed, SPEED_CLAMP[0]), SPEED_CLAMP[1])
    dwell = (sum(dwells) / len(dwells)) if dwells else DEFAULT_DWELL_MIN
    return speed, dwell


def cutoff_times(db: Session, stop: models.Stop) -> tuple[datetime | None, datetime | None]:
    """(clinic_cutoff, carrier_cutoff) datetimes for the stop's route date."""
    route = stop.route
    route_date = route.route_date if route else None
    clinic_cutoff = carrier_cutoff = None
    if route_date and stop.clinic_id:
        clinic = db.get(models.Clinic, stop.clinic_id)
        if clinic and clinic.cutoff_time:
            clinic_cutoff = datetime.combine(route_date, clinic.cutoff_time)
    if route_date and stop.carrier_id:
        carrier = db.get(models.Carrier, stop.carrier_id)
        if carrier and carrier.cutoff_time:
            carrier_cutoff = datetime.combine(route_date, carrier.cutoff_time)
    return clinic_cutoff, carrier_cutoff


def cutoff_status(
    stop: models.Stop,
    clinic_cutoff: datetime | None,
    carrier_cutoff: datetime | None,
    projected_arrival: datetime | None,
) -> str:
    """Per-stop cutoff status: ok | at_risk | breached | na."""
    if stop.status == models.STOP_SKIPPED:
        return "na"
    cutoff = None
    arrive_before = True
    if stop.stop_type == models.STOP_PICKUP and stop.location_type == models.LOC_CLINIC:
        cutoff, arrive_before = clinic_cutoff, False  # must arrive after
    elif stop.stop_type == models.STOP_DELIVERY and stop.location_type == models.LOC_CARRIER:
        cutoff, arrive_before = carrier_cutoff, True  # must arrive before
    if cutoff is None:
        return "na"
    if stop.arrival_time:
        breached = stop.arrival_time > cutoff if arrive_before else stop.arrival_time < cutoff
        return "breached" if breached else "ok"
    if projected_arrival is not None:
        at_risk = projected_arrival > cutoff if arrive_before else projected_arrival < cutoff
        return "at_risk" if at_risk else "ok"
    return "na"


def build_route_projection(db: Session, route: models.Route) -> dict:
    """Per-stop meta + route-level cutoff/ETA info for a route.

    Returns:
        stops: {stop_id: {lat, lng, clinic_cutoff, carrier_cutoff,
                          cutoff_status, projected_arrival}}
        state_cutoff: datetime | None
        projected_final_eta: datetime | None
        projected_state_cutoff_risk: bool
        next_stop_id: int | None
    """
    stops = sorted(route.stops, key=lambda s: s.sequence)
    speed, dwell = historical_speed_dwell(db)

    driver = route.driver
    cur_lat = driver.current_lat if driver else None
    cur_lng = driver.current_lng if driver else None
    cursor_time = datetime.now()
    last_completed = next(
        (
            s
            for s in reversed(stops)
            if s.status == models.STOP_COMPLETED and s.arrival_time
        ),
        None,
    )
    if cur_lat is None and last_completed is not None:
        cur_lat, cur_lng = _stop_coords(db, last_completed)
        cursor_time = last_completed.departure_time or last_completed.arrival_time

    state = route.state
    state_cutoff = None
    if state and state.cutoff_time:
        state_cutoff = datetime.combine(route.route_date, state.cutoff_time)

    meta: dict[int, dict] = {}
    projected_final: datetime | None = None
    next_stop_id: int | None = None

    for stop in stops:
        lat, lng = _stop_coords(db, stop)
        clinic_cutoff, carrier_cutoff = cutoff_times(db, stop)

        projected: datetime | None = None
        if stop.status in (models.STOP_PENDING, models.STOP_ARRIVED):
            if cur_lat is not None and cur_lng is not None and lat is not None and lng is not None:
                distance = haversine_km(cur_lat, cur_lng, lat, lng)
                drive_min = ((distance * ROAD_FACTOR) / speed) * 60.0
                projected = cursor_time + timedelta(minutes=drive_min)
                cursor_time = projected + timedelta(minutes=dwell)
                cur_lat, cur_lng = lat, lng
                if next_stop_id is None:
                    next_stop_id = stop.id
                projected_final = projected

        meta[stop.id] = {
            "lat": lat,
            "lng": lng,
            "clinic_cutoff": clinic_cutoff,
            "carrier_cutoff": carrier_cutoff,
            "cutoff_status": cutoff_status(stop, clinic_cutoff, carrier_cutoff, projected),
            "projected_arrival": projected,
        }

    risk = bool(projected_final and state_cutoff and projected_final > state_cutoff)
    return {
        "stops": meta,
        "state_cutoff": state_cutoff,
        "projected_final_eta": projected_final,
        "projected_state_cutoff_risk": risk,
        "next_stop_id": next_stop_id,
    }
