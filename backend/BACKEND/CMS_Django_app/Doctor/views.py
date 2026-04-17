from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.db import IntegrityError
from django.db.models import Count, Q
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404

from .models import Consultation, Prescription, MedicinePrescription
from .serializers import (
    ConsultationSerializer,
    PrescriptionSerializer,
    MedicinePrescriptionSerializer,
)
from .utils.prescription_pdf import generate_prescription_pdf
from Admin.models import DoctorProfile
# FIX: Import IsDoctor from Authentication — do NOT redefine it here
from Authentication.permissions import IsDoctor
from rest_framework.decorators import action


# ======================================================
# HELPERS
# ======================================================

def success_response(data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)

def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "errors": errors}, status=status_code)


def handle_save(serializer, **kwargs):
    integrity_msg = kwargs.pop("integrity_msg", "A database constraint was violated.")
    try:
        return serializer.save(**kwargs)
    except IntegrityError:
        raise DRFValidationError({"detail": integrity_msg})
    except DjangoValidationError as e:
        raise DRFValidationError(
            e.message_dict if hasattr(e, "message_dict") else {"error": e.messages}
        )


# ======================================================
# SOFT DELETE
# ======================================================

class SoftDeleteMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ======================================================
# PARENT LOOKUP
# ======================================================

class ParentLookupMixin:
    def get_consultation(self):
        consultation_pk = self.kwargs.get("consultation_pk")
        try:
            return Consultation.objects.get(pk=consultation_pk, is_deleted=False)
        except Consultation.DoesNotExist:
            raise NotFound(f"Consultation {consultation_pk} not found.")

    def get_prescription_from_kwargs(self):
        prescription_pk = self.kwargs.get("prescription_pk")
        consultation_pk = self.kwargs.get("consultation_pk")
        try:
            return Prescription.objects.get(
                pk=prescription_pk,
                consultation__id=consultation_pk,
                is_deleted=False,
            )
        except Prescription.DoesNotExist:
            raise NotFound(
                f"Prescription {prescription_pk} not found under consultation {consultation_pk}."
            )


# ======================================================
# DOCTOR DASHBOARD
# ======================================================

class DoctorDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsDoctor]

    def get(self, request):
        today = timezone.localdate()
        try:
            doctor_profile = DoctorProfile.objects.select_related(
                'staff__user', 'specialization'
            ).get(staff__user=request.user, is_active=True, is_deleted=False)
        except DoctorProfile.DoesNotExist:
            return error_response("Doctor profile not found.")

        from Receptionist.models import Appointment
        today_apts = Appointment.objects.filter(
            appointment_date=today, schedule__doctor=doctor_profile, is_deleted=False,
        )
        all_consultations = Consultation.objects.filter(
            is_deleted=False, appointment__schedule__doctor=doctor_profile,
        )

        stats = {
            "today_total":        today_apts.count(),
            "today_pending":      today_apts.filter(status__in=["BOOKED", "IN_PROGRESS"]).count(),
            "today_completed":    today_apts.filter(status="COMPLETED").count(),
            "total_consultations": all_consultations.count(),
            "doctor_name":        doctor_profile.staff.user.get_full_name(),
            "doctor_code":        doctor_profile.doctor_code,
            "specialization":     (doctor_profile.specialization.name if doctor_profile.specialization else "—"),
        }
        return success_response(data=stats, message="Dashboard stats retrieved.")


# ======================================================
# PATIENT HISTORY VIEW
# ======================================================

class PatientHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsDoctor]

    def get(self, request, patient_id):
        from Receptionist.models import Patient
        patient = get_object_or_404(Patient, pk=patient_id, is_deleted=False)
        consultations = Consultation.objects.filter(
            is_deleted=False, appointment__patient=patient,
        ).select_related(
            "appointment__patient",
            "appointment__schedule__doctor__staff__user",
            "prescription",
        ).prefetch_related(
            "prescription__medicines__medicine",
        ).order_by("-appointment__appointment_date")

        data = ConsultationSerializer(consultations, many=True).data
        return success_response(
            data={
                "patient": {
                    "id":           patient.id,
                    "patient_code": patient.patient_code,
                    "full_name":    patient.full_name,
                    "phone":        patient.phone,
                    "gender":       patient.get_gender_display(),
                    "dob":          str(patient.dob) if patient.dob else None,
                },
                "consultations": data,
                "total":         consultations.count(),
            },
            message="Patient history retrieved.",
        )


# ======================================================
# PRESCRIPTION PDF VIEWS
# ======================================================

class PrescriptionPDFView(APIView):
    """Opens prescription inline in browser for printing."""
    permission_classes = [IsAuthenticated, IsDoctor]

    def get(self, request, consultation_pk):
        consultation = get_object_or_404(
            Consultation.objects.select_related(
                "appointment__patient",
                "appointment__schedule__doctor__staff__user",
                "prescription",
            ).prefetch_related("prescription__medicines__medicine"),
            pk=consultation_pk, is_deleted=False,
        )
        if not hasattr(consultation, "prescription"):
            return error_response("No prescription found for this consultation.")
        buf      = generate_prescription_pdf(consultation)
        filename = f"prescription_{consultation.appointment.appointment_code}.pdf"
        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class PrescriptionDownloadView(APIView):
    """Downloads prescription as a PDF attachment."""
    permission_classes = [IsAuthenticated, IsDoctor]

    def get(self, request, consultation_pk):
        consultation = get_object_or_404(
            Consultation.objects.select_related(
                "appointment__patient",
                "appointment__schedule__doctor__staff__user",
                "prescription",
            ).prefetch_related("prescription__medicines__medicine"),
            pk=consultation_pk, is_deleted=False,
        )
        if not hasattr(consultation, "prescription"):
            return error_response("No prescription found for this consultation.")
        buf      = generate_prescription_pdf(consultation)
        filename = f"prescription_{consultation.appointment.appointment_code}.pdf"
        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ======================================================
# CONSULTATION VIEWSET
# ======================================================

class ConsultationViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
    serializer_class   = ConsultationSerializer
    permission_classes = [IsAuthenticated, IsDoctor]

    def get_queryset(self):
        qs = Consultation.objects.filter(is_deleted=False).select_related(
            "appointment__patient",
            "appointment__schedule__doctor__staff__user",
            "prescription",
        ).prefetch_related("prescription__medicines__medicine")
        patient_id = self.request.query_params.get("patient")
        if patient_id:
            qs = qs.filter(appointment__patient_id=patient_id)
        return qs.order_by("-appointment__appointment_date")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Consultations retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Consultation retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, integrity_msg="A consultation already exists for this appointment.")
        return success_response(
            data=serializer.data, message="Consultation created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial  = kwargs.pop("partial", False)
        instance = self.get_object()
        if instance.appointment.status == "COMPLETED":
            return error_response("Cannot modify a completed consultation.")
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, integrity_msg="Update conflict. Please retry.")
        return success_response(data=serializer.data, message="Consultation updated successfully.")

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        consultation = self.get_object()
        appointment  = consultation.appointment

        if appointment.status == 'CANCELLED':
            return error_response("Cannot complete a consultation for a cancelled appointment.")
        if appointment.status == 'COMPLETED':
            return error_response("This consultation is already completed.")
        if not hasattr(consultation, 'prescription'):
            return error_response("Cannot complete consultation without creating a prescription first.")

        from django.db import transaction
        with transaction.atomic():
            appointment.status = 'COMPLETED'
            appointment.save(update_fields=['status', 'updated_at'])

        return success_response(
            data=ConsultationSerializer(consultation).data,
            message="Consultation completed. Appointment marked as completed.",
        )


# ======================================================
# PRESCRIPTION VIEWSET
# ======================================================

class PrescriptionViewSet(SoftDeleteMixin, ParentLookupMixin, viewsets.ModelViewSet):
    serializer_class   = PrescriptionSerializer
    permission_classes = [IsAuthenticated, IsDoctor]

    def get_queryset(self):
        consultation = self.get_consultation()
        return Prescription.objects.filter(
            is_deleted=False, consultation=consultation,
        ).select_related("consultation").prefetch_related("medicines", "medicines__medicine")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Prescription retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Prescription retrieved.")

    def create(self, request, *args, **kwargs):
        consultation = self.get_consultation()
        serializer   = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, consultation=consultation,
                    integrity_msg="A prescription already exists for this consultation.")
        return success_response(
            data=serializer.data, message="Prescription created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, integrity_msg="Update conflict. Please retry.")
        return success_response(data=serializer.data, message="Prescription updated successfully.")


# ======================================================
# MEDICINE PRESCRIPTION VIEWSET
# ======================================================

class MedicinePrescriptionViewSet(SoftDeleteMixin, ParentLookupMixin, viewsets.ModelViewSet):
    serializer_class   = MedicinePrescriptionSerializer
    permission_classes = [IsAuthenticated, IsDoctor]

    def get_queryset(self):
        prescription = self.get_prescription_from_kwargs()
        return MedicinePrescription.objects.filter(
            is_deleted=False, prescription=prescription,
        ).select_related("prescription", "medicine")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Medicine prescriptions retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Medicine prescription retrieved.")

    def create(self, request, *args, **kwargs):
        prescription = self.get_prescription_from_kwargs()
        serializer   = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, prescription=prescription,
                    integrity_msg="This medicine is already in this prescription.")
        return success_response(
            data=serializer.data, message="Medicine added to prescription.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        handle_save(serializer, integrity_msg="Update conflict. Please retry.")
        return success_response(data=serializer.data, message="Medicine prescription updated.")

    def perform_destroy(self, instance):
        if instance.is_dispensed:
            raise DRFValidationError(
                {"detail": "Cannot delete a medicine that has already been dispensed."}
            )
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted", "updated_at"])


# ======================================================
# COMPLETED PRESCRIPTIONS VIEW
# FIX #10: Return prescriptions with ANY dispensed medicine (not just fully dispensed)
# ======================================================

class CompletedPrescriptionsView(APIView):
    """
    GET /api/v1/doctor/completed-prescriptions/
    Returns prescriptions where ALL in-clinic medicines are dispensed.
    Medicines marked buy_outside_clinic=True are excluded from this check
    since the patient buys those themselves.
    Bill is generated only once per prescription (one bill per consultation).
    Accessible by both doctors and pharmacists.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        consultations = Consultation.objects.filter(
            is_deleted=False,
            prescription__isnull=False,
        ).select_related(
            'appointment__patient',
            'prescription',
        ).prefetch_related('prescription__medicines__medicine')

        result = []
        for c in consultations:
            meds = list(c.prescription.medicines.filter(is_deleted=False))
            if not meds:
                continue

            # Split medicines into in-clinic and outside-clinic
            inclinic_meds  = [m for m in meds if not getattr(m, 'buy_outside_clinic', False)]
            outside_meds   = [m for m in meds if getattr(m, 'buy_outside_clinic', False)]

            # Bill is ready only when ALL in-clinic medicines are dispensed
            # (outside-clinic medicines are the patient's responsibility)
            if not inclinic_meds:
                # All medicines are outside-clinic — no pharmacy bill needed
                continue

            inclinic_dispensed = sum(1 for m in inclinic_meds if m.is_dispensed)
            inclinic_total     = len(inclinic_meds)
            bill_ready         = inclinic_dispensed == inclinic_total

            # Only surface this prescription to the bill section once bill is ready
            if not bill_ready:
                continue

            result.append({
                'prescription_id':      c.prescription.id,
                'appointment_code':     c.appointment.appointment_code,
                'patient_name':         c.appointment.patient.full_name,
                'inclinic_total':       inclinic_total,
                'inclinic_dispensed':   inclinic_dispensed,
                'outside_count':        len(outside_meds),
                'bill_ready':           bill_ready,
                'medicines': [
                    {
                        'id':                m.id,
                        'medicine_name':     m.medicine.name,
                        'is_dispensed':      m.is_dispensed,
                        'buy_outside_clinic': getattr(m, 'buy_outside_clinic', False),
                    }
                    for m in meds
                ],
            })

        return success_response(data=result, message="Completed prescriptions retrieved.")