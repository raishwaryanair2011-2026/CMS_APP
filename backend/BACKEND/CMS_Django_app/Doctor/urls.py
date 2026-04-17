from django.urls import path, include
from rest_framework_nested import routers

from .views import (
    ConsultationViewSet,
    PrescriptionViewSet,
    MedicinePrescriptionViewSet,
    DoctorDashboardView,
    PatientHistoryView,
    PrescriptionPDFView,
    PrescriptionDownloadView,
    CompletedPrescriptionsView,   # NEW — pharmacy billing endpoint
)

# Root router
router = routers.DefaultRouter()
router.register(r"consultations", ConsultationViewSet, basename="consultation")

# Prescription nested under Consultation
consultation_router = routers.NestedDefaultRouter(
    router, r"consultations", lookup="consultation",
)
consultation_router.register(
    r"prescription", PrescriptionViewSet, basename="consultation-prescription",
)

# Medicines nested under Prescription
prescription_router = routers.NestedDefaultRouter(
    consultation_router, r"prescription", lookup="prescription",
)
prescription_router.register(
    r"medicines", MedicinePrescriptionViewSet, basename="prescription-medicines",
)

# Mounted at api/v1/doctor/ in root urls.py
#
# GET  /api/v1/doctor/dashboard/
# GET  /api/v1/doctor/patients/<patient_id>/history/
# GET  /api/v1/doctor/completed-prescriptions/        ← NEW (used by pharmacy billing)
#
# GET/POST   /api/v1/doctor/consultations/
# GET/POST   /api/v1/doctor/consultations/?patient=<id>
# GET/PATCH  /api/v1/doctor/consultations/<id>/
# POST       /api/v1/doctor/consultations/<id>/complete/
#
# GET/POST   /api/v1/doctor/consultations/<c_pk>/prescription/
# GET/PATCH  /api/v1/doctor/consultations/<c_pk>/prescription/<id>/
# GET        /api/v1/doctor/consultations/<c_pk>/rx-pdf/
# GET        /api/v1/doctor/consultations/<c_pk>/rx-download/
#
# GET/POST   /api/v1/doctor/consultations/<c_pk>/prescription/<p_pk>/medicines/

urlpatterns = [
    path("", include(router.urls)),
    path("", include(consultation_router.urls)),
    path("", include(prescription_router.urls)),

    # Dashboard stats
    path("dashboard/",
         DoctorDashboardView.as_view(), name="doctor-dashboard"),

    # Patient history
    path("patients/<int:patient_id>/history/",
         PatientHistoryView.as_view(), name="patient-history"),

    # Prescription PDF (print inline)
    path("consultations/<int:consultation_pk>/rx-pdf/",
         PrescriptionPDFView.as_view(), name="prescription-pdf"),

    # Prescription PDF (download attachment)
    path("consultations/<int:consultation_pk>/rx-download/",
         PrescriptionDownloadView.as_view(), name="prescription-download"),

    # Completed prescriptions — used by pharmacy to determine bill readiness
    # Returns prescriptions where ALL in-clinic medicines are dispensed
    path("completed-prescriptions/",
         CompletedPrescriptionsView.as_view(), name="completed-prescriptions"),
]