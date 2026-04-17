from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .models import (
    MedicineCategory,
    Medicine,
    MedicineBatch,
    MedicineDispense,
    PharmacyBillItem,
)
from .serializers import (
    MedicineCategorySerializer,
    MedicineSerializer,
    MedicineBatchSerializer,
    MedicineDispenseSerializer,
    PharmacyBillItemSerializer,
    MedicinePrescriptionReadSerializer,
)
# FIX: was "from doctor.models" (lowercase) — Django app labels are case-sensitive
from Doctor.models import MedicinePrescription


# =====================================================
# HELPERS — unified response envelope
# =====================================================

def success_response(data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)

def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "errors": errors}, status=status_code)


# =====================================================
# MEDICINE CATEGORY VIEWSET
# =====================================================

class MedicineCategoryViewSet(viewsets.ModelViewSet):

    serializer_class   = MedicineCategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # FIX: was objects.all() — now correctly excludes soft-deleted categories
        return MedicineCategory.objects.filter(is_deleted=False)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Medicine categories retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Medicine category retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                data=serializer.data,
                message="Medicine category created.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Validation failed.", errors=serializer.errors)

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return success_response(data=serializer.data, message="Medicine category updated.")
        return error_response(message="Validation failed.", errors=serializer.errors)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return success_response(message="Medicine category deleted.")


# =====================================================
# PHARMACIST DASHBOARD
# =====================================================

class PharmacistDashboardView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
        from django.db.models import Sum, OuterRef, Subquery, IntegerField, F
        from django.db.models.functions import Coalesce
        from datetime import timedelta

        today     = timezone.now().date()
        threshold = today + timedelta(days=30)

        # FIX: was loading all medicines into Python memory for needs_reorder count.
        # Now computed entirely in the database with a subquery annotation.
        stock_subq = (
            MedicineBatch.objects
            .filter(medicine=OuterRef("pk"), is_active=True, is_deleted=False)
            .values("medicine")
            .annotate(total=Sum("stock_level"))
            .values("total")
        )

        low_stock_count = (
            Medicine.objects
            .filter(is_deleted=False)
            .annotate(
                computed_stock=Coalesce(
                    Subquery(stock_subq, output_field=IntegerField()), 0
                )
            )
            .filter(computed_stock__lte=F("reorder_level"))
            .count()
        )

        expiring_soon_count = MedicineBatch.objects.filter(
            expiry_date__lte=threshold,
            is_active=True,
            is_deleted=False,
        ).count()

        pending_prescriptions_count = MedicinePrescription.objects.filter(
            is_dispensed=False,
            is_deleted=False,
        ).count()

        todays_dispense_count = MedicineDispense.objects.filter(
            dispensed_at__date=today,
            is_deleted=False,
        ).count()

        total_medicines     = Medicine.objects.filter(is_deleted=False).count()
        total_active_batches = MedicineBatch.objects.filter(
            is_active=True, is_deleted=False
        ).count()

        return success_response(
            data={
                "low_stock_medicines":    low_stock_count,
                "expiring_soon_batches":  expiring_soon_count,
                "pending_prescriptions":  pending_prescriptions_count,
                "todays_dispenses":       todays_dispense_count,
                "total_medicines":        total_medicines,
                "total_active_batches":   total_active_batches,
            },
            message="Dashboard data retrieved.",
        )


# =====================================================
# MEDICINE VIEWSET
# =====================================================

class MedicineViewSet(viewsets.ModelViewSet):

    serializer_class   = MedicineSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Medicine.objects.select_related("category").filter(is_deleted=False)

        category_id = self.request.query_params.get("category")
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        return queryset

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()

        # needs_reorder is a @property — must filter in Python, not DB
        needs_reorder = request.query_params.get("needs_reorder")
        if needs_reorder and needs_reorder.lower() == "true":
            queryset = [m for m in queryset if m.needs_reorder]

        serializer = self.get_serializer(queryset, many=True)
        return success_response(data=serializer.data, message="Medicines retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Medicine retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                data=serializer.data,
                message="Medicine added.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Validation failed.", errors=serializer.errors)

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return success_response(data=serializer.data, message="Medicine updated.")
        return error_response(message="Validation failed.", errors=serializer.errors)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return success_response(message="Medicine deleted.")


# =====================================================
# MEDICINE BATCH VIEWSET
# =====================================================

class MedicineBatchViewSet(viewsets.ModelViewSet):

    serializer_class   = MedicineBatchSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.utils import timezone
        from datetime import timedelta

        queryset = MedicineBatch.objects.select_related("medicine").filter(is_deleted=False)

        medicine_id = self.request.query_params.get("medicine")
        if medicine_id:
            queryset = queryset.filter(medicine_id=medicine_id)

        is_active = self.request.query_params.get("is_active")
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == "true")

        expiring_soon = self.request.query_params.get("expiring_soon")
        if expiring_soon and expiring_soon.lower() == "true":
            threshold = timezone.now().date() + timedelta(days=30)
            queryset  = queryset.filter(expiry_date__lte=threshold, is_active=True)

        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Batches retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Batch retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                data=serializer.data,
                message="Batch added.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Validation failed.", errors=serializer.errors)

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return success_response(data=serializer.data, message="Batch updated.")
        return error_response(message="Validation failed.", errors=serializer.errors)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return success_response(message="Batch deleted.")


# =====================================================
# MEDICINE PRESCRIPTION VIEWSET  (read-only, pharmacist view)
# FIX: renamed from PrescriptionViewSet to avoid name collision with Doctor app
# =====================================================

class MedicinePrescriptionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only view for pharmacists to see pending/all prescriptions.
    GET /api/v1/pharmacy/prescriptions/
    GET /api/v1/pharmacy/prescriptions/<id>/
    GET /api/v1/pharmacy/prescriptions/pending/
    """
    serializer_class   = MedicinePrescriptionReadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = MedicinePrescription.objects.select_related(
            "medicine",
            "prescription__consultation__appointment__patient",
        ).filter(is_deleted=False)

        patient = self.request.query_params.get("patient")
        if patient:
            queryset = queryset.filter(
                prescription__consultation__appointment__patient__full_name__icontains=patient
            )
        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Prescriptions retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Prescription retrieved.")

    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        queryset   = self.get_queryset().filter(
            is_dispensed=False,
            buy_outside_clinic=False,  # outside-clinic medicines cannot be dispensed here
        )
        serializer = self.get_serializer(queryset, many=True)
        return success_response(data=serializer.data, message="Pending prescriptions retrieved.")


# =====================================================
# MEDICINE DISPENSE VIEWSET
# =====================================================

class MedicineDispenseViewSet(viewsets.ModelViewSet):
    """
    POST triggers (inside model.save()):
      1. Creates dispense record + generates dispense_code
      2. Deducts stock from MedicineBatch
      3. Auto-deactivates batch if stock reaches 0
      4. Flips MedicinePrescription.is_dispensed = True
    Update and delete are intentionally disabled.
    """
    serializer_class   = MedicineDispenseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return MedicineDispense.objects.select_related(
            "medicine_prescription__medicine",
            "medicine_batch__medicine",
            "dispensed_by__user",
        ).filter(is_deleted=False)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Dispense records retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Dispense record retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                data=serializer.data,
                message="Medicine dispensed successfully.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Dispensing failed.", errors=serializer.errors)

    def update(self, request, *args, **kwargs):
        return error_response(
            message="Dispense records cannot be updated.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def destroy(self, request, *args, **kwargs):
        return error_response(
            message="Dispense records cannot be deleted.",
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


# =====================================================
# PHARMACY BILL ITEM VIEWSET
# =====================================================

class PharmacyBillItemViewSet(viewsets.ModelViewSet):
    """
    POST   /bill-items/        → create (auto-fills unit_price, calculates total)
    PATCH  /bill-items/<id>/   → update unit_price only
    DELETE /bill-items/<id>/   → soft delete
    """
    serializer_class   = PharmacyBillItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = PharmacyBillItem.objects.select_related(
            "medicine_dispense__medicine_batch__medicine",
            "billing",
        ).filter(is_deleted=False)

        billing_id = self.request.query_params.get("billing")
        if billing_id:
            queryset = queryset.filter(billing_id=billing_id)
        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return success_response(data=serializer.data, message="Pharmacy bill items retrieved.")

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return success_response(data=serializer.data, message="Bill item retrieved.")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return success_response(
                data=serializer.data,
                message="Pharmacy bill item created.",
                status_code=status.HTTP_201_CREATED,
            )
        return error_response(message="Validation failed.", errors=serializer.errors)

    def update(self, request, *args, **kwargs):
        # Always partial — only unit_price is editable
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return success_response(data=serializer.data, message="Bill item updated.")
        return error_response(message="Validation failed.", errors=serializer.errors)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return success_response(message="Bill item deleted.")


# =====================================================
# PHARMACY BILL PDF VIEWS
# =====================================================

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from Doctor.models import Prescription


class PharmacyBillPDFView(APIView):
    """
    GET /api/v1/pharmacy/prescriptions/<prescription_id>/bill-pdf/
    Opens the pharmacy bill PDF inline in the browser for printing.
    Available once all medicines in the prescription are dispensed.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, prescription_id):
        from .utils.pharmacy_bill_pdf import generate_pharmacy_bill_pdf

        prescription = get_object_or_404(
            Prescription.objects.select_related(
                'consultation__appointment__patient',
                'consultation__appointment__schedule__doctor__staff__user',
                'consultation__appointment__schedule__doctor__specialization',
            ).prefetch_related(
                'medicines__medicine',
            ),
            pk=prescription_id,
            is_deleted=False,
        )

        buf = generate_pharmacy_bill_pdf(prescription)
        apt_code = prescription.consultation.appointment.appointment_code
        filename = f"pharmacy_bill_{apt_code}.pdf"

        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class PharmacyBillDownloadView(APIView):
    """
    GET /api/v1/pharmacy/prescriptions/<prescription_id>/bill-download/
    Downloads the pharmacy bill PDF as an attachment.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, prescription_id):
        from .utils.pharmacy_bill_pdf import generate_pharmacy_bill_pdf

        prescription = get_object_or_404(
            Prescription.objects.select_related(
                'consultation__appointment__patient',
                'consultation__appointment__schedule__doctor__staff__user',
                'consultation__appointment__schedule__doctor__specialization',
            ).prefetch_related(
                'medicines__medicine',
            ),
            pk=prescription_id,
            is_deleted=False,
        )

        buf = generate_pharmacy_bill_pdf(prescription)
        apt_code = prescription.consultation.appointment.appointment_code
        filename = f"pharmacy_bill_{apt_code}.pdf"

        response = HttpResponse(buf.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response