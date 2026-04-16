# Vercel Django Deployment Guide

## Fixed Issues

### 1. NOT_FOUND Error Resolution
- **Problem**: Django serverless function wasn't properly handling Vercel events
- **Solution**: Updated `api/index.py` with proper WSGI environ conversion and response handling
- **Result**: All API routes now work correctly on Vercel

### 2. CORS Issues Fixed
- **Problem**: Cross-origin requests were blocked
- **Solution**: Added proper CORS headers to all responses
- **Result**: Frontend can now communicate with backend

### 3. Routing Issues Fixed
- **Problem**: Only `/api/*` routes were handled
- **Solution**: Added catch-all route to handle all requests
- **Result**: Django URL routing works properly

## Deployment Steps

### 1. Commit and Push Changes
```bash
git add backend/api/index.py backend/vercel.json
git commit -m "Fix Vercel deployment: proper Django serverless setup"
git push origin main
```

### 2. Deploy to Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Import your repository
3. Select the `backend` folder as root directory
4. Framework preset: "Python"
5. Set environment variables:
   ```
   DJANGO_SETTINGS_MODULE=config.settings_production
   SECRET_KEY=your-secret-key-here
   DEBUG=False
   DB_NAME=your-database-name
   DB_USER=your-database-user
   DB_PASSWORD=your-database-password
   DB_HOST=your-database-host
   DB_PORT=5432
   ```

### 3. Run Migrations
After deployment, run migrations:
```bash
curl -X POST https://your-backend.vercel.app/api/migrate
```

### 4. Create Superuser
Create admin user:
```bash
curl -X POST https://your-backend.vercel.app/api/createsuperuser \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"secure_password"}'
```

## Testing

### 1. Health Check
```bash
curl https://your-backend.vercel.app/api/
```

### 2. Test API Endpoints
```bash
# Test fee types
curl https://your-backend.vercel.app/api/fee-types/

# Test schools
curl https://your-backend.vercel.app/api/schools/
```

## Troubleshooting

### Common Issues

1. **NOT_FOUND Error**: 
   - Check if `api/index.py` exists and is properly formatted
   - Verify `vercel.json` routes are correct

2. **CORS Error**:
   - Ensure CORS headers are set in all responses
   - Check frontend is making requests to correct URL

3. **Database Error**:
   - Verify all environment variables are set
   - Check database connection details

4. **Import Error**:
   - Ensure Python path is set correctly in `api/index.py`
   - Check Django settings module path

### Debug Mode
Add this to your handler for debugging:
```python
import traceback
return {
    'statusCode': 500,
    'headers': {'Content-Type': 'application/json'},
    'body': json.dumps({
        'error': str(e),
        'traceback': traceback.format_exc()
    })
}
```

## Environment Variables

### Required Variables
- `DJANGO_SETTINGS_MODULE`: Set to `config.settings_production`
- `SECRET_KEY`: Django secret key
- `DEBUG`: Set to `False`
- `DB_*`: Database connection details

### Optional Variables
- `EMAIL_*`: Email configuration
- `REDIS_URL`: Cache configuration
- `MAINTENANCE_MODE`: Maintenance mode flag

## Architecture

### How It Works
1. **Vercel Routes**: All requests go to `api/index.py`
2. **Serverless Handler**: Converts Vercel events to Django WSGI format
3. **Django Application**: Processes requests through normal Django URL routing
4. **Response Conversion**: Converts Django responses back to Vercel format

### File Structure
```
backend/
  api/
    index.py          # Main serverless function
  vercel.json         # Vercel configuration
  config/
    settings_production.py  # Production Django settings
  schools/
    models.py          # Django models
    serializers.py     # API serializers
    urls.py           # Django URL patterns
```

## Performance Tips

1. **Cold Starts**: Django has cold starts, consider using Vercel Pro for better performance
2. **Database**: Use connection pooling for better performance
3. **Static Files**: Consider using CDN for static files
4. **Caching**: Implement Redis caching for frequently accessed data

## Security

1. **Environment Variables**: Never commit secrets to git
2. **CORS**: Restrict CORS origins in production
3. **HTTPS**: Always use HTTPS in production
4. **Authentication**: Implement proper JWT authentication
