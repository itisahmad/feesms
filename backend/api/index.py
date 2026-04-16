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
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

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
        # Convert Vercel event to WSGI environ
        environ = {
            'REQUEST_METHOD': event.get('httpMethod', 'GET'),
            'PATH_INFO': event.get('path', '/'),
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
