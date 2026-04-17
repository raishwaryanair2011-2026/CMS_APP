from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from datetime import datetime, timedelta
import re

from .models import Patient, Appointment, Billing, ConsultationBillItem, SLOT_DURATION_MINUTES
from Admin.models import DoctorSchedule
from Admin.serializers import DoctorScheduleSerializer

WEEKDAY_MAP = {
    0: "MONDAY", 1: "TUESDAY", 2: "WEDNESDAY",
    3: "THURSDAY", 4: "FRIDAY", 5: "SATURDAY", 6: "SUNDAY",
}


def generate_slots(schedule, date_str):
    """
    Generate all 20-minute slots for a given schedule on a given date.
    Returns a list of dicts: {slot_time, token_no, is_booked, is_past}
    """
    from .models import Appointment as Apt
    start = datetime.combine(datetime.today(), schedule.start_time)
    end   = datetime.combine(datetime.today(), schedule.end_time)

    # All possible slot start times
    slots = []
    current = start
    token   = 1
    while current + timedelta(minutes=SLOT_DURATION_MINUTES) <= end:
        slots.append(current.time())
        current += timedelta(minutes=SLOT_DURATION_MINUTES)
        token   += 1

    # Fetch already-booked slots for this schedule+date
    booked_times = set(
        Apt.objects.filter(
            schedule=schedule,
            appointment_date=date_str,
            is_deleted=False,
        ).exclude(status='CANCELLED').values_list('slot_time', flat=True)
    )

    now          = timezone.now().astimezone(timezone.get_current_timezone()).time()
    today_str    = timezone.now().date().isoformat()
    is_today     = (date_str == today_str)

    result = []
    for i, slot_time in enumerate(slots):
        is_booked = slot_time in booked_times
        is_past   = is_today and slot_time <= now
        result.append({
            "token_no":  i + 1,
            "slot_time": slot_time.strftime("%H:%M"),
            "is_booked": is_booked,
            "is_past":   is_past,
            "available": not is_booked and not is_past,
        })
    return result


# =========================================================
# PATIENT SERIALIZER
# =========================================================

class PatientSerializer(serializers.ModelSerializer):
    age = serializers.SerializerMethodField()

    class Meta:
        model  = Patient
        fields = [
            'id', 'patient_code', 'full_name', 'dob', 'age',
            'gender', 'phone', 'address', 'blood_group', 'is_active', 'created_at',
        ]
        read_only_fields = ('patient_code', 'age', 'created_at')

    def get_age(self, obj):
        if not obj.dob:
            return None
        today = timezone.now().date()
        dob   = obj.dob
        delta_days = (today - dob).days

        # Newborn / infant: show days if under 31 days
        if delta_days < 31:
            return f"{delta_days} day{'s' if delta_days != 1 else ''}"

        # Baby: show months if under 24 months (2 years)
        months = (today.year - dob.year) * 12 + (today.month - dob.month)
        if today.day < dob.day:
            months -= 1
        if months < 24:
            return f"{months} month{'s' if months != 1 else ''}"

        # Child / adult: show years
        years = today.year - dob.year
        if (today.month, today.day) < (dob.month, dob.day):
            years -= 1
        return f"{years} year{'s' if years != 1 else ''}"

    def validate_blood_group(self, value):
        valid = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
        if value and value not in valid:
            raise serializers.ValidationError("Invalid blood group.")
        return value

    def validate_full_name(self, value):
        value = value.strip()
        if not value: raise serializers.ValidationError("Full name cannot be blank.")
        if len(value) < 2: raise serializers.ValidationError("Full name must be at least 2 characters.")
        if not re.match(r'^[A-Za-z\s]+$', value):
            raise serializers.ValidationError("Full name can only contain letters and spaces.")
        stripped = value.replace(" ", "").lower()
        if len(stripped) > 2 and len(set(stripped)) == 1:
            raise serializers.ValidationError("Full name appears to be invalid.")
        if len(stripped) >= 4 and not re.search(r'[aeiou]', stripped):
            raise serializers.ValidationError("Full name appears to be invalid (no vowels).")
        return value.title()

    def validate_dob(self, value):
        if value:
            today = timezone.now().date()
            if value > today: raise serializers.ValidationError("Date of birth cannot be in the future.")
            if (today - value).days / 365.25 > 120:
                raise serializers.ValidationError("Invalid date of birth.")
        return value

    def validate_gender(self, value):
        if value not in ['M', 'F', 'O']:
            raise serializers.ValidationError("Invalid gender.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not re.match(r'^[6-9]\d{9}$', value):
            raise serializers.ValidationError(
                "Enter a valid 10-digit Indian phone number starting with 6, 7, 8, or 9."
            )
        # FIX #7: no uniqueness check — family members may share a number
        return value

    def validate_address(self, value):
        if value and len(value.strip()) > 500:
            raise serializers.ValidationError("Address cannot exceed 500 characters.")
        return value

    def create(self, validated_data):
        try:
            with transaction.atomic():
                return Patient.objects.create(**validated_data)
        except DjangoValidationError as e:
            raise DRFValidationError(e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages})

    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()
                return instance
        except DjangoValidationError as e:
            raise DRFValidationError(e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages})


# =========================================================
# BILLING SERIALIZER
# =========================================================

class BillingSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Billing
        fields = [
            'id', 'bill_no', 'appointment', 'patient',
            'total_amount', 'paid_amount', 'payment_status', 'created_at',
        ]
        read_only_fields = ('bill_no', 'payment_status', 'paid_amount', 'created_at', 'patient', 'appointment')


# =========================================================
# MARK BILLING PAID SERIALIZER
# =========================================================

class MarkBillingPaidSerializer(serializers.Serializer):
    paid_amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_paid_amount(self, value):
        if value <= 0: raise serializers.ValidationError("Paid amount must be greater than zero.")
        return value

    def validate(self, data):
        billing = self.instance
        if billing.payment_status == 'SUCCESS':
            raise serializers.ValidationError("This bill has already been paid.")
        if float(data['paid_amount']) != float(billing.total_amount):
            raise serializers.ValidationError(
                f"Full amount of Rs.{billing.total_amount} must be paid."
            )
        return data

    def update(self, instance, validated_data):
        instance.paid_amount    = validated_data['paid_amount']
        instance.payment_status = 'SUCCESS'
        instance.save()
        return instance


# =========================================================
# CONSULTATION BILL ITEM SERIALIZER
# =========================================================

class ConsultationBillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ConsultationBillItem
        fields = ['id', 'billing', 'fee']
        read_only_fields = ('billing',)

    def validate_fee(self, value):
        if value <= 0: raise serializers.ValidationError("Fee must be greater than zero.")
        return value


# =========================================================
# APPOINTMENT WITH BILLING SERIALIZER  (used for booking)
# =========================================================

class AppointmentWithBillingSerializer(serializers.Serializer):

    appointment_date = serializers.DateField()
    patient          = serializers.PrimaryKeyRelatedField(
        queryset=Patient.objects.filter(is_active=True, is_deleted=False)
    )
    schedule         = serializers.PrimaryKeyRelatedField(
        queryset=DoctorSchedule.objects.filter(is_deleted=False, is_active=True)
    )
    # NEW: specific 20-minute slot start time chosen by receptionist
    slot_time        = serializers.TimeField()

    def validate_appointment_date(self, value):
        today = timezone.now().date()
        if value < today:
            raise serializers.ValidationError("Cannot book an appointment for a past date.")
        from datetime import timedelta
        if value > today + timedelta(days=30):
            raise serializers.ValidationError("Appointments can only be booked up to 30 days in advance.")
        return value

    def validate_patient(self, value):
        if not value.is_active:
            raise serializers.ValidationError("This patient account is inactive.")
        return value

    def validate_schedule(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Selected schedule is not active.")
        if not value.doctor.is_active:
            raise serializers.ValidationError("The doctor for this schedule is not active.")
        return value

    def validate(self, data):
        schedule         = data.get('schedule')
        appointment_date = data.get('appointment_date')
        slot_time        = data.get('slot_time')
        now              = timezone.now()
        today            = now.date()

        if not schedule or not appointment_date or not slot_time:
            return data

        # Day-of-week check
        expected_day = WEEKDAY_MAP[appointment_date.weekday()]
        if schedule.day_of_week != expected_day:
            raise serializers.ValidationError({
                "schedule": f"This schedule is for {schedule.day_of_week} but the date is a {expected_day}."
            })

        # Slot must be within schedule bounds
        if slot_time < schedule.start_time or slot_time >= schedule.end_time:
            raise serializers.ValidationError({
                "slot_time": f"Slot {slot_time} is outside the schedule window "
                             f"({schedule.start_time}–{schedule.end_time})."
            })

        # FIX #4: Slot must not have already passed (for today)
        if appointment_date == today:
            current_time = now.astimezone(timezone.get_current_timezone()).time()
            if slot_time <= current_time:
                raise serializers.ValidationError({
                    "slot_time": f"The {slot_time.strftime('%I:%M %p')} slot has already passed for today."
                })

        # Slot must not already be booked
        already_booked = Appointment.objects.filter(
            schedule=schedule,
            appointment_date=appointment_date,
            slot_time=slot_time,
            is_deleted=False,
        ).exclude(status='CANCELLED').exists()
        if already_booked:
            raise serializers.ValidationError({
                "slot_time": f"The {slot_time.strftime('%I:%M %p')} slot is already booked. Please choose another."
            })

        return data

    @transaction.atomic
    def create(self, validated_data):
        schedule         = validated_data['schedule']
        consultation_fee = schedule.doctor.consultation_fee

        try:
            appointment = Appointment.objects.create(
                appointment_date=validated_data['appointment_date'],
                schedule=schedule,
                patient=validated_data['patient'],
                slot_time=validated_data['slot_time'],
                status='BOOKED',
            )
        except DjangoValidationError as e:
            raise DRFValidationError(e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages})

        billing = Billing.objects.create(
            appointment=appointment,
            patient=validated_data['patient'],
            total_amount=consultation_fee,
            paid_amount=0,
            payment_status='PENDING',
        )
        ConsultationBillItem.objects.create(billing=billing, fee=consultation_fee)
        return appointment


# =========================================================
# APPOINTMENT SERIALIZER  (read / listing)
# =========================================================

class AppointmentSerializer(serializers.ModelSerializer):
    patient = PatientSerializer(read_only=True)
    billing = BillingSerializer(read_only=True)

    class Meta:
        model  = Appointment
        fields = [
            'id', 'appointment_code', 'appointment_date', 'slot_time',
            'token_no', 'status', 'patient', 'schedule', 'billing', 'created_at',
        ]
        read_only_fields = ('appointment_code', 'token_no', 'status', 'billing', 'created_at')