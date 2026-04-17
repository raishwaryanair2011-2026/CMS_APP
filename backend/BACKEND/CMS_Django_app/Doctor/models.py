from django.db import models, transaction
from django.core.exceptions import ValidationError

from Receptionist.models import Appointment
from Pharmacist.models import Medicine


# =====================================================
# SOFT DELETE MANAGER
# =====================================================

class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


# =====================================================
# BASE MODEL
# =====================================================

class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    objects     = SoftDeleteManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True

    def delete(self, *args, **kwargs):
        if self.is_deleted:
            return
        self.is_deleted = True
        self.save(update_fields=["is_deleted", "updated_at"])


# =====================================================
# CONSULTATION
# =====================================================

class Consultation(TimeStampedModel):

    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name="consultation"
    )

    symptoms  = models.TextField()
    diagnosis = models.TextField()
    notes     = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["appointment"])]

    def clean(self):
        errors = {}

        try:
            appointment = self.appointment
        except Exception:
            errors["appointment"] = "Appointment linkage is required."
        else:
            if appointment.status == "CANCELLED":
                errors["appointment"] = (
                    "Cannot create a consultation for a cancelled appointment."
                )

        if not self.symptoms or not self.symptoms.strip():
            errors["symptoms"] = "Symptoms cannot be empty."

        if not self.diagnosis or not self.diagnosis.strip():
            errors["diagnosis"] = "Diagnosis cannot be empty."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        with transaction.atomic():
            super().save(*args, **kwargs)
            appointment = self.appointment
            if appointment.status == 'BOOKED':
                appointment.status = 'IN_PROGRESS'
                appointment.save(update_fields=['status', 'updated_at'])

    def __str__(self):
        return f"Consultation for {self.appointment.appointment_code}"


# =====================================================
# PRESCRIPTION
# =====================================================

class Prescription(TimeStampedModel):

    consultation = models.OneToOneField(
        Consultation,
        on_delete=models.CASCADE,
        related_name="prescription"
    )

    class Meta:
        indexes = [models.Index(fields=["consultation"])]

    def clean(self):
        try:
            _ = self.consultation
        except Exception:
            raise ValidationError({"consultation": "Consultation linkage is required."})

    def save(self, *args, **kwargs):
        self.full_clean()
        with transaction.atomic():
            super().save(*args, **kwargs)

    def __str__(self):
        return f"Prescription #{self.id} for {self.consultation}"


# =====================================================
# MEDICINE PRESCRIPTION
# =====================================================

# FIX #9: Frequency choices in N-N-N format
FREQUENCY_CHOICES = [
    ('1-0-0', '1-0-0  (Morning only)'),
    ('0-1-0', '0-1-0  (Afternoon only)'),
    ('0-0-1', '0-0-1  (Night only)'),
    ('1-0-1', '1-0-1  (Morning & Night)'),
    ('1-1-0', '1-1-0  (Morning & Afternoon)'),
    ('0-1-1', '0-1-1  (Afternoon & Night)'),
    ('1-1-1', '1-1-1  (Three times a day)'),
    ('1-1-1-1', '1-1-1-1  (Four times a day)'),
    ('0-0-0-1', '0-0-0-1  (Bedtime only)'),
    ('SOS',   'SOS  (As needed)'),
]


class MedicinePrescription(TimeStampedModel):

    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        related_name="medicines"
    )

    medicine = models.ForeignKey(
        Medicine,
        on_delete=models.PROTECT
    )

    dosage    = models.CharField(max_length=50)

    # FIX #9: Frequency stored as N-N-N pattern; CharField to allow custom entries too
    frequency = models.CharField(max_length=20)

    duration     = models.CharField(max_length=50)
    quantity     = models.PositiveIntegerField()
    is_dispensed = models.BooleanField(default=False)

    # FIX #8: Flag set when medicine stock is below reorder level at prescription time
    is_low_stock         = models.BooleanField(default=False)
    buy_outside_clinic   = models.BooleanField(
        default=False,
        help_text="Doctor has indicated patient should purchase this medicine outside the clinic."
    )

    class Meta:
        unique_together = ["prescription", "medicine"]
        indexes = [
            models.Index(fields=["prescription"]),
            models.Index(fields=["medicine"]),
        ]

    def clean(self):
        errors = {}

        try:
            _ = self.prescription
        except Exception:
            errors["prescription"] = "Prescription linkage is required."

        try:
            medicine = self.medicine
            if not medicine.is_active:
                errors["medicine"] = "Inactive medicine cannot be prescribed."
        except Exception:
            errors["medicine"] = "Medicine selection is required."

        if not self.dosage or not self.dosage.strip():
            errors["dosage"] = "Dosage is required."

        if not self.frequency or not self.frequency.strip():
            errors["frequency"] = "Frequency is required."

        if not self.duration or not self.duration.strip():
            errors["duration"] = "Duration is required."

        if self.quantity is None:
            errors["quantity"] = "Quantity is required."
        elif self.quantity <= 0:
            errors["quantity"] = "Quantity must be greater than zero."

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # FIX #8: Auto-flag low stock at save time
        try:
            if self.medicine.needs_reorder:
                self.is_low_stock = True
        except Exception:
            pass
        self.full_clean()
        with transaction.atomic():
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.medicine.name} - {self.dosage}"