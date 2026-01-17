#!/usr/bin/env tsx
import 'dotenv/config';
import { db } from '../server/db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

const adminEmail = 'David.Monis.Weston@PurposefulVentures.org';

async function verifyAdmin() {
  try {
    console.log(`Verifying and setting admin for: ${adminEmail}`);

    const result = await db
      .update(users)
      .set({
        emailVerified: true,
        role: 'admin'
      })
      .where(eq(users.email, adminEmail))
      .returning();

    if (result.length > 0) {
      console.log('✅ Success! User verified and set as admin:');
      console.log(`   Email: ${result[0].email}`);
      console.log(`   Role: ${result[0].role}`);
      console.log(`   Email Verified: ${result[0].emailVerified}`);
    } else {
      console.log('❌ User not found. Please register first.');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

verifyAdmin();
