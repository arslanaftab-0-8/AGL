# AGL Auditing & Software Guide

This guide covers two things: **how to run your daily audit work** (the 12-step QA workflow and the pickup-sheet flow) and **how to use the AGL Audit app** (every page, every action). The same content is available in the app under **Guide** (sidebar → Guide).

---

## 1. Your daily flow (the pickup sheet)

1. **Open the Pickup Sheet** — the **Pickup Sheet** is the first item in the sidebar (the main page). **Type the driver's name** (existing drivers appear as suggestions) and pick the **date**; the app finds or creates that driver's day automatically — no need to add the driver first, and no separate "create route" step.
2. **Add each stop with its fare** — On the sheet, add the stops in order — the **1st, 2nd, 3rd…** stop. For each one:
   - **Clinic** (type the clinic ID from your dispatch portal — no need to add it to the Clinics page first; known clinics appear as suggestions; a name isn't required)
   - **Pickup location** (e.g. "rear lockbox", "reception desk")
   - **Driver** (comes from the sheet)
   - **FedEx cutoff time**
   - **Fare** — entering this auto-creates the driver's pay record for that stop. Fares can be corrected any time — type in the fare cell on the sheet and click away to save.
3. **Mark it picked up / delivered** — After the pickup, hit **✓ Picked up** on the row (or **✓ Delivered** for delivery stops). One click stamps arrival/departure times.
4. **Audit the stop** — Click the stop's audit badge to open the **protocol checklist**. Work the checklist: mark every item **Pass / Fail / N/A**. A Fail raises a flag (violation) with a suggested severity. No photos are uploaded in the app — you review the evidence and mark the checklist.
5. **Complete the audit** — When every item is marked, hit **Complete — Pass** or **Complete — Fail**. Your name is stamped on the audit.
6. **Everything is on the sheet** — The Daily Audit Report (*Reports*, exportable to Excel), driver flags + income (*Driver Day*), pay vs. billing (*Financials*), and monthly trends (*Trends*) update automatically from your audits.

---

## 2. The 12-step audit workflow (QA training manual — digitized)

1. **Open the completed job** — verify Driver, Route #, Clinic, Pickup Time, Delivery Time, Status, Dispatcher. Missing info → flag for review.
2. **Verify pickup documentation**
   - *Lockbox:* lockbox photo, package-inside-lockbox (if applicable), empty-lockbox-after-pickup, proof slip (if applicable), building exterior.
   - *Reception:* reception area, package, proof slip (if required), clinic entrance.
3. **Verify package count** — reconcile Portal Count ↔ Clinic Bag Count ↔ Driver Photo count. Mismatch → flag immediately.
4. **Verify shipping labels** — fully visible, readable, undamaged, correct destination, barcode visible, tracking number readable. Reject if unreadable.
5. **Verify arrival times** — within the scheduled window, on time, no unusual delay (check driver notes if delayed).
6. **Verify delivery documentation** (by destination):
   - *FedEx:* shipment at counter/drop box, receipt (if available), shipment photo.
   - *UPS:* shipment at counter, receipt, shipment photo.
   - *Airport Cargo:* cargo counter, acceptance receipt, shipment photo.
   - *Laboratory:* receiving area, staff acceptance (if applicable), proof of delivery.
7. **Verify picture quality** — clear, focused, well-lit, readable, complete. Reject: blurry, dark, cropped, too close, too far, unreadable.
8. **Verify correct clinic** — building matches assigned clinic, name correct, address matches, correct location visited.
9. **Verify route sequence** — stops in proper order, no unexplained detours, no duplicates, no skipped clinics.
10. **Review driver notes** — e.g. "lockbox missing", "clinic closed", "staff unavailable". Photos must support the stated explanation.
11. **Verify dispatch review** — dispatcher verified the job, updated status, reviewed photos, added notes where required, followed SOP.
12. **Identify SOP violations** — assign severity (Critical / Major / Minor).

---

## 3. Severity levels

| Severity | Definition | Examples | Action |
|---|---|---|---|
| **Critical** | Immediate escalation required | No delivery proof, missing shipment, wrong package delivered, wrong clinic visited, package left unattended, missing pickup proof, missing delivery confirmation | Notify Dispatch Supervisor **immediately** |
| **Major** | Correction required before end of shift when possible | Missing building/lockbox photo, blurry images, incorrect timestamps, missing shipping label photo, unreadable barcode, **State Cutoff breach on a route** | Request correction before EOS |
| **Minor** | Documentation improvement | Missing notes, typos, minor formatting | Track in daily report |

### Escalation procedure
1. Record Route ID + Stop ID. 2. Record Driver Name. 3. Record Dispatcher Name. 4. Categorize the issue (Critical/Major/Minor). 5. Attach screenshots if needed. 6. Notify the Dispatch Supervisor immediately for Critical. 7. Request Major fixes before EOS. 8. Include it in the Daily Audit Report. 9. Track repeat issues by driver/dispatcher (Trends).

---

## 4. The per-stop checklist protocol

Mark every item **Pass / Fail / N/A** on the audit page. Failing an item opens a suggested violation (severity from the table above) that you can edit before saving. Use **N/A** for items that don't apply (e.g. "Inside Lockbox Photo" for a reception pickup).

**Standard items (§3.3):** Pickup Photo · Delivery Photo · Building Photo · Lockbox Photo · Proof Slip · Shipping Label Visible · Barcode Readable · Package Count Verified · Correct Clinic · Correct Destination · Timestamp Verified · Dispatch Verified · Driver Notes Reviewed · SOP Followed

**Pickup photo protocol (pickup stops only):** Inside Lockbox Photo · Outside Lockbox Photo · Front of Clinic Photo · Specimen Count Photo · Reception Area Photo · Package Photo · Clinic Entrance Photo

---

## 5. Cutoff times & the dispatch map

| Cutoff | Definition | Enforcement |
|---|---|---|
| **Carrier cutoff** (FedEx/UPS/Airport) | Latest time a package can reach the counter to make that day's outbound shipment/flight. Driver must arrive **before** this time. | Per stop |
| **Clinic cutoff** | The time the clinic finishes prepping specimens. Driver must visit **after** this time — arriving early risks an incomplete pickup. | Per stop |
| **State cutoff** | Deadline barrier the whole route must finish by. A breach = the entire route finished later than the state's cutoff. | Per route |

- A **State Cutoff breach** is confirmed only once the route is fully closed late, and is logged as a **Major** violation.
- While a route is live, the Dispatch Map shows a **projected at-risk warning** ("projected to miss FL cutoff") when the ETA to the final stop passes the state cutoff — a live UI warning only, not a logged violation.
- Driver location is entered **manually** (type it or select the current stop); the ETA recalculates automatically.

---

## 6. Every page, explained

| Page | What it's for |
|---|---|
| **Pickup Sheet** | The main page: pick a driver + date and their day opens (or is created) automatically. Add stops as the 1st, 2nd, 3rd… — clinic ID, pickup location, FedEx cutoff, and fare on each row — then mark them picked up and run the protocol checklist. Everything flows to the report. |
| **Dashboard** | Home screen: counts, open routes, audit queue, open violations (critical ones highlighted for immediate supervisor notification), state-cutoff breaches. |
| **Routes** | Create a route per driver per day (date + driver + state). Open a route to work its pickup sheet. |
| **Stops** | Every stop across all routes. Filter to completed stops for your audit queue, then open the audit page. |
| **Dispatch Map** | US map: active routes, manually-entered driver location, stop sequence line, ETA per stop, projected state-cutoff risk warnings. |
| **Financials** | Driver pay per stop vs. client billed, with variance. Edit billed amounts once you know the actual charge. |
| **Reports** | Daily Audit Report in the §3.4 format — generate for any date, export to Excel (.xlsx). |
| **Trends** | Monthly view of recurring issues by driver / clinic / dispatcher with training-opportunity flags (same category 2+ times in the month). |
| **Driver Day** | Pick a driver + date: every stop, flags raised, driver pay, client billed, variance, plus day totals (flags and total income). |
| **Clinics** | Client database: ID, address, cutoff time, notes, and a full change log of every edit. |
| **Drivers** | Courier roster (phone, vehicle) with the manual live-location fields used by the map. |
| **Dispatchers** | Office staff who assign/review jobs — used for violation attribution and trends. |
| **Carriers** | FedEx / UPS / Airport Cargo / Laboratory destinations, location, cutoff times. |
| **States** | State cutoff times — the per-route deadline for state-cutoff breaches. |
| **Guide** | This guide, in-app. |

---

## 7. Performance standards (KPIs)

Audit Accuracy **99%** · Documentation Completeness **100%** · Critical Issues Missed **0** · Missing Photos **0** · Average Audit Time **1–2 minutes per stop**

---

## 8. Common errors (trend analytics)

- **Driver:** missing pickup/delivery photo, forgot building/lockbox photo, wrong count, wrong clinic, blurry pictures, missing label, no proof of delivery.
- **Dispatch:** approved incomplete jobs, failed to request missing photos, incorrect job status, missed SOP violations, closed jobs with incomplete docs.

---

## 9. Running & maintenance

```bash
# Backend (FastAPI + SQLite) — backend/
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (React + Vite) — frontend/
npm install
npm run dev        # open http://localhost:5173
```

- The SQLite database (`backend/agl.db`) is created automatically on first boot
  and **seeded with demo data** (today's VA / MD / NC pickup sheets, audited
  records, SOP checklist statuses, charges and violations) so you can explore
  immediately. Set `AGL_SEED_DEMO=0` to start completely empty instead.
- Delete `backend/agl.db` and restart to reseed from scratch.
- API docs: http://localhost:8000/docs
