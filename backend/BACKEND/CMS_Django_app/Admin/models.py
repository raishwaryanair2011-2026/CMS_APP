from django.db import models, transaction
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator, RegexValidator
from django.core.exceptions import ValidationError
from django.db.models import Q
from datetime import date


# =========================================================
# BASE MODEL (Abstract)
# =========================================================

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


# =========================================================
# GENDER CHOICES
# =========================================================

class GenderChoices(models.TextChoices):
    MALE   = "MALE",   "Male"
    FEMALE = "FEMALE", "Female"
    OTHER  = "OTHER",  "Other"


# =========================================================
# STAFF
# =========================================================

class Staff(BaseModel):

    staff_id = models.AutoField(primary_key=True)

    staff_code = models.CharField(max_length=20, unique=True, blank=True)

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="staff_profile"
    )

    gender = models.CharField(max_length=10, choices=GenderChoices.choices)

    date_of_birth = models.DateField()

    phone = models.CharField(
        max_length=15,
        unique=True,
        validators=[
            RegexValidator(
                # FIX #11: 10-digit number starting with 6,7,8,9 — no +91 prefix required
                regex=r"^[6-9]\d{9}$",
                message="Enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9."
            )
        ]
    )

    address = models.TextField()

    # FIX #3: blank=True — qualification is only required for Doctor role,
    # enforced at the serializer level, not the model level
    qualification = models.TextField(blank=True, default='')

    salary = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(1000000)]
    )

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "staff"
        ordering = ["-created_at"]

    def clean(self):
        today = date.today()

        if self.date_of_birth >= today:
            raise ValidationError("Date of birth must be in the past.")

        age = today.year - self.date_of_birth.year - (
            (today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day)
        )

        if age < 21 or age > 60:
            raise ValidationError("Staff age must be between 21 and 60.")

        if not self.address or len(self.address.strip()) < 5:
            raise ValidationError("Address must contain at least 5 characters.")

        # FIX #3: Qualification validation removed from model — only the serializer
        # enforces it, and only when the role is Doctor. Non-Doctor staff (Receptionist,
        # Admin, Pharmacist) are allowed to have a blank qualification.
        # If qualification is provided, just strip whitespace.
        if self.qualification:
            self.qualification = self.qualification.strip()

        if self.user_id and not self.is_active and self.user.is_active:
            raise ValidationError("Inactive staff cannot have active login.")

        self.address = self.address.strip()

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        self.full_clean()
        super().save(*args, **kwargs)

        if is_new and not self.staff_code:
            self.staff_code = f"ST{str(self.staff_id).zfill(3)}"
            super().save(update_fields=["staff_code"])

    def delete(self, *args, **kwargs):
        """
        Soft-delete cascade when a staff member is deleted:
        1. Cancel all future BOOKED appointments
        2. Soft-delete all doctor schedules
        3. Soft-delete the doctor profile
        4. Deactivate the Django User (cannot log in)
        5. Soft-delete the staff record itself
        """
        with transaction.atomic():
            try:
                if hasattr(self, 'doctor_profile') and not self.doctor_profile.is_deleted:
                    # 1. Cancel all future BOOKED appointments
                    try:
                        from Receptionist.models import Appointment
                        from django.utils import timezone
                        Appointment.objects.filter(
                            schedule__doctor=self.doctor_profile,
                            appointment_date__gte=timezone.localdate(),
                            status='BOOKED',
                            is_deleted=False,
                        ).update(status='CANCELLED')
                    except Exception:
                        pass

                    # 2. Soft-delete all schedules
                    self.doctor_profile.schedules.filter(
                        is_deleted=False
                    ).update(is_deleted=True, is_active=False)

                    # 3. Soft-delete the doctor profile
                    DoctorProfile.objects.filter(
                        pk=self.doctor_profile.pk
                    ).update(is_deleted=True, is_active=False)

            except Exception:
                pass

            # 4. Deactivate the Django User so they cannot log in
            self.user.is_active = False
            self.user.save(update_fields=["is_active"])

            # 5. Soft-delete the staff record
            self.is_active  = False
            self.is_deleted = True
            self.save(update_fields=["is_active", "is_deleted", "updated_at"])

    def deactivate_system(self):
        """
        Deactivates staff without deleting — reversible with activate().
        Cascades to doctor profile and schedules.
        """
        with transaction.atomic():
            self.is_active      = False
            self.user.is_active = False
            self.user.save(update_fields=["is_active"])
            self.save(update_fields=["is_active", "updated_at"])

            try:
                if hasattr(self, 'doctor_profile') and not self.doctor_profile.is_deleted:
                    DoctorProfile.objects.filter(
                        pk=self.doctor_profile.pk
                    ).update(is_active=False)

                    self.doctor_profile.schedules.filter(
                        is_deleted=False, is_active=True
                    ).update(is_active=False)
            except Exception:
                pass

    def activate(self):
        """
        Reactivates staff. Cascades to doctor profile and all their schedules.
        """
        with transaction.atomic():
            self.is_active      = True
            self.user.is_active = True
            self.user.save(update_fields=["is_active"])
            self.save(update_fields=["is_active", "updated_at"])

            try:
                if hasattr(self, 'doctor_profile') and not self.doctor_profile.is_deleted:
                    DoctorProfile.objects.filter(
                        pk=self.doctor_profile.pk
                    ).update(is_active=True)

                    self.doctor_profile.schedules.filter(
                        is_deleted=False
                    ).update(is_active=True)
            except Exception:
                pass

    def __str__(self):
        return f"{self.staff_code} - {self.user.username}"


# =========================================================
# SPECIALIZATION
# =========================================================

class Specialization(BaseModel):

    specialization_id = models.AutoField(primary_key=True)

    name = models.CharField(
        max_length=150,
        unique=True,
        validators=[
            RegexValidator(
                regex=r"^[A-Za-z\s]+$",
                message="Only letters allowed."
            )
        ]
    )

    class Meta:
        db_table = "specializations"
        ordering = ["name"]

    def clean(self):
        if not self.name or len(self.name.strip()) < 3:
            raise ValidationError("Specialization must contain at least 3 characters.")
        self.name = self.name.strip().title()

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# =========================================================
# DOCTOR PROFILE
# =========================================================

class DoctorProfile(BaseModel):

    doctor_profile_id = models.AutoField(primary_key=True)

    doctor_code = models.CharField(max_length=20, unique=True, blank=True)

    staff = models.OneToOneField(
        "Admin.Staff",
        on_delete=models.PROTECT,
        related_name="doctor_profile"
    )

    specialization = models.ForeignKey(
        "Admin.Specialization",
        on_delete=models.PROTECT,
        related_name="doctors"
    )

    consultation_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100000)]
    )

    max_patient_per_day = models.PositiveIntegerField(
        default=20,
        validators=[MinValueValidator(1), MaxValueValidator(50)]
    )

    profile_image = models.ImageField(
        upload_to='doctors/',
        null=True,
        blank=True,
    )

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "doctor_profiles"
        ordering = ["doctor_code"]

    def clean(self):
        errors = {}
        # Only validate staff status on CREATE — not on updates like deactivation cascade
        if not self.pk:
            if self.staff.is_deleted:
                errors["staff"] = "Cannot assign doctor to deleted staff."
            if not self.staff.is_active:
                errors["staff"] = "Staff member must be active to create a doctor profile."
        if errors:
            raise ValidationError(errors)

    def delete(self, *args, **kwargs):
        """
        Soft-delete cascade when a doctor profile is deleted:
        1. Cancel all future BOOKED appointments
        2. Soft-delete all associated schedules
        3. Soft-delete the doctor profile itself
        """
        with transaction.atomic():
            try:
                from Receptionist.models import Appointment
                from django.utils import timezone
                Appointment.objects.filter(
                    schedule__doctor=self,
                    appointment_date__gte=timezone.localdate(),
                    status='BOOKED',
                    is_deleted=False,
                ).update(status='CANCELLED')
            except Exception:
                pass

            self.schedules.filter(is_deleted=False).update(
                is_deleted=True, is_active=False
            )

            self.is_deleted = True
            self.is_active  = False
            self.save(update_fields=["is_deleted", "is_active", "updated_at"])

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        self.full_clean()
        super().save(*args, **kwargs)

        if is_new and not self.doctor_code:
            self.doctor_code = f"DR{str(self.doctor_profile_id).zfill(3)}"
            super().save(update_fields=["doctor_code"])

    def __str__(self):
        return f"{self.doctor_code} - {self.staff.user.get_full_name()}"


# =========================================================
# DOCTOR SCHEDULE
# =========================================================

class DayOfWeekChoices(models.TextChoices):
    MONDAY    = "MONDAY",    "Monday"
    TUESDAY   = "TUESDAY",   "Tuesday"
    WEDNESDAY = "WEDNESDAY", "Wednesday"
    THURSDAY  = "THURSDAY",  "Thursday"
    FRIDAY    = "FRIDAY",    "Friday"
    SATURDAY  = "SATURDAY",  "Saturday"
    SUNDAY    = "SUNDAY",    "Sunday"


class DoctorSchedule(BaseModel):

    schedule_id = models.AutoField(primary_key=True)

    doctor = models.ForeignKey(
        "Admin.DoctorProfile",
        on_delete=models.PROTECT,
        related_name="schedules"
    )

    day_of_week = models.CharField(max_length=10, choices=DayOfWeekChoices.choices)
    start_time  = models.TimeField()
    end_time    = models.TimeField()
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table = "doctor_schedule"
        ordering = ["doctor", "day_of_week", "start_time"]
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "day_of_week", "start_time", "end_time"],
                condition=Q(is_deleted=False),
                name="unique_active_schedule"
            )
        ]

    def clean(self):
        if self.doctor.is_deleted or not self.doctor.is_active:
            raise ValidationError("Doctor must be active.")
        if self.start_time >= self.end_time:
            raise ValidationError("Start time must be before end time.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.doctor.doctor_code} - {self.day_of_week}"