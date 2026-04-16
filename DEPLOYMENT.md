# Vercel Deployment Guide

## 📋 Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Push your code to GitHub
3. **Database**: PostgreSQL database (recommended for production)
4. **Environment Variables**: Configure all required environment variables

## 🚀 Deployment Steps

### 1. Deploy Backend API

1. **Push Backend to GitHub**:
   ```bash
   cd backend
   git add .
   git commit -m "Configure for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Select the `backend` folder as root directory
   - Framework preset: "Python"

3. **Configure Environment Variables**:
   ```
   SECRET_KEY=your-secret-key-here
   DJANGO_SETTINGS_MODULE=config.settings_production
   DEBUG=False
   DB_NAME=your_postgres_db_name
   DB_USER=your_postgres_user
   DB_PASSWORD=your_postgres_password
   DB_HOST=your_postgres_host
   DB_PORT=5432
   EMAIL_HOST=smtp.gmail.com
   EMAIL_HOST_USER=your_email@gmail.com
   EMAIL_HOST_PASSWORD=your_email_password
   REDIS_URL=redis://localhost:6379/1
   JWT_SECRET_KEY=your-jwt-secret-key
   CORS_ALLOWED_ORIGINS=https://your-frontend-domain.vercel.app
   ```

4. **Deploy**: Click "Deploy"

### 2. Deploy Frontend

1. **Push Frontend to GitHub**:
   ```bash
   cd frontend
   git add .
   git commit -m "Configure for Vercel deployment"
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Select the `frontend` folder as root directory
   - Framework preset: "Next.js"

3. **Configure Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-domain.vercel.app/api
   NODE_ENV=production
   ```

4. **Deploy**: Click "Deploy"

## 🔧 Configuration Files Created

### Backend Files:
- `api/index.py` - Vercel serverless function entry point
- `vercel.json` - Vercel configuration
- `config/settings_production.py` - Production Django settings
- `requirements.txt` - Updated with production dependencies

### Frontend Files:
- `vercel.json` - Vercel configuration
- `.env.example` - Environment variables template

## 📊 Database Setup

### PostgreSQL (Recommended)
1. Create a PostgreSQL database (Vercel Postgres, Supabase, or Railway)
2. Get connection details
3. Add to environment variables
4. Run migrations:
   ```bash
   # After deployment, you may need to run migrations
   # You can do this via Vercel CLI or create a migration endpoint
   ```

### SQLite (Development Only)
- Works out of the box but not recommended for production

## 🔄 CORS Configuration

Update `CORS_ALLOWED_ORIGINS` in production settings:
```python
CORS_ALLOWED_ORIGINS = [
    "https://your-frontend-domain.vercel.app",
    "https://your-custom-domain.com",
]
```

## 📱 Testing Deployment

1. **Backend Health Check**:
   ```
   GET https://your-backend-domain.vercel.app/api/
   ```

2. **Frontend Access**:
   ```
   https://your-frontend-domain.vercel.app
   ```

## 🛠️ Troubleshooting

### Common Issues:

1. **CORS Errors**:
   - Check CORS_ALLOWED_ORIGINS in backend settings
   - Ensure frontend URL is whitelisted

2. **Database Connection**:
   - Verify database credentials
   - Check if database is accessible from Vercel

3. **Environment Variables**:
   - Ensure all required variables are set
   - Check for typos in variable names

4. **Build Failures**:
   - Check requirements.txt for missing dependencies
   - Verify Python version compatibility

## 📝 Post-Deployment Tasks

1. **Run Migrations**: Create a migration endpoint or use Vercel CLI
2. **Create Superuser**: Create admin user for Django admin
3. **Load Initial Data**: Populate with initial data if needed
4. **Set Up Monitoring**: Configure error tracking and monitoring

## 🔄 Continuous Deployment

Both frontend and backend will automatically deploy when you push to GitHub.

## 📞 Support

- Vercel Documentation: [vercel.com/docs](https://vercel.com/docs)
- Django Documentation: [docs.djangoproject.com](https://docs.djangoproject.com/)
- Next.js Documentation: [nextjs.org/docs](https://nextjs.org/docs/)
