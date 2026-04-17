from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.exceptions import TokenError

from .serializers import LoginSerializer, ChangePasswordSerializer, UserProfileSerializer

REFRESH_COOKIE_NAME = 'refresh_token'
REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24  # 24 hours in seconds


def success_response(data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)

def error_response(message="Error", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
    return Response({"success": False, "message": message, "errors": errors}, status=status_code)


class LoginView(APIView):
    """
    POST /api/v1/auth/login/
    Authenticates the user, returns the access token in the response body
    and sets the refresh token as an httpOnly cookie (invisible to JS).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return error_response(
                message="Invalid credentials.",
                errors=serializer.errors,
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        user    = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        access  = str(refresh.access_token)

        user_data = UserProfileSerializer(user).data

        response = success_response(
            data={
                "access": access,
                # refresh token intentionally NOT included in response body
                "user":   user_data,
            },
            message="Login successful.",
            status_code=status.HTTP_200_OK,
        )

        # Set refresh token as httpOnly cookie — JS cannot read or steal it
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=str(refresh),
            max_age=REFRESH_COOKIE_MAX_AGE,
            httponly=True,          # not accessible via document.cookie
            secure=False,           # set True in production (requires HTTPS)
            samesite='Lax',         # protects against CSRF while allowing normal navigation
            path='/',
        )

        return response


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/
    Blacklists the refresh token (read from cookie) and clears the cookie.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                # Already blacklisted or invalid — still clear the cookie
                pass

        response = success_response(message="Logged out successfully.")

        # Clear the httpOnly cookie
        response.delete_cookie(
            key=REFRESH_COOKIE_NAME,
            path='/',
            samesite='Lax',
        )

        return response


class TokenRefreshFromCookieView(APIView):
    """
    POST /api/v1/auth/token/refresh/
    Reads the refresh token from the httpOnly cookie (not the request body),
    validates it, and returns a new access token in the response body.
    The frontend calls this automatically when a 401 is received.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)

        if not refresh_token:
            return error_response(
                message="No refresh token found. Please log in again.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(refresh_token)
            access  = str(refresh.access_token)

            # Optionally rotate the refresh token (recommended for security)
            # Uncomment the lines below to enable rotation:
            # refresh.blacklist()
            # new_refresh = RefreshToken.for_user(...)
            # response.set_cookie(REFRESH_COOKIE_NAME, str(new_refresh), ...)

            return success_response(
                data={"access": access},
                message="Access token refreshed.",
            )
        except TokenError as e:
            return error_response(
                message="Refresh token is invalid or expired. Please log in again.",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )


class MeView(APIView):
    """
    GET /api/v1/auth/me/
    Returns the currently authenticated user's profile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return success_response(data=serializer.data, message="User profile retrieved.")


class ChangePasswordView(APIView):
    """
    POST /api/v1/auth/change-password/
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            return error_response(
                message="Password change failed.",
                errors=serializer.errors,
            )
        serializer.save()
        return success_response(message="Password changed successfully.")