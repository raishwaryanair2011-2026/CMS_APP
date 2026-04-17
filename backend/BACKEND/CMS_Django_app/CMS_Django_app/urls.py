from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT Authentication
    path('api/token/',           TokenObtainPairView.as_view(),  name='token_obtain_pair'),
    path('api/token/refresh/',   TokenRefreshView.as_view(),     name='token_refresh'),
    path('api/token/blacklist/', TokenBlacklistView.as_view(),   name='token_blacklist'),

    # App routes
    path('api/v1/auth/',       include('Authentication.urls')),
    path('api/v1/admin/',      include('Admin.urls')),
    path('api/v1/doctor/',     include('Doctor.urls')),
    path('api/v1/pharmacy/',   include('Pharmacist.urls')),
    path('api/v1/reception/',  include('Receptionist.urls')),
] + static(settings.MEDIA_URL, document_root = settings.MEDIA_ROOT)