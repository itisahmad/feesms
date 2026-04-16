from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status
import os
from datetime import datetime, timedelta

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def booking_slots(request):
    """
    Get available booking slots
    First checks maintenance mode before returning slots
    """
    # Check maintenance mode first
    maintenance_mode = os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'
    
    if maintenance_mode:
        maintenance_message = os.getenv('MAINTENANCE_MESSAGE', 'System is currently under maintenance. Please try again later.')
        return Response({
            'error': 'maintenance_mode',
            'message': maintenance_message,
            'slots': []
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    # If not in maintenance, return available slots
    # This is sample data - replace with your actual slot logic
    today = datetime.now().date()
    slots = []
    
    # Generate slots for next 7 days
    for i in range(7):
        slot_date = today + timedelta(days=i)
        
        # Generate time slots for each date
        time_slots = []
        for hour in range(18, 23):  # 6 PM to 10 PM
            for minute in ['00', '30']:
                time_str = f"{hour}:{minute}"
                time_slots.append({
                    'time': time_str,
                    'available': True,  # Check actual availability
                    'spots_left': 10    # Check actual spots left
                })
        
        slots.append({
            'date': slot_date.strftime('%Y-%m-%d'),
            'day_name': slot_date.strftime('%A'),
            'time_slots': time_slots
        })
    
    return Response({
        'status': 'active',
        'slots': slots
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def book_slot(request):
    """
    Book a specific slot
    First checks maintenance mode before processing booking
    """
    # Check maintenance mode first
    maintenance_mode = os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'
    
    if maintenance_mode:
        maintenance_message = os.getenv('MAINTENANCE_MESSAGE', 'System is currently under maintenance. Please try again later.')
        return Response({
            'error': 'maintenance_mode',
            'message': maintenance_message
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    
    # Process booking if not in maintenance
    date = request.data.get('date')
    time = request.data.get('time')
    user_email = request.user.email if request.user.is_authenticated else None
    
    # Validate input
    if not date or not time:
        return Response({
            'error': 'missing_fields',
            'message': 'Date and time are required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Here you would:
    # 1. Check if slot is available
    # 2. Create booking record
    # 3. Send confirmation
    
    return Response({
        'status': 'success',
        'message': 'Slot booked successfully',
        'booking': {
            'date': date,
            'time': time,
            'user_email': user_email,
            'booking_id': f'BK{datetime.now().strftime("%Y%m%d%H%M%S")}'
        }
    })
