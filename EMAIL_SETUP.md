# Email Configuration Guide

This guide will help you set up email functionality for Daily Summarizer so you can send reports directly to your email.

## Overview

The Daily Summarizer now supports sending research reports via email. Each topic can have its own email address configured, allowing you to send reports to different recipients based on the topic.

## Setup Instructions

### 1. Configure Email Environment Variables

Create a `.env` file in the root directory of the project (or update your existing one) with the following variables:

```bash
# Email Configuration (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=Daily Summarizer <your-email@gmail.com>
```

### 2. Gmail Configuration (Recommended)

If you're using Gmail:

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the 16-character password
   - Use this password as `EMAIL_PASSWORD` in your `.env` file

3. **Configure `.env`**:
```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Your 16-character app password
EMAIL_FROM=Daily Summarizer <your-email@gmail.com>
```

### 3. Other Email Providers

#### Outlook/Office 365
```bash
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
EMAIL_FROM=Daily Summarizer <your-email@outlook.com>
```

#### Custom SMTP Server
```bash
EMAIL_HOST=smtp.your-domain.com
EMAIL_PORT=587  # or 465 for SSL
EMAIL_SECURE=false  # set to true if using port 465
EMAIL_USER=your-username
EMAIL_PASSWORD=your-password
EMAIL_FROM=Daily Summarizer <noreply@your-domain.com>
```

## Using the Email Feature

### 1. Configure Email Address for a Topic

1. Navigate to your Daily Summarizer dashboard
2. Click on a topic in your Monitor List
3. Click the **Settings** icon (⚙️) to expand the topic configuration
4. Find the **"Email Reports To"** field at the top
5. Enter the email address where you want to receive reports for this topic
6. The email address is automatically saved

### 2. Send a Report via Email

1. Generate a report by clicking **"Scan All"** or the refresh icon for a specific topic
2. Once the report is generated, click on it to expand the full summary
3. Click the **"Send Email"** button at the top of the report
4. The report will be sent to the configured email address
5. You'll receive a confirmation message when the email is sent successfully

### 3. Email Format

The emails are formatted as HTML with:
- **Subject**: "Daily Summary Report: [Topic Name]"
- **Body**: Beautifully formatted report with:
  - Headers, bold text, and links styled for readability
  - Verified sources section with clickable links
  - Professional footer

## Troubleshooting

### Email not sending?

1. **Check environment variables**: Make sure all required variables are set in your `.env` file
2. **Restart the server**: After updating `.env`, restart your server for changes to take effect
3. **Check console logs**: Look for error messages in the server console
4. **Verify credentials**: Make sure your email and password are correct
5. **Check firewall**: Ensure outgoing SMTP connections are allowed

### Common Errors

#### "Email service is not configured"
- This means the environment variables are missing or incorrect
- Check your `.env` file and restart the server

#### "Authentication failed"
- For Gmail: Make sure you're using an App Password, not your regular password
- Verify your credentials are correct

#### "Connection timeout"
- Check if your firewall is blocking SMTP connections
- Try a different SMTP port (587 or 465)

## Security Best Practices

1. **Never commit `.env` files**: The `.env` file is in `.gitignore` by default
2. **Use App Passwords**: For Gmail, always use App Passwords instead of your main password
3. **Limit access**: Only share email credentials with trusted team members
4. **Regular rotation**: Change your email passwords regularly

## Features

- ✅ Configure different email addresses per topic
- ✅ Beautiful HTML email formatting
- ✅ Includes verified sources with clickable links
- ✅ Markdown to HTML conversion
- ✅ Professional email styling
- ✅ Real-time sending status
- ✅ Error handling and user feedback

## Need Help?

If you encounter any issues setting up email functionality, please:
1. Check the troubleshooting section above
2. Review the server console logs for error messages
3. Verify your SMTP settings with your email provider
4. Open an issue on GitHub if the problem persists
