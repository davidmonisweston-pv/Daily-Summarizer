import { Router } from "express";
import { registerUser, loginUser, verifyEmailToken, requireAuth, requireAdmin, hashPassword, verifyPassword, createPasswordResetToken, verifyPasswordResetToken, resetPasswordWithToken } from "./auth";
import { sendPasswordResetEmail } from "./emailService";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Email, password, first name, and last name are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    await registerUser(email, password, firstName, lastName);

    const smtpConfigured = (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) ||
                           (process.env.SMTP_USER && process.env.SMTP_PASS);

    res.json({
      success: true,
      message: smtpConfigured
        ? "Registration successful! Please check your email to verify your account."
        : "Registration successful! You can now log in."
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    res.status(400).json({ error: error.message || "Registration failed" });
  }
});

// Verify email
router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Invalid verification token" });
    }

    await verifyEmailToken(token);

    // Redirect to login page with success message
    res.redirect(`${process.env.APP_URL}/login?verified=true`);
  } catch (error: any) {
    console.error("Email verification error:", error);
    res.redirect(`${process.env.APP_URL}/login?verified=false&error=${encodeURIComponent(error.message)}`);
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await loginUser(email, password);

    // Store user in session
    req.session.user = user;

    res.json({ success: true, user });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(401).json({ error: error.message || "Login failed" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to logout" });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get("/me", requireAuth, (req, res) => {
  res.json(req.session.user);
});

// Admin: Get all users
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users);

    res.json(allUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Admin: Update user role
router.patch("/users/:id/role", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// Admin: Delete user
router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Don't allow deleting self
    if (req.session.user?.id === userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    await db.delete(users).where(eq(users.id, userId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Temporary endpoint to verify and promote user to admin
router.post("/verify-me", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Update user to verified and admin
    const updated = await db
      .update(users)
      .set({
        emailVerified: true,
        role: "admin",
      })
      .where(eq(users.email, email))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      message: "Account verified and promoted to admin",
      user: updated[0],
    });
  } catch (error: any) {
    console.error("Verify error:", error);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
});

// Profile: Update user name
router.patch("/profile/name", requireAuth, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ error: "First name and last name are required" });
    }

    // Trim whitespace
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (trimmedFirstName.length === 0 || trimmedLastName.length === 0) {
      return res.status(400).json({ error: "First name and last name cannot be empty" });
    }

    // Update user name
    const updated = await db
      .update(users)
      .set({
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        displayName: `${trimmedFirstName} ${trimmedLastName}`, // Keep displayName in sync for now
      })
      .where(eq(users.id, userId))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update session
    req.session.user = {
      ...req.session.user!,
      displayName: `${trimmedFirstName} ${trimmedLastName}`,
    };

    res.json({
      success: true,
      user: {
        id: updated[0].id,
        email: updated[0].email,
        firstName: updated[0].firstName,
        lastName: updated[0].lastName,
        displayName: updated[0].displayName,
        role: updated[0].role,
        emailVerified: updated[0].emailVerified,
      },
    });
  } catch (error: any) {
    console.error("Update name error:", error);
    res.status(500).json({ error: error.message || "Failed to update name" });
  }
});

// Profile: Change password
router.patch("/profile/password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    // Validate new password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters long" });
    }

    // Get user from database
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(currentPassword, user[0].passwordHash);

    if (!isPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await db
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error: any) {
    console.error("Change password error:", error);
    res.status(500).json({ error: error.message || "Failed to change password" });
  }
});

// Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    console.log(`📧 Password reset requested for: ${email}`);
    const token = await createPasswordResetToken(email);

    // Check if SMTP is configured
    const smtpConfigured = (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) ||
                           (process.env.SMTP_USER && process.env.SMTP_PASS);

    console.log(`🔧 SMTP configured: ${smtpConfigured ? 'Yes' : 'No'}`);
    console.log(`🔑 Token created: ${token ? 'Yes' : 'No (user not found)'}`);

    if (token && smtpConfigured) {
      try {
        console.log(`📨 Attempting to send password reset email to: ${email}`);
        await sendPasswordResetEmail(email, token);
        console.log(`✅ Password reset email sent successfully to: ${email}`);
      } catch (error) {
        console.error("❌ Failed to send password reset email:", error);
        return res.status(500).json({ error: "Failed to send password reset email" });
      }
    } else if (!token) {
      console.log(`ℹ️  No user found with email: ${email} (returning success for security)`);
    } else if (!smtpConfigured) {
      console.log(`⚠️  SMTP not configured - cannot send email`);
    }

    // Always return success for security (don't reveal if email exists)
    res.json({
      success: true,
      message: smtpConfigured
        ? "If an account exists with that email, a password reset link has been sent."
        : "Password reset email service is not configured. Please contact an administrator.",
    });
  } catch (error: any) {
    console.error("❌ Password reset request error:", error);
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// Verify password reset token
router.get("/reset-password/verify", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    const email = await verifyPasswordResetToken(token);

    if (!email) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    res.json({ success: true, email });
  } catch (error: any) {
    console.error("Password reset verification error:", error);
    res.status(500).json({ error: error.message || "Verification failed" });
  }
});

// Reset password with token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    await resetPasswordWithToken(token, newPassword);

    res.json({
      success: true,
      message: "Password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error: any) {
    console.error("Password reset error:", error);
    res.status(400).json({ error: error.message || "Failed to reset password" });
  }
});

export default router;
