import { createPasswordResetToken } from '../server/auth';
import { sendPasswordResetEmail } from '../server/emailService';

async function testPasswordResetEmail() {
  const testEmail = process.argv[2];

  if (!testEmail) {
    console.error('❌ Please provide an email address as an argument');
    console.log('Usage: npx tsx scripts/test-password-reset-email.ts your-email@example.com');
    process.exit(1);
  }

  console.log(`🔄 Testing password reset email for: ${testEmail}`);

  // Check SMTP configuration
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  const appUrl = process.env.APP_URL;

  console.log('📧 SMTP Configuration:');
  console.log(`  - EMAIL_USER: ${emailUser ? '✅ Set' : '❌ Not set'}`);
  console.log(`  - EMAIL_PASSWORD: ${emailPassword ? '✅ Set' : '❌ Not set'}`);
  console.log(`  - APP_URL: ${appUrl || '❌ Not set'}`);

  if (!emailUser || !emailPassword) {
    console.error('❌ SMTP not configured. Cannot send emails.');
    process.exit(1);
  }

  try {
    // Create reset token
    console.log('\n🔑 Creating password reset token...');
    const token = await createPasswordResetToken(testEmail);

    if (!token) {
      console.log('ℹ️  No user found with that email (this is expected for security)');
      console.log('✅ The API would still return success to not reveal if the email exists');
      return;
    }

    console.log(`✅ Token created: ${token.substring(0, 10)}...`);

    // Send email
    console.log('\n📧 Sending password reset email...');
    await sendPasswordResetEmail(testEmail, token);
    console.log('✅ Email sent successfully!');
    console.log(`\n🔗 Reset link: ${appUrl}/reset-password?token=${token}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

testPasswordResetEmail();
