from rest_framework import serializers
from django.contrib.auth.models import User, Group
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from datetime import date
import re

from .models import Staff, Specialization, DoctorProfile, DoctorSchedule

ALLOWED_ROLES = ["Admin", "Doctor", "Pharmacist", "Receptionist"]

# FIX #9: Frequency pattern validator — must match N-N-N format (e.g. 1-0-1)
FREQUENCY_PATTERN = re.compile(r'^\d-\d-\d$')


def validate_no_keyboard_smash(value, field_name="This field"):
    """
    FIX #2: Reject obvious keyboard-smash strings.
    Rules: if length > 3 and all chars identical, or length >= 5 with no vowels.
    """
    stripped = re.sub(r'\s+', '', value).lower()
    if len(stripped) > 3 and len(set(stripped)) == 1:
        raise serializers.ValidationError(
            f"{field_name} appears to be invalid (repeated characters)."
        )
    if len(stripped) >= 5 and not re.search(r'[aeiou]', stripped) and re.match(r'^[a-z]+$', stripped):
        raise serializers.ValidationError(
            f"{field_name} appears to be invalid (no vowels)."
        )


# =========================================================
# USER SERIALIZER
# =========================================================

class UserSerializer(serializers.ModelSerializer):

    class Meta:
        model  = User
        fields = ["id", "username", "first_name", "last_name", "email", "password"]
        extra_kwargs = {
            "password":   {"write_only": True, "required": False},
            "email":      {"required": True,  "allow_blank": False, "validators": []},
            "username":   {"required": True,  "allow_blank": False, "validators": []},
            "first_name": {"required": True,  "allow_blank": False},
            "last_name":  {"required": False, "allow_blank": True},
        }

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Username cannot be blank.")
        if len(value) < 3:
            raise serializers.ValidationError("Username must be at least 3 characters.")
        if len(value) > 50:
            raise serializers.ValidationError("Username cannot exceed 50 characters.")
        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise serializers.ValidationError(
                "Username can only contain letters, numbers, and underscores."
            )
        return value

    def validate_first_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("First name cannot be blank.")
        if len(value) < 2:
            raise serializers.ValidationError("First name must be at least 2 characters.")
        if len(value) > 50:
            raise serializers.ValidationError("First name cannot exceed 50 characters.")
        if not re.match(r'^[A-Za-z\s]+$', value):
            raise serializers.ValidationError("First name can only contain letters.")
        validate_no_keyboard_smash(value, "First name")
        return value.title()

    def validate_last_name(self, value):
        # Last name is optional — a person may have no last name
        if not value or not value.strip():
            return ""
        value = value.strip()
        if len(value) > 50:
            raise serializers.ValidationError("Last name cannot exceed 50 characters.")
        if not re.match(r'^[A-Za-z\s]+$', value):
            raise serializers.ValidationError("Last name can only contain letters.")
        validate_no_keyboard_smash(value, "Last name")
        return value.title()

    def validate_email(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Email cannot be blank.")
        if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', value):
            raise serializers.ValidationError("Enter a valid email address.")
        return value.lower()

    def validate_password(self, value):
        if not value:
            return value
        if len(value) < 6:
            raise serializers.ValidationError("Password must be at least 6 characters.")
        if len(value) > 128:
            raise serializers.ValidationError("Password cannot exceed 128 characters.")
        if value.isdigit():
            raise serializers.ValidationError("Password cannot be entirely numeric.")
        if value.isalpha():
            raise serializers.ValidationError(
                "Password must contain at least one number or special character."
            )
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


# =========================================================
# STAFF SERIALIZER
# =========================================================

class StaffSerializer(serializers.ModelSerializer):

    user       = UserSerializer()
    staff_code = serializers.CharField(read_only=True)

    role = serializers.SerializerMethodField()
    set_role = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    def get_role(self, obj):
        group = obj.user.groups.filter(name__in=ALLOWED_ROLES).first()
        return group.name if group else None

    class Meta:
        model  = Staff
        fields = [
            "staff_id", "staff_code", "user",
            "gender", "date_of_birth", "phone",
            "address", "qualification", "salary",
            "is_active", "role", "set_role",
        ]
        read_only_fields = ["staff_id", "staff_code"]

    def validate_gender(self, value):
        allowed = [choice[0] for choice in Staff._meta.get_field('gender').choices]
        if not value:
            raise serializers.ValidationError("Gender is required.")
        if value not in allowed:
            raise serializers.ValidationError(
                f"Invalid gender. Must be one of: {', '.join(allowed)}."
            )
        return value

    def validate_date_of_birth(self, value):
        if not value:
            raise serializers.ValidationError("Date of birth is required.")
        today = date.today()
        if value >= today:
            raise serializers.ValidationError("Date of birth must be in the past.")
        age = today.year - value.year - (
            (today.month, today.day) < (value.month, value.day)
        )
        if age < 21:
            raise serializers.ValidationError("Staff must be at least 21 years old.")
        if age > 60:
            raise serializers.ValidationError("Staff cannot be older than 60 years.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Phone number is required.")
        # FIX #11: Accept 10-digit numbers starting with 6,7,8,9 (no +91 required)
        if not re.match(r'^[6-9]\d{9}$', value):
            raise serializers.ValidationError(
                "Enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9."
            )
        qs = Staff.objects.filter(phone=value, is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This phone number is already registered.")
        return value

    def validate_address(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Address is required.")
        if len(value) < 5:
            raise serializers.ValidationError("Address must be at least 5 characters.")
        if len(value) > 500:
            raise serializers.ValidationError("Address cannot exceed 500 characters.")
        validate_no_keyboard_smash(value, "Address")
        return value

    def validate_qualification(self, value):
        """
        FIX #3: Qualification is a list of strings stored as newline-separated text.
        Only validated when role is Doctor — blank is always allowed here
        because the cross-field validate() enforces Doctor-only requirement.
        """
        # Always allow blank — the cross-field validate() enforces
        # the "required for Doctor" rule, not this method
        if not value or not value.strip():
            return value

        # value arrives as a string from the frontend (newline-separated entries)
        entries = [e.strip() for e in value.split('\n') if e.strip()]
        if not entries:
            return value

        for entry in entries:
            if len(entry) < 3:
                raise serializers.ValidationError(
                    f"Each qualification must be at least 3 characters (got: '{entry}')."
                )
            if len(entry) > 255:
                raise serializers.ValidationError(
                    f"Each qualification cannot exceed 255 characters."
                )
            if entry.isdigit():
                raise serializers.ValidationError(
                    f"Qualification cannot be numeric only (got: '{entry}')."
                )
            validate_no_keyboard_smash(entry, "Qualification")

        return '\n'.join(entries)

    def validate_salary(self, value):
        if value is None:
            raise serializers.ValidationError("Salary is required.")
        if value < 0:
            raise serializers.ValidationError("Salary cannot be negative.")
        if value == 0:
            raise serializers.ValidationError("Salary must be greater than zero.")
        if value > 1000000:
            raise serializers.ValidationError("Salary cannot exceed 10,00,000.")
        return value

    def validate_set_role(self, value):
        if value and value not in ALLOWED_ROLES:
            raise serializers.ValidationError(
                f"Invalid role. Must be one of: {', '.join(ALLOWED_ROLES)}."
            )
        return value

    def validate(self, data):
        """
        Cross-field: username/email uniqueness + qualification required for Doctor role.
        """
        user_data = data.get("user", {})
        username  = user_data.get("username", "")
        email     = user_data.get("email", "")
        role      = data.get("set_role", "")
        qualification = data.get("qualification", "")

        current_user = self.instance.user if self.instance else None

        if username:
            qs = User.objects.filter(username=username)
            if current_user:
                qs = qs.exclude(pk=current_user.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"user": {"username": ["Username already exists."]}}
                )

        if email:
            qs = User.objects.filter(email=email.lower())
            if current_user:
                qs = qs.exclude(pk=current_user.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"user": {"email": ["Email already exists."]}}
                )

        # FIX #3: Qualification is required only when role is Doctor
        if role == "Doctor" and not qualification:
            raise serializers.ValidationError(
                {"qualification": ["Qualification is required for Doctor role."]}
            )

        return data

    def _assign_role(self, user, role):
        if not role:
            return
        user.groups.remove(*Group.objects.filter(name__in=ALLOWED_ROLES))
        try:
            group = Group.objects.get(name=role)
            user.groups.add(group)
        except Group.DoesNotExist:
            pass

    def create(self, validated_data):
        user_data = validated_data.pop("user")
        role      = validated_data.pop("set_role", "")

        if not user_data.get("password"):
            raise serializers.ValidationError({"user": {"password": ["Password is required."]}})

        try:
            with transaction.atomic():
                user  = User.objects.create_user(**user_data)
                staff = Staff.objects.create(user=user, **validated_data)
                self._assign_role(user, role)
                return staff
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        role      = validated_data.pop("set_role", "")

        try:
            with transaction.atomic():
                user = instance.user
                for attr, value in user_data.items():
                    if attr == "password":
                        if value:
                            user.set_password(value)
                    else:
                        setattr(user, attr, value)
                user.save()

                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()

                if role:
                    self._assign_role(user, role)

                return instance
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )


# =========================================================
# SPECIALIZATION SERIALIZER
# =========================================================

class SpecializationSerializer(serializers.ModelSerializer):

    class Meta:
        model  = Specialization
        fields = "__all__"
        read_only_fields = ["specialization_id"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Specialization name cannot be blank.")
        if len(value) < 3:
            raise serializers.ValidationError(
                "Specialization name must be at least 3 characters."
            )
        if len(value) > 150:
            raise serializers.ValidationError(
                "Specialization name cannot exceed 150 characters."
            )
        if not re.match(r'^[A-Za-z\s]+$', value):
            raise serializers.ValidationError(
                "Specialization name can only contain letters and spaces."
            )
        validate_no_keyboard_smash(value, "Specialization name")
        qs = Specialization.objects.filter(name__iexact=value, is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This specialization already exists.")
        return value.title()


# =========================================================
# DOCTOR PROFILE SERIALIZER
# =========================================================

class DoctorProfileSerializer(serializers.ModelSerializer):

    staff         = serializers.PrimaryKeyRelatedField(
        queryset=Staff.objects.filter(is_deleted=False, is_active=True)
    )
    staff_details = StaffSerializer(source="staff", read_only=True)

    class Meta:
        model  = DoctorProfile
        fields = [
            "doctor_profile_id", "doctor_code",
            "staff", "staff_details",
            "specialization", "consultation_fee",
            "max_patient_per_day", "profile_image", "is_active",
        ]
        read_only_fields = ["doctor_profile_id", "doctor_code"]

    def validate_staff(self, value):
        if not value:
            raise serializers.ValidationError("Staff selection is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Cannot assign a deleted staff member.")
        if not value.is_active:
            raise serializers.ValidationError("Staff member must be active.")
        return value

    def validate_specialization(self, value):
        if not value:
            raise serializers.ValidationError("Specialization is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected specialization has been deleted.")
        return value

    def validate_consultation_fee(self, value):
        if value is None:
            raise serializers.ValidationError("Consultation fee is required.")
        if value < 0:
            raise serializers.ValidationError("Consultation fee cannot be negative.")
        if value == 0:
            raise serializers.ValidationError("Consultation fee must be greater than zero.")
        if value > 100000:
            raise serializers.ValidationError("Consultation fee cannot exceed 1,00,000.")
        return value

    def validate_max_patient_per_day(self, value):
        if value is None:
            raise serializers.ValidationError("Max patients per day is required.")
        if value < 1:
            raise serializers.ValidationError("Max patients per day must be at least 1.")
        if value > 50:
            raise serializers.ValidationError("Max patients per day cannot exceed 50.")
        return value

    def validate(self, data):
        staff = data.get("staff")
        if staff:
            if not staff.user.groups.filter(name="Doctor").exists():
                raise serializers.ValidationError(
                    {"staff": "This staff member does not have the Doctor role assigned."}
                )
        qs = DoctorProfile.objects.filter(staff=staff, is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {"staff": "This staff member already has a doctor profile."}
            )
        return data


# =========================================================
# DOCTOR SCHEDULE SERIALIZER
# =========================================================

class DoctorScheduleSerializer(serializers.ModelSerializer):

    class Meta:
        model  = DoctorSchedule
        fields = [
            "schedule_id", "doctor", "day_of_week",
            "start_time", "end_time", "is_active",
        ]
        read_only_fields = ["schedule_id"]

    def validate_doctor(self, value):
        if not value:
            raise serializers.ValidationError("Doctor selection is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected doctor profile has been deleted.")
        if not value.is_active:
            raise serializers.ValidationError("Doctor must be active.")
        return value

    def validate_day_of_week(self, value):
        if not value:
            raise serializers.ValidationError("Day of week is required.")
        allowed = [choice[0] for choice in DoctorSchedule._meta.get_field('day_of_week').choices]
        if value not in allowed:
            raise serializers.ValidationError(
                f"Invalid day. Must be one of: {', '.join(allowed)}."
            )
        return value

    def validate_start_time(self, value):
        if not value:
            raise serializers.ValidationError("Start time is required.")
        return value

    def validate_end_time(self, value):
        if not value:
            raise serializers.ValidationError("End time is required.")
        return value

    def validate(self, data):
        doctor     = data.get("doctor")
        start_time = data.get("start_time")
        end_time   = data.get("end_time")
        day        = data.get("day_of_week")

        if start_time and end_time:
            if start_time >= end_time:
                raise serializers.ValidationError(
                    {"end_time": "End time must be after start time."}
                )
            from datetime import datetime
            start_dt = datetime.combine(date.today(), start_time)
            end_dt   = datetime.combine(date.today(), end_time)
            duration = (end_dt - start_dt).seconds / 3600
            if duration < 1:
                raise serializers.ValidationError(
                    {"end_time": "Schedule duration must be at least 1 hour."}
                )
            if duration > 12:
                raise serializers.ValidationError(
                    {"end_time": "Schedule duration cannot exceed 12 hours."}
                )

        if doctor and day and start_time and end_time:
            qs = DoctorSchedule.objects.filter(
                doctor=doctor,
                day_of_week=day,
                start_time__lt=end_time,
                end_time__gt=start_time,
                is_deleted=False,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "This schedule overlaps with an existing schedule for this doctor."
                )

        return data