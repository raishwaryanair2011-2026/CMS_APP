"""
Pharmacist/utils/pharmacy_bill_pdf.py

Generates a printable A4 pharmacy bill PDF for a completed prescription
where all in-clinic medicines have been dispensed.

Outside-clinic medicines (buy_outside_clinic=True) are excluded from
the bill amount — they are listed separately as a patient note.

Usage:
    from Pharmacist.utils.pharmacy_bill_pdf import generate_pharmacy_bill_pdf
    buf = generate_pharmacy_bill_pdf(prescription)  # returns BytesIO at position 0

Font rule: NEVER use Unicode rupee (U+20B9). Use "Rs." instead.
"""

from io import BytesIO
from decimal import Decimal
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

# ── Colour palette ─────────────────────────────────────────────────
PRIMARY      = colors.HexColor("#854F0B")
ACCENT       = colors.HexColor("#BA7517")
LIGHT_BG     = colors.HexColor("#FAEEDA")
OUTSIDE_BG   = colors.HexColor("#fefce8")   # amber tint for outside-clinic note
OUTSIDE_BORDER = colors.HexColor("#fcd34d")
WHITE        = colors.white
DARK_TEXT    = colors.HexColor("#1e293b")
MID_TEXT     = colors.HexColor("#64748b")
BORDER       = colors.HexColor("#e2e8f0")
SUCCESS      = colors.HexColor("#27ae60")
WARNING      = colors.HexColor("#e67e22")
OUTSIDE_TEXT = colors.HexColor("#92400e")


def _styles():
    base = getSampleStyleSheet()
    def ps(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)
    return {
        "hospital_name": ParagraphStyle(
            "HospName", parent=base["Title"],
            fontSize=20, textColor=PRIMARY,
            alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=2,
        ),
        "hospital_sub": ps(
            "HospSub", fontSize=9, textColor=MID_TEXT,
            alignment=TA_CENTER, spaceAfter=1,
        ),
        "section_title": ps(
            "SecTitle", fontSize=9, textColor=WHITE,
            fontName="Helvetica-Bold", alignment=TA_LEFT,
        ),
        "label":       ps("Lbl",      fontSize=8.5, textColor=MID_TEXT),
        "value":       ps("Val",      fontSize=8.5, textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        "med_hdr":     ps("MedHdr",   fontSize=9,   textColor=WHITE, fontName="Helvetica-Bold"),
        "med_cell":    ps("MedCell",  fontSize=9,   textColor=DARK_TEXT),
        "med_right":   ps("MedRight", fontSize=9,   textColor=DARK_TEXT,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT),
        "med_center":  ps("MedCtr",   fontSize=9,   textColor=DARK_TEXT, alignment=TA_CENTER),
        "total_label": ps("TotalLbl", fontSize=11,  textColor=WHITE,
                          fontName="Helvetica-Bold", alignment=TA_LEFT),
        "total_value": ps("TotalVal", fontSize=11,  textColor=WHITE,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT),
        "stamp_paid":    ps("StPaid",  fontSize=14, textColor=SUCCESS,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "stamp_pending": ps("StPend",  fontSize=14, textColor=WARNING,
                            fontName="Helvetica-Bold", alignment=TA_CENTER),
        "footer":        ps("Footer",  fontSize=8,  textColor=MID_TEXT, alignment=TA_CENTER),
        "meta_label":    ps("MetaLbl", fontSize=9,  textColor=MID_TEXT),
        "meta_value":    ps("MetaVal", fontSize=9,  textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        "outside_title": ps("OutTitle",fontSize=9,  textColor=OUTSIDE_TEXT,
                            fontName="Helvetica-Bold"),
        "outside_body":  ps("OutBody", fontSize=9,  textColor=DARK_TEXT, leading=14),
    }


def _section_bar(title, col_width, st):
    t = Table([[Paragraph(title, st["section_title"])]], colWidths=[col_width])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), PRIMARY),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ]))
    return t


def _kv_table(rows, col_width, st):
    data = [
        [Paragraph(str(l), st["label"]), Paragraph(str(v), st["value"])]
        for l, v in rows
    ]
    t = Table(data, colWidths=[col_width*0.40, col_width*0.60])
    t.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
    ]))
    return t


def generate_pharmacy_bill_pdf(prescription) -> BytesIO:
    buf   = BytesIO()
    W, _H = A4
    margin = 18 * mm
    col    = W - 2 * margin
    half   = col / 2 - 3 * mm

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
        title="Pharmacy Bill",
    )

    st    = _styles()
    story = []

    # ── Resolve related objects ───────────────────────────────────
    consultation = prescription.consultation
    appointment  = consultation.appointment
    patient      = appointment.patient
    schedule     = appointment.schedule
    doctor       = schedule.doctor

    try:
        doctor_name = doctor.staff.user.get_full_name().strip() or doctor.staff.user.username
    except Exception:
        doctor_name = str(doctor)

    try:
        specialization = doctor.specialization.name or "—"
    except Exception:
        specialization = "—"

    # ── Separate in-clinic vs outside-clinic medicines ────────────
    # Only IN-CLINIC medicines are billed here.
    # Outside-clinic medicines are listed as a note — the patient buys them directly.
    inclinic_items  = []
    outside_items   = []
    total_amount    = Decimal("0.00")

    for med_rx in prescription.medicines.filter(is_deleted=False):
        is_outside = getattr(med_rx, 'buy_outside_clinic', False)

        if is_outside:
            # Collect for the note section — not billed
            outside_items.append({
                "name":      med_rx.medicine.name,
                "dosage":    med_rx.dosage,
                "frequency": med_rx.frequency,
                "duration":  med_rx.duration,
                "quantity":  med_rx.quantity,
            })
            continue  # skip billing for this medicine

        # In-clinic medicine — get dispense record and price
        try:
            from Pharmacist.models import MedicineDispense, PharmacyBillItem
            dispense = MedicineDispense.objects.filter(
                medicine_prescription=med_rx
            ).select_related('medicine_batch', 'dispensed_by__user').first()

            bill_item = PharmacyBillItem.objects.filter(
                medicine_dispense=dispense
            ).first() if dispense else None

            unit_price  = bill_item.unit_price  if bill_item else med_rx.medicine.price
            total_price = bill_item.total_price  if bill_item else (
                unit_price * med_rx.quantity
            )
            dispensed_by = (
                dispense.dispensed_by.user.get_full_name()
                if dispense and dispense.dispensed_by else "—"
            )
            batch_no = dispense.medicine_batch.batch_no if dispense else "—"

            inclinic_items.append({
                "name":         med_rx.medicine.name,
                "dosage":       med_rx.dosage,
                "frequency":    med_rx.frequency,
                "duration":     med_rx.duration,
                "quantity":     med_rx.quantity,
                "unit_price":   unit_price,
                "total_price":  total_price,
                "batch_no":     batch_no,
                "dispensed_by": dispensed_by,
                "is_dispensed": med_rx.is_dispensed,
            })
            total_amount += Decimal(str(total_price))
        except Exception:
            pass

    dispensed_by_name = inclinic_items[0]["dispensed_by"] if inclinic_items else "—"
    all_inclinic_dispensed = all(item["is_dispensed"] for item in inclinic_items) if inclinic_items else False

    # ── 1. Hospital header ────────────────────────────────────────
    story.append(Paragraph("CMS Hospital", st["hospital_name"]))
    story.append(Paragraph("Pharmacy Bill", st["hospital_sub"]))
    story.append(Spacer(1, 3*mm))
    story.append(HRFlowable(width=col, thickness=2, color=ACCENT, spaceAfter=4*mm))

    # ── 2. Bill meta block ────────────────────────────────────────
    meta_rows = [
        ("Appointment No",  appointment.appointment_code),
        ("Visit Date",      appointment.appointment_date.strftime("%d %b %Y")),
        ("Token No",        str(appointment.token_no)),
        ("Prescription ID", f"RX-{prescription.id:06d}"),
        ("Status",          "Fully Dispensed" if all_inclinic_dispensed else "Partially Dispensed"),
        ("Dispensed By",    dispensed_by_name),
        ("Printed On",      localtime().strftime("%d %b %Y, %I:%M %p")),
    ]
    meta_data = [
        [Paragraph(l, st["meta_label"]), Paragraph(v, st["meta_value"])]
        for l, v in meta_rows
    ]
    meta_table = Table(meta_data, colWidths=[col*0.30, col*0.70])
    meta_table.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0,0),(-1,-1), [LIGHT_BG, WHITE]),
        ("LEFTPADDING",    (0,0),(-1,-1), 10),
        ("RIGHTPADDING",   (0,0),(-1,-1), 10),
        ("TOPPADDING",     (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",  (0,0),(-1,-1), 5),
        ("BOX",            (0,0),(-1,-1), 0.5, BORDER),
        ("LINEBELOW",      (0,0),(-1,-2), 0.3, BORDER),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 5*mm))

    # ── 3. Patient & Doctor panels ────────────────────────────────
    dob_str = patient.dob.strftime("%d %b %Y") if patient.dob else "—"

    patient_panel = _kv_table([
        ("Patient Code",  patient.patient_code),
        ("Name",          patient.full_name),
        ("Gender",        patient.get_gender_display()),
        ("Phone",         patient.phone),
        ("Date of Birth", dob_str),
    ], half, st)

    doctor_panel = _kv_table([
        ("Doctor",         f"Dr. {doctor_name}"),
        ("Specialisation", specialization),
        ("Diagnosis",      (consultation.diagnosis or "—")[:60]),
    ], half, st)

    two_col = Table([[patient_panel, doctor_panel]], colWidths=[half, half])
    two_col.setStyle(TableStyle([
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("LINEAFTER",     (0,0),(0,-1), 0.5, BORDER),
    ]))

    story.append(_section_bar("PATIENT & DOCTOR DETAILS", col, st))
    story.append(Spacer(1, 2*mm))
    story.append(two_col)
    story.append(Spacer(1, 5*mm))

    # ── 4. Medicines dispensed table (IN-CLINIC ONLY) ────────────
    story.append(_section_bar("MEDICINES DISPENSED", col, st))
    story.append(Spacer(1, 2*mm))

    header_row = [
        Paragraph("#",          st["med_hdr"]),
        Paragraph("Medicine",   st["med_hdr"]),
        Paragraph("Dosage",     st["med_hdr"]),
        Paragraph("Frequency",  st["med_hdr"]),
        Paragraph("Qty",        st["med_hdr"]),
        Paragraph("Unit Price", st["med_hdr"]),
        Paragraph("Total",      st["med_hdr"]),
    ]

    rows = [header_row]
    for i, item in enumerate(inclinic_items, 1):
        rows.append([
            Paragraph(str(i), st["med_center"]),
            Paragraph(
                f"{item['name']}<br/>"
                f"<font size='7' color='#94a3b8'>Batch: {item['batch_no']}</font>",
                st["med_cell"]
            ),
            Paragraph(item["dosage"],                    st["med_cell"]),
            Paragraph(item["frequency"],                 st["med_cell"]),
            Paragraph(str(item["quantity"]),             st["med_center"]),
            Paragraph(f"Rs. {item['unit_price']:.2f}",  st["med_right"]),
            Paragraph(f"Rs. {item['total_price']:.2f}", st["med_right"]),
        ])

    if not rows[1:]:
        rows.append([
            Paragraph("—", st["med_cell"]),
            Paragraph("No in-clinic medicines dispensed.", st["med_cell"]),
            Paragraph("", st["med_cell"]),
            Paragraph("", st["med_cell"]),
            Paragraph("", st["med_cell"]),
            Paragraph("", st["med_cell"]),
            Paragraph("", st["med_cell"]),
        ])

    med_table = Table(
        rows,
        colWidths=[
            col*0.05,  # #
            col*0.25,  # medicine
            col*0.12,  # dosage
            col*0.20,  # frequency
            col*0.08,  # qty
            col*0.15,  # unit price
            col*0.15,  # total
        ],
    )
    med_table.setStyle(TableStyle([
        ("BACKGROUND",     (0,0),(-1, 0), PRIMARY),
        ("ROWBACKGROUNDS", (0,1),(-1,-1), [WHITE, LIGHT_BG]),
        ("ALIGN",          (0,0),(0,-1),  "CENTER"),
        ("ALIGN",          (4,0),(4,-1),  "CENTER"),
        ("ALIGN",          (5,0),(6,-1),  "RIGHT"),
        ("LEFTPADDING",    (0,0),(-1,-1), 6),
        ("RIGHTPADDING",   (0,0),(-1,-1), 6),
        ("TOPPADDING",     (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",  (0,0),(-1,-1), 6),
        ("GRID",           (0,0),(-1,-1), 0.4, BORDER),
        ("VALIGN",         (0,0),(-1,-1), "TOP"),
    ]))
    story.append(med_table)
    story.append(Spacer(1, 3*mm))

    # ── 5. Totals bar (in-clinic medicines only) ──────────────────
    totals_table = Table(
        [[
            Paragraph("Total Amount  (In-Clinic Medicines)", st["total_label"]),
            Paragraph(f"Rs. {total_amount:.2f}", st["total_value"]),
        ]],
        colWidths=[col*0.65, col*0.35],
    )
    totals_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), PRIMARY),
        ("LEFTPADDING",   (0,0),(-1,-1), 12),
        ("RIGHTPADDING",  (0,0),(-1,-1), 12),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 5*mm))

    # ── 6. Outside-clinic medicines note ─────────────────────────
    # Listed separately — not billed, patient purchases directly
    if outside_items:
        lines = []
        for m in outside_items:
            lines.append(
                f"• {m['name']}  —  {m['dosage']},  {m['frequency']},  "
                f"{m['duration']},  Qty: {m['quantity']}"
            )
        notice_text = (
            "<b>* Medicines to be purchased outside the clinic "
            "</b><br/><br/>"
            + "<br/>".join(lines)
            + "<br/><br/>"
            "<i>These medicines are unavailable or low in stock at the clinic pharmacy. "
            "The patient is advised to purchase them from an external pharmacy.</i>"
        )
        notice_table = Table(
            [[Paragraph(notice_text, st["outside_body"])]],
            colWidths=[col],
        )
        notice_table.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), OUTSIDE_BG),
            ("BOX",           (0,0),(-1,-1), 1.0, OUTSIDE_BORDER),
            ("LEFTPADDING",   (0,0),(-1,-1), 10),
            ("RIGHTPADDING",  (0,0),(-1,-1), 10),
            ("TOPPADDING",    (0,0),(-1,-1), 8),
            ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ]))
        story.append(notice_table)
        story.append(Spacer(1, 5*mm))

    # ── 7. Status stamp ───────────────────────────────────────────
    if all_inclinic_dispensed:
        stamp_text  = "ALL IN-CLINIC MEDICINES DISPENSED"
        stamp_style = st["stamp_paid"]
        stamp_color = SUCCESS
    else:
        stamp_text  = "PARTIALLY DISPENSED — PENDING ITEMS REMAIN"
        stamp_style = st["stamp_pending"]
        stamp_color = WARNING

    story.append(Table(
        [[Paragraph(stamp_text, stamp_style)]],
        colWidths=[col],
        style=TableStyle([
            ("BOX",           (0,0),(-1,-1), 1.5, stamp_color),
            ("TOPPADDING",    (0,0),(-1,-1), 7),
            ("BOTTOMPADDING", (0,0),(-1,-1), 7),
        ]),
    ))
    story.append(Spacer(1, 8*mm))

    # ── 8. Footer ─────────────────────────────────────────────────
    story.append(HRFlowable(width=col, thickness=0.5, color=MID_TEXT, spaceAfter=3*mm))
    story.append(Paragraph(
        "This is a computer-generated pharmacy bill and does not require a signature.",
        st["footer"],
    ))
    story.append(Spacer(1, 1*mm))
    story.append(Paragraph("Thank you for choosing CMS Hospital.", st["footer"]))

    doc.build(story)
    buf.seek(0)
    return buf