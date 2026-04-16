import os
import sys
import json
from django.conf import settings
from django.core.wsgi import get_wsgi_application
from django.http import JsonResponse
from django.core.handlers.wsgi import WSGIHandler

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings_production')

# Initialize Django
import django
django.setup()

# Django WSGI application
django_app = WSGIHandler()

def handler(event, context):
    """
    Vercel serverless function handler for Django
    """
    try:
        # Handle special routes
        path = event.get('path', '')
        
        # Handle migrations
        if path == '/api/migrate':
            if event.get('httpMethod') == 'POST':
                from django.core.management import call_command
                from io import StringIO
                
                out = StringIO()
                call_command('migrate', stdout=out)
                migration_output = out.getvalue()
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    'body': json.dumps({
                        'message': 'Migrations completed successfully',
                        'output': migration_output
                    })
                }
            else:
                return {
                    'statusCode': 405,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    'body': json.dumps({
                        'error': 'Method not allowed. Use POST for migrations.'
                    })
                }
        
        # Handle createsuperuser
        elif path == '/api/createsuperuser':
            if event.get('httpMethod') == 'POST':
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
                
                from django.contrib.auth import get_user_model
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
            else:
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
        
        # Handle Django application for all other routes
        else:
            # Convert Vercel event to WSGI environ
            environ = {
                'REQUEST_METHOD': event.get('httpMethod', 'GET'),
                'PATH_INFO': path,
                'QUERY_STRING': event.get('queryString', ''),
                'SERVER_NAME': 'vercel.app',
                'SERVER_PORT': '443',
                'wsgi.url_scheme': 'https',
                'wsgi.input': event.get('body', ''),
                'CONTENT_LENGTH': str(len(event.get('body', ''))),
                'CONTENT_TYPE': event.get('headers', {}).get('content-type', 'application/json'),
            }
            
            # Add headers
            for key, value in event.get('headers', {}).items():
                environ[f'HTTP_{key.upper().replace("-", "_")}'] = value
            
            # Call Django application
            def start_response(status, headers):
                pass
            
            response = django_app(environ, start_response)
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
                'body': json.dumps({'message': 'Django API is running'})
            }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({'error': str(e)})
        }

# For Vercel deployment
app = handler
