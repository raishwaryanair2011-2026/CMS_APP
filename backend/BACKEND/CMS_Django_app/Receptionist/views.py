from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.http import HttpResponse

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.generics import RetrieveAPIView, ListAPIView
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticated
from Authentication.permissions import IsReceptionist, IsDoctor
from Admin.models import DoctorProfile
from .serializers import generate_slots
from Admin.models import DoctorSchedule


from .models import Patient, Appointment, Billing
from .serializers import (
    PatientSerializer,
    AppointmentSerializer,
    BillingSerializer,
    MarkBillingPaidSerializer,
    AppointmentWithBillingSerializer,
)
from .utils.bill_pdf import generate_bill_pdf
from Admin.models import DoctorSchedule
from Admin.serializers import DoctorScheduleSerializer
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError

WEEKDAY_MAP = {
    0: "MONDAY", 1: "TUESDAY", 2: "WEDNESDAY",
    3: "THURSDAY", 4: "FRIDAY", 5: "SATURDAY", 6: "SUNDAY",
}


def success_response(data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)

def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "errors": errors}, status=status_code)


# -----------------------------------------------
# Shared query used by both PDF views
# -----------------------------------------------

def _get_billing_for_pdf(pk):
    """
    Fetch a single non-deleted Billing with all relations needed by
    generate_bill_pdf() pre-loaded in one query.
    Raises Http404 if not found.
    """
    return get_object_or_404(
        Billing.objects.select_related(
            "patient",
            "appointment__schedule__doctor__staff__user",
            "consultation_item",
        ),
        pk=pk,
        is_deleted=False,
    )


# -----------------------------------------------
# Patient ViewSet
# -----------------------------------------------

class PatientViewSet(viewsets.ModelViewSet):
    """
    GET    /patients/               → list active patients
    POST   /patients/               → register new patient
    GET    /patients/<id>/          → patient detail
    PUT    /patients/<id>/          → full update
    PATCH  /patients/<id>/          → partial update
    DELETE /patients/<id>/          → soft delete
    GET    /patients/?search=<q>    → search by name or phone
    """
    serializer_class   = PatientSerializer
    # permission_classes = [IsReceptionist]
    filter_backends    = [SearchFilter]
    search_fields      = ['full_name', 'phone']

    def get_permissions(self):
        from Authentication.permissions import IsDoctor
        from rest_framework.permissions import IsAuthenticated

        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsReceptionist()]

    def get_queryset(self):
        return Patient.objects.filter(is_deleted=False).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )
        return success_response(
            data=serializer.data,
            message="Patient registered successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )
        return success_response(data=serializer.data, message="Patient updated successfully.")

    def destroy(self, request, *args, **kwargs):
        patient = self.get_object()
        patient.delete()
        return success_response(message="Patient deactivated successfully.")


# -----------------------------------------------
# Book Appointment
# -----------------------------------------------

class BookAppointmentView(APIView):
    """
    POST /appointments/book/
    Atomically: books appointment + assigns token + creates PENDING billing.
    """
    permission_classes = [IsReceptionist]

    def post(self, request):
        serializer = AppointmentWithBillingSerializer(data=request.data)
        if serializer.is_valid():
            appointment = serializer.save()
            return success_response(
                data=AppointmentSerializer(appointment).data,
                message="Appointment booked successfully.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Booking failed.", errors=serializer.errors)


# -----------------------------------------------
# Cancel Appointment
# -----------------------------------------------

class CancelAppointmentView(APIView):
    """PATCH /appointments/<id>/cancel/"""
    permission_classes = [IsReceptionist]

    def patch(self, request, pk):
        appointment = get_object_or_404(Appointment, pk=pk, is_deleted=False)
        if appointment.status != 'BOOKED':
            return error_response("Only BOOKED appointments can be cancelled.")
        appointment.status = 'CANCELLED'
        appointment.save(update_fields=['status', 'updated_at'])
        return success_response(
            data=AppointmentSerializer(appointment).data,
            message="Appointment cancelled successfully.",
        )


# -----------------------------------------------
# Complete Appointment
# -----------------------------------------------

class CompleteAppointmentView(APIView):
    """PATCH /appointments/<id>/complete/"""
    permission_classes = [IsReceptionist]

    def patch(self, request, pk):
        appointment = get_object_or_404(Appointment, pk=pk, is_deleted=False)
        if appointment.status == 'CANCELLED':
            return error_response("A cancelled appointment cannot be completed.")
        if appointment.status == 'COMPLETED':
            return error_response("Appointment is already completed.")
        appointment.status = 'COMPLETED'
        appointment.save(update_fields=['status', 'updated_at'])
        return success_response(
            data=AppointmentSerializer(appointment).data,
            message="Appointment marked as completed.",
        )


# -----------------------------------------------
# Today's Appointments
# -----------------------------------------------

class TodayAppointmentsView(APIView):
    permission_classes = [IsReceptionist | IsDoctor]

    def get(self, request):
        today    = timezone.localdate()
        queryset = Appointment.objects.filter(
            appointment_date=today,
            is_deleted=False,
        ).select_related('patient', 'schedule', 'billing')

        schedule_id = request.query_params.get('schedule')
        if schedule_id:
            queryset = queryset.filter(schedule_id=schedule_id)

        # If request is from a doctor — filter to only their schedule's appointments
        if request.user.groups.filter(name='Doctor').exists():
            try:
                doctor = DoctorProfile.objects.get(
                    staff__user=request.user,
                    is_active=True,
                    is_deleted=False,
                )
                queryset = queryset.filter(schedule__doctor=doctor)
            except DoctorProfile.DoesNotExist:
                queryset = queryset.none()

        return success_response(
            data=AppointmentSerializer(queryset, many=True).data,
            message="Today's appointments retrieved.",
        )



# -----------------------------------------------
# Appointment Detail
# -----------------------------------------------

class AppointmentDetailView(RetrieveAPIView):
    """GET /appointments/<id>/"""
    permission_classes = [IsReceptionist | IsDoctor]
    serializer_class   = AppointmentSerializer
    queryset           = Appointment.objects.select_related('patient', 'schedule', 'billing')


# -----------------------------------------------
# Billing ViewSet
# -----------------------------------------------

class BillingViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /billing/                       → list
    GET /billing/<id>/                  → detail
    GET /billing/?search=<q>            → search by patient name / appt code / bill_no
    GET /billing/?patient=<id>          → filter by patient
    GET /billing/?date=YYYY-MM-DD       → filter by date
    """
    permission_classes = [IsReceptionist]
    serializer_class   = BillingSerializer
    filter_backends    = [SearchFilter]
    search_fields      = ['patient__full_name', 'appointment__appointment_code', 'bill_no']

    def get_queryset(self):
        queryset = Billing.objects.select_related(
            'appointment', 'patient'
        ).filter(is_deleted=False).order_by('-created_at')

        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(created_at__date=date)

        patient_id = self.request.query_params.get('patient')
        if patient_id:
            queryset = queryset.filter(patient_id=patient_id)

        return queryset


# -----------------------------------------------
# Mark Billing as Paid
# -----------------------------------------------

class MarkBillingPaidView(APIView):
    permission_classes = [IsReceptionist]

    def patch(self, request, pk):
        billing    = get_object_or_404(Billing, pk=pk, is_deleted=False)
        serializer = MarkBillingPaidSerializer(billing, data=request.data)

        if not serializer.is_valid():
            return error_response(message="Payment failed.", errors=serializer.errors)

        try:
            serializer.save()
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )

        billing.refresh_from_db()
        return success_response(
            data=BillingSerializer(billing).data,
            message="Payment recorded successfully.",
        )


# -----------------------------------------------
# Today's Available Doctor Schedules
# -----------------------------------------------

class TodayAvailableSchedulesView(ListAPIView):
    """GET /schedules/today/"""
    permission_classes = [IsReceptionist]
    serializer_class   = DoctorScheduleSerializer

    def get_queryset(self):
        now          = timezone.localtime()
        day_str      = WEEKDAY_MAP[now.weekday()]
        current_time = now.time()

        return DoctorSchedule.objects.filter(
            day_of_week=day_str,
            start_time__lte=current_time,
            end_time__gte=current_time,
            is_deleted=False,
            is_active=True,
        ).select_related('doctor__staff__user')


# -----------------------------------------------
# Bill PDF — Print (opens inline in browser)
# -----------------------------------------------

class BillPDFView(APIView):
    """
    GET /billing/<id>/pdf/

    Streams the bill PDF with Content-Disposition: inline so the browser
    renders it directly in a new tab.  The user can then hit Ctrl+P (or
    the browser's print icon) to send it to a printer.

    PDF sections
    ------------
    1. Clinic header
    2. Meta: Bill No (BILL-YYYY-NNNN) | Appointment No | Appointment Date |
             Token No | Payment Status | Printed On
    3. Patient & Doctor details  (side-by-side)
    4. Bill items table  (Consultation Fee)
    5. Totals bar  (Total Amount / Paid Amount)
    6. Payment stamp  (green PAID  or  orange PAYMENT PENDING)
    7. Footer
    """
    permission_classes = [IsReceptionist]

    def get(self, request, pk):
        billing  = _get_billing_for_pdf(pk)
        buf      = generate_bill_pdf(billing)
        filename = f"bill_{billing.bill_no}.pdf"

        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


# -----------------------------------------------
# Bill PDF — Download (force-download attachment)
# -----------------------------------------------

class BillDownloadView(APIView):
    """
    GET /billing/<id>/download/

    Same PDF as BillPDFView but sent as an attachment so the browser
    triggers a Save-As / Downloads dialog instead of rendering inline.
    Useful for saving a digital copy of the bill.
    """
    permission_classes = [IsReceptionist]

    def get(self, request, pk):
        billing  = _get_billing_for_pdf(pk)
        buf      = generate_bill_pdf(billing)
        filename = f"bill_{billing.bill_no}.pdf"

        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
    


class SlotAvailabilityView(APIView):
    """
    GET /api/v1/reception/appointments/slots/
        ?schedule=<schedule_id>&date=<YYYY-MM-DD>

    Returns all 20-minute slots for the given schedule on that date,
    with each slot marked as available, booked, or past.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        schedule_id = request.query_params.get('schedule')
        date_str    = request.query_params.get('date')

        if not schedule_id or not date_str:
            return error_response("Both 'schedule' and 'date' query params are required.")

        try:
            schedule = DoctorSchedule.objects.get(
                pk=schedule_id, is_active=True, is_deleted=False
            )
        except DoctorSchedule.DoesNotExist:
            return error_response("Schedule not found.", status_code=status.HTTP_404_NOT_FOUND)

        try:
            from datetime import date
            date_obj = date.fromisoformat(date_str)
        except ValueError:
            return error_response("Invalid date format. Use YYYY-MM-DD.")

        # Validate day of week matches schedule
        day_names = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']
        expected_day = day_names[date_obj.weekday()]
        if schedule.day_of_week != expected_day:
            return error_response(
                f"The date {date_str} is a {expected_day} but this schedule is for {schedule.day_of_week}."
            )

        slots = generate_slots(schedule, date_str)
        return success_response(data={
            "schedule_id":  schedule.pk,
            "date":         date_str,
            "day":          schedule.day_of_week,
            "start_time":   schedule.start_time.strftime("%H:%M"),
            "end_time":     schedule.end_time.strftime("%H:%M"),
            "slot_minutes": 20,
            "total_slots":  len(slots),
            "slots":        slots,
        }, message="Slot availability retrieved.")