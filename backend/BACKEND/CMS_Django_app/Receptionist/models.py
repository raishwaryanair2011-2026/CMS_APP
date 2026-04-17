from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.utils import timezone

from Admin.models import DoctorSchedule

SLOT_DURATION_MINUTES = 20  # each patient gets a 20-minute slot


# =====================================================
# BASE MODEL
# =====================================================

class BaseModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    class Meta:
        abstract = True

    def delete(self, *args, **kwargs):
        if self.is_deleted:
            return
        self.is_deleted = True
        self.save(update_fields=["is_deleted", "updated_at"])


# =====================================================
# PATIENT
# =====================================================

class Patient(BaseModel):

    GENDER_CHOICES = (('M', 'Male'), ('F', 'Female'), ('O', 'Other'))

    BLOOD_GROUP_CHOICES = (
        ('A+', 'A+'), ('A-', 'A-'), ('B+', 'B+'), ('B-', 'B-'),
        ('AB+', 'AB+'), ('AB-', 'AB-'), ('O+', 'O+'), ('O-', 'O-'),
    )

    # FIX #11: 10-digit number starting with 6,7,8,9
    phone_validator = RegexValidator(
        regex=r'^[6-9]\d{9}$',
        message="Enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9."
    )

    patient_code = models.CharField(max_length=20, unique=True, editable=False)
    full_name    = models.CharField(max_length=100)
    dob          = models.DateField(null=True, blank=True)
    gender       = models.CharField(max_length=1, choices=GENDER_CHOICES)
    # FIX #7: phone is NOT unique — family members can share a number
    phone        = models.CharField(max_length=15, validators=[phone_validator])
    address      = models.TextField(blank=True)
    blood_group  = models.CharField(max_length=3, null=True, blank=True, choices=BLOOD_GROUP_CHOICES)
    is_active    = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def generate_patient_code(self):
        with transaction.atomic():
            year = timezone.now().year
            last = (
                Patient.objects.select_for_update()
                .filter(patient_code__startswith=f"PAT-{year}")
                .order_by("-id").first()
            )
            number = int(last.patient_code.split("-")[-1]) + 1 if last else 1
            return f"PAT-{year}-{str(number).zfill(4)}"

    def clean(self):
        errors = {}
        if self.dob:
            today = timezone.now().date()
            if self.dob > today:
                errors["dob"] = "Date of birth cannot be in the future."
            if (today - self.dob).days / 365.25 > 120:
                errors["dob"] = "Invalid age."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if not self.patient_code:
                self.patient_code = self.generate_patient_code()
            self.full_clean()
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.patient_code} - {self.full_name}"


# =====================================================
# TOKEN COUNTER  (tracks next token per schedule+date)
# =====================================================

class TokenCounter(models.Model):
    schedule         = models.ForeignKey(DoctorSchedule, on_delete=models.CASCADE)
    appointment_date = models.DateField()
    last_token       = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "appointment_date"],
                name="unique_token_per_schedule_day"
            )
        ]

    def __str__(self):
        return f"{self.schedule} | {self.appointment_date} | last={self.last_token}"


# =====================================================
# APPOINTMENT
# =====================================================

class Appointment(BaseModel):

    STATUS_CHOICES = (
        ('BOOKED', 'Booked'), ('IN_PROGRESS', 'In Progress'),
        ('CANCELLED', 'Cancelled'), ('COMPLETED', 'Completed'),
    )

    appointment_code = models.CharField(max_length=30, unique=True, editable=False)
    appointment_date = models.DateField()
    token_no         = models.PositiveIntegerField(editable=False)

    # NEW: specific time slot assigned to this patient within the schedule block
    slot_time = models.TimeField(
        null=True, blank=True,
        help_text="The specific 20-minute slot start time assigned to this patient."
    )

    patient  = models.ForeignKey(Patient,        on_delete=models.PROTECT, related_name="appointments")
    schedule = models.ForeignKey(DoctorSchedule, on_delete=models.PROTECT, related_name="appointments")
    status   = models.CharField(max_length=15, choices=STATUS_CHOICES, default='BOOKED')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "appointment_date", "token_no"],
                name="unique_token_per_schedule"
            ),
            # Prevent double-booking the same time slot
            models.UniqueConstraint(
                fields=["schedule", "appointment_date", "slot_time"],
                name="unique_slot_per_schedule_date",
                condition=models.Q(is_deleted=False, slot_time__isnull=False)
            ),
        ]

    def clean(self):
        errors = {}
        now   = timezone.now()
        today = now.date()

        if self.appointment_date < today:
            errors["appointment_date"] = "Cannot book appointment for a past date."

        # FIX #4: block same-day bookings where the slot has already passed
        if self.appointment_date == today and self.slot_time:
            current_time = now.astimezone(timezone.get_current_timezone()).time()
            if self.slot_time <= current_time:
                errors["slot_time"] = (
                    f"The selected time slot ({self.slot_time.strftime('%I:%M %p')}) "
                    f"has already passed for today."
                )

        if not self.patient.is_active:
            errors["patient"] = "Inactive patient cannot book an appointment."

        day_map = {
            0: "MONDAY", 1: "TUESDAY", 2: "WEDNESDAY", 3: "THURSDAY",
            4: "FRIDAY", 5: "SATURDAY", 6: "SUNDAY",
        }
        if self.schedule.day_of_week != day_map[self.appointment_date.weekday()]:
            errors["appointment_date"] = (
                f"Appointment date ({self.appointment_date.strftime('%A')}) "
                f"does not match schedule day ({self.schedule.day_of_week.title()})."
            )

        if errors:
            raise ValidationError(errors)

    def generate_appointment_code(self):
        date_str    = self.appointment_date.strftime('%y%m%d')
        schedule_id = str(self.schedule_id).zfill(3)
        return f"APT-{date_str}-{schedule_id}-{str(self.token_no).zfill(2)}"

    def save(self, *args, **kwargs):
        if not self.pk:
            self.full_clean()
            with transaction.atomic():
                counter, _ = TokenCounter.objects.select_for_update().get_or_create(
                    schedule=self.schedule,
                    appointment_date=self.appointment_date,
                )
                limit = self.schedule.doctor.max_patient_per_day
                if counter.last_token >= limit:
                    raise ValidationError(f"Token limit ({limit}) reached for this schedule.")
                counter.last_token += 1
                counter.save()
                self.token_no         = counter.last_token
                self.appointment_code = self.generate_appointment_code()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.appointment_code} | Token {self.token_no} | {self.slot_time}"


# =====================================================
# BILLING
# =====================================================

class Billing(BaseModel):

    PAYMENT_STATUS_CHOICES = (('PENDING', 'Pending'), ('SUCCESS', 'Success'))

    bill_no = models.CharField(max_length=20, unique=True, editable=False, null=True, blank=True, db_index=True)
    appointment    = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name='billing')
    patient        = models.ForeignKey(Patient,        on_delete=models.PROTECT, related_name='billings')
    total_amount   = models.DecimalField(max_digits=10, decimal_places=2)
    paid_amount    = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS_CHOICES, default='PENDING')

    @classmethod
    def generate_bill_no(cls):
        year = timezone.now().year
        last = (
            cls.objects.select_for_update()
            .filter(bill_no__startswith=f"BILL-{year}-")
            .order_by("-id").first()
        )
        number = int(last.bill_no.split("-")[-1]) + 1 if (last and last.bill_no) else 1
        return f"BILL-{year}-{str(number).zfill(4)}"

    def clean(self):
        errors = {}
        if self.total_amount <= 0:
            errors["total_amount"] = "Total amount must be greater than zero."
        if self.paid_amount < 0:
            errors["paid_amount"] = "Paid amount cannot be negative."
        if self.payment_status == 'SUCCESS' and self.paid_amount != self.total_amount:
            errors["paid_amount"] = "Full amount must be paid before marking as SUCCESS."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                current = Billing.objects.get(pk=self.pk)
                if current.payment_status == 'SUCCESS':
                    raise ValidationError("A paid bill cannot be modified.")
            except Billing.DoesNotExist:
                pass
        with transaction.atomic():
            if not self.bill_no:
                self.bill_no = Billing.generate_bill_no()
            self.full_clean()
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.bill_no} | {self.appointment.appointment_code}"


# =====================================================
# CONSULTATION BILL ITEM
# =====================================================

class ConsultationBillItem(BaseModel):
    billing = models.OneToOneField(Billing, on_delete=models.CASCADE, related_name='consultation_item')
    fee     = models.DecimalField(max_digits=10, decimal_places=2)

    def clean(self):
        if self.fee <= 0:
            raise ValidationError({"fee": "Consultation fee must be greater than zero."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Consultation Fee - {self.fee}"