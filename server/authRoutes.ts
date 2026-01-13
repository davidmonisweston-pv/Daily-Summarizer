import { Router } from "express";
import { getAuthCodeUrl, handleCallback, getOrCreateUser, requireAuth, requireAdmin } from "./auth";
import { db } from "./db";
import { users, allowedDomains } from "../shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Login - redirects to Microsoft login
router.get("/login", async (req, res) => {
  try {
    const state = Math.random().toString(36).substring(7);
    req.session.authState = state;
    
    const authCodeUrl = await getAuthCodeUrl(state);
    res.redirect(authCodeUrl);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to initiate login" });
  }
});

// Callback from Microsoft
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    // Verify state to prevent CSRF
    if (state !== req.session.authState) {
      return res.status(400).json({ error: "Invalid state parameter" });
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "No authorization code received" });
    }

    // Exchange code for token
    const tokenResponse = await handleCallback(code);

    if (!tokenResponse?.account) {
      return res.status(400).json({ error: "Failed to get user information" });
    }

    // Extract user information
    const profile = {
      oid: tokenResponse.account.homeAccountId.split(".")[0],
      email: tokenResponse.account.username,
      name: tokenResponse.account.name || tokenResponse.account.username,
    };

    // Get or create user in database
    const user = await getOrCreateUser(profile);

    // Store user in session
    req.session.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      microsoftId: user.microsoftId || "",
    };

    // Redirect to app
    res.redirect(process.env.APP_URL || "http://localhost:5000");
  } catch (error: any) {
    console.error("Callback error:", error);
    const errorMessage = encodeURIComponent(error.message || "Authentication failed");
    res.redirect(`${process.env.APP_URL}?error=${errorMessage}`);
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
    const allUsers = await db.select().from(users);
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

// Admin: Get allowed domains
router.get("/domains", requireAdmin, async (req, res) => {
  try {
    const domains = await db.select().from(allowedDomains);
    res.json(domains);
  } catch (error) {
    console.error("Error fetching domains:", error);
    res.status(500).json({ error: "Failed to fetch domains" });
  }
});

// Admin: Add allowed domain
router.post("/domains", requireAdmin, async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Invalid domain" });
    }

    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return res.status(400).json({ error: "Invalid domain format" });
    }

    const newDomain = await db
      .insert(allowedDomains)
      .values({
        domain: domain.toLowerCase(),
        addedBy: req.session.user!.id,
      })
      .returning();

    res.json(newDomain[0]);
  } catch (error: any) {
    if (error.code === "23505") {
      // Unique constraint violation
      return res.status(400).json({ error: "Domain already exists" });
    }
    console.error("Error adding domain:", error);
    res.status(500).json({ error: "Failed to add domain" });
  }
});

// Admin: Delete allowed domain
router.delete("/domains/:id", requireAdmin, async (req, res) => {
  try {
    const domainId = parseInt(req.params.id);

    await db.delete(allowedDomains).where(eq(allowedDomains.id, domainId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting domain:", error);
    res.status(500).json({ error: "Failed to delete domain" });
  }
});

export default router;
