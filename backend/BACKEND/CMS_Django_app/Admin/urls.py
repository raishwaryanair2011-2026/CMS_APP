from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    StaffViewSet,
    SpecializationViewSet,
    DoctorProfileViewSet,
    DoctorScheduleViewSet,
    PublicDoctorListView,
)

router = DefaultRouter()
router.register(r'staff',           StaffViewSet,           basename='staff')
router.register(r'specializations', SpecializationViewSet,  basename='specialization')
router.register(r'doctors',         DoctorProfileViewSet,   basename='doctor')
router.register(r'schedules',       DoctorScheduleViewSet,  basename='schedule')

urlpatterns = [
    path('doctors/public/', PublicDoctorListView.as_view(), name='doctors-public'),
    *router.urls,
]