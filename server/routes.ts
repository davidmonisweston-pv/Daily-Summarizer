import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { emailService } from "./email";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get(api.topics.list.path, async (req, res) => {
    const topics = await storage.getTopics();
    res.json(topics);
  });

  app.post(api.topics.create.path, async (req, res) => {
    const input = api.topics.create.input.parse(req.body);
    const topic = await storage.createTopic(input);
    res.status(201).json(topic);
  });

  app.post(api.email.send.path, async (req, res) => {
    try {
      const input = api.email.send.input.parse(req.body);

      if (!emailService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Email service is not configured. Please set up email environment variables.',
        });
      }

      const result = await emailService.sendReportEmail(
        input.to,
        input.topicName,
        input.summary,
        input.sources || []
      );

      res.json(result);
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      });
    }
  });

  return httpServer;
}
