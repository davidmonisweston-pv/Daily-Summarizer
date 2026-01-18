import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db } from "./db";
import { users, verificationTokens, passwordResetTokens } from "../shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { sendVerificationEmail, sendPasswordResetEmail } from "./emailService";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      displayName: string;
      firstName: string;
      lastName: string;
      role: string;
      emailVerified: boolean;
    }
  }
}

export interface AuthRequest extends Request {
  user?: Express.User;
  isAuthenticated: () => boolean;
}

// Middleware to check if user is authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && (req.session as any).user) {
    (req as AuthRequest).user = (req.session as any).user;
    (req as AuthRequest).isAuthenticated = () => true;
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// Middleware to check if user is admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session && (req.session as any).user && (req.session as any).user.role === "admin") {
    (req as AuthRequest).user = (req.session as any).user;
    (req as AuthRequest).isAuthenticated = () => true;
    return next();
  }
  return res.status(403).json({ error: "Forbidden: Admin access required" });
}

// Hash password with bcrypt
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Verify password with bcrypt
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Generate verification token
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Create verification token for user
export async function createVerificationToken(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await db.insert(verificationTokens).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

// Register new user
export async function registerUser(email: string, password: string, firstName: string, lastName: string) {
  // Normalize email to lowercase for case-insensitive matching
  const normalizedEmail = email.toLowerCase();

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser.length > 0) {
    throw new Error("User with this email already exists");
  }

  // Validate password strength
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  // Trim names
  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();

  if (trimmedFirstName.length === 0 || trimmedLastName.length === 0) {
    throw new Error("First name and last name cannot be empty");
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Check if SMTP is configured
  const smtpConfigured = (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) ||
                         (process.env.SMTP_USER && process.env.SMTP_PASS);

  // Create user (auto-verify if SMTP not configured)
  const newUser = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      displayName: `${trimmedFirstName} ${trimmedLastName}`,
      role: "user",
      emailVerified: !smtpConfigured, // Auto-verify if no SMTP
    })
    .returning();

  // Only send verification email if SMTP is configured
  if (smtpConfigured) {
    // Create verification token
    const token = await createVerificationToken(newUser[0].id);

    // Send verification email
    try {
      await sendVerificationEmail(email, token);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // Delete the user if email fails
      await db.delete(users).where(eq(users.id, newUser[0].id));
      throw new Error("Failed to send verification email. Please check your email configuration.");
    }
  } else {
    console.log(`⚠️  SMTP not configured - User ${email} auto-verified for development`);
  }

  return newUser[0];
}

// Verify email with token
export async function verifyEmailToken(token: string) {
  const verificationToken = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        gt(verificationTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (verificationToken.length === 0) {
    throw new Error("Invalid or expired verification token");
  }

  // Update user email verified status
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.id, verificationToken[0].userId));

  // Delete used token
  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.id, verificationToken[0].id));

  return true;
}

// Login user
export async function loginUser(email: string, password: string) {
  // Normalize email to lowercase for case-insensitive matching
  const normalizedEmail = email.toLowerCase();

  // Find user by email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (user.length === 0) {
    throw new Error("Invalid email or password");
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user[0].passwordHash);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  // Check if email is verified
  if (!user[0].emailVerified) {
    throw new Error("Please verify your email before logging in");
  }

  // Update last login time
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user[0].id));

  return {
    id: user[0].id,
    email: user[0].email,
    displayName: user[0].displayName,
    firstName: user[0].firstName,
    lastName: user[0].lastName,
    role: user[0].role,
    emailVerified: user[0].emailVerified,
  };
}

// Create password reset token for user
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase();

  // Find user by email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (user.length === 0) {
    // Don't reveal if email exists or not for security
    return null;
  }

  // Delete any existing password reset tokens for this user
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user[0].id));

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.insert(passwordResetTokens).values({
    userId: user[0].id,
    token,
    expiresAt,
  });

  return token;
}

// Verify password reset token and return user email
export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const resetToken = await db
    .select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (resetToken.length === 0) {
    return null;
  }

  // Get user email
  const user = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, resetToken[0].userId))
    .limit(1);

  return user.length > 0 ? user[0].email : null;
}

// Reset password with token
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const resetToken = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (resetToken.length === 0) {
    throw new Error("Invalid or expired reset token");
  }

  // Validate new password
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long");
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password
  await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, resetToken[0].userId));

  // Delete used token
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.id, resetToken[0].id));

  return true;
}
