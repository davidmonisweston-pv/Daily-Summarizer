import { registerUser } from '../server/auth';

async function createTestUser() {
  const email = process.argv[2] || 'david.monis.weston@purposefulventures.org';
  const password = process.argv[3] || 'TestPassword123';
  const firstName = process.argv[4] || 'David';
  const lastName = process.argv[5] || 'Weston';

  console.log('Creating test user...');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Name:', `${firstName} ${lastName}`);

  try {
    const user = await registerUser(email, password, firstName, lastName);
    console.log('✅ User created successfully!');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Email Verified:', user.emailVerified);
    console.log('\nYou can now:');
    console.log('1. Login with this email and password');
    console.log('2. Test the password reset feature');
  } catch (error: any) {
    console.error('❌ Failed to create user:', error.message);
    process.exit(1);
  }
}

createTestUser();
