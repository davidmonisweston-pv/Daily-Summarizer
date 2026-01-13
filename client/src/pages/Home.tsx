import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Settings,
  X,
  Timer,
  Lightbulb,
  Sparkles,
  Send,
  Key,
  AlertCircle,
  FileText,
  LayoutDashboard,
  Database,
  Globe,
  ExternalLink,
  Mail,
  User,
  LogOut,
  Shield,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";

// --- UTILITIES ---

// Simple wrapper for LocalStorage to replace the proprietary window.storage
const storage = {
  get: async (key: string) => {
    const val = localStorage.getItem(key);
    return val ? { value: val } : null;
  },
  set: async (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  delete: async (key: string) => {
    localStorage.removeItem(key);
  },
};

/**
 * Takes the raw text and grounding metadata from Gemini and
 * inserts inline Markdown links for citations.
 * * @param text The raw text output from the model
 * @param chunks The 'groundingChunks' array from metadata (contains URLs)
 * @param supports The 'groundingSupports' array from metadata (contains indices)
 * @returns A string of markdown with inline citations [Source Title](URL)
 */
/**
 * Takes the raw text and grounding metadata from Gemini and
 * inserts inline Markdown links for citations.
 */
export function formatGroundedText(
  text: string,
  chunks: any[],
  supports: any[],
): string {
  if (!text || !supports || supports.length === 0) return text;

  // 1. Validate chunks to prevent crashes on sparse arrays
  const validChunks = chunks || [];

  // 2. Sort supports by descending start index.
  // We use start index descending so we can build the string from the bottom up
  // without messing up the indices of the earlier text.
  const sortedSupports = [...supports].sort((a, b) => {
    return b.segment.endIndex - a.segment.endIndex;
  });

  // 3. We will build the new string using a buffer approach
  let currentText = text;

  sortedSupports.forEach((support) => {
    const start = support.segment.startIndex;
    const end = support.segment.endIndex;

    // Safety check: ensure indices are within bounds of the *current* string state
    // Note: Since we process descending, 'end' should usually differ from currentText length,
    // but 'start' must be valid relative to the original text concept.
    if (start < 0 || end > currentText.length || start >= end) return;

    const chunkIndices = support.groundingChunkIndices;
    if (!chunkIndices || chunkIndices.length === 0) return;

    // --- ROBUST DEDUPLICATION ---
    const rawChunks = chunkIndices
      .map((idx: number) => validChunks[idx])
      .filter((c: any) => c && c.web && c.web.uri); // Filter out undefined/null chunks immediately

    // Filter duplicates based on URL
    const uniqueChunks = rawChunks.reduce((acc: any[], current: any) => {
      const exists = acc.find((item: any) => item.web.uri === current.web.uri);
      if (!exists) acc.push(current);
      return acc;
    }, []);

    if (uniqueChunks.length === 0) return;

    // Create citations string: " [Title](URL) [Title](URL)"
    const citations = uniqueChunks
      .map((chunk: any) => ` [${chunk.web.title}](${chunk.web.uri})`)
      .join("");

    // Insert the citation at the end of the segment
    const before = currentText.substring(0, end);
    const after = currentText.substring(end);
    currentText = before + citations + after;
  });

  return currentText;
}

// --- GEMINI API CLIENT ---

const callGemini = async (
  apiKey: string,
  prompt: string,
  systemInstruction: string | null = null,
  useGoogleSearch = false,
  signal: AbortSignal | null = null,
) => {
  if (!apiKey) throw new Error("API Key is missing");

  const model = "gemini-3-flash-preview"; // Or gemini-1.5-pro-latest
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];

  // 1. Extract Text
  let text = candidate?.content?.parts?.map((p: any) => p.text).join("") || "";

  // 2. Extract Grounding Metadata
  const groundingMetadata = candidate?.groundingMetadata;
  const chunks = groundingMetadata?.groundingChunks || [];
  const supports = groundingMetadata?.groundingSupports || [];

  // 3. APPLY THE FORMATTING HELPER
  // This updates 'text' to include the inline [Source](url) links
  if (useGoogleSearch && supports.length > 0) {
    text = formatGroundedText(text, chunks, supports);
  }

  return { text, groundingMetadata };
};

// --- TYPES ---

interface ResearchProfile {
  sources?: {
    name: string;
    url?: string;
    type?: string;
    description?: string;
  }[];
  searchTerms?: string[];
  keyVoices?: { name: string; platform?: string; handle?: string }[];
  lastUpdated?: string;
  topic?: string;
}

interface Summary {
  id: number;
  topic: string;
  summary: string | null;
  timestamp: string;
  status: "success" | "error";
  errorMessage?: string;
  period?: string;
  hasProfile?: boolean;
  sources?: { title: string; url: string }[];
}

interface SearchProgress {
  current: number;
  total: number;
  currentTopic: string;
}

// --- MAIN COMPONENT ---

export default function Home() {
  const { user, isAdmin, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      setLocation('/login');
    }
  }, [user, authLoading, setLocation]);

  const [initialized, setInitialized] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const [topics, setTopics] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [topicEmails, setTopicEmails] = useState<Record<string, string>>({});

  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [researchProfiles, setResearchProfiles] = useState<
    Record<string, ResearchProfile>
  >({});

  const [loading, setLoading] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState<string | null>(
    null,
  );
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({
    current: 0,
    total: 0,
    currentTopic: "",
  });
  const [cancelled, setCancelled] = useState(false);

  const [searchPeriod, setSearchPeriod] = useState("last 48 hours");
  const [expandedSummary, setExpandedSummary] = useState<number | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);

  const [profileChatInput, setProfileChatInput] = useState<
    Record<string, string>
  >({});
  const [profileChatHistory, setProfileChatHistory] = useState<
    Record<string, { role: string; content: string; timestamp: string }[]>
  >({});
  const [profileChatLoading, setProfileChatLoading] = useState<string | null>(
    null,
  );

  const [searchQueue, setSearchQueue] = useState<string[]>([]);
  const [skippedTopics, setSkippedTopics] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const skipActionRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const periodOptions = [
    { value: "last 48 hours", label: "Last 48 hours" },
    { value: "last week", label: "Last week" },
    { value: "last month", label: "Last month" },
    { value: "since last search", label: "Since last search" },
  ];

  const getDateRangeText = (period: string, topic: string) => {
    const now = new Date();
    let startDate;
    if (period === "since last search") {
      const lastSearch = summaries.find(
        (s) => s.topic === topic && s.status === "success",
      );
      startDate = lastSearch
        ? new Date(lastSearch.timestamp)
        : new Date(now.setDate(now.getDate() - 7));
    } else {
      startDate = new Date(now);
      if (period === "last 48 hours")
        startDate.setHours(startDate.getHours() - 48);
      else if (period === "last week")
        startDate.setDate(startDate.getDate() - 7);
      else if (period === "last month")
        startDate.setMonth(startDate.getMonth() - 1);
    }
    const formatDate = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return `from ${formatDate(startDate)} to ${formatDate(new Date())}`;
  };

  useEffect(() => {
    async function loadData() {
      const t = await storage.get("search-topics");
      if (t?.value) setTopics(JSON.parse(t.value));

      const s = await storage.get("search-summaries");
      if (s?.value) setSummaries(JSON.parse(s.value));

      const rp = await storage.get("research-profiles");
      if (rp?.value) setResearchProfiles(JSON.parse(rp.value));

      const te = await storage.get("topic-emails");
      if (te?.value) setTopicEmails(JSON.parse(te.value));

      const k = await storage.get("gemini-api-key");
      if (k?.value) setApiKey(k.value);
      else setShowKeyInput(true);

      setInitialized(true);
    }
    loadData();
  }, []);

  useEffect(() => {
    if (initialized) storage.set("search-topics", JSON.stringify(topics));
  }, [topics, initialized]);

  useEffect(() => {
    if (initialized) storage.set("topic-emails", JSON.stringify(topicEmails));
  }, [topicEmails, initialized]);

  useEffect(() => {
    if (initialized) storage.set("search-summaries", JSON.stringify(summaries));
  }, [summaries, initialized]);

  useEffect(() => {
    if (initialized)
      storage.set("research-profiles", JSON.stringify(researchProfiles));
  }, [researchProfiles, initialized]);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    storage.set("gemini-api-key", key);
    setShowKeyInput(false);
  };

  const addTopic = () => {
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()]);
      setNewTopic("");
    }
  };

  const removeTopic = (topic: string) => {
    setTopics(topics.filter((t) => t !== topic));
    setSummaries(summaries.filter((s) => s.topic !== topic));
    const newProfiles = { ...researchProfiles };
    delete newProfiles[topic];
    setResearchProfiles(newProfiles);
    const newEmails = { ...topicEmails };
    delete newEmails[topic];
    setTopicEmails(newEmails);
  };

  const updateTopicEmail = (topic: string, email: string) => {
    setTopicEmails({ ...topicEmails, [topic]: email });
  };

  const sendEmail = async (summary: Summary) => {
    const email = topicEmails[summary.topic];

    if (!email) {
      alert("Please configure an email address for this topic first.");
      return;
    }

    if (!summary.summary) {
      alert("No summary content to send.");
      return;
    }

    setSendingEmail(summary.id);

    try {
      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          topicName: summary.topic,
          summary: summary.summary,
          sources: summary.sources || [],
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert("Email sent successfully!");
      } else {
        alert(`Failed to send email: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error sending email:", error);
      alert("Failed to send email. Please check your email configuration.");
    } finally {
      setSendingEmail(null);
    }
  };

  // --- GEMINI PROMPT LOGIC ---

  const generateResearchProfile = async (topic) => {
    setGeneratingProfile(topic);

    try {
      const systemPrompt = `You are a Senior Research Analyst and Information Specialist.
  Your goal is to create a high-leverage monitoring strategy that prioritizes depth, authority, and technical detail over generic news.
  Focus on sources that provide primary data, analysis, and research.`;

      const prompt = `I need a deep-dive research profile for monitoring: "${topic}"

  Create a comprehensive strategy that digs beneath the surface level.

  STRICT CONTENT REQUIREMENTS:
  1. **Sources (8-12 High-Value Targets)**:
   - Prioritize "Deep" sources: Academic journals, industry whitepapers, government policy documents, and technical trade outlets.
   - Avoid generic news (e.g., CNN, BBC) unless they have a specific relevant vertical.
   - Include at least 2 Research/Academic sources if applicable to the topic.
  2. **Search Terms (10-15 Precise Terms)**:
   - Go beyond keywords. Use specific terminology, acronyms, regulation numbers, or technical concepts known to insiders.
   - Include specific phrases that appear in high-quality reports.
  3. **Databases & Indices (3-5 items)**:
   - Identify specific repositories (e.g., arXiv, PubMed, Gov stats, specialized industry datasets) where raw data is found.
  4. **Key Voices (5-8 Experts)**:
   - Focus on subject matter experts, researchers, and policy architects rather than general influencers.

  Respond in this EXACT JSON format (no markdown, just raw JSON):
  {
  "sources": [{"name": "Source Name", "url": "https://...", "type": "Academic/Industry/Gov", "description": "Why this specific source matters"}],
  "searchTerms": ["term 1", "term 2", "technical phrase"],
  "databases": [{"name": "Database Name", "url": "https://...", "searchStrategy": "How to use this effectively"}],
  "keyVoices": [{"name": "Name", "platform": "Platform", "handle": "Handle/URL"}],
  "relatedTopics": ["adjacent topic 1", "adjacent topic 2"],
  "searchTips": "Professional advice on finding 'hidden' information for this topic."
  }`;

      // We do NOT use search here, just pure LLM knowledge for strategy
      const { text: responseText } = await callGemini(
        apiKey,
        prompt,
        systemPrompt,
        false,
      );

      const cleanJson = responseText.replace(/```json\n?|```\n?/g, "").trim();
      const profile = JSON.parse(cleanJson);
      profile.lastUpdated = new Date().toISOString();
      profile.topic = topic;

      setResearchProfiles((prev) => ({ ...prev, [topic]: profile }));
      setExpandedProfile(topic);
    } catch (err) {
      console.error("Failed to generate profile:", err);
      alert(`Error generating profile: ${err.message}`);
    }
    setGeneratingProfile(null);
  };

  const updateProfileViaChat = async (topic: string, instruction: string) => {
    const currentProfile = researchProfiles[topic];
    if (!currentProfile) return;
    setProfileChatLoading(topic);

    setProfileChatHistory((prev) => ({
      ...prev,
      [topic]: [
        ...(prev[topic] || []),
        {
          role: "user",
          content: instruction,
          timestamp: new Date().toISOString(),
        },
      ],
    }));

    const needsSearch =
      /\b(search|find|look for|look up|discover|what are|suggest)\b/i.test(
        instruction,
      );

    try {
      const prompt = `Here is the current research profile for "${topic}":
${JSON.stringify(currentProfile)}

User instruction: "${instruction}"

${needsSearch ? "Use web search if needed to find real URLs." : "Do NOT search web, just edit JSON."}

Respond with ONLY the complete updated JSON profile.`;

      const { text: responseText } = await callGemini(
        apiKey,
        prompt,
        "You are a JSON editor.",
        needsSearch,
      );

      // Attempt to extract JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const cleanJson = jsonMatch
        ? jsonMatch[0]
        : responseText.replace(/```json\n?|```\n?/g, "").trim();

      const updatedProfile = JSON.parse(cleanJson);
      updatedProfile.lastUpdated = new Date().toISOString();
      updatedProfile.topic = topic;

      setResearchProfiles((prev) => ({ ...prev, [topic]: updatedProfile }));
      setProfileChatHistory((prev) => ({
        ...prev,
        [topic]: [
          ...(prev[topic] || []),
          {
            role: "assistant",
            content: "✓ Profile updated",
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      setProfileChatInput((prev) => ({ ...prev, [topic]: "" }));
    } catch (err: any) {
      setProfileChatHistory((prev) => ({
        ...prev,
        [topic]: [
          ...(prev[topic] || []),
          {
            role: "error",
            content: `Error: ${err.message}`,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
    }
    setProfileChatLoading(null);
  };

  const searchAndSummarize = async (topic) => {
    if (!apiKey) return setShowKeyInput(true);
    setLoadingTopic(topic);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 240000);

    const dateRange = getDateRangeText(searchPeriod, topic);
    const profile = researchProfiles[topic];

    // --- UPDATED PROMPT START ---
    let searchPrompt = `Topic: "${topic}"
  Current Date: ${new Date().toLocaleDateString()}
  Target Date Range: ${dateRange}

  Task: Perform a deep Google Search to find specific news articles and reports published STRICTLY within the Target Date Range.

  STRICT DATE VERIFICATION RULES:
  1. **IGNORE Footer Dates**: Do not use the "Copyright 2025" date in a website footer. That is not the publication date.
  2. **VERIFY the Snippet**: Only include a result if the search snippet EXPLICITLY shows a publication date (e.g., "2 days ago", "Dec 22, 2025").
  3. **NO Generic Pages**: Exclude "Home", "About Us", or "Pricing" pages. These always look "current" but contain no news.
  4. **If Unsure, SKIP**: It is better to return fewer results than to include old news disguised as new.
  `;

    if (profile) {
      searchPrompt += `
  Research Strategy (Prioritize these high-signal sources):
  1. Check these Primary Sources first: ${profile.sources?.map((s) => s.name).join(", ")}.
  2. Use these technical Search Terms: ${profile.searchTerms?.join(", ")}.
  3. Look for updates from: ${profile.keyVoices?.map((v) => v.name).join(", ")}.
  `;
    }

    searchPrompt += `
Output Format: 
  Structure the response as a series of clear news cards. Do NOT use a single bulleted list.

  IMPORTANT: 
  1. **CITATION DENSITY**: Every single claim must be grounded. If you cannot link a source to a specific sentence, do not include that sentence.
  2. **CONCISENESS**: Do not write long paragraphs. Keep summaries punchy and under 40 words per news card to ensure accurate grounding.
  
  Use this Markdown structure for each finding:
  ### [Headline of the News Update]
  **Date:** [Date] | **Source:** [Source Name]
  
  [Write a 2-3 sentence summary of the update here. The citation links will be inserted automatically by the system, so just write the text naturally.]

  QUALITY CONTROL:
  - **EXCLUDE** press release aggregators (e.g., "Financial Content", "GlobeNewswire").
  - **PRIORITIZE** Academic journals, Government (DfE/Ofsted) official releases, and Reputable Industry Press.
  - **CHECK DATES**: If a URL links to a general "landing page" rather than a specific dated article, DO NOT USE IT.
  - If no *verified* recent news is found, explicitly state: "No validated updates found in this date range."
  `;

    try {
      // Enable Google Search tool for this call
      const { text: summaryText, grounding } = await callGemini(
        apiKey,
        searchPrompt,
        "You are a news researcher.",
        true,
        controller.signal,
      );

      clearTimeout(timeoutId);

      // Process grounding chunks to create a safe source list
      // Grounding metadata usually contains "chunks" with "web" data containing "uri" and "title"
      const verifiedSources =
        grounding?.groundingChunks
          ?.filter((c: any) => c.web)
          .map((c: any) => ({
            title: c.web.title,
            url: c.web.uri,
          })) || [];

      const newSummary: Summary = {
        id: Date.now(),
        topic,
        summary: summaryText,
        // Add verified sources to your Summary interface
        sources: verifiedSources,
        timestamp: new Date().toISOString(),
        status: "success",
        period: searchPeriod,
        hasProfile: !!profile,
      };

      setSummaries((prev) => [
        newSummary,
        ...prev.filter((s) => s.topic !== topic),
      ]);
      setExpandedSummary(newSummary.id);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (
        skipActionRef.current !== "skip" &&
        skipActionRef.current !== "later"
      ) {
        const failedSummary: Summary = {
          id: Date.now(),
          topic,
          summary: null,
          timestamp: new Date().toISOString(),
          status: "error",
          errorMessage: err.name === "AbortError" ? "Timeout" : err.message,
        };
        setSummaries((prev) => [
          failedSummary,
          ...prev.filter((s) => s.topic !== topic),
        ]);
      }
    }
    setLoadingTopic(null);
  };

  // --- QUEUE LOGIC (Preserved) ---

  useEffect(() => {
    if (loadingTopic) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadingTopic]);

  const searchAllTopics = async () => {
    setLoading(true);
    setCancelled(false);
    cancelledRef.current = false;
    setSkippedTopics([]);

    let queue = [...topics];
    let completed = 0;
    const total = topics.length;

    setSearchQueue(queue);
    setSearchProgress({ current: 0, total, currentTopic: "" });

    while (queue.length > 0 && !cancelledRef.current) {
      const topic = queue[0];
      skipActionRef.current = null;
      setSearchProgress({ current: completed + 1, total, currentTopic: topic });

      await searchAndSummarize(topic);

      if (cancelledRef.current) break;

      if (skipActionRef.current === "later") {
        queue = [...queue.slice(1), topic];
      } else if (skipActionRef.current === "skip") {
        queue = queue.slice(1);
        setSkippedTopics((prev) => [...prev, topic]);
      } else {
        queue = queue.slice(1);
        completed++;
      }
      setSearchQueue(queue);
      if (queue.length > 0) await new Promise((r) => setTimeout(r, 5000));
    }

    setLoading(false);
    setSearchProgress({ current: 0, total: 0, currentTopic: "" });
  };

  const cancelSearch = () => {
    setCancelled(true);
    cancelledRef.current = true;
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
            <LayoutDashboard className="w-8 h-8 text-blue-400" />
          </div>
          <div className="text-slate-400 font-medium tracking-wide">
            AUTHENTICATING...
          </div>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
            <LayoutDashboard className="w-8 h-8 text-blue-400" />
          </div>
          <div className="text-slate-400 font-medium tracking-wide">
            INITIALIZING DASHBOARD...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-purple-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 relative z-10">
        {/* API Key Modal */}
        <AnimatePresence>
          {showKeyInput && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-slate-900 border border-slate-700 p-8 rounded-2xl max-w-lg w-full shadow-2xl shadow-black/50"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Key className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold font-display tracking-tight text-white">
                      API Configuration
                    </h2>
                    <p className="text-slate-400 text-sm mt-0.5">
                      Connect to Google Gemini 2.0 Flash
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 mb-6">
                  <p className="text-slate-300 text-sm leading-relaxed">
                    This tool runs entirely in your browser. Your key is stored
                    in{" "}
                    <code className="bg-slate-700 px-1 py-0.5 rounded text-xs">
                      localStorage
                    </code>{" "}
                    and is used to call Google's API directly.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-2 tracking-wider">
                      API Key
                    </label>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      className="w-full bg-slate-950 border border-slate-700 hover:border-slate-600 focus:border-blue-500 rounded-lg px-4 py-3 text-white placeholder-slate-600 outline-none transition-all duration-200"
                      onKeyDown={(e) =>
                        e.key === "Enter" && saveApiKey(apiKey || "")
                      }
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 hover:underline underline-offset-4"
                    >
                      Get a free key <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => saveApiKey(apiKey)}
                      disabled={!apiKey}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-2.5 rounded-lg transition-all duration-200 shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-blue-500/20 active:scale-95"
                    >
                      Connect & Continue
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex items-center gap-5">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3.5 rounded-2xl shadow-xl shadow-blue-900/20 border border-white/10">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold font-display text-white tracking-tight">
                Daily Pulse
              </h1>
              <p className="text-slate-400 mt-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                AI-Powered Research Agent
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setLocation('/admin')}
                className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 hover:border-blue-500 transition-all text-blue-400 hover:text-blue-300"
                title="Admin Dashboard"
              >
                <Shield className="w-4 h-4" />
                <span className="text-sm font-medium">Admin</span>
              </button>
            )}
            <button
              onClick={() => setShowKeyInput(true)}
              className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-slate-600 transition-all text-slate-400 hover:text-white"
              title="Update API Key"
            >
              <Key className="w-4 h-4 group-hover:text-blue-400 transition-colors" />
              <span className="text-sm font-medium">API Key</span>
            </button>
            <button
              onClick={() => {
                if (confirm("Clear all data?")) {
                  storage.delete("search-topics");
                  storage.delete("search-summaries");
                  storage.delete("research-profiles");
                  window.location.reload();
                }
              }}
              className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 hover:border-red-500/30 transition-all text-slate-400 hover:text-red-400"
              title="Reset Application"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Reset</span>
            </button>
            <div className="h-6 w-px bg-slate-700"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-300">{user?.displayName}</span>
              </div>
              <button
                onClick={() => logout()}
                className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-red-900/20 border border-slate-700/50 hover:border-red-500/30 transition-all text-slate-400 hover:text-red-400"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN: Controls & Topics */}
          <div className="lg:col-span-4 space-y-6">
            {/* Add Topic Card */}
            <div className="glass-panel rounded-2xl p-5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
                New Research Topic
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTopic()}
                  placeholder="e.g. Quantum Computing..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                />
                <button
                  onClick={addTopic}
                  disabled={!newTopic.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Topics List Card */}
            <div className="glass-panel rounded-2xl p-5 min-h-[500px] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  Monitor List{" "}
                  <span className="text-slate-500 text-sm font-normal">
                    ({topics.length})
                  </span>
                </h2>
              </div>

              {topics.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-slate-600">
                    <Search className="w-6 h-6" />
                  </div>
                  <p className="text-slate-400 font-medium">No topics yet</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Add a topic above to start monitoring
                  </p>
                </div>
              ) : (
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  {/* Global Controls */}
                  <div className="flex flex-col gap-3 pb-4 border-b border-slate-800 mb-2">
                    <select
                      value={searchPeriod}
                      onChange={(e) => setSearchPeriod(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-blue-500 transition-colors"
                    >
                      {periodOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <button
                        onClick={searchAllTopics}
                        disabled={loading}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                          loading
                            ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                            : "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 hover:shadow-green-500/20"
                        }`}
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                        />
                        {loading
                          ? `Scanning ${searchProgress.current}/${searchProgress.total}`
                          : "Scan All"}
                      </button>

                      {loading && (
                        <button
                          onClick={cancelSearch}
                          className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-3 rounded-lg flex items-center justify-center transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <AnimatePresence>
                    {loading && searchProgress.total > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-slate-900/50 rounded-lg p-3 border border-slate-800 overflow-hidden"
                      >
                        <div className="flex justify-between items-center text-xs text-slate-400 mb-2">
                          <span className="truncate max-w-[70%]">
                            Scanning:{" "}
                            <span className="text-white">
                              {searchProgress.currentTopic}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 font-mono text-blue-400">
                            <Timer className="w-3 h-3" /> {elapsedTime}s
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-blue-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(searchProgress.current / searchProgress.total) * 100}%`,
                            }}
                            transition={{
                              type: "spring",
                              stiffness: 50,
                              damping: 20,
                            }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Individual Topic Cards */}
                  {topics.map((topic) => {
                    const profile = researchProfiles[topic];
                    const isExpanded = expandedProfile === topic;
                    const isLoadingThis = loadingTopic === topic;

                    return (
                      <div
                        key={topic}
                        className={`rounded-xl transition-all duration-200 border ${isLoadingThis ? "bg-blue-900/10 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600"}`}
                      >
                        <div className="p-3 flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${profile ? "bg-purple-500/10 text-purple-400" : "bg-slate-700/50 text-slate-500"}`}
                          >
                            {profile ? (
                              <Sparkles className="w-4 h-4" />
                            ) : (
                              <Database className="w-4 h-4" />
                            )}
                          </div>

                          <span className="text-sm font-medium flex-1 text-slate-200 truncate">
                            {topic}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Profile Toggle */}
                            <button
                              onClick={() =>
                                setExpandedProfile(isExpanded ? null : topic)
                              }
                              className={`p-1.5 rounded-lg transition-colors ${isExpanded ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-slate-700/50"}`}
                              title="Research Profile"
                            >
                              {generatingProfile === topic ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                              ) : (
                                <Settings className="w-4 h-4" />
                              )}
                            </button>

                            {/* Search Single */}
                            <button
                              onClick={() => searchAndSummarize(topic)}
                              disabled={isLoadingThis}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-700/50 disabled:opacity-50 transition-colors"
                              title="Search Now"
                            >
                              <RefreshCw
                                className={`w-4 h-4 ${isLoadingThis ? "animate-spin" : ""}`}
                              />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => removeTopic(topic)}
                              disabled={loading}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                              title="Remove Topic"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Profile View */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 pb-3 pt-0 border-t border-slate-700/50 bg-slate-900/30 rounded-b-xl">
                                {/* Email Configuration */}
                                <div className="mt-3 mb-3 bg-slate-900/80 border border-slate-700/50 p-2.5 rounded-lg">
                                  <h4 className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <Mail className="w-3 h-3" /> Email Reports To
                                  </h4>
                                  <input
                                    type="email"
                                    value={topicEmails[topic] || ""}
                                    onChange={(e) => updateTopicEmail(topic, e.target.value)}
                                    placeholder="email@example.com"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-all"
                                  />
                                </div>

                                {!profile ? (
                                  <div className="py-4 text-center">
                                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 mb-2">
                                      <Lightbulb className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <p className="text-xs text-slate-400 mb-3">
                                      No research strategy defined.
                                    </p>
                                    <button
                                      onClick={() =>
                                        generateResearchProfile(topic)
                                      }
                                      className="text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-purple-900/20"
                                    >
                                      Generate Strategy
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-3 space-y-3">
                                    {/* Profile Data */}
                                    <div className="grid grid-cols-1 gap-2">
                                      <div className="bg-slate-900/80 border border-slate-700/50 p-2.5 rounded-lg">
                                        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                          <Globe className="w-3 h-3" /> Priority
                                          Sources
                                        </h4>
                                        <div className="space-y-1">
                                          {profile.sources?.map((s, i) => (
                                            <div
                                              key={i}
                                              className="text-xs text-slate-300 truncate flex items-center gap-1.5"
                                            >
                                              <span className="w-1 h-1 rounded-full bg-purple-500/50"></span>
                                              {s.name}
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="bg-slate-900/80 border border-slate-700/50 p-2.5 rounded-lg">
                                        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                          <Search className="w-3 h-3" />{" "}
                                          Keywords
                                        </h4>
                                        <div className="flex flex-wrap gap-1.5">
                                          {profile.searchTerms?.map((t, i) => (
                                            <span
                                              key={i}
                                              className="text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-slate-300"
                                            >
                                              {t}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Chat Refine */}
                                    <div className="pt-2 border-t border-slate-700/50">
                                      <p className="text-[10px] text-slate-500 mb-2">
                                        AI Assistant
                                      </p>
                                      {/* History */}
                                      <div className="space-y-2 mb-2 max-h-24 overflow-y-auto custom-scrollbar">
                                        {profileChatHistory[topic]?.map(
                                          (msg, i) => (
                                            <div
                                              key={i}
                                              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                            >
                                              <div
                                                className={`max-w-[85%] text-[10px] px-2 py-1.5 rounded-lg ${
                                                  msg.role === "user"
                                                    ? "bg-slate-700 text-slate-200 rounded-tr-none"
                                                    : "bg-purple-900/20 border border-purple-500/20 text-purple-200 rounded-tl-none"
                                                }`}
                                              >
                                                {msg.content}
                                              </div>
                                            </div>
                                          ),
                                        )}
                                      </div>

                                      <div className="flex gap-2">
                                        <input
                                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-purple-500 transition-colors"
                                          placeholder="Refine strategy..."
                                          value={profileChatInput[topic] || ""}
                                          onChange={(e) =>
                                            setProfileChatInput({
                                              ...profileChatInput,
                                              [topic]: e.target.value,
                                            })
                                          }
                                          onKeyDown={(e) =>
                                            e.key === "Enter" &&
                                            updateProfileViaChat(
                                              topic,
                                              profileChatInput[topic],
                                            )
                                          }
                                        />
                                        <button
                                          onClick={() =>
                                            updateProfileViaChat(
                                              topic,
                                              profileChatInput[topic],
                                            )
                                          }
                                          disabled={
                                            profileChatLoading === topic ||
                                            !profileChatInput[topic]
                                          }
                                          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:bg-slate-700 px-2.5 rounded-lg text-white transition-colors"
                                        >
                                          {profileChatLoading === topic ? (
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <Send className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Summaries Feed */}
          <div className="lg:col-span-8">
            <div className="glass-panel rounded-2xl p-6 min-h-[600px]">
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-display font-semibold text-xl flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  Latest Intelligence
                </h2>
                {summaries.length > 0 && (
                  <span className="text-xs font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-slate-700">
                    {summaries.length} REPORTS
                  </span>
                )}
              </div>

              {summaries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                  <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                    <FileText className="w-10 h-10 text-slate-600" />
                  </div>
                  <h3 className="text-xl font-medium text-slate-300 mb-2">
                    No Reports Generated
                  </h3>
                  <p className="text-slate-500 max-w-md mx-auto">
                    Add topics on the left and click "Scan All" to generate
                    comprehensive research summaries powered by Gemini 2.0.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {summaries.map((summary) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={summary.id}
                      className={`rounded-2xl overflow-hidden border transition-all duration-300 ${
                        summary.status === "error"
                          ? "bg-red-950/10 border-red-500/20"
                          : expandedSummary === summary.id
                            ? "bg-slate-800/40 border-slate-600 shadow-2xl shadow-black/20"
                            : "bg-slate-800/20 border-slate-700/40 hover:bg-slate-800/40 hover:border-slate-600/60"
                      }`}
                    >
                      <button
                        onClick={() =>
                          setExpandedSummary(
                            expandedSummary === summary.id ? null : summary.id,
                          )
                        }
                        className="w-full px-5 py-4 flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-2 h-10 rounded-full ${summary.status === "error" ? "bg-red-500" : "bg-blue-500"}`}
                          ></div>
                          <div className="text-left">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-display font-bold text-lg text-slate-100 group-hover:text-blue-400 transition-colors">
                                {summary.topic}
                              </span>
                              {summary.hasProfile && (
                                <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" /> STRATEGY
                                </span>
                              )}
                              {summary.status === "error" && (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                  <AlertCircle className="w-2.5 h-2.5" /> FAILED
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span>
                                {new Date(summary.timestamp).toLocaleString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                              <span>•</span>
                              <span>{summary.period}</span>
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${expandedSummary === summary.id ? "bg-blue-600 text-white rotate-180" : "bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300"}`}
                        >
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </button>

                      <AnimatePresence>
                        {expandedSummary === summary.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-700/50"
                          >
                            <div className="p-6 bg-slate-900/30">
                              {summary.status === "error" ? (
                                <div className="text-red-400 p-4 bg-red-950/20 rounded-xl border border-red-900/30 text-sm flex items-start gap-3">
                                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <h4 className="font-bold mb-1">
                                      Generation Failed
                                    </h4>
                                    <p className="text-red-300/80">
                                      {summary.errorMessage}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex justify-end mb-3">
                                    <button
                                      onClick={() => sendEmail(summary)}
                                      disabled={sendingEmail === summary.id || !topicEmails[summary.topic]}
                                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                        !topicEmails[summary.topic]
                                          ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                                          : sendingEmail === summary.id
                                            ? "bg-blue-600 text-white cursor-wait"
                                            : "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20"
                                      }`}
                                      title={!topicEmails[summary.topic] ? "Configure email address in topic settings first" : "Send this report via email"}
                                    >
                                      <Mail className={`w-4 h-4 ${sendingEmail === summary.id ? "animate-pulse" : ""}`} />
                                      {sendingEmail === summary.id ? "Sending..." : "Send Email"}
                                    </button>
                                  </div>

                                  <MarkdownRenderer
                                    content={summary.summary || ""}
                                  />

                                  {summary.sources &&
                                    summary.sources.length > 0 && (
                                      <div className="mt-6 pt-4 border-t border-slate-700/50">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                          Verified Sources
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {summary.sources.map(
                                            (source: any, idx: number) => (
                                              <a
                                                key={idx}
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors text-xs text-blue-300 truncate border border-slate-700/50"
                                              >
                                                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate">
                                                  {source.title || source.url}
                                                </span>
                                              </a>
                                            ),
                                          )}
                                        </div>
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
