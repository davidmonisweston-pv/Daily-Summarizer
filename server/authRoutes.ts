import { Router } from "express";
import { registerUser, loginUser, verifyEmailToken, requireAuth, requireAdmin } from "./auth";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "Email, password, and display name are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    await registerUser(email, password, displayName);

    const smtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS;

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

export default router;
