# Authentication Setup Guide

This guide will help you set up Microsoft Azure AD (Entra ID) authentication for the Daily Summarizer application.

## Overview

The Daily Summarizer now includes enterprise-grade authentication with:
- **Microsoft SSO**: Single Sign-On using Microsoft/Azure AD accounts
- **User Management**: Admin dashboard to manage users and permissions
- **Domain Whitelist**: Allow automatic access for entire email domains
- **User-Specific Reports**: Each user has their own set of topics and receives emails at their own address

## Prerequisites

- An Azure account (free tier works fine)
- Access to Azure Active Directory (now called Microsoft Entra ID)
- PostgreSQL database (configured via DATABASE_URL)

## Step 1: Create an Azure AD App Registration

1. **Navigate to Azure Portal**
   - Go to [https://portal.azure.com](https://portal.azure.com)
   - Sign in with your Microsoft account

2. **Access Azure Active Directory**
   - Search for "Azure Active Directory" or "Microsoft Entra ID" in the top search bar
   - Click on "App registrations" in the left menu

3. **Create New Registration**
   - Click "+ New registration"
   - Fill in the following:
     - **Name**: `Daily Summarizer` (or your preferred name)
     - **Supported account types**: Select one of:
       - "Accounts in this organizational directory only" (Single tenant - for your organization only)
       - "Accounts in any organizational directory" (Multi-tenant - for multiple organizations)
     - **Redirect URI**: 
       - Platform: `Web`
       - URI: `http://localhost:5000/api/auth/callback` (for development)
       - For production, use your actual domain: `https://yourdomain.com/api/auth/callback`
   - Click "Register"

4. **Note Your Application (client) ID**
   - After registration, you'll see the "Overview" page
   - Copy the **Application (client) ID** - you'll need this for `AZURE_AD_CLIENT_ID`
   - Copy the **Directory (tenant) ID** - you'll need this for `AZURE_AD_TENANT_ID`

5. **Create a Client Secret**
   - In the left menu, click "Certificates & secrets"
   - Click "+ New client secret"
   - Add a description (e.g., "Daily Summarizer Secret")
   - Choose an expiration period (recommendation: 24 months)
   - Click "Add"
   - **IMPORTANT**: Copy the secret **Value** immediately - you'll need this for `AZURE_AD_CLIENT_SECRET`
   - This value is only shown once and cannot be retrieved later!

6. **Configure API Permissions**
   - In the left menu, click "API permissions"
   - You should see "User.Read" already added by default
   - If not, click "+ Add a permission" → "Microsoft Graph" → "Delegated permissions" → Search for and add:
     - `User.Read` (allows reading basic user profile)
   - Click "Grant admin consent" if you have admin rights (optional but recommended)

## Step 2: Configure Environment Variables

Create or update your `.env` file in the project root with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/daily_summarizer

# Email Configuration (existing)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=Daily Summarizer <your-email@gmail.com>

# Microsoft Azure AD / Entra ID Configuration
AZURE_AD_CLIENT_ID=your-application-client-id-from-step-4
AZURE_AD_CLIENT_SECRET=your-client-secret-from-step-5
AZURE_AD_TENANT_ID=your-directory-tenant-id-from-step-4
AZURE_AD_REDIRECT_URI=http://localhost:5000/api/auth/callback

# Session Secret (generate a random string - IMPORTANT for security!)
SESSION_SECRET=your-very-long-random-secret-here-change-this

# Google Gemini API Key (existing)
VITE_GEMINI_API_KEY=your-gemini-api-key

# Application URL
APP_URL=http://localhost:5000

# First Admin Email
# This email will automatically be given admin privileges on first login
FIRST_ADMIN_EMAIL=your-admin-email@example.com
```

### Generating a Secure Session Secret

Use one of these methods to generate a secure session secret:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

## Step 3: Run Database Migrations

The authentication system requires new database tables. Run the migration:

```bash
# Generate migration if needed
npm run db:generate

# Apply migrations to your database
npm run db:migrate
```

This will create the following tables:
- `users` - Stores user information (id, email, displayName, role, microsoftId)
- `allowed_domains` - Domain whitelist for automatic user access
- `session` - Stores Express session data
- Updates `topics` table to include `user_id` foreign key

## Step 4: Start the Application

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## Step 5: First Admin Setup

1. **Access the application** at `http://localhost:5000`

2. **First login** - You'll be redirected to the login page
   - Click "Sign in with Microsoft"
   - You'll be redirected to Microsoft's login page
   - Sign in with the email address you set as `FIRST_ADMIN_EMAIL`
   - Grant permissions when prompted
   - You'll be redirected back to the application

3. **Admin access** - The first user with the matching email will automatically receive admin privileges

4. **Access Admin Dashboard** - Click the "Admin" button in the header to manage users and domains

## Using the Admin Dashboard

### User Management

As an admin, you can:

1. **View all users** - See all registered users with their roles and last login times
2. **Promote/demote users** - Toggle users between "user" and "admin" roles
3. **Delete users** - Remove users from the system (cannot delete yourself)

### Domain Whitelist

The domain whitelist allows automatic user registration:

1. **Add a domain** 
   - Enter a domain name (e.g., `example.com`)
   - Click "Add Domain"
   - Any user with an email from this domain can now sign in automatically

2. **Remove a domain**
   - Click the trash icon next to the domain
   - Users from this domain will no longer be able to auto-register (existing users remain)

**Example use cases:**
- Add your company domain: `yourcompany.com` - all employees can sign in
- Add multiple domains for partner organizations
- Remove a domain if you want to control access more strictly

## User Flow

### For New Users

1. User visits the application
2. Clicks "Sign in with Microsoft"
3. Authenticates with Microsoft
4. System checks if:
   - User's email domain is in the allowed domains list, OR
   - User's email matches the FIRST_ADMIN_EMAIL
5. If allowed, user account is created and they gain access
6. If not allowed, user sees an error: "Domain not allowed. Please contact an administrator."

### For Existing Users

1. User visits the application
2. Clicks "Sign in with Microsoft"
3. Authenticates with Microsoft
4. System updates their last login time
5. User is logged in and sees their personal dashboard

## User-Specific Features

### Topics and Reports

- Each user has their own set of research topics
- Topics are not shared between users
- Each user's reports are independent

### Email Delivery

- Reports default to sending to the user's email (from Microsoft account)
- Users can optionally specify a different email address per topic
- Daily automated reports are sent to each user for their topics

### Data Isolation

- Users can only see and manage their own topics
- Summaries are tied to specific topics and users
- No cross-user data visibility (except for admins managing users)

## Production Deployment

### Important Security Considerations

1. **Use HTTPS in production**
   ```bash
   # Update redirect URI in Azure AD to use https://
   AZURE_AD_REDIRECT_URI=https://yourdomain.com/api/auth/callback
   APP_URL=https://yourdomain.com
   ```

2. **Update Azure AD App Registration**
   - Add your production URL as a redirect URI
   - Keep the localhost URI for development if needed

3. **Environment Variables**
   - Use strong, unique SESSION_SECRET
   - Store secrets securely (use environment variables, not .env files in production)
   - Consider using Azure Key Vault or similar for secret management

4. **Database**
   - Use a production-grade PostgreSQL instance
   - Enable SSL connections
   - Regular backups

5. **Session Storage**
   - Sessions are stored in PostgreSQL by default
   - Consider Redis for better performance at scale

### GitHub Actions

Update your `.github/workflows/daily-email.yml` to include the new environment variables:

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  EMAIL_HOST: ${{ secrets.EMAIL_HOST }}
  EMAIL_PORT: ${{ secrets.EMAIL_PORT }}
  EMAIL_SECURE: ${{ secrets.EMAIL_SECURE }}
  EMAIL_USER: ${{ secrets.EMAIL_USER }}
  EMAIL_PASSWORD: ${{ secrets.EMAIL_PASSWORD }}
  EMAIL_FROM: ${{ secrets.EMAIL_FROM }}
```

## Troubleshooting

### Issue: "Invalid redirect URI"

**Solution**: Make sure the redirect URI in your Azure AD app registration exactly matches the one in your .env file. Common mistakes:
- Missing trailing slash
- http vs https mismatch
- Port number mismatch

### Issue: "Domain not allowed" error on login

**Solution**: 
1. Check if your email domain is in the allowed domains list (Admin Dashboard → Domains tab)
2. Or, check if your email matches the FIRST_ADMIN_EMAIL environment variable
3. Have an admin add your domain to the whitelist

### Issue: Session not persisting

**Solution**:
1. Check that SESSION_SECRET is set in .env
2. Check that DATABASE_URL is correctly configured
3. Verify the session table was created in the database

### Issue: "Failed to get user information"

**Solution**:
1. Verify AZURE_AD_CLIENT_ID and AZURE_AD_TENANT_ID are correct
2. Check that the client secret hasn't expired
3. Verify User.Read permission is granted in Azure AD

## Architecture Overview

### Authentication Flow

```
1. User clicks "Sign in with Microsoft"
2. → Redirect to /api/auth/login
3. → Redirect to Microsoft login page
4. → User authenticates with Microsoft
5. → Microsoft redirects to /api/auth/callback with auth code
6. → Server exchanges code for access token
7. → Server gets user profile from Microsoft Graph API
8. → Server checks if user/domain is allowed
9. → Server creates/updates user in database
10. → Server creates session
11. → Redirect to application homepage
```

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  microsoft_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Allowed domains table
CREATE TABLE allowed_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  added_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Topics table (updated)
CREATE TABLE topics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Authentication

- `GET /api/auth/login` - Initiate Microsoft OAuth flow
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user info

### Admin Only

- `GET /api/auth/users` - List all users
- `PATCH /api/auth/users/:id/role` - Update user role
- `DELETE /api/auth/users/:id` - Delete user
- `GET /api/auth/domains` - List allowed domains
- `POST /api/auth/domains` - Add allowed domain
- `DELETE /api/auth/domains/:id` - Remove allowed domain

## Support

For issues or questions:
1. Check this documentation first
2. Review the Azure AD app registration settings
3. Check application logs for error messages
4. Create an issue in the GitHub repository

## License

Same as the main project.
