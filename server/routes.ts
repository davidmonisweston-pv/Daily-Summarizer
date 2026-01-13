import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

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

  return httpServer;
}
