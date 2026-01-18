import express from 'express';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai'; // If you use the SDK, or use fetch like below

// If you are using 'type': 'module' in package.json, you need this for pathing
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

// 1. SERVE YOUR FRONTEND (The React App)
// This tells the server: "When someone visits the site, show them the files in 'dist'"
app.use(express.static('dist')); 

// 2. EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const RECIPIENTS = ['david.monis.weston@purposefulventures.org']; // CHANGE THIS
const TOPICS = ["Mathematics EdTech", "AI in Education"]; // TOPICS TO WATCH

// 3. THE "DAILY PULSE" BOT LOGIC
async function runDailyScan() {
  console.log("⚡ Starting Daily Scan...");

  let emailHtml = `<h1>Daily Intelligence Report (${new Date().toLocaleDateString()})</h1>`;

  for (const topic of TOPICS) {
    try {
      // Direct Fetch to Gemini API (mimicking your frontend logic)
      const apiKey = process.env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent?key=${apiKey}`;

      const prompt = `Search the web for the latest detailed news on "${topic}" from the last 24 hours. Summarize 3 key updates.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        })
      });

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No significant updates found.";

      // Convert Markdown to simple HTML for email (Basic replacement)
      const formattedContent = content
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Bold
        .replace(/\n/g, '<br>'); // Line breaks

      emailHtml += `
        <div style="margin-bottom: 20px; padding: 15px; background: #f4f4f4; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top:0;">${topic}</h2>
          <div style="font-family: sans-serif; color: #333;">${formattedContent}</div>
        </div>
      `;

      // Wait 2 seconds between topics to be nice to the API
      await new Promise(r => setTimeout(r, 2000));

    } catch (e) {
      console.error(`Error scanning ${topic}:`, e);
    }
  }

  // Send the Email
  try {
    await transporter.sendMail({
      from: `"Daily Pulse Bot" <${process.env.EMAIL_USER}>`,
      to: RECIPIENTS,
      subject: `Daily Pulse: ${new Date().toLocaleDateString()}`,
      html: emailHtml
    });
    console.log("✅ Daily report emailed successfully.");
  } catch (e) {
    console.error("❌ Failed to send email:", e);
  }
}

// 4. SCHEDULE THE CRON JOB
// Run at 7:00 AM UTC every day
cron.schedule('0 7 * * *', () => {
  console.log("⏰ Cron Job Triggered");
  runDailyScan();
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

runDailyScan();