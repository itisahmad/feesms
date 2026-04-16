from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.conf import settings
import os

@api_view(['GET'])
@permission_classes([AllowAny])
def maintenance_check(request):
    """
    Check if the system is under maintenance
    Returns maintenance status and message
    """
    # Check environment variable or settings for maintenance flag
    maintenance_mode = os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'
    maintenance_message = os.getenv('MAINTENANCE_MESSAGE', 'System is currently under maintenance. Please try again later.')
    
    return Response({
        'maintenance_mode': maintenance_mode,
        'message': maintenance_message if maintenance_mode else None,
        'status': 'maintenance' if maintenance_mode else 'active'
    })
