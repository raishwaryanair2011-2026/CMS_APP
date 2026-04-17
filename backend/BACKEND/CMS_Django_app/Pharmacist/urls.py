from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MedicineCategoryViewSet,
    MedicineViewSet,
    MedicineBatchViewSet,
    MedicinePrescriptionViewSet,
    MedicineDispenseViewSet,
    PharmacyBillItemViewSet,
    PharmacistDashboardView,
    PharmacyBillPDFView,
    PharmacyBillDownloadView,
)

router = DefaultRouter()
router.register(r'categories',     MedicineCategoryViewSet,    basename='category')
router.register(r'medicines',      MedicineViewSet,            basename='medicine')
router.register(r'batches',        MedicineBatchViewSet,       basename='batch')
router.register(r'prescriptions',  MedicinePrescriptionViewSet, basename='prescription')
router.register(r'dispense',       MedicineDispenseViewSet,    basename='dispense')
router.register(r'bill-items',     PharmacyBillItemViewSet,    basename='bill-item')

# Mounted at api/v1/pharmacy/ in root urls.py
# Full route list:
#
# CATEGORIES
#   GET/POST              /api/v1/pharmacy/categories/
#   GET/PUT/PATCH/DELETE  /api/v1/pharmacy/categories/<id>/
#
# MEDICINES
#   GET/POST              /api/v1/pharmacy/medicines/
#   GET/PUT/PATCH/DELETE  /api/v1/pharmacy/medicines/<id>/
#   GET                   /api/v1/pharmacy/medicines/?category=<id>
#   GET                   /api/v1/pharmacy/medicines/?is_active=true
#   GET                   /api/v1/pharmacy/medicines/?needs_reorder=true
#
# BATCHES
#   GET/POST              /api/v1/pharmacy/batches/
#   GET/PUT/PATCH/DELETE  /api/v1/pharmacy/batches/<id>/
#   GET                   /api/v1/pharmacy/batches/?medicine=<id>
#   GET                   /api/v1/pharmacy/batches/?expiring_soon=true
#
# PRESCRIPTIONS (read-only)
#   GET                   /api/v1/pharmacy/prescriptions/
#   GET                   /api/v1/pharmacy/prescriptions/<id>/
#   GET                   /api/v1/pharmacy/prescriptions/pending/
#   GET                   /api/v1/pharmacy/prescriptions/?patient=<name>
#
# DISPENSE
#   POST                  /api/v1/pharmacy/dispense/
#   GET                   /api/v1/pharmacy/dispense/
#   GET                   /api/v1/pharmacy/dispense/<id>/
#   PUT/PATCH/DELETE      DISABLED — dispense records are immutable
#
# BILL ITEMS
#   GET/POST              /api/v1/pharmacy/bill-items/
#   PATCH                 /api/v1/pharmacy/bill-items/<id>/  (unit_price only)
#   DELETE                /api/v1/pharmacy/bill-items/<id>/
#   GET                   /api/v1/pharmacy/bill-items/?billing=<id>
#
# DASHBOARD
#   GET                   /api/v1/pharmacy/dashboard/

urlpatterns = [
    *router.urls,
    path('dashboard/', PharmacistDashboardView.as_view(), name='pharmacist-dashboard'),

    # Pharmacy bill PDF
    # GET /api/v1/pharmacy/prescriptions/<id>/bill-pdf/       → inline print
    # GET /api/v1/pharmacy/prescriptions/<id>/bill-download/  → file download
    path('prescriptions/<int:prescription_id>/bill-pdf/',
         PharmacyBillPDFView.as_view(), name='pharmacy-bill-pdf'),
    path('prescriptions/<int:prescription_id>/bill-download/',
         PharmacyBillDownloadView.as_view(), name='pharmacy-bill-download'),
]