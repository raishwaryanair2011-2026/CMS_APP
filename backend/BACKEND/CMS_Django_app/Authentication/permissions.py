# Authentication/permissions.py
from rest_framework.permissions import BasePermission
from Admin.models import DoctorProfile


class IsHospitalAdmin(BasePermission):
    message = "Access restricted to hospital administrators only."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.groups.filter(name="Admin").exists()
        )


class IsReceptionist(BasePermission):
    message = "Access restricted to receptionists only."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.groups.filter(
                name__in=["Admin", "Receptionist"]
            ).exists()
        )


class IsPharmacist(BasePermission):
    message = "Access restricted to pharmacists only."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.groups.filter(
                name__in=["Admin", "Pharmacist"]
            ).exists()
        )


class IsDoctor(BasePermission):
    message = "Access restricted to active doctors only."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return DoctorProfile.objects.filter(
            staff__user=request.user,
            is_active=True,
            is_deleted=False,
            staff__is_active=True,
            staff__is_deleted=False,
        ).exists()


class IsAdminOrReceptionist(BasePermission):
    message = "Access restricted to admin or receptionist."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return (
            request.user.is_superuser
            or request.user.groups.filter(
                name__in=["Admin", "Receptionist"]
            ).exists()
        )


class IsAdminOrDoctor(BasePermission):
    message = "Access restricted to admin or doctor."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        if request.user.groups.filter(name="Admin").exists():
            return True
        return DoctorProfile.objects.filter(
            staff__user=request.user,
            is_active=True,
            is_deleted=False,
            staff__is_active=True,
            staff__is_deleted=False,
        ).exists()