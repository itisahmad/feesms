import os
import sys
import django
from django.core.management import execute_from_command_line
from django.http import JsonResponse
from django.contrib.auth import get_user_model

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings_production')

# Initialize Django
django.setup()

def handler(event, context):
    """
    Vercel serverless function for creating Django superuser
    """
    try:
        # Get user data from request body
        if event.get('httpMethod') == 'POST':
            import json
            body = json.loads(event.get('body', '{}'))
            
            username = body.get('username')
            email = body.get('email')
            password = body.get('password')
            
            if not all([username, email, password]):
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    'body': json.dumps({
                        'error': 'Missing required fields: username, email, password'
                    })
                }
            
            # Create superuser
            User = get_user_model()
            
            if User.objects.filter(username=username).exists():
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    'body': json.dumps({
                        'error': 'User with this username already exists'
                    })
                }
            
            user = User.objects.create_superuser(
                username=username,
                email=email,
                password=password
            )
            
            return {
                'statusCode': 201,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                'body': json.dumps({
                    'message': 'Superuser created successfully',
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'is_superuser': user.is_superuser,
                        'is_staff': user.is_staff
                    }
                })
            }
        
        # Return info for GET requests
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'message': 'Superuser creation endpoint',
                'usage': {
                    'method': 'POST',
                    'body': {
                        'username': 'admin',
                        'email': 'admin@example.com',
                        'password': 'secure_password'
                    }
                }
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': 'Failed to create superuser',
                'details': str(e)
            })
        }

# For Vercel deployment
app = handler
