"""Idempotent demo seed data.

Runs once on first boot (when the `drivers` table is empty) so a fresh
database is immediately populated with demo data — today's pickup sheets
across VA / MD / NC with audited records, SOP checklist statuses, charges
and violations — ready for testing the Excel export and dashboards.

To start with a clean sheet instead (no data until you enter your own), set
AGL_SEED_DEMO=0 / false / no (recommended for production). The US state
reference list is always ensured regardless — the pickup sheet's Driver
state dropdown needs it. Delete backend/agl.db to reseed from scratch.

Coordinates are approximate real-world locations around Richmond, VA for
demonstration purposes.
"""
import os
from datetime import date, datetime, time, timedelta

from .database import SessionLocal
from .models import (
    AUDIT_PASSED,
    AUDIT_FAILED,
    CARRIER_AIRPORT,
    CARRIER_FEDEX,
    CARRIER_LAB,
    CARRIER_UPS,
    Carrier,
    ChargeRecord,
    CHK_FAIL,
    CHK_NA,
    CHK_PASS,
    ChecklistItem,
    Clinic,
    DailyReport,
    Dispatcher,
    Driver,
    Route,
    SEV_CRITICAL,
    SEV_MAJOR,
    SEV_MINOR,
    SRC_DISPATCH,
    SRC_DRIVER,
    State,
    Stop,
    ROUTE_ACTIVE,
    ROUTE_CLOSED,
    STOP_ARRIVED,
    STOP_COMPLETED,
    STOP_DELIVERY,
    STOP_PENDING,
    STOP_PICKUP,
    Violation,
)
from .reporting import compute_report
from .routers.checklist import CHECKLIST_ITEMS, PICKUP_PHOTO_ITEMS

US_STATES: list[tuple[str, str]] = [
    ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"),
    ("CA", "California"), ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"),
    ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"), ("HI", "Hawaii"),
    ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"),
    ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"),
    ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"),
    ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"),
    ("NV", "Nevada"), ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"),
    ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"),
    ("OK", "Oklahoma"), ("OR", "Oregon"), ("PA", "Pennsylvania"), ("RI", "Rhode Island"),
    ("SC", "South Carolina"), ("SD", "South Dakota"), ("TN", "Tennessee"), ("TX", "Texas"),
    ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"), ("WA", "Washington"),
    ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming"),
]

# State cutoffs (times by which the whole route must finish) — demo values.
STATE_CUTOFFS: dict[str, str] = {
    "VA": "18:00", "MD": "17:30", "DC": "17:00", "NC": "18:30",
    "WV": "17:30", "TN": "18:00",
}


def _seed() -> None:
    db = SessionLocal()
    try:
        _seed_states(db)
        _seed_carriers(db)
        _seed_drivers(db)
        _seed_dispatchers(db)
        _seed_clinics(db)
        db.flush()          # <-- add this line: pushes staged inserts to DB
                             #     so the queries in _seed_routes() can see them
        _seed_routes(db)
        _seed_state_sheet_demo(db)
        db.commit()
    finally:
        db.close()


def _seed_states(db) -> None:
    """Ensure the US state reference rows exist (idempotent — only adds the
    missing codes and never overwrites existing rows or their cutoff times)."""
    existing = {row[0] for row in db.query(State.code).all()}
    for code, name in US_STATES:
        if code in existing:
            continue
        cutoff = None
        if code in STATE_CUTOFFS:
            cutoff = time.fromisoformat(STATE_CUTOFFS[code])
        db.add(State(code=code, name=name, cutoff_time=cutoff))


def _seed_carriers(db) -> None:
    carriers = [
        Carrier(
            type=CARRIER_FEDEX,
            name="FedEx Ground Drop",
            location="6601 Midlothian Turnpike, Richmond, VA 23225",
            lat=37.5010, lng=-77.5310, cutoff_time=time(17, 30),
        ),
        Carrier(
            type=CARRIER_UPS,
            name="UPS Customer Center",
            location="7001 Old Osborne Turnpike, Richmond, VA 23231",
            lat=37.4740, lng=-77.3930, cutoff_time=time(17, 0),
        ),
        Carrier(
            type=CARRIER_AIRPORT,
            name="Richmond Intl Airport Cargo (RIC)",
            location="1 Richard E. Byrd Terminal Drive, Sandston, VA 23150",
            lat=37.5087, lng=-77.3237, cutoff_time=time(18, 0),
        ),
        Carrier(
            type=CARRIER_LAB,
            name="LabCorp Richmond",
            location="2400 Grenoble Court, Glen Allen, VA 23060",
            lat=37.6995, lng=-77.4383, cutoff_time=time(17, 0),
        ),
    ]
    db.add_all(carriers)


def _seed_drivers(db) -> None:
    db.add_all(
        [
            Driver(
                name="Michael Hartman", phone="(804) 555-0142", vehicle="Ford Transit Van",
                # Phase 3 demo: manually-entered live location, between stops 2-3.
                current_lat=37.6040, current_lng=-77.3560,
                location_updated_at=datetime.now(),
            ),
            Driver(name="Sarah Okafor", phone="(804) 555-0187", vehicle="Ford Transit Van"),
            Driver(
                name="Dan Reyes", phone="(804) 555-0199", vehicle="Ram ProMaster",
                # Phase 3 demo: far from the route → projected State Cutoff risk.
                current_lat=36.5950, current_lng=-82.1880,
                location_updated_at=datetime.now(),
            ),
            Driver(name="Carlos Mendez", phone="(804) 555-0155", vehicle="Ford Transit Van"),
        ]
    )


def _seed_dispatchers(db) -> None:
    db.add_all(
        [
            Dispatcher(name="Linda Pierce"),
            Dispatcher(name="Greg Novak"),
        ]
    )


def _seed_clinics(db) -> None:
    clinics = [
        Clinic(
            name="Lakeside Family Medicine",
            contact_person="Dr. A. Reyes",
            contact_phone="(804) 555-0101",
            address="5001 Lakeside Avenue",
            city="Richmond", state="VA", zip="23228",
            lat=37.6136, lng=-77.4477,
            cutoff_time=time(7, 30),
            notes="Lockbox on rear wall. Code 4491.",
        ),
        Clinic(
            name="St. Mary's Women's Health",
            contact_person="T. Whitfield",
            contact_phone="(804) 555-0102",
            address="5801 Bremo Road",
            city="Richmond", state="VA", zip="23226",
            lat=37.5756, lng=-77.5078,
            cutoff_time=time(7, 45),
            notes="Reception pickup only.",
        ),
        Clinic(
            name="Mechanicsville Urgent Care",
            contact_person="Front desk",
            contact_phone="(804) 555-0103",
            address="7350 Mechanicsville Turnpike",
            city="Mechanicsville", state="VA", zip="23111",
            lat=37.6053, lng=-77.3304,
            cutoff_time=time(7, 30),
        ),
        Clinic(
            name="Chester Pediatrics",
            contact_person="Nurse J. Alvarez",
            contact_phone="(804) 555-0104",
            address="1000 Mall Drive",
            city="Chester", state="VA", zip="23836",
            lat=37.3536, lng=-77.4414,
            cutoff_time=time(7, 45),
        ),
        Clinic(
            name="Henrico Oncology Center",
            contact_person="Lab manager",
            contact_phone="(804) 555-0105",
            address="1602 Skipwith Road",
            city="Henrico", state="VA", zip="23229",
            lat=37.5969, lng=-77.5517,
            cutoff_time=time(7, 15),
            notes="Cold-chain specimens — hand to lab staff.",
        ),
        Clinic(
            name="VCU Health Endocrinology",
            contact_person="Dr. P. Ngo",
            contact_phone="(804) 555-0106",
            address="9000 Stony Point Parkway",
            city="Richmond", state="VA", zip="23235",
            lat=37.5423, lng=-77.5789,
            cutoff_time=time(7, 30),
        ),
        Clinic(
            name="Midlothian Dermatology",
            contact_person="S. Chen",
            contact_phone="(804) 555-0107",
            address="2111 Smith Lane",
            city="Midlothian", state="VA", zip="23113",
            lat=37.5029, lng=-77.6460,
            cutoff_time=time(7, 45),
        ),
        Clinic(
            name="Short Pump Internal Medicine",
            contact_person="Front desk",
            contact_phone="(804) 555-0108",
            address="11600 West Broad Street",
            city="Short Pump", state="VA", zip="23233",
            lat=37.6540, lng=-77.5603,
            cutoff_time=time(7, 30),
            notes="Parking in rear lot. Ring bell for pickup.",
        ),
        # Extra clinics in other states — the pickup-sheet Excel export groups
        # routes by state, so these make the multi-state demo visible.
        Clinic(
            name="Rockville Family Practice",
            contact_person="Front desk",
            contact_phone="(301) 555-0150",
            address="1401 Rockville Pike",
            city="Rockville", state="MD", zip="20852",
            lat=39.0840, lng=-77.1528,
            cutoff_time=time(7, 30),
            notes="Lockbox at rear entrance.",
        ),
        Clinic(
            name="Bethesda Cardiology",
            contact_person="Lab manager",
            contact_phone="(301) 555-0161",
            address="8600 Old Georgetown Road",
            city="Bethesda", state="MD", zip="20814",
            lat=38.9922, lng=-77.0980,
            cutoff_time=time(7, 45),
        ),
        Clinic(
            name="Durham Women's Health",
            contact_person="Nurse R. Patel",
            contact_phone="(919) 555-0160",
            address="2600 Erwin Road",
            city="Durham", state="NC", zip="27705",
            lat=35.9999, lng=-78.9220,
            cutoff_time=time(7, 45),
            notes="Reception pickup — ring bell.",
        ),
    ]
    db.add_all(clinics)


def _seed_routes(db) -> None:
    drivers = db.query(Driver).order_by(Driver.id).all()
    dispatchers = db.query(Dispatcher).order_by(Dispatcher.id).all()
    clinics = db.query(Clinic).order_by(Clinic.id).all()
    carriers = db.query(Carrier).order_by(Carrier.id).all()
    va = db.query(State).filter(State.code == "VA").first()

    # Route 1 — active route for today (driver Hartman).
    today = date.today()
    route1 = Route(
        driver_id=drivers[0].id,
        state_id=va.id,
        route_date=today,
        status=ROUTE_ACTIVE,
        notes="Demo route — morning clinic pickups to FedEx + LabCorp.",
    )
    db.add(route1)
    db.flush()  # get route1.id

    def dt(hour: int, minute: int = 0, day_offset: int = 0) -> datetime:
        return datetime.combine(today + timedelta(days=day_offset), time(hour, minute))

    db.add_all(
        [
            Stop(
                route_id=route1.id, sequence=1, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[0].id,
                scheduled_start=dt(8, 0), scheduled_end=dt(8, 15),
                arrival_time=dt(8, 2), departure_time=dt(8, 14),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[0].id,
                package_count_portal=3, package_count_bag=3, package_count_photo=3,
            ),
            Stop(
                route_id=route1.id, sequence=2, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[2].id,
                scheduled_start=dt(8, 25), scheduled_end=dt(8, 40),
                arrival_time=dt(8, 31), departure_time=dt(8, 43),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[0].id,
                package_count_portal=2, package_count_bag=2, package_count_photo=2,
                driver_notes="Heavy traffic on 360.",
            ),
            Stop(
                route_id=route1.id, sequence=3, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[4].id,
                scheduled_start=dt(8, 50), scheduled_end=dt(9, 5),
                arrival_time=dt(8, 58),
                status=STOP_ARRIVED, dispatcher_id=dispatchers[0].id,
                package_count_portal=5,
            ),
            Stop(
                route_id=route1.id, sequence=4, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[1].id,
                scheduled_start=dt(9, 20), scheduled_end=dt(9, 35),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
                package_count_portal=1,
            ),
            Stop(
                route_id=route1.id, sequence=5, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[0].id,
                scheduled_start=dt(10, 15), scheduled_end=dt(10, 30),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
            ),
            Stop(
                route_id=route1.id, sequence=6, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[3].id,
                scheduled_start=dt(11, 0), scheduled_end=dt(11, 15),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
            ),
        ]
    )

    # Route 2 — closed route from yesterday (driver Okafor), closed late:
    # a demo of the state-cutoff breach flag (Phase 3 will auto-set this).
    yesterday = today - timedelta(days=1)
    route2 = Route(
        driver_id=drivers[1].id,
        state_id=va.id,
        route_date=yesterday,
        status=ROUTE_CLOSED,
        closed_at=datetime.combine(yesterday, time(18, 40)),
        state_cutoff_breached=True,
        notes="Closed 40 min past VA cutoff — breach flagged for review.",
    )
    db.add(route2)
    db.flush()

    db.add_all(
        [
            Stop(
                route_id=route2.id, sequence=1, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[3].id,
                scheduled_start=datetime.combine(yesterday, time(8, 0)),
                scheduled_end=datetime.combine(yesterday, time(8, 15)),
                arrival_time=datetime.combine(yesterday, time(8, 5)),
                departure_time=datetime.combine(yesterday, time(8, 20)),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[1].id,
                package_count_portal=1, package_count_bag=1, package_count_photo=1,
                audit_status=AUDIT_PASSED, auditor_name="M. Carter",
                audited_at=datetime.combine(yesterday, time(13, 0)),
            ),
            Stop(
                route_id=route2.id, sequence=2, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[5].id,
                scheduled_start=datetime.combine(yesterday, time(8, 35)),
                scheduled_end=datetime.combine(yesterday, time(8, 55)),
                arrival_time=datetime.combine(yesterday, time(8, 40)),
                departure_time=datetime.combine(yesterday, time(8, 52)),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[1].id,
                package_count_portal=4, package_count_bag=4, package_count_photo=4,
                audit_status=AUDIT_PASSED, auditor_name="M. Carter",
                audited_at=datetime.combine(yesterday, time(13, 10)),
            ),
            Stop(
                route_id=route2.id, sequence=3, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[7].id,
                scheduled_start=datetime.combine(yesterday, time(9, 10)),
                scheduled_end=datetime.combine(yesterday, time(9, 25)),
                arrival_time=datetime.combine(yesterday, time(9, 15)),
                departure_time=datetime.combine(yesterday, time(9, 30)),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[1].id,
                package_count_portal=2, package_count_bag=2, package_count_photo=1,
                driver_notes="Clinic busy; one bag not scanned at counter.",
                dispatch_notes="Count mismatch — photo requested from driver.",
                audit_status=AUDIT_FAILED, auditor_name="M. Carter",
                audited_at=datetime.combine(yesterday, time(13, 25)),
            ),
            Stop(
                route_id=route2.id, sequence=4, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[3].id,
                scheduled_start=datetime.combine(yesterday, time(10, 0)),
                scheduled_end=datetime.combine(yesterday, time(10, 20)),
                arrival_time=datetime.combine(yesterday, time(10, 5)),
                departure_time=datetime.combine(yesterday, time(10, 18)),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[1].id,
                audit_status=AUDIT_PASSED, auditor_name="M. Carter",
                audited_at=datetime.combine(yesterday, time(13, 40)),
            ),
            Stop(
                route_id=route2.id, sequence=5, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[0].id,
                scheduled_start=datetime.combine(yesterday, time(11, 5)),
                scheduled_end=datetime.combine(yesterday, time(11, 20)),
                arrival_time=datetime.combine(yesterday, time(11, 12)),
                departure_time=datetime.combine(yesterday, time(11, 20)),
                status=STOP_COMPLETED, dispatcher_id=dispatchers[1].id,
                audit_status=AUDIT_PASSED, auditor_name="M. Carter",
                audited_at=datetime.combine(yesterday, time(13, 50)),
            ),
        ]
    )

    # Route 3 — planned route (driver Reyes) positioned to demo the live
    # projected State Cutoff at-risk warning on the dispatch map.
    route3 = Route(
        driver_id=drivers[2].id,
        state_id=va.id,
        route_date=today,
        status="planned",
        notes="Demo route — starts from the far west of the state (at-risk demo).",
    )
    db.add(route3)
    db.flush()
    db.add_all(
        [
            Stop(
                route_id=route3.id, sequence=1, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[5].id,
                scheduled_start=dt(14, 0), scheduled_end=dt(14, 15),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
                package_count_portal=3,
            ),
            Stop(
                route_id=route3.id, sequence=2, stop_type=STOP_PICKUP,
                location_type="clinic", clinic_id=clinics[6].id,
                scheduled_start=dt(14, 35), scheduled_end=dt(14, 50),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
                package_count_portal=2,
            ),
            Stop(
                route_id=route3.id, sequence=3, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[1].id,
                scheduled_start=dt(15, 30), scheduled_end=dt(15, 45),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
            ),
            Stop(
                route_id=route3.id, sequence=4, stop_type=STOP_DELIVERY,
                location_type="carrier", carrier_id=carriers[0].id,
                scheduled_start=dt(16, 0), scheduled_end=dt(16, 15),
                status=STOP_PENDING, dispatcher_id=dispatchers[0].id,
            ),
        ]
    )

    # Demo SOP violations on the count-mismatch stop (route 2, stop 3).
    # (Sessions use autoflush=False, so flush the pending stops first so the
    # query below can see them.)
    db.flush()
    mismatch_stop = (
        db.query(Stop)
        .filter(Stop.route_id == route2.id, Stop.sequence == 3)
        .first()
    )
    db.add_all(
        [
            Violation(
                stop_id=mismatch_stop.id,
                severity=SEV_MAJOR,
                category="Package count mismatch",
                description="Portal (2) vs clinic bag (2) vs photo (1) counts do not reconcile.",
                source=SRC_DRIVER,
                created_at=datetime.combine(yesterday, time(13, 30)),
            ),
            Violation(
                stop_id=mismatch_stop.id,
                severity=SEV_MINOR,
                category="Dispatch review incomplete",
                description="Job approved before the missing bag photo was requested.",
                source=SRC_DISPATCH,
                escalated_at=datetime.combine(yesterday, time(14, 0)),
                created_at=datetime.combine(yesterday, time(13, 35)),
            ),
            Violation(
                route_id=route2.id,
                severity=SEV_MAJOR,
                category="State cutoff breach",
                description=(
                    f"Route #{route2.id} closed at 18:40, past the VA state cutoff "
                    "of 18:00."
                ),
                source=SRC_DRIVER,
                created_at=datetime.combine(yesterday, time(18, 45)),
            ),
        ]
    )

    # Demo daily report for yesterday (§3.4): metrics are derived from the
    # seeded audits + violations above. Re-running /api/reports/generate later
    # just recomputes and refreshes the snapshot.
    db.flush()
    metrics = compute_report(db, yesterday)
    db.add(
        DailyReport(
            report_date=yesterday,
            auditor_name="M. Carter",
            recommendations=(
                "Follow up on the route 2 bag-count mismatch — driver photo "
                "resubmission requested before EOS. Review dispatch planning "
                "after the state cutoff breach on route 2."
            ),
            **metrics,
        )
    )

    # Demo charge records for route 2's completed stops (Phase 4).
    route2_stops = (
        db.query(Stop).filter(Stop.route_id == route2.id).order_by(Stop.sequence).all()
    )
    demo_charges = [
        (7.50, 16.00, None),
        (7.50, 16.00, None),
        (7.50, 22.00, "Billed higher on disputed count — variance flagged for review."),
        (9.00, 18.50, None),
        (9.00, 18.50, None),
    ]
    for stop, (pay, billed, note) in zip(route2_stops, demo_charges):
        db.add(
            ChargeRecord(stop_id=stop.id, driver_pay=pay, client_billed=billed, notes=note)
        )

    # Phase 6 demo: extra violations spread across the current month so the
    # trends dashboard shows recurring patterns + training-opportunity flags
    # (Hartman: lockbox photo x2, Pierce: approved-incomplete x2, Reyes:
    # critical proof-of-delivery). days_ago offsets fall in the current month
    # when today is mid-month or later; earlier offsets roll into the previous
    # month, which is harmless for demo purposes.
    db.flush()
    stops_by_seq = {
        (s.route_id, s.sequence): s for s in db.query(Stop).all()
    }
    stop_a = stops_by_seq[(route1.id, 1)]  # Lakeside pickup (Hartman)
    stop_b = stops_by_seq[(route1.id, 2)]  # Mechanicsville pickup (Hartman)
    stop_c = stops_by_seq[(route3.id, 3)]  # UPS delivery drop (Reyes)
    noon = datetime.combine(today, time(12, 0))
    extra_violations = [
        # (days_ago, stop, severity, category, description, source)
        (3, stop_a, SEV_MAJOR, "Missing lockbox photo",
         "Lockbox photo not attached to job.", SRC_DRIVER),
        (5, stop_b, SEV_MAJOR, "Missing lockbox photo",
         "Lockbox photo not attached to job.", SRC_DRIVER),
        (6, stop_a, SEV_MINOR, "Blurry photo",
         "Shipping label photo out of focus.", SRC_DRIVER),
        (4, stop_c, SEV_CRITICAL, "Missing proof of delivery",
         "No delivery confirmation photo on file.", SRC_DRIVER),
        (2, stop_b, SEV_MINOR, "Approved incomplete job",
         "Job approved before photo resubmission.", SRC_DISPATCH),
        (7, stop_a, SEV_MINOR, "Approved incomplete job",
         "Job approved with pending photo request.", SRC_DISPATCH),
    ]
    db.add_all(
        [
            Violation(
                stop_id=stop.id,
                severity=sev,
                category=cat,
                description=desc,
                source=src,
                created_at=noon - timedelta(days=days_ago),
            )
            for days_ago, stop, sev, cat, desc, src in extra_violations
        ]
    )


def _seed_checklist(db, stop, pass_all: bool = False, fail_names: tuple = ()) -> None:
    """Seed a stop's SOP checklist rows directly (so the Excel export shows
    Pass/Fail/N/A without the audit page being opened first). Passed stops get
    every item Pass; flagged stops fail the named items and leave the rest N/A.
    """
    template = CHECKLIST_ITEMS + (
        PICKUP_PHOTO_ITEMS if stop.stop_type == STOP_PICKUP else []
    )
    fails = set(fail_names)
    for name in template:
        status = CHK_FAIL if name in fails else (CHK_PASS if pass_all else CHK_NA)
        db.add(ChecklistItem(stop_id=stop.id, item_name=name, status=status))


def _seed_state_sheet_demo(db) -> None:
    """Demo data for the state-grouped pickup-sheet Excel export and the
    per-day duplicate search.

    Today only: routes in VA / MD / NC so the export shows multiple state
    headings, with the audit color key visible (green = passed,
    orange = minor flag, red = major/critical flag), seeded SOP checklist
    statuses and charge records. Nothing is seeded for other dates — the next
    day starts with a fresh empty sheet (per-day isolation).
    """
    today = date.today()

    def dt(day: date, hour: int, minute: int = 0) -> datetime:
        return datetime.combine(day, time(hour, minute))

    okafor = db.query(Driver).filter(Driver.name == "Sarah Okafor").first()
    mendez = db.query(Driver).filter(Driver.name == "Carlos Mendez").first()
    rockville = db.query(Clinic).filter(Clinic.name == "Rockville Family Practice").first()
    bethesda = db.query(Clinic).filter(Clinic.name == "Bethesda Cardiology").first()
    durham = db.query(Clinic).filter(Clinic.name == "Durham Women's Health").first()
    fedex = db.query(Carrier).filter(Carrier.type == CARRIER_FEDEX).first()
    labcorp = db.query(Carrier).filter(Carrier.name == "LabCorp Richmond").first()
    md = db.query(State).filter(State.code == "MD").first()
    nc = db.query(State).filter(State.code == "NC").first()

    # ---- Today (MD): Okafor — green + orange rows ---------------------------
    md_route = Route(
        driver_id=okafor.id, state_id=md.id, route_date=today,
        status=ROUTE_ACTIVE,
        notes="MD demo route — shows green (passed) and orange (minor flag) rows in the export.",
    )
    db.add(md_route)
    db.flush()
    md1 = Stop(
        route_id=md_route.id, sequence=1, stop_type=STOP_PICKUP,
        location_type="clinic", clinic_id=rockville.id, clinic_ref=str(rockville.id),
        fedex_cutoff=time(15, 30), pickup_location="Rear lockbox",
        scheduled_start=dt(today, 9, 0), scheduled_end=dt(today, 9, 15),
        arrival_time=dt(today, 9, 4), departure_time=dt(today, 9, 12),
        status=STOP_COMPLETED, package_count_portal=2, package_count_bag=2, package_count_photo=2,
        audit_status=AUDIT_PASSED, audited_at=dt(today, 12, 0), auditor_name="M. Carter",
    )
    md2 = Stop(
        route_id=md_route.id, sequence=2, stop_type=STOP_PICKUP,
        location_type="clinic", clinic_id=bethesda.id, clinic_ref=str(bethesda.id),
        fedex_cutoff=time(15, 30), pickup_location="Reception desk",
        scheduled_start=dt(today, 9, 30), scheduled_end=dt(today, 9, 45),
        arrival_time=dt(today, 9, 33), departure_time=dt(today, 9, 46),
        status=STOP_COMPLETED, package_count_portal=1, package_count_bag=1, package_count_photo=1,
        audit_status=AUDIT_FAILED, audited_at=dt(today, 12, 15), auditor_name="M. Carter",
    )
    md3 = Stop(
        route_id=md_route.id, sequence=3, stop_type=STOP_DELIVERY,
        location_type="carrier", carrier_id=fedex.id,
        scheduled_start=dt(today, 11, 0), scheduled_end=dt(today, 11, 15),
        status=STOP_PENDING,
    )
    db.add_all([md1, md2, md3])
    db.flush()

    # ---- Today (NC): Mendez — red row ----------------------------------------
    nc_route = Route(
        driver_id=mendez.id, state_id=nc.id, route_date=today,
        status=ROUTE_ACTIVE,
        notes="NC demo route — shows a red (major flag) row in the export.",
    )
    db.add(nc_route)
    db.flush()
    nc1 = Stop(
        route_id=nc_route.id, sequence=1, stop_type=STOP_PICKUP,
        location_type="clinic", clinic_id=durham.id, clinic_ref=str(durham.id),
        fedex_cutoff=time(16, 0), pickup_location="Front counter",
        scheduled_start=dt(today, 10, 0), scheduled_end=dt(today, 10, 15),
        arrival_time=dt(today, 10, 8), departure_time=dt(today, 10, 20),
        status=STOP_COMPLETED, package_count_portal=3, package_count_bag=3, package_count_photo=2,
        audit_status=AUDIT_FAILED, audited_at=dt(today, 12, 30), auditor_name="M. Carter",
    )
    nc2 = Stop(
        route_id=nc_route.id, sequence=2, stop_type=STOP_DELIVERY,
        location_type="carrier", carrier_id=labcorp.id,
        scheduled_start=dt(today, 11, 45), scheduled_end=dt(today, 12, 0),
        status=STOP_PENDING,
    )
    db.add_all([nc1, nc2])
    db.flush()

    # ---- Complete the VA demo rows so the export shows fares + SOPs there ---
    # (route 1 stops already carry trend violations → they render as red rows;
    # route 3 stop 1 is clean → audit-passed renders as a green row.)
    hartman = db.query(Driver).filter(Driver.name == "Michael Hartman").first()
    reyes = db.query(Driver).filter(Driver.name == "Dan Reyes").first()
    route1 = (
        db.query(Route)
        .filter(Route.driver_id == hartman.id, Route.route_date == today)
        .first()
    )
    route3 = (
        db.query(Route)
        .filter(Route.driver_id == reyes.id, Route.route_date == today)
        .first()
    )
    if route1:
        r1 = {s.sequence: s for s in route1.stops}
        s1 = r1.get(1)  # Lakeside
        s2 = r1.get(2)  # Mechanicsville
        if s1:
            s1.audit_status = AUDIT_FAILED
            s1.audited_at = dt(today, 12, 40)
            s1.auditor_name = "M. Carter"
            db.add(
                ChargeRecord(stop_id=s1.id, driver_pay=7.50, client_billed=16.00, notes="Seeded sheet demo.")
            )
            _seed_checklist(
                db, s1, fail_names=("Lockbox Photo", "Inside Lockbox Photo", "Specimen Count Photo")
            )
        if s2:
            s2.audit_status = AUDIT_FAILED
            s2.audited_at = dt(today, 12, 50)
            s2.auditor_name = "M. Carter"
            db.add(
                ChargeRecord(stop_id=s2.id, driver_pay=7.50, client_billed=16.00, notes="Seeded sheet demo.")
            )
            _seed_checklist(db, s2, fail_names=("Lockbox Photo", "Inside Lockbox Photo"))
    if route3:
        r3s1 = {s.sequence: s for s in route3.stops}.get(1)  # VCU Endocrinology
        if r3s1:
            r3s1.audit_status = AUDIT_PASSED
            r3s1.audited_at = dt(today, 13, 0)
            r3s1.auditor_name = "M. Carter"
            db.add(
                ChargeRecord(stop_id=r3s1.id, driver_pay=7.50, client_billed=16.00, notes="Seeded sheet demo.")
            )
            _seed_checklist(db, r3s1, pass_all=True)

    # ---- Audits / SOPs / violations / charges --------------------------------
    _seed_checklist(db, md1, pass_all=True)
    _seed_checklist(db, md2, fail_names=("Lockbox Photo", "Inside Lockbox Photo"))
    _seed_checklist(db, nc1, fail_names=("Package Count Verified", "Specimen Count Photo"))
    db.add_all(
        [
            ChargeRecord(stop_id=md1.id, driver_pay=7.50, client_billed=16.00, notes="Seeded sheet demo."),
            ChargeRecord(stop_id=md2.id, driver_pay=7.50, client_billed=22.00, notes="Seeded sheet demo."),
            ChargeRecord(stop_id=nc1.id, driver_pay=7.50, client_billed=22.00, notes="Seeded sheet demo."),
            Violation(
                stop_id=md2.id, severity=SEV_MINOR, category="Missing lockbox photo",
                description="Lockbox photo not attached to job.", source=SRC_DRIVER,
                created_at=dt(today, 12, 20),
            ),
            Violation(
                stop_id=nc1.id, severity=SEV_MAJOR, category="Package count mismatch",
                description="Portal (3) vs clinic bag (3) vs photo (2) counts do not reconcile.",
                source=SRC_DRIVER, created_at=dt(today, 12, 35),
            ),
        ]
    )


def seed_if_empty() -> None:
    """Seed a never-seeded database with the demo dataset by default; set
    AGL_SEED_DEMO=0/false/no to start with no demo records (e.g. production).

    The US state reference list is ALWAYS ensured, independent of the demo
    opt-in — the pickup sheet's Driver state dropdown and the state-cutoff
    features need it even on a clean production database.
    """
    db = SessionLocal()
    try:
        # Reference data first (idempotent, never overwrites existing rows).
        _seed_states(db)
        db.commit()
        # Demo dataset (default on; skipped when AGL_SEED_DEMO=0).
        if os.environ.get("AGL_SEED_DEMO", "").strip().lower() in ("0", "false", "no", "off"):
            return
        if db.query(Driver).first() is None:
            _seed()
    finally:
        db.close()
