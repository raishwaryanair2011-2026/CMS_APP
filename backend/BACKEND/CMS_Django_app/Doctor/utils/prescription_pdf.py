"""
Doctor/utils/prescription_pdf.py
    from Doctor.utils.prescription_pdf import generate_prescription_pdf
    buf = generate_prescription_pdf(consultation)  # returns BytesIO at position 0
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
PRIMARY      = colors.HexColor("#0f766e")
ACCENT       = colors.HexColor("#14b8a6")
LIGHT_BG     = colors.HexColor("#f0fdfa")
OUTSIDE_BG   = colors.HexColor("#fefce8")   # amber tint for outside-clinic rows
OUTSIDE_TEXT = colors.HexColor("#92400e")   # amber text
WHITE        = colors.white
DARK_TEXT    = colors.HexColor("#1e293b")
MID_TEXT     = colors.HexColor("#64748b")
BORDER       = colors.HexColor("#e2e8f0")
RX_COLOR     = colors.HexColor("#0f766e")


def _styles():
    base = getSampleStyleSheet()
    def ps(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)
    return {
        "hospital_name": ParagraphStyle(
            "HospitalName", parent=base["Title"],
            fontSize=20, textColor=PRIMARY,
            alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=2,
        ),
        "hospital_sub": ps(
            "HospitalSub", fontSize=9, textColor=MID_TEXT,
            alignment=TA_CENTER, spaceAfter=1,
        ),
        "rx_symbol": ParagraphStyle(
            "RxSymbol", parent=base["Normal"],
            fontSize=28, textColor=RX_COLOR,
            fontName="Helvetica-Bold", spaceAfter=0,
        ),
        "section_title": ps(
            "SectionTitle", fontSize=9, textColor=WHITE,
            fontName="Helvetica-Bold", alignment=TA_LEFT,
        ),
        "label":      ps("Label",     fontSize=8.5, textColor=MID_TEXT),
        "value":      ps("Value",     fontSize=8.5, textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        "diag_label": ps("DiagLabel", fontSize=9,   textColor=MID_TEXT),
        "diag_value": ps("DiagValue", fontSize=9,   textColor=DARK_TEXT, fontName="Helvetica-Bold"),
        "med_hdr":    ps("MedHdr",    fontSize=9,   textColor=WHITE, fontName="Helvetica-Bold"),
        "med_cell":   ps("MedCell",   fontSize=9,   textColor=DARK_TEXT),
        "med_num":    ps("MedNum",    fontSize=9,   textColor=MID_TEXT, alignment=TA_CENTER),
        "med_outside":ps("MedOutside",fontSize=8.5, textColor=OUTSIDE_TEXT,
                         fontName="Helvetica-Bold", alignment=TA_CENTER),
        "outside_note_title": ps(
            "OutsideNoteTitle", fontSize=9, textColor=OUTSIDE_TEXT,
            fontName="Helvetica-Bold",
        ),
        "outside_note_body": ps(
            "OutsideNoteBody", fontSize=9, textColor=DARK_TEXT, leading=14,
        ),
        "footer": ps("Footer", fontSize=8, textColor=MID_TEXT, alignment=TA_CENTER),
        "notes":  ps("Notes",  fontSize=9, textColor=DARK_TEXT, leading=14),
    }


def _section_bar(title, col_width, st):
    t = Table([[Paragraph(title, st["section_title"])]], colWidths=[col_width])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PRIMARY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _kv_table(rows, col_width, st):
    data = [
        [Paragraph(str(lbl), st["label"]), Paragraph(str(val), st["value"])]
        for lbl, val in rows
    ]
    t = Table(data, colWidths=[col_width * 0.40, col_width * 0.60])
    t.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def generate_prescription_pdf(consultation) -> BytesIO:
    buf   = BytesIO()
    W, _H = A4
    margin = 18 * mm
    col    = W - 2 * margin
    half   = col / 2 - 3 * mm

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=margin, bottomMargin=margin,
        title=f"Prescription {consultation.appointment.appointment_code}",
    )

    st    = _styles()
    story = []

    # ── Resolve related objects ──────────────────────────────────────
    appointment = consultation.appointment
    patient     = appointment.patient
    schedule    = appointment.schedule
    doctor      = schedule.doctor

    try:
        doctor_name = doctor.staff.user.get_full_name().strip() or doctor.staff.user.username
    except Exception:
        doctor_name = str(doctor)

    try:
        specialization = doctor.specialization.name or "—"
    except Exception:
        specialization = "—"

    prescription  = getattr(consultation, "prescription", None)
    medicines     = list(prescription.medicines.filter(is_deleted=False)) if prescription else []

    # Separate in-clinic vs outside-clinic medicines
    outside_meds  = [m for m in medicines if getattr(m, 'buy_outside_clinic', False)]
    has_outside   = len(outside_meds) > 0

    # ── 1. Hospital header ───────────────────────────────────────────
    story.append(Paragraph("CMS Hospital", st["hospital_name"]))
    story.append(Paragraph("Medical Prescription", st["hospital_sub"]))
    story.append(Spacer(1, 3 * mm))
    story.append(HRFlowable(width=col, thickness=2, color=ACCENT, spaceAfter=4 * mm))

    # ── 2. Doctor & patient info (side by side) ──────────────────────
    dob_str = patient.dob.strftime("%d %b %Y") if patient.dob else "—"

    doctor_panel = _kv_table([
        ("Doctor",         f"Dr. {doctor_name}"),
        ("Specialization", specialization),
        ("Date",           appointment.appointment_date.strftime("%d %b %Y")),
        ("Token No",       str(appointment.token_no)),
        ("Appt Code",      appointment.appointment_code),
    ], half, st)

    patient_panel = _kv_table([
        ("Patient", patient.full_name),
        ("Code",    patient.patient_code),
        ("Gender",  patient.get_gender_display()),
        ("Phone",   patient.phone),
        ("D.O.B",   dob_str),
    ], half, st)

    two_col = Table([[doctor_panel, patient_panel]], colWidths=[half, half])
    two_col.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LINEAFTER",     (0, 0), (0, -1), 0.5, BORDER),
    ]))

    story.append(_section_bar("DOCTOR & PATIENT DETAILS", col, st))
    story.append(Spacer(1, 2 * mm))
    story.append(two_col)
    story.append(Spacer(1, 5 * mm))

    # ── 3. Clinical notes ────────────────────────────────────────────
    story.append(_section_bar("CLINICAL NOTES", col, st))
    story.append(Spacer(1, 2 * mm))

    clinical_data = [
        [Paragraph("Symptoms",  st["diag_label"]), Paragraph(consultation.symptoms  or "—", st["diag_value"])],
        [Paragraph("Diagnosis", st["diag_label"]), Paragraph(consultation.diagnosis or "—", st["diag_value"])],
    ]
    clinical_table = Table(clinical_data, colWidths=[col * 0.20, col * 0.80])
    clinical_table.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BG, WHITE]),
        ("LEFTPADDING",    (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 8),
        ("TOPPADDING",     (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
        ("BOX",            (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW",      (0, 0), (-1, -2), 0.3, BORDER),
        ("VALIGN",         (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(clinical_table)
    story.append(Spacer(1, 5 * mm))

    # ── 4. Rx medicine table ─────────────────────────────────────────
    story.append(_section_bar("Rx  MEDICINES PRESCRIBED", col, st))
    story.append(Spacer(1, 2 * mm))

    if medicines:
        # Header row — includes "Note" column when any medicine is outside-clinic
        header_row = [
            Paragraph("#",         st["med_hdr"]),
            Paragraph("Medicine",  st["med_hdr"]),
            Paragraph("Dosage",    st["med_hdr"]),
            Paragraph("Frequency", st["med_hdr"]),
            Paragraph("Duration",  st["med_hdr"]),
            Paragraph("Qty",       st["med_hdr"]),
            Paragraph("Note",      st["med_hdr"]),
        ]

        # Column widths — "Note" column replaces some width from medicine/frequency
        col_widths = [
            col * 0.05,   # #
            col * 0.24,   # medicine
            col * 0.12,   # dosage
            col * 0.22,   # frequency
            col * 0.15,   # duration
            col * 0.09,   # qty
            col * 0.13,   # note
        ]

        rows        = [header_row]
        style_cmds  = [
            ("BACKGROUND",    (0, 0), (-1,  0), PRIMARY),
            ("ALIGN",         (0, 0), (0, -1),  "CENTER"),
            ("ALIGN",         (5, 0), (5, -1),  "CENTER"),
            ("ALIGN",         (6, 0), (6, -1),  "CENTER"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ]

        for i, m in enumerate(medicines, 1):
            is_outside = getattr(m, 'buy_outside_clinic', False)

            note_para = Paragraph(
                "Buy Outside*" if is_outside else "—",
                st["med_outside"] if is_outside else st["med_num"],
            )
            name_para = Paragraph(
                f"{m.medicine.name}" + (" *" if is_outside else ""),
                st["med_cell"],
            )

            rows.append([
                Paragraph(str(i),          st["med_num"]),
                name_para,
                Paragraph(m.dosage,        st["med_cell"]),
                Paragraph(m.frequency,     st["med_cell"]),
                Paragraph(m.duration,      st["med_cell"]),
                Paragraph(str(m.quantity), st["med_cell"]),
                note_para,
            ])

            # Highlight entire outside-clinic row in amber tint
            if is_outside:
                row_idx = i  # data row index (0 = header)
                style_cmds.append(("BACKGROUND", (0, row_idx), (-1, row_idx), OUTSIDE_BG))

        # Alternate row backgrounds only for non-outside rows
        for i, m in enumerate(medicines, 1):
            if not getattr(m, 'buy_outside_clinic', False):
                bg = WHITE if i % 2 == 1 else LIGHT_BG
                style_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))

        med_table = Table(rows, colWidths=col_widths)
        med_table.setStyle(TableStyle(style_cmds))
        story.append(med_table)

        # ── Outside-clinic notice box ────────────────────────────────
        if has_outside:
            story.append(Spacer(1, 4 * mm))

            outside_lines = []
            for m in outside_meds:
                outside_lines.append(
                    f"• {m.medicine.name}  –  {m.dosage},  {m.frequency},  "
                    f"{m.duration},  Qty: {m.quantity}"
                )
            notice_text = (
                "<b>* Medicines to be purchased outside the clinic (not available / low stock):</b><br/><br/>"
                + "<br/>".join(outside_lines)
            )

            notice_table = Table(
                [[Paragraph(notice_text, st["outside_note_body"])]],
                colWidths=[col],
            )
            notice_table.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), OUTSIDE_BG),
                ("BOX",           (0, 0), (-1, -1), 1.0, colors.HexColor("#fcd34d")),
                ("LEFTPADDING",   (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
                ("TOPPADDING",    (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(notice_table)

    else:
        story.append(Paragraph("No medicines prescribed.", st["diag_value"]))

    story.append(Spacer(1, 5 * mm))

    # ── 5. Notes ─────────────────────────────────────────────────────
    if consultation.notes and consultation.notes.strip():
        story.append(_section_bar("DOCTOR'S NOTES", col, st))
        story.append(Spacer(1, 2 * mm))
        notes_table = Table(
            [[Paragraph(consultation.notes, st["notes"])]],
            colWidths=[col],
        )
        notes_table.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BG),
            ("BOX",           (0, 0), (-1, -1), 0.5, BORDER),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(notes_table)
        story.append(Spacer(1, 5 * mm))

    # ── 6. Doctor signature block ────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    sig_data = [[
        Paragraph("", st["label"]),
        Paragraph(
            f"Dr. {doctor_name}<br/>"
            f"<font size='8' color='#64748b'>{specialization}</font>",
            ParagraphStyle(
                "SigDoc", parent=st["value"],
                fontSize=10, alignment=TA_RIGHT, leading=14,
            )
        ),
    ]]
    sig_table = Table(sig_data, colWidths=[col * 0.60, col * 0.40])
    sig_table.setStyle(TableStyle([
        ("LINEABOVE",   (1, 0), (1, 0), 0.5, BORDER),
        ("TOPPADDING",  (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",(0, 0), (-1, -1), 0),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 8 * mm))

    # ── 7. Footer ────────────────────────────────────────────────────
    story.append(HRFlowable(width=col, thickness=0.5, color=MID_TEXT, spaceAfter=3 * mm))
    story.append(Paragraph(
        f"Printed on {localtime().strftime('%d %b %Y, %I:%M %p')}  |  "
        "This is a computer-generated prescription.",
        st["footer"],
    ))
    story.append(Spacer(1, 1 * mm))
    story.append(Paragraph("CMS Hospital — Thank you for your visit.", st["footer"]))

    doc.build(story)
    buf.seek(0)
    return buf