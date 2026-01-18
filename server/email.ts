import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Check if email configuration is present
    const host = process.env.EMAIL_HOST;
    const port = process.env.EMAIL_PORT;
    const user = process.env.EMAIL_USER;
    const password = process.env.EMAIL_PASSWORD;
    const from = process.env.EMAIL_FROM;

    if (!host || !port || !user || !password || !from) {
      console.warn('Email configuration not found. Email functionality will be disabled.');
      console.warn('To enable email, set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM environment variables.');
      return;
    }

    this.config = {
      host,
      port: parseInt(port, 10),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user,
        pass: password,
      },
      from,
    };

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
    });

    console.log('Email service initialized successfully');
  }

  async sendReportEmail(to: string, topicName: string, summary: string, sources: Array<{ title: string; url: string }>, timePeriod?: string) {
    if (!this.transporter || !this.config) {
      throw new Error('Email service is not configured. Please set email environment variables.');
    }

    // Normalize email addresses (trim whitespace, handle comma-separated list)
    const normalizedTo = to.split(',').map(e => e.trim()).filter(e => e).join(', ');

    // Convert markdown summary to HTML
    const htmlContent = this.convertMarkdownToHTML(summary, sources, topicName, timePeriod);

    const mailOptions = {
      from: this.config.from,
      to: normalizedTo,
      subject: `Daily Summary Report: ${topicName}`,
      html: htmlContent,
      text: this.stripHtml(summary),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  private convertMarkdownToHTML(markdown: string, sources: Array<{ title: string; url: string }>, topicName?: string, timePeriod?: string): string {
    // Basic markdown to HTML conversion
    let html = markdown
      // Headers
      .replace(/### (.*?)$/gm, '<h3 style="color: #3b82f6; font-size: 18px; font-weight: bold; margin: 20px 0 10px 0;">$1</h3>')
      .replace(/## (.*?)$/gm, '<h2 style="color: #3b82f6; font-size: 20px; font-weight: bold; margin: 20px 0 10px 0;">$1</h2>')
      .replace(/# (.*?)$/gm, '<h1 style="color: #3b82f6; font-size: 24px; font-weight: bold; margin: 20px 0 10px 0;">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #3b82f6;">$1</strong>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #3b82f6; text-decoration: underline;">$1</a>')
      // Lists
      .replace(/^\* (.*?)$/gm, '<li style="margin: 5px 0;">$1</li>')
      .replace(/^- (.*?)$/gm, '<li style="margin: 5px 0;">$1</li>')
      // Paragraphs
      .replace(/\n\n/g, '</p><p style="margin: 10px 0;">');

    // Wrap list items in ul tags
    html = html.replace(/(<li.*?<\/li>\n?)+/g, '<ul style="margin: 10px 0; padding-left: 20px;">$&</ul>');

    // Add sources section if available
    let sourcesHtml = '';
    if (sources && sources.length > 0) {
      sourcesHtml = '<div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">';
      sourcesHtml += '<h3 style="color: #3b82f6; font-size: 18px; font-weight: bold; margin-bottom: 10px;">Sources</h3>';
      sourcesHtml += '<ul style="list-style: none; padding: 0;">';
      sources.forEach(source => {
        sourcesHtml += `<li style="margin: 8px 0;">
          <a href="${source.url}" style="color: #3b82f6; text-decoration: none; background-color: #eff6ff; padding: 4px 8px; border-radius: 4px; display: inline-block;">
            ${source.title}
          </a>
        </li>`;
      });
      sourcesHtml += '</ul></div>';
    }

    // Build header section with branding and report info
    const headerHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); background-color: #3b82f6; border-radius: 8px 8px 0 0; margin: -30px -30px 25px -30px;">
        <tr>
          <td style="padding: 25px;">
            <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 24px; font-weight: bold; mso-line-height-rule: exactly;">
              <span style="color: #ffffff;">Daily Summarizer</span>
            </h1>
            <p style="color: #bfdbfe; margin: 0; font-size: 14px; mso-line-height-rule: exactly;">
              <span style="color: #bfdbfe;">by David Monis Weston</span>
            </p>
          </td>
        </tr>
      </table>
      ${topicName ? `<div style="margin-bottom: 20px;">
        <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 10px 0;"><span style="color: #1f2937;">Report: ${topicName}</span></h2>
        ${timePeriod ? `<p style="color: #6b7280; font-size: 14px; margin: 0;"><span style="color: #6b7280;">Time Period: ${timePeriod}</span></p>` : ''}
      </div>` : ''}
    `;

    // Wrap everything in a container
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9fafb;
          }
          .container {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${headerHtml}
          <p style="margin: 10px 0;">${html}</p>
          ${sourcesHtml}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            <p>This report was automatically generated by Daily Summarizer (by David Monis Weston).</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*/g, '')
      .replace(/\n\n+/g, '\n\n');
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }
}

// Export a singleton instance
export const emailService = new EmailService();
