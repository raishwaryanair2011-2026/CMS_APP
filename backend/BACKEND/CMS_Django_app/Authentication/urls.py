from django.urls import path
from .views import (
    LoginView,
    LogoutView,
    MeView,
    ChangePasswordView,
    TokenRefreshFromCookieView,
)

# Mounted at api/v1/auth/ in root urls.py
#
# POST  /api/v1/auth/login/            → access token in body, refresh in httpOnly cookie
# POST  /api/v1/auth/logout/           → blacklist refresh cookie, clear cookie
# GET   /api/v1/auth/me/               → current user profile + role
# POST  /api/v1/auth/change-password/  → change password
# POST  /api/v1/auth/token/refresh/    → get new access token using httpOnly cookie

urlpatterns = [
    path('login/',           LoginView.as_view(),                 name='auth-login'),
    path('logout/',          LogoutView.as_view(),                name='auth-logout'),
    path('me/',              MeView.as_view(),                    name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(),        name='auth-change-password'),
    path('token/refresh/',   TokenRefreshFromCookieView.as_view(), name='auth-token-refresh'),
]