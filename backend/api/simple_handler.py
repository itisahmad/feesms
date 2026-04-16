import os
import sys
import json
from django.conf import settings
from django.core.wsgi import get_wsgi_application
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
    Simplified Vercel serverless function handler for Django
    """
    try:
        # Basic logging
        print(f"Handler called with path: {event.get('path', 'N/A')}")
        
        # Handle CORS
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
        
        # Get path and method
        path = event.get('path', '')
        method = event.get('httpMethod', 'GET')
        
        # Simple WSGI environ conversion
        environ = {
            'REQUEST_METHOD': method,
            'PATH_INFO': path,
            'QUERY_STRING': event.get('queryString', ''),
            'SERVER_NAME': 'vercel.app',
            'SERVER_PORT': '443',
            'wsgi.url_scheme': 'https',
            'CONTENT_TYPE': event.get('headers', {}).get('content-type', 'application/json'),
            'CONTENT_LENGTH': str(len(event.get('body', ''))),
        }
        
        # Add headers
        for key, value in event.get('headers', {}).items():
            environ[f'HTTP_{key.upper().replace("-", "_")}'] = value
        
        # Add body for POST requests
        if method in ['POST', 'PUT', 'PATCH']:
            environ['wsgi.input'] = event.get('body', '')
        
        # Simple response collector
        response_headers = {}
        status_code = 500
        
        def start_response(status, headers):
            nonlocal response_headers, status_code
            response_headers.update(headers)
            status_code = int(status.split()[0]) if isinstance(status, str) else status
        
        # Call Django
        response_data = django_app(environ, start_response)
        response_body = b''.join(response_data).decode('utf-8')
        
        # Extract status from response
        if response_headers:
            status_line = response_headers.get('status', '200 OK')
            try:
                status_code = int(status_line.split()[0])
            except:
                pass
        
        # Return response
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
            'body': response_body
        }
        
    except Exception as e:
        # Simple error response
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'Server error occurred'
            })
        }

# For Vercel deployment
app = handler
