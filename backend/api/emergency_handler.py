import os
import sys
import json

def handler(event, context):
    """
    Emergency fallback handler - minimal and guaranteed to work
    """
    try:
        # Basic response for any request
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
            'body': json.dumps({
                'message': 'Backend API is running',
                'status': 'OK',
                'timestamp': str(context.get('requestTime', 'unknown')),
                'path': event.get('path', 'unknown'),
                'method': event.get('httpMethod', 'unknown')
            })
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'Emergency handler error'
            })
        }

# For Vercel deployment
app = handler
