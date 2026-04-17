from rest_framework import serializers
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
import re

from .models import Consultation, Prescription, MedicinePrescription
from Receptionist.models import Appointment
from Pharmacist.models import Medicine

# FIX #9: Valid frequency patterns (N-N-N or N-N-N-N or SOS)
FREQUENCY_REGEX = re.compile(r'^(\d-\d-\d(-\d)?|SOS)$')


# =========================================================
# MEDICINE PRESCRIPTION SERIALIZER
# =========================================================

class MedicinePrescriptionSerializer(serializers.ModelSerializer):

    medicine_name      = serializers.CharField(source="medicine.name", read_only=True)
    # FIX #8: expose stock-warning fields
    is_low_stock       = serializers.BooleanField(read_only=True)
    buy_outside_clinic = serializers.BooleanField(required=False)
    total_stock        = serializers.SerializerMethodField()

    def get_total_stock(self, obj):
        try:
            return obj.medicine.total_stock
        except Exception:
            return None

    class Meta:
        model  = MedicinePrescription
        fields = [
            "id", "prescription", "medicine", "medicine_name",
            "dosage", "frequency", "duration", "quantity",
            "is_dispensed",
            "is_low_stock", "buy_outside_clinic", "total_stock",
        ]
        read_only_fields = ["id", "prescription", "is_dispensed", "is_low_stock"]

    def validate_medicine(self, value):
        if not value:
            raise serializers.ValidationError("Medicine selection is required.")
        if value.is_deleted:
            raise serializers.ValidationError("This medicine has been deleted.")
        if not value.is_active:
            raise serializers.ValidationError(
                "This medicine is inactive and cannot be prescribed."
            )
        return value

    def validate_dosage(self, value):
        value = value.strip() if value else value
        if not value:
            raise serializers.ValidationError("Dosage is required.")
        if len(value) < 2:
            raise serializers.ValidationError("Dosage must be at least 2 characters.")
        if len(value) > 50:
            raise serializers.ValidationError("Dosage cannot exceed 50 characters.")
        return value

    def validate_frequency(self, value):
        """
        FIX #9: Frequency must match N-N-N pattern (e.g. 1-0-1, 1-1-1, SOS).
        """
        value = value.strip() if value else value
        if not value:
            raise serializers.ValidationError("Frequency is required.")
        if not FREQUENCY_REGEX.match(value):
            raise serializers.ValidationError(
                "Frequency must be in N-N-N format (e.g. 1-0-1, 1-1-1, 0-0-1) or 'SOS'."
            )
        return value

    def validate_duration(self, value):
        value = value.strip() if value else value
        if not value:
            raise serializers.ValidationError("Duration is required.")
        if len(value) < 2:
            raise serializers.ValidationError("Duration must be at least 2 characters.")
        if len(value) > 50:
            raise serializers.ValidationError("Duration cannot exceed 50 characters.")
        return value

    def validate_quantity(self, value):
        if value is None:
            raise serializers.ValidationError("Quantity is required.")
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        if value > 1000:
            raise serializers.ValidationError("Quantity cannot exceed 1000.")
        return value


# =========================================================
# PRESCRIPTION SERIALIZER
# =========================================================

class PrescriptionSerializer(serializers.ModelSerializer):

    medicines = MedicinePrescriptionSerializer(many=True, required=False)

    class Meta:
        model  = Prescription
        fields = ["id", "consultation", "medicines", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "consultation": {"required": False}
        }

    def validate_consultation(self, value):
        if not value:
            raise serializers.ValidationError("Consultation linkage is required.")
        if value.is_deleted:
            raise serializers.ValidationError("This consultation has been deleted.")
        qs = Prescription.objects.filter(consultation=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A prescription already exists for this consultation."
            )
        return value

    def validate_medicines(self, value):
        if value:
            medicine_ids = [item.get('medicine').id for item in value if item.get('medicine')]
            if len(medicine_ids) != len(set(medicine_ids)):
                raise serializers.ValidationError(
                    "Duplicate medicines are not allowed in the same prescription."
                )
        return value

    def create(self, validated_data):
        medicines_data = validated_data.pop("medicines", [])
        try:
            with transaction.atomic():
                prescription = Prescription.objects.create(**validated_data)
                for med in medicines_data:
                    med.pop("prescription", None)
                    MedicinePrescription.objects.create(
                        prescription=prescription, **med
                    )
            return prescription
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )

    def update(self, instance, validated_data):
        medicines_data = validated_data.pop("medicines", None)
        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()
                if medicines_data is not None:
                    instance.medicines.filter(is_dispensed=False).delete()
                    for med in medicines_data:
                        med.pop("prescription", None)
                        MedicinePrescription.objects.create(
                            prescription=instance, **med
                        )
            return instance
        except DjangoValidationError as e:
            raise DRFValidationError(
                e.message_dict if hasattr(e, 'message_dict') else {'error': e.messages}
            )


# =========================================================
# CONSULTATION SERIALIZER
# =========================================================

class ConsultationSerializer(serializers.ModelSerializer):

    appointment_code = serializers.CharField(
        source="appointment.appointment_code",
        read_only=True,
    )
    appointment_status = serializers.CharField(
        source="appointment.status", read_only=True
    )
    patient_name = serializers.CharField(
        source="appointment.patient.full_name", read_only=True
    )
    prescription = PrescriptionSerializer(read_only=True)

    class Meta:
        model  = Consultation
        fields = [
            "id", "appointment", "appointment_code",
            "appointment_status", "patient_name",
            "symptoms", "diagnosis", "notes",
            "prescription", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_appointment(self, value):
        if not value:
            raise serializers.ValidationError("Appointment selection is required.")
        if value.is_deleted:
            raise serializers.ValidationError("This appointment has been deleted.")
        if value.status == "CANCELLED":
            raise serializers.ValidationError(
                "Cannot create a consultation for a cancelled appointment."
            )
        qs = Consultation.objects.filter(appointment=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A consultation already exists for this appointment."
            )
        return value

    def validate_symptoms(self, value):
        value = value.strip() if value else value
        if not value:
            raise serializers.ValidationError("Symptoms cannot be blank.")
        if len(value) < 3:
            raise serializers.ValidationError("Symptoms must be at least 3 characters.")
        if len(value) > 1000:
            raise serializers.ValidationError("Symptoms cannot exceed 1000 characters.")
        return value

    def validate_diagnosis(self, value):
        value = value.strip() if value else value
        if not value:
            raise serializers.ValidationError("Diagnosis cannot be blank.")
        if len(value) < 3:
            raise serializers.ValidationError("Diagnosis must be at least 3 characters.")
        if len(value) > 1000:
            raise serializers.ValidationError("Diagnosis cannot exceed 1000 characters.")
        return value

    def validate_notes(self, value):
        if value:
            value = value.strip()
            if len(value) > 2000:
                raise serializers.ValidationError("Notes cannot exceed 2000 characters.")
        return value