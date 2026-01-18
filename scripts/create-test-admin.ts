import { db } from '../server/db';
import { users } from '../shared/schema';
import { hashPassword } from '../server/auth';

async function createTestAdmin() {
  const email = process.argv[2] || 'david.monis.weston@purposefulventures.org';
  const password = process.argv[3] || 'TestPassword123';
  const firstName = process.argv[4] || 'David';
  const lastName = process.argv[5] || 'Weston';

  console.log('Creating test admin user...');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Name:', `${firstName} ${lastName}`);

  try {
    const normalizedEmail = email.toLowerCase();
    const passwordHash = await hashPassword(password);

    const user = await db.insert(users).values({
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      role: 'admin',
      emailVerified: true, // Auto-verify for test admin
    }).returning();

    console.log('✅ Admin user created successfully!');
    console.log('User ID:', user[0].id);
    console.log('Email:', user[0].email);
    console.log('Role:', user[0].role);
    console.log('Email Verified:', user[0].emailVerified);
    console.log('\nYou can now:');
    console.log('1. Login with this email and password');
    console.log('2. Access the admin dashboard');
    console.log('3. Test the password reset feature');
  } catch (error: any) {
    console.error('❌ Failed to create admin user:', error.message);
    process.exit(1);
  }
}

createTestAdmin();
