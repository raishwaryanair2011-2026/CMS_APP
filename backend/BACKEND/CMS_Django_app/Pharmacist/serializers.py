from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.db import IntegrityError, transaction
import re

from .models import (
    MedicineCategory,
    Medicine,
    MedicineBatch,
    MedicineDispense,
    PharmacyBillItem,
)
from Doctor.models import MedicinePrescription


# =========================================================
# BASE SERIALIZER
# =========================================================

class BaseModelSerializer(serializers.ModelSerializer):

    def create(self, validated_data):
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except DjangoValidationError as e:
            raise serializers.ValidationError(
                e.message_dict if hasattr(e, "message_dict") else {"error": e.messages}
            )
        except IntegrityError:
            raise serializers.ValidationError(
                {"database_error": "A database constraint was violated."}
            )

    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except DjangoValidationError as e:
            raise serializers.ValidationError(
                e.message_dict if hasattr(e, "message_dict") else {"error": e.messages}
            )
        except IntegrityError:
            raise serializers.ValidationError(
                {"database_error": "A database constraint was violated."}
            )


# =========================================================
# MEDICINE PRESCRIPTION READ SERIALIZER
# =========================================================

class MedicinePrescriptionReadSerializer(serializers.ModelSerializer):

    medicine_name    = serializers.CharField(source="medicine.name",   read_only=True)
    patient_name     = serializers.CharField(
        source="prescription.consultation.appointment.patient.full_name",
        read_only=True,
    )
    appointment_code = serializers.CharField(
        source="prescription.consultation.appointment.appointment_code",
        read_only=True,
    )

    class Meta:
        model  = MedicinePrescription
        fields = [
            "id", "medicine", "medicine_name",
            "dosage", "frequency", "duration",
            "quantity", "is_dispensed",
            "patient_name", "appointment_code",
        ]
        read_only_fields = fields


# =========================================================
# MEDICINE CATEGORY SERIALIZER
# =========================================================

class MedicineCategorySerializer(BaseModelSerializer):

    class Meta:
        model  = MedicineCategory
        fields = ["id", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Category name cannot be blank.")
        if len(value) < 3:
            raise serializers.ValidationError(
                "Category name must be at least 3 characters."
            )
        if len(value) > 100:
            raise serializers.ValidationError(
                "Category name cannot exceed 100 characters."
            )
        if not re.match(r'^[A-Za-z\s]+$', value):
            raise serializers.ValidationError(
                "Category name can only contain letters and spaces."
            )
        qs = MedicineCategory.objects.filter(name__iexact=value, is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("This category already exists.")
        return value.title()


# =========================================================
# MEDICINE SERIALIZER
# =========================================================

class MedicineSerializer(BaseModelSerializer):

    category_name = serializers.CharField(source="category.name", read_only=True)
    total_stock   = serializers.IntegerField(read_only=True)
    needs_reorder = serializers.BooleanField(read_only=True)

    class Meta:
        model  = Medicine
        fields = [
            "id", "name", "generic_name", "company", "price",
            "category", "category_name",
            "reorder_level", "is_active",
            "total_stock", "needs_reorder",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "total_stock", "needs_reorder", "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Medicine name cannot be blank.")
        if len(value) < 2:
            raise serializers.ValidationError(
                "Medicine name must be at least 2 characters."
            )
        if len(value) > 200:
            raise serializers.ValidationError(
                "Medicine name cannot exceed 200 characters."
            )

        # Check for duplicate name (case-insensitive), excluding soft-deleted records
        # and excluding the current instance on edit
        qs = Medicine.objects.filter(
            name__iexact=value,
            is_deleted=False,
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                f"A medicine named '{value}' already exists."
            )

        return value

    def validate_generic_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Generic name cannot be blank.")
        if len(value) < 2:
            raise serializers.ValidationError(
                "Generic name must be at least 2 characters."
            )
        if len(value) > 200:
            raise serializers.ValidationError(
                "Generic name cannot exceed 200 characters."
            )
        return value

    def validate_company(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Company name cannot be blank.")
        if len(value) < 2:
            raise serializers.ValidationError(
                "Company name must be at least 2 characters."
            )
        if len(value) > 200:
            raise serializers.ValidationError(
                "Company name cannot exceed 200 characters."
            )
        return value

    def validate_price(self, value):
        if value is None:
            raise serializers.ValidationError("Price is required.")
        if value <= 0:
            raise serializers.ValidationError("Price must be greater than zero.")
        if value > 1000000:
            raise serializers.ValidationError("Price cannot exceed 10,00,000.")
        return value

    def validate_reorder_level(self, value):
        if value is None:
            raise serializers.ValidationError("Reorder level is required.")
        if value < 0:
            raise serializers.ValidationError("Reorder level cannot be negative.")
        if value > 10000:
            raise serializers.ValidationError("Reorder level cannot exceed 10,000.")
        return value

    def validate_category(self, value):
        if not value:
            raise serializers.ValidationError("Category is required.")
        if value.is_deleted:
            raise serializers.ValidationError(
                "Selected category has been deleted."
            )
        return value

    def validate(self, data):
        name         = data.get('name', '').strip()
        generic_name = data.get('generic_name', '').strip()
        company      = data.get('company', '').strip()

        if name and generic_name and company:
            qs = Medicine.objects.filter(
                name__iexact=name,
                generic_name__iexact=generic_name,
                company__iexact=company,
                is_deleted=False,
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "A medicine with this name, generic name, and company already exists."
                )
        return data


# =========================================================
# MEDICINE BATCH SERIALIZER
# =========================================================

class MedicineBatchSerializer(BaseModelSerializer):

    medicine_name    = serializers.CharField(source="medicine.name",         read_only=True)
    medicine_generic = serializers.CharField(source="medicine.generic_name", read_only=True)
    is_expired       = serializers.BooleanField(read_only=True)
    is_out_of_stock  = serializers.BooleanField(read_only=True)

    class Meta:
        model  = MedicineBatch
        fields = [
            "id", "batch_no",
            "medicine", "medicine_name", "medicine_generic",
            "stock_level", "purchase_date", "expiry_date",
            "is_active", "is_expired", "is_out_of_stock",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "is_expired", "is_out_of_stock", "created_at", "updated_at",
        ]

    def validate_batch_no(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Batch number cannot be blank.")
        if len(value) < 2:
            raise serializers.ValidationError("Batch number must be at least 2 characters.")
        if len(value) > 100:
            raise serializers.ValidationError("Batch number cannot exceed 100 characters.")
        if not re.match(r'^[A-Z0-9\-]+$', value):
            raise serializers.ValidationError(
                "Batch number must contain only uppercase letters, numbers, or hyphens."
            )
        return value

    def validate_medicine(self, value):
        if not value:
            raise serializers.ValidationError("Medicine selection is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected medicine has been deleted.")
        if not value.is_active:
            raise serializers.ValidationError(
                "Cannot add a batch for an inactive medicine."
            )
        return value

    def validate_stock_level(self, value):
        if value is None:
            raise serializers.ValidationError("Stock level is required.")
        if value < 0:
            raise serializers.ValidationError("Stock level cannot be negative.")
        if value > 100000:
            raise serializers.ValidationError("Stock level cannot exceed 1,00,000.")
        return value

    def validate_purchase_date(self, value):
        if not value:
            raise serializers.ValidationError("Purchase date is required.")
        from django.utils import timezone
        if value > timezone.now().date():
            raise serializers.ValidationError(
                "Purchase date cannot be in the future."
            )
        return value

    def validate_expiry_date(self, value):
        if not value:
            raise serializers.ValidationError("Expiry date is required.")
        from django.utils import timezone
        if value < timezone.now().date():
            raise serializers.ValidationError(
                "Cannot add a batch that is already expired."
            )
        return value

    def validate(self, data):
        purchase_date = data.get("purchase_date")
        expiry_date   = data.get("expiry_date")

        if purchase_date and expiry_date:
            if expiry_date <= purchase_date:
                raise serializers.ValidationError({
                    "expiry_date": "Expiry date must be after the purchase date."
                })
            from datetime import timedelta
            if (expiry_date - purchase_date).days < 30:
                raise serializers.ValidationError({
                    "expiry_date": "Expiry date should be at least 30 days after purchase date."
                })

        return data

    def update(self, instance, validated_data):
        for locked_field in ("medicine", "batch_no"):
            if locked_field in validated_data:
                raise serializers.ValidationError(
                    {locked_field: f"{locked_field} cannot be changed after creation."}
                )
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


# =========================================================
# MEDICINE DISPENSE SERIALIZER
# =========================================================

class MedicineDispenseSerializer(BaseModelSerializer):

    prescription_detail = MedicinePrescriptionReadSerializer(
        source="medicine_prescription",
        read_only=True,
    )
    medicine_name     = serializers.CharField(
        source="medicine_batch.medicine.name", read_only=True,
    )
    batch_no          = serializers.CharField(
        source="medicine_batch.batch_no", read_only=True,
    )
    dispensed_by_name = serializers.SerializerMethodField()

    def get_dispensed_by_name(self, obj):
        return obj.dispensed_by.user.get_full_name()

    class Meta:
        model  = MedicineDispense
        fields = [
            "id", "dispense_code",
            "medicine_prescription", "prescription_detail",
            "medicine_batch", "medicine_name", "batch_no",
            "quantity_dispensed",
            "dispensed_by", "dispensed_by_name",
            "dispensed_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "dispense_code",
            "prescription_detail", "medicine_name", "batch_no",
            "dispensed_by_name", "dispensed_at",
            "created_at", "updated_at",
        ]

    def validate_medicine_prescription(self, value):
        if not value:
            raise serializers.ValidationError("Medicine prescription is required.")
        if value.is_deleted:
            raise serializers.ValidationError("This prescription item has been deleted.")
        if value.is_dispensed:
            raise serializers.ValidationError(
                "This prescription item has already been dispensed."
            )
        return value

    def validate_medicine_batch(self, value):
        if not value:
            raise serializers.ValidationError("Medicine batch is required.")
        if value.is_deleted:
            raise serializers.ValidationError("This batch has been deleted.")
        if not value.is_active:
            raise serializers.ValidationError("This batch is inactive.")
        if value.is_expired:
            raise serializers.ValidationError(
                f"This batch expired on {value.expiry_date}."
            )
        if value.is_out_of_stock:
            raise serializers.ValidationError("This batch is out of stock.")
        return value

    def validate_quantity_dispensed(self, value):
        if value is None:
            raise serializers.ValidationError("Quantity to dispense is required.")
        if value <= 0:
            raise serializers.ValidationError("Quantity dispensed must be at least 1.")
        return value

    def validate_dispensed_by(self, value):
        if not value:
            raise serializers.ValidationError("Dispensed by (staff) is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected staff member has been deleted.")
        if not value.is_active:
            raise serializers.ValidationError(
                "Selected staff member is inactive."
            )
        return value

    def validate(self, data):
        prescription = data.get("medicine_prescription")
        batch        = data.get("medicine_batch")
        qty          = data.get("quantity_dispensed")

        if prescription and batch:
            if batch.medicine != prescription.medicine:
                raise serializers.ValidationError({
                    "medicine_batch": (
                        f"Batch is for '{batch.medicine.name}' but prescription "
                        f"is for '{prescription.medicine.name}'. They must match."
                    )
                })

        if batch and qty is not None:
            if qty > batch.stock_level:
                raise serializers.ValidationError({
                    "quantity_dispensed": (
                        f"Insufficient stock. Available: {batch.stock_level}, "
                        f"Requested: {qty}."
                    )
                })

        if prescription and qty is not None:
            if qty > prescription.quantity:
                raise serializers.ValidationError({
                    "quantity_dispensed": (
                        f"Cannot dispense more than prescribed. "
                        f"Prescribed: {prescription.quantity}, Requested: {qty}."
                    )
                })

        return data

    def create(self, validated_data):
        dispense = MedicineDispense(**validated_data)
        dispense.save()
        return dispense

    def update(self, instance, validated_data):
        raise serializers.ValidationError(
            "Dispense records cannot be modified once created."
        )


# =========================================================
# PHARMACY BILL ITEM SERIALIZER
# =========================================================

class PharmacyBillItemSerializer(BaseModelSerializer):

    medicine_name      = serializers.CharField(
        source="medicine_dispense.medicine_batch.medicine.name", read_only=True,
    )
    batch_no           = serializers.CharField(
        source="medicine_dispense.medicine_batch.batch_no", read_only=True,
    )
    quantity_dispensed = serializers.IntegerField(
        source="medicine_dispense.quantity_dispensed", read_only=True,
    )

    class Meta:
        model  = PharmacyBillItem
        fields = [
            "id", "billing", "medicine_dispense",
            "medicine_name", "batch_no", "quantity_dispensed",
            "unit_price", "total_price",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "total_price",
            "medicine_name", "batch_no", "quantity_dispensed",
            "created_at", "updated_at",
        ]

    def validate_billing(self, value):
        if not value:
            raise serializers.ValidationError("Billing record is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected billing record has been deleted.")
        return value

    def validate_medicine_dispense(self, value):
        if not value:
            raise serializers.ValidationError("Medicine dispense record is required.")
        if value.is_deleted:
            raise serializers.ValidationError("Selected dispense record has been deleted.")
        return value

    def validate_unit_price(self, value):
        if value is not None:
            if value <= 0:
                raise serializers.ValidationError("Unit price must be greater than zero.")
            if value > 1000000:
                raise serializers.ValidationError("Unit price seems too large. Please verify.")
        return value

    def validate(self, data):
        medicine_dispense = data.get("medicine_dispense")
        if medicine_dispense:
            qs = PharmacyBillItem.objects.filter(medicine_dispense=medicine_dispense)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "A bill item already exists for this dispense record."
                )
        return data

    def create(self, validated_data):
        dispense = validated_data.get("medicine_dispense")
        if not validated_data.get("unit_price"):
            validated_data["unit_price"] = dispense.medicine_batch.medicine.price
        validated_data["total_price"] = (
            validated_data["unit_price"] * dispense.quantity_dispensed
        )
        return PharmacyBillItem.objects.create(**validated_data)

    def update(self, instance, validated_data):
        for locked_field in ("medicine_dispense", "billing"):
            if locked_field in validated_data:
                raise serializers.ValidationError(
                    {locked_field: f"{locked_field} cannot be changed after creation."}
                )
        unit_price = validated_data.get("unit_price", instance.unit_price)
        if unit_price <= 0:
            raise serializers.ValidationError(
                {"unit_price": "Unit price must be greater than zero."}
            )
        instance.unit_price  = unit_price
        instance.total_price = unit_price * instance.medicine_dispense.quantity_dispensed
        instance.save()
        return instance