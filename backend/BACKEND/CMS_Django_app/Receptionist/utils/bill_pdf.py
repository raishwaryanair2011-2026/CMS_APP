"""
Reception/utils/bill_pdf.py

Generates a printable A4 bill PDF for a Billing instance.

Usage:
    from Reception.utils.bill_pdf import generate_bill_pdf
    buf = generate_bill_pdf(billing)   # returns BytesIO seeked to 0

Font safety rules (ReportLab built-in Helvetica is Latin-1 only):
  - NEVER use the Unicode rupee symbol (U+20B9) in Paragraph text.
    Use the ASCII string "Rs." instead.
  - NEVER use Unicode subscript / superscript characters.
"""

from io import BytesIO
from django.utils.timezone import localtime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, TableStyle, HRFlowable,
)


# ── Colour palette ────────────────────────────────────────────────────
PRIMARY   = colors.HexColor("#1a3c5e")   # dark navy  — headers / totals bar
ACCENT    = colors.HexColor("#2e86de")   # medium blue — rule line / item header
LIGHT_BG  = colors.HexColor("#f0f4f8")  # pale grey  — alternating table rows
SUCCESS   = colors.HexColor("#27ae60")  # green      — PAID stamp
WARNING   = colors.HexColor("#e67e22")  # orange     — PENDING stamp
WHITE     = colors.white
DARK_TEXT = colors.HexColor("#2d3436")
MID_TEXT  = colors.HexColor("#636e72")
BORDER    = colors.HexColor("#dee2e6")


# ── Paragraph style registry ─────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    def ps(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        # Clinic header
        "clinic_name": ParagraphStyle(
            "ClinicName", parent=base["Title"],
            fontSize=22, textColor=PRIMARY,
            alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=2,
        ),
        "clinic_sub": ps(
            "ClinicSub",
            fontSize=9, textColor=MID_TEXT,
            alignment=TA_CENTER, spaceAfter=1,
        ),
        # Section bar (white text on PRIMARY background)
        "section_title": ps(
            "SectionTitle",
            fontSize=9, textColor=WHITE,
            fontName="Helvetica-Bold", alignment=TA_LEFT,
        ),
        # Meta block (left col = label, right col = value)
        "meta_label": ps("MetaLabel", fontSize=9,  textColor=MID_TEXT),
        "meta_value": ps("MetaValue", fontSize=9,  textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        # Info panels (patient / doctor)
        "info_label": ps("InfoLabel", fontSize=8.5, textColor=MID_TEXT),
        "info_value": ps("InfoValue", fontSize=8.5, textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        # Items table
        "item_hdr":    ps("ItemHdr",   fontSize=9, textColor=WHITE, fontName="Helvetica-Bold"),
        "item_cell":   ps("ItemCell",  fontSize=9, textColor=DARK_TEXT),
        "item_amount": ps("ItemAmt",   fontSize=9, textColor=DARK_TEXT,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT),
        # Totals bar
        "total_label": ps("TotalLbl",  fontSize=11, textColor=WHITE,
                          fontName="Helvetica-Bold", alignment=TA_LEFT),
        "total_value": ps("TotalVal",  fontSize=11, textColor=WHITE,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT),
        # Payment stamp
        "stamp_paid":    ps("StampPaid",    fontSize=14, textColor=SUCCESS,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "stamp_pending": ps("StampPending", fontSize=14, textColor=WARNING,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        # Footer
        "footer": ps("Footer", fontSize=8, textColor=MID_TEXT, alignment=TA_CENTER),
    }


# ── Layout helpers ────────────────────────────────────────────────────

def _section_bar(title, col_width, st):
    """Full-width dark-navy section title bar."""
    t = Table([[Paragraph(title, st["section_title"])]], colWidths=[col_width])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PRIMARY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _kv_table(rows, col_width, st, lbl_key="info_label", val_key="info_value"):
    """
    Two-column key / value grid.
    rows : list of (label_str, value_str)
    """
    data = [
        [Paragraph(str(lbl), st[lbl_key]), Paragraph(str(val), st[val_key])]
        for lbl, val in rows
    ]
    t = Table(data, colWidths=[col_width * 0.42, col_width * 0.58])
    t.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    return t


# ── Main PDF builder ──────────────────────────────────────────────────

def generate_bill_pdf(billing) -> BytesIO:
    """
    Build and return a BytesIO containing the complete A4 bill PDF.

    The billing object should be fetched with:
        Billing.objects.select_related(
            "patient",
            "appointment__schedule__doctor__staff__user",
            "consultation_item",
        )

    PDF layout
    ----------
    1. Clinic header  (name + "Patient Billing Invoice" + rule)
    2. Bill meta block
         Bill No          →  billing.bill_no           (BILL-2025-0001)
         Appointment No   →  appointment.appointment_code
         Appointment Date →  human-readable dd Mon YYYY
         Token No         →  integer
         Payment Status   →  "Pending" / "Success"
         Printed On       →  current datetime
    3. Patient & Doctor details  (side-by-side)
    4. Bill items table  (Consultation Fee row)
    5. Totals bar  (Total Amount / Paid Amount on dark background)
    6. Payment stamp  (green PAID  or  orange PAYMENT PENDING)
    7. Footer
    """
    buf    = BytesIO()
    W, _H  = A4
    margin = 18 * mm
    col    = W - 2 * margin          # usable page width
    half   = col / 2 - 3 * mm       # width of each half-panel

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin,  bottomMargin=margin,
        title=f"Bill {billing.bill_no or ''}",
    )

    st    = _styles()
    story = []

    # ── Resolve related objects ───────────────────────────────────────
    appointment = billing.appointment
    patient     = billing.patient
    schedule    = appointment.schedule
    doctor      = schedule.doctor

    # Doctor display name
    try:
        raw = doctor.staff.user.get_full_name().strip()
        doctor_name = raw or doctor.staff.user.username
    except Exception:
        doctor_name = str(doctor)

    # Specialisation
    try:
        specialization = doctor.specialization.name or "—"
    except Exception:
        specialization = "—"

    # ── 1. Clinic header ──────────────────────────────────────────────
    story.append(Paragraph("CMS Hospital", st["clinic_name"]))
    story.append(Paragraph("Patient Billing Invoice", st["clinic_sub"]))
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width=col, thickness=2, color=ACCENT, spaceAfter=4 * mm))

    # ── 2. Bill meta block ────────────────────────────────────────────
    #
    #  Every field has a distinct, self-explanatory label.
    #  "Bill No"        is the auto-generated BILL-YYYY-NNNN from Billing.bill_no
    #  "Appointment No" is the appointment code (APT-...)
    #  "Appointment Date" is the human-readable visit date
    #
    meta_rows = [
        ("Bill No",           billing.bill_no or "—"),
        ("Appointment No",    appointment.appointment_code),
        ("Appointment Date",  appointment.appointment_date.strftime("%d %b %Y")),
        ("Token No",          str(appointment.token_no)),
        ("Payment Status",    billing.get_payment_status_display()),
        # ("Printed On",        tz.now().strftime("%d %b %Y, %I:%M %p")),
        ("Printed On", localtime().strftime("%d %b %Y, %I:%M %p"))
    ]
    meta_data = [
        [Paragraph(lbl, st["meta_label"]), Paragraph(val, st["meta_value"])]
        for lbl, val in meta_rows
    ]
    meta_table = Table(meta_data, colWidths=[col * 0.30, col * 0.70])
    meta_table.setStyle(TableStyle([
        ("ROWBACKGROUNDS",  (0, 0), (-1, -1), [LIGHT_BG, WHITE]),
        ("LEFTPADDING",     (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",    (0, 0), (-1, -1), 10),
        ("TOPPADDING",      (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",   (0, 0), (-1, -1), 5),
        ("BOX",             (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW",       (0, 0), (-1, -2), 0.3, BORDER),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 5 * mm))

    # ── 3. Patient & Doctor panels ────────────────────────────────────
    dob_str = patient.dob.strftime("%d %b %Y") if patient.dob else "—"

    patient_panel = _kv_table([
        ("Patient Code",  patient.patient_code),
        ("Name",          patient.full_name),
        ("Gender",        patient.get_gender_display()),
        ("Phone",         patient.phone),
        ("Date of Birth", dob_str),
        ("Address",       (patient.address or "—")[:60]),
    ], half, st)

    doctor_panel = _kv_table([
        ("Doctor",         f"Dr. {doctor_name}"),
        ("Specialisation", specialization),
        ("Schedule Day",   schedule.day_of_week.title()),
        ("Timings",
         f"{schedule.start_time.strftime('%I:%M %p')} - "
         f"{schedule.end_time.strftime('%I:%M %p')}"),
    ], half, st)

    two_col = Table([[patient_panel, doctor_panel]], colWidths=[half, half])
    two_col.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))

    story.append(_section_bar("PATIENT & DOCTOR DETAILS", col, st))
    story.append(Spacer(1, 2 * mm))
    story.append(two_col)
    story.append(Spacer(1, 5 * mm))

    # ── 4. Bill items ─────────────────────────────────────────────────
    story.append(_section_bar("BILL DETAILS", col, st))
    story.append(Spacer(1, 2 * mm))

    # Resolve consultation fee (graceful fallback for legacy rows)
    try:
        cons_fee = billing.consultation_item.fee
    except Exception:
        cons_fee = billing.total_amount

    header_row = [
        Paragraph("#",            st["item_hdr"]),
        Paragraph("Description",  st["item_hdr"]),
        Paragraph("Amount (Rs.)", st["item_hdr"]),
    ]
    data_row = [
        Paragraph("1",                   st["item_cell"]),
        Paragraph("Consultation Fee",    st["item_cell"]),
        Paragraph(f"Rs. {cons_fee:.2f}", st["item_amount"]),
    ]

    items_table = Table(
        [header_row, data_row],
        colWidths=[col * 0.08, col * 0.67, col * 0.25],
    )
    items_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), ACCENT),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BG]),
        ("ALIGN",         (2, 0), ( 2, -1), "RIGHT"),
        ("ALIGN",         (0, 0), ( 0, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 3 * mm))

    # ── 5. Totals bar ─────────────────────────────────────────────────
    totals_table = Table(
        [
            [Paragraph("Total Amount", st["total_label"]),
             Paragraph(f"Rs. {billing.total_amount:.2f}", st["total_value"])],
            [Paragraph("Paid Amount",  st["total_label"]),
             Paragraph(f"Rs. {billing.paid_amount:.2f}",  st["total_value"])],
        ],
        colWidths=[col * 0.60, col * 0.40],
    )
    totals_table.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PRIMARY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW",     (0, 0), (-1,  0), 0.5, colors.HexColor("#2c5282")),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 5 * mm))

    # ── 6. Payment status stamp ───────────────────────────────────────
    if billing.payment_status == "SUCCESS":
        stamp_text  = "PAID"
        stamp_style = st["stamp_paid"]
        stamp_color = SUCCESS
    else:
        stamp_text  = "PAYMENT PENDING"
        stamp_style = st["stamp_pending"]
        stamp_color = WARNING

    story.append(Table(
        [[Paragraph(stamp_text, stamp_style)]],
        colWidths=[col],
        style=TableStyle([
            ("BOX",           (0, 0), (-1, -1), 1.5, stamp_color),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    ))
    story.append(Spacer(1, 8 * mm))

    # ── 7. Footer ─────────────────────────────────────────────────────
    story.append(HRFlowable(width=col, thickness=0.5, color=MID_TEXT, spaceAfter=3 * mm))
    story.append(Paragraph(
        "This is a computer-generated bill and does not require a signature.",
        st["footer"],
    ))
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph("Thank you for choosing CMS Hospital.", st["footer"]))

    doc.build(story)
    buf.seek(0)
    return buf
