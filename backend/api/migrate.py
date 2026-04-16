import os
import sys
import django
from django.core.management import execute_from_command_line
from django.http import JsonResponse

# Add the backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings_production')

# Initialize Django
django.setup()

def handler(event, context):
    """
    Vercel serverless function for running Django migrations
    """
    try:
        # Run migrations
        from io import StringIO
        from django.core.management import call_command
        
        # Capture migration output
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
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': 'Migration failed',
                'details': str(e)
            })
        }

# For Vercel deployment
app = handler
