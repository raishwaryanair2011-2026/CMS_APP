from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth import authenticate


# Role priority — Admin must be checked first.
# A user in multiple groups always gets the highest-priority role.
ROLE_PRIORITY = ['Admin', 'Doctor', 'Receptionist', 'Pharmacist']


# =========================================================
# LOGIN SERIALIZER
# =========================================================

class LoginSerializer(serializers.Serializer):

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        username = data.get("username")
        password = data.get("password")

        if not username or not password:
            raise serializers.ValidationError("Username and password are required.")

        user = authenticate(username=username, password=password)

        if not user:
            raise serializers.ValidationError("Invalid username or password.")

        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")

        data["user"] = user
        return data


# =========================================================
# CHANGE PASSWORD SERIALIZER
# =========================================================

class ChangePasswordSerializer(serializers.Serializer):

    old_password     = serializers.CharField(write_only=True)
    new_password     = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "New passwords do not match."}
            )
        if len(data["new_password"]) < 6:
            raise serializers.ValidationError(
                {"new_password": "Password must be at least 6 characters."}
            )
        if data["new_password"] == data["old_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password cannot be the same as the old password."}
            )
        return data

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


# =========================================================
# LOGGED IN USER SERIALIZER
# =========================================================

class UserProfileSerializer(serializers.ModelSerializer):

    role       = serializers.SerializerMethodField()
    staff_code = serializers.SerializerMethodField()
    staff_id   = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = [
            "id", "username", "first_name",
            "last_name", "email", "role", "staff_code", "staff_id",
        ]

    def get_role(self, obj):
        """
        Return the user's highest-priority role.
        Uses a fixed priority order so an Admin user who is also in other
        groups always gets 'Admin' — not a random group from .first().

        Priority: Admin > Doctor > Receptionist > Pharmacist
        """
        user_groups = set(obj.groups.values_list("name", flat=True))
        for role in ROLE_PRIORITY:
            if role in user_groups:
                return role
        # Superuser with no group — treat as Admin
        if obj.is_superuser:
            return "Admin"
        return None

    def get_staff_code(self, obj):
        if hasattr(obj, "staff_profile"):
            return obj.staff_profile.staff_code
        return None

    def get_staff_id(self, obj):
        if hasattr(obj, "staff_profile"):
            return obj.staff_profile.staff_id
        return None