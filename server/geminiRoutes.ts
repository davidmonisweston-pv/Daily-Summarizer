import { Router } from "express";
import { requireAuth } from "./auth";

const router = Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

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

    const geminiModel = model || "gemini-2.0-flash-exp";
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
      console.error("Gemini API error:", errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || "Gemini API request failed",
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ error: error.message || "Failed to generate content" });
  }
});

export default router;
