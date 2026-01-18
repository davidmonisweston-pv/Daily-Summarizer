import { Router } from "express";
import { requireAuth, requireAdmin } from "./auth";
import { db } from "./db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  geminiModel: "gemini-3-flash-preview",
};

// Get all settings (admin only)
router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allSettings = await db.select().from(settings);

    // Merge with defaults
    const settingsMap: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const setting of allSettings) {
      settingsMap[setting.key] = setting.value;
    }

    res.json(settingsMap);
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: error.message || "Failed to fetch settings" });
  }
});

// Get a specific setting (authenticated users)
router.get("/:key", requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));

    if (setting) {
      res.json({ key: setting.key, value: setting.value });
    } else if (DEFAULT_SETTINGS[key]) {
      res.json({ key, value: DEFAULT_SETTINGS[key] });
    } else {
      res.status(404).json({ error: "Setting not found" });
    }
  } catch (error: any) {
    console.error("Error fetching setting:", error);
    res.status(500).json({ error: error.message || "Failed to fetch setting" });
  }
});

// Update a setting (admin only)
router.put("/:key", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: "Value is required" });
    }

    // Upsert the setting
    const existing = await db.select().from(settings).where(eq(settings.key, key));

    if (existing.length > 0) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value });
    }

    res.json({ key, value });
  } catch (error: any) {
    console.error("Error updating setting:", error);
    res.status(500).json({ error: error.message || "Failed to update setting" });
  }
});

export default router;
