"""Financial report PDF export (reportlab).

`build_financial_pdf` renders the Financials page's data in an organized,
print-ready layout: a summary block up top (client billed / driver pay / net
variance / record count / uncharged stops), then the charge records grouped
by driver with a subtotal row per driver and a grand-total row at the end.
"""

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

SLATE = colors.HexColor("#1E293B")
LIGHT_GRAY = colors.HexColor("#F1F5F9")
MID_GRAY = colors.HexColor("#CBD5E1")
RED = colors.HexColor("#B91C1C")
GREEN = colors.HexColor("#047857")

SUMMARY_COL_WIDTHS = [1.4 * 72] * 5
# Sums to 7.3in = 525.6pt — fits letter width (612pt) minus 2×0.6in margins.
DETAIL_COL_WIDTHS = [
    0.5 * 72,
    0.9 * 72,
    1.95 * 72,
    0.85 * 72,
    0.85 * 72,
    0.75 * 72,
    1.5 * 72,
]


def _money(v: float | None) -> str:
    return f"${v:,.2f}" if v is not None else "—"


def _variance_str(v: float | None) -> str:
    return f"{v:+,.2f}" if v is not None else "—"


def _filter_line(filters: dict) -> str:
    parts: list[str] = []
    frm, to = filters.get("date_from"), filters.get("date_to")
    if frm and to:
        parts.append(f"{frm} → {to}")
    elif frm:
        parts.append(f"from {frm}")
    elif to:
        parts.append(f"through {to}")
    else:
        parts.append("all dates")
    parts.append(f"route #{filters['route_id']}" if filters.get("route_id") else "all routes")
    parts.append(filters.get("driver_label") or "all drivers")
    return " · ".join(parts)


def _page_setup(out: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        out,
        pagesize=letter,
        leftMargin=0.6 * 72,
        rightMargin=0.6 * 72,
        topMargin=0.6 * 72,
        bottomMargin=0.6 * 72,
        title="AGL Financial Report",
    )


def build_financial_pdf(rows: list[dict], summary: dict, filters: dict) -> BytesIO:
    """Render charge records + summary to a PDF. `rows` are ChargeOut dicts,
    `summary` a ChargeSummary dict, `filters` the applied filter labels."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "FPTitle", parent=styles["Title"], fontSize=18, textColor=SLATE, spaceAfter=2
    )
    meta_style = ParagraphStyle(
        "FPMeta", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#64748B")
    )
    h2_style = ParagraphStyle(
        "FPHeading", parent=styles["Heading2"], fontSize=13, textColor=SLATE, spaceBefore=10
    )
    subtotal_style = ParagraphStyle(
        "FPSubtotal", parent=styles["Normal"], fontSize=9, textColor=SLATE
    )

    out = BytesIO()
    doc = _page_setup(out)
    story = [
        Paragraph("AGL — Financial Report", title_style),
        Paragraph(
            f"Generated {datetime.now().strftime('%B %d, %Y · %I:%M %p').replace(' 0', ' ')}"
            f" &nbsp;&nbsp;|&nbsp;&nbsp; {_filter_line(filters)}",
            meta_style,
        ),
        Spacer(1, 14),
    ]

    # Summary block
    summary_data = [
        [
            Paragraph(f"<b>{h}</b>", meta_style)
            for h in ("Client billed", "Driver pay", "Net variance", "Records", "Uncharged stops")
        ],
        [
            _money(summary.get("total_billed")),
            _money(summary.get("total_pay")),
            _variance_str(summary.get("total_variance")),
            str(summary.get("count", 0)),
            str(summary.get("uncharged_completed_stops", 0)),
        ],
    ]
    summary_table = Table(summary_data, colWidths=SUMMARY_COL_WIDTHS)
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SLATE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.5, MID_GRAY),
                ("BACKGROUND", (0, 1), (-1, 1), LIGHT_GRAY),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)

    if not rows:
        story.append(Paragraph("No charge records match the selected filters.", styles["Normal"]))
        doc.build(story)
        out.seek(0)
        return out

    # Group by driver (organized layout), sorted by driver name.
    grouped: dict[str, list[dict]] = {}
    for r in rows:
        grouped.setdefault(r.get("driver_name") or "Unassigned", []).append(r)

    table_header = [
        Paragraph(f"<b>{h}</b>", meta_style)
        for h in ("Route", "Date", "Stop", "Driver pay", "Client billed", "Variance", "Notes")
    ]
    grand = {"pay": 0.0, "billed": 0.0, "variance": 0.0, "count": 0}

    for driver in sorted(grouped):
        driver_rows = grouped[driver]
        subtotal = {"pay": 0.0, "billed": 0.0, "variance": 0.0}
        data = [table_header]
        for r in sorted(
            driver_rows,
            key=lambda x: (
                str(x.get("route_date") or ""),
                x.get("route_id") or 0,
                x.get("stop_sequence") or 0,
            ),
        ):
            pay = r.get("driver_pay") or 0.0
            billed = r.get("client_billed") or 0.0
            variance = r.get("variance") or 0.0
            subtotal["pay"] += pay
            subtotal["billed"] += billed
            subtotal["variance"] += variance
            stop_label = (
                f"{r.get('stop_sequence')}. {r.get('stop_label') or '—'}"
                if r.get("stop_sequence") is not None
                else r.get("stop_label") or "—"
            )
            data.append(
                [
                    f"#{r['route_id']}" if r.get("route_id") else "—",
                    str(r.get("route_date") or ""),
                    stop_label,
                    _money(pay),
                    _money(billed),
                    _variance_str(variance),
                    (r.get("notes") or "")[:60],
                ]
            )
        data.append(
            [
                "",
                "",
                Paragraph(f"<b>Subtotal — {driver} ({len(driver_rows)})</b>", subtotal_style),
                _money(subtotal["pay"]),
                _money(subtotal["billed"]),
                _variance_str(subtotal["variance"]),
                "",
            ]
        )
        grand["pay"] += subtotal["pay"]
        grand["billed"] += subtotal["billed"]
        grand["variance"] += subtotal["variance"]
        grand["count"] += len(driver_rows)

        story.append(Paragraph(f"Driver: {driver}", h2_style))
        t = Table(data, colWidths=DETAIL_COL_WIDTHS, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), SLATE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (3, 0), (5, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -2), 0.4, MID_GRAY),
            ("BOX", (0, -1), (-1, -1), 0.8, SLATE),
            ("BACKGROUND", (0, -1), (-1, -1), LIGHT_GRAY),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        # Color the variance column: red when negative, green when positive.
        for i, r in enumerate(data[1:-1], start=1):
            var = r[5]
            if var.startswith("-"):
                style.append(("TEXTCOLOR", (5, i), (5, i), RED))
            elif var.startswith("+"):
                style.append(("TEXTCOLOR", (5, i), (5, i), GREEN))
        t.setStyle(TableStyle(style))
        story.append(t)
        story.append(Spacer(1, 6))

    # Grand total row
    grand_style = ParagraphStyle(
        "FPGrand", parent=subtotal_style, fontSize=10, textColor=SLATE
    )
    grand_table = Table(
        [
            [
                "",
                "",
                Paragraph(f"<b>Grand total — {grand['count']} record(s)</b>", grand_style),
                _money(grand["pay"]),
                _money(grand["billed"]),
                _variance_str(grand["variance"]),
                "",
            ]
        ],
        colWidths=DETAIL_COL_WIDTHS,
    )
    grand_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), SLATE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (3, 0), (5, 0), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(Spacer(1, 8))
    story.append(grand_table)

    doc.build(story)
    out.seek(0)
    return out
