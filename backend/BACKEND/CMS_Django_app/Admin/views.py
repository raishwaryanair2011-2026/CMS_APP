from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db import transaction
from django.contrib.auth.models import Group

from .models import Staff, Specialization, DoctorProfile, DoctorSchedule
from .serializers import (
    StaffSerializer,
    SpecializationSerializer,
    DoctorProfileSerializer,
    DoctorScheduleSerializer,
)
from Authentication.permissions import IsHospitalAdmin
from rest_framework.views import APIView


def success_response(data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)

def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "errors": errors}, status=status_code)


# =========================================================
# STAFF VIEWSET
# =========================================================

class StaffViewSet(viewsets.ModelViewSet):

    serializer_class   = StaffSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsHospitalAdmin()]

    # FIX: removed duplicate get_queryset
    def get_queryset(self):
        return Staff.objects.filter(is_deleted=False).select_related("user")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(
            data=serializer.data,
            message="Staff created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(data=serializer.data, message="Staff updated successfully.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return success_response(message="Staff deleted successfully.", status_code=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        staff = self.get_object()
        if staff.is_active:
            return error_response("Staff is already active.")
        staff.activate()
        return success_response(message="Staff activated successfully.")

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        staff = self.get_object()
        if not staff.is_active:
            return error_response("Staff is already inactive.")
        staff.deactivate_system()
        return success_response(message="Staff deactivated successfully.")

    @action(detail=True, methods=["post"], url_path="assign-role")
    def assign_role(self, request, pk=None):
        staff         = self.get_object()
        role          = request.data.get("role", "").strip()
        allowed_roles = ["Admin", "Doctor", "Pharmacist", "Receptionist"]

        if not role:
            return error_response("Role is required.")
        if role not in allowed_roles:
            return error_response(
                f"Invalid role. Must be one of: {', '.join(allowed_roles)}."
            )

        try:
            group = Group.objects.get(name=role)
        except Group.DoesNotExist:
            return error_response(
                f"Group '{role}' does not exist. Create groups first via Django admin."
            )

        user = staff.user
        user.groups.remove(*Group.objects.filter(name__in=allowed_roles))
        user.groups.add(group)

        return success_response(
            message=f"Role '{role}' assigned to {user.get_full_name() or user.username}.",
            data={"staff_code": staff.staff_code, "role": role},
        )


# =========================================================
# SPECIALIZATION VIEWSET
# =========================================================

class SpecializationViewSet(viewsets.ModelViewSet):

    serializer_class   = SpecializationSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsHospitalAdmin()]

    def get_queryset(self):
        return Specialization.objects.filter(is_deleted=False)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(
            data=serializer.data,
            message="Specialization created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(data=serializer.data, message="Specialization updated successfully.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return success_response(message="Specialization deleted successfully.", status_code=status.HTTP_200_OK)


# =========================================================
# DOCTOR PROFILE VIEWSET
# =========================================================

class DoctorProfileViewSet(viewsets.ModelViewSet):

    serializer_class   = DoctorProfileSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsHospitalAdmin()]

    # FIX: removed duplicate get_queryset
    def get_queryset(self):
        return DoctorProfile.objects.filter(is_deleted=False).select_related(
            "staff__user", "specialization"
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(
            data=serializer.data,
            message="Doctor profile created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(data=serializer.data, message="Doctor profile updated successfully.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return success_response(message="Doctor profile deleted successfully.", status_code=status.HTTP_200_OK)


# =========================================================
# DOCTOR SCHEDULE VIEWSET
# =========================================================

class DoctorScheduleViewSet(viewsets.ModelViewSet):

    serializer_class   = DoctorScheduleSerializer
    permission_classes = [IsAuthenticated, IsHospitalAdmin]

    def get_permissions(self):
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsHospitalAdmin()]

    # FIX: removed duplicate get_queryset
    def get_queryset(self):
        return DoctorSchedule.objects.filter(is_deleted=False).select_related(
            "doctor__staff__user"
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(
            data=serializer.data,
            message="Schedule created successfully.",
            status_code=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            serializer.save()
        return success_response(data=serializer.data, message="Schedule updated successfully.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return success_response(message="Schedule deleted successfully.", status_code=status.HTTP_200_OK)


# =========================================================
# PUBLIC DOCTOR LIST VIEW
# =========================================================

class PublicDoctorListView(APIView):
    """
    GET /api/v1/admin/doctors/public/
    No authentication required — used by the homepage.
    """
    permission_classes    = [AllowAny]
    authentication_classes = []

    def get(self, request):
        doctors = DoctorProfile.objects.filter(
            is_active=True,
            is_deleted=False,
        ).select_related('staff__user', 'specialization')

        data = []
        for doc in doctors:
            try:
                full_name = doc.staff.user.get_full_name().strip()
            except Exception:
                full_name = "—"

            image_url = None
            if doc.profile_image:
                image_url = request.build_absolute_uri(doc.profile_image.url)

            data.append({
                "doctor_code":         doc.doctor_code,
                "full_name":           full_name,
                "specialization":      doc.specialization.name if doc.specialization else "—",
                "consultation_fee":    str(doc.consultation_fee),
                "max_patient_per_day": doc.max_patient_per_day,
                "profile_image":       image_url,
            })

        return success_response(data=data, message="Doctors retrieved.")