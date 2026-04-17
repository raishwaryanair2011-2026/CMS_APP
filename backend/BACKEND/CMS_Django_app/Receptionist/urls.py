from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PatientViewSet,
    BookAppointmentView,
    CancelAppointmentView,
    CompleteAppointmentView,
    TodayAppointmentsView,
    AppointmentDetailView,
    BillingViewSet,
    MarkBillingPaidView,
    TodayAvailableSchedulesView,
    SlotAvailabilityView,          # NEW — returns 20-min slot grid for a schedule+date
    BillPDFView,
    BillDownloadView,
)

router = DefaultRouter()
router.register(r'patients', PatientViewSet, basename='patient')
router.register(r'billing',  BillingViewSet, basename='billing')

# Mounted at api/v1/reception/ in root urls.py
#
# PATIENTS
#   GET / POST                      /api/v1/reception/patients/
#   GET / PUT / PATCH / DELETE      /api/v1/reception/patients/<id>/
#   GET                             /api/v1/reception/patients/?search=<q>
#
# APPOINTMENTS
#   POST   /api/v1/reception/appointments/book/
#   GET    /api/v1/reception/appointments/slots/?schedule=<id>&date=<YYYY-MM-DD>
#   GET    /api/v1/reception/appointments/today/
#   GET    /api/v1/reception/appointments/today/?schedule=<id>
#   GET    /api/v1/reception/appointments/<id>/
#   PATCH  /api/v1/reception/appointments/<id>/cancel/
#   PATCH  /api/v1/reception/appointments/<id>/complete/
#
# BILLING
#   GET    /api/v1/reception/billing/
#   GET    /api/v1/reception/billing/<id>/
#   PATCH  /api/v1/reception/billing/<id>/pay/
#   GET    /api/v1/reception/billing/<id>/pdf/       ← Print Bill (inline)
#   GET    /api/v1/reception/billing/<id>/download/  ← Download Bill (attachment)
#
# SCHEDULES
#   GET    /api/v1/reception/schedules/today/

urlpatterns = [
    *router.urls,

    # Appointments
    path('appointments/book/',              BookAppointmentView.as_view(),     name='appointment-book'),
    path('appointments/slots/',             SlotAvailabilityView.as_view(),    name='appointment-slots'),
    path('appointments/today/',             TodayAppointmentsView.as_view(),   name='appointment-today'),
    path('appointments/<int:pk>/',          AppointmentDetailView.as_view(),   name='appointment-detail'),
    path('appointments/<int:pk>/cancel/',   CancelAppointmentView.as_view(),   name='appointment-cancel'),
    path('appointments/<int:pk>/complete/', CompleteAppointmentView.as_view(), name='appointment-complete'),

    # Billing
    path('billing/<int:pk>/pay/',           MarkBillingPaidView.as_view(),  name='billing-pay'),
    path('billing/<int:pk>/pdf/',           BillPDFView.as_view(),          name='billing-pdf'),
    path('billing/<int:pk>/download/',      BillDownloadView.as_view(),     name='billing-download'),

    # Schedules
    path('schedules/today/',                TodayAvailableSchedulesView.as_view(), name='schedules-today'),
]