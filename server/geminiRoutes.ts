import { Router } from "express";
import { requireAuth } from "./auth";
import { db } from "./db";
import { settings } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const DEFAULT_MODEL = "gemini-3-flash-preview";

async function getGeminiModel(): Promise<string> {
  try {
    const [setting] = await db.select().from(settings).where(eq(settings.key, "geminiModel"));
    return setting?.value || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

// Generate content with Gemini
router.post("/generate", requireAuth, async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key not configured. Please contact administrator."
      });
    }

    const { prompt, systemInstruction, useGoogleSearch, model } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const defaultModel = await getGeminiModel();
    const geminiModel = model || defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;

    const tools = useGoogleSearch ? [{ google_search: {} }] : [];

    const body: any = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", JSON.stringify(errorData, null, 2));
      return res.status(response.status).json({
        error: errorData.error?.message || "Gemini API request failed",
      });
    }

    const data = await response.json();

    // Log grounding metadata for debugging
    const candidate = data.candidates?.[0];
    const groundingMeta = candidate?.groundingMetadata;
    const chunkTitles = groundingMeta?.groundingChunks?.map((c: any) => c?.web?.title).filter(Boolean) || [];
    const queriesCount = groundingMeta?.webSearchQueries?.length || 0;
    const chunksCount = groundingMeta?.groundingChunks?.length || 0;

    console.log("[Gemini] Response received:", {
      hasCandidate: !!candidate,
      hasGroundingMetadata: !!groundingMeta,
      groundingChunksCount: chunksCount,
      groundingSupportsCount: groundingMeta?.groundingSupports?.length || 0,
      searchQueriesUsed: groundingMeta?.webSearchQueries || [],
      chunkTitles: chunkTitles,
      useGoogleSearchRequested: useGoogleSearch,
    });

    // Warn if grounding coverage is poor
    if (useGoogleSearch && queriesCount > 0 && chunksCount < queriesCount * 0.3) {
      console.warn("[Gemini] WARNING: Low grounding coverage detected", {
        queriesExecuted: queriesCount,
        chunksReturned: chunksCount,
        coverageRatio: chunksCount / queriesCount,
        suggestion: "Consider strengthening prompt to focus on fewer, more verifiable topics"
      });
    }

    res.json(data);
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ error: error.message || "Failed to generate content" });
  }
});

export default router;
