import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { emailService } from "./email";
import { requireAuth, AuthRequest } from "./auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get(api.topics.list.path, requireAuth, async (req, res) => {
    const authReq = req as AuthRequest;
    const topics = await storage.getTopics(authReq.user!.id);
    res.json(topics);
  });

  app.post(api.topics.create.path, requireAuth, async (req, res) => {
    const authReq = req as AuthRequest;
    const input = api.topics.create.input.parse(req.body);
    const topic = await storage.createTopic({
      ...input,
      userId: authReq.user!.id,
    });
    res.status(201).json(topic);
  });

  app.post(api.email.send.path, requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const input = api.email.send.input.parse(req.body);

      if (!emailService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Email service is not configured. Please set up email environment variables.',
        });
      }

      // Default to user's email if not specified
      const recipientEmail = input.to || authReq.user!.email;

      const result = await emailService.sendReportEmail(
        recipientEmail,
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
