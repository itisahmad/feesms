import os
import sys
import json
from django.conf import settings
from django.core.wsgi import get_wsgi_application
from django.http import JsonResponse
from django.core.handlers.wsgi import WSGIHandler
from django.urls import resolve
from django.core.exceptions import Resolver404

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
        # Handle CORS preflight requests
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
                'body': ''
            }
        
        # Get the path from the event
        path = event.get('path', '')
        method = event.get('httpMethod', 'GET')
        
        # Handle special routes
        if path == '/api/migrate':
            if method == 'POST':
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
            if method == 'POST':
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
            query_string = event.get('queryString', '')
            if query_string:
                # Convert Vercel queryString to proper format
                if isinstance(query_string, dict):
                    query_parts = []
                    for key, value in query_string.items():
                        if isinstance(value, list):
                            for v in value:
                                query_parts.append(f"{key}={v}")
                        else:
                            query_parts.append(f"{key}={value}")
                    query_string = '&'.join(query_parts)
            
            environ = {
                'REQUEST_METHOD': method,
                'PATH_INFO': path,
                'QUERY_STRING': query_string,
                'SERVER_NAME': 'vercel.app',
                'SERVER_PORT': '443',
                'wsgi.url_scheme': 'https',
                'CONTENT_TYPE': event.get('headers', {}).get('content-type', 'application/json'),
                'CONTENT_LENGTH': str(len(event.get('body', ''))),
            }
            
            # Add headers
            for key, value in event.get('headers', {}).items():
                environ[f'HTTP_{key.upper().replace("-", "_")}'] = value
            
            # Set up input stream for POST/PUT requests
            if method in ['POST', 'PUT', 'PATCH']:
                body = event.get('body', '')
                environ['wsgi.input'] = body
            
            # Collect response headers
            response_headers = {}
            
            def start_response(status, headers):
                nonlocal response_headers
                response_headers = dict(headers)
            
            # Call Django application
            response_data = django_app(environ, start_response)
            
            # Process response
            response_body = b''.join(response_data).decode('utf-8')
            
            # Extract status code
            status_code = 200
            if response_headers:
                status_line = response_headers.get('status', '200 OK')
                try:
                    status_code = int(status_line.split()[0])
                except:
                    pass
            
            # Set CORS headers
            cors_headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
            
            # Merge headers
            all_headers = {**response_headers, **cors_headers}
            
            # Try to parse as JSON, fallback to text
            try:
                json.loads(response_body)
                content_type = 'application/json'
            except:
                content_type = 'text/html'
            
            all_headers['Content-Type'] = content_type
            
            return {
                'statusCode': status_code,
                'headers': all_headers,
                'body': response_body
            }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': 'Internal server error',
                'details': str(e)
            })
        }

# For Vercel deployment
app = handler
