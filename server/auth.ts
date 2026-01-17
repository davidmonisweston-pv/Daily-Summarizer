import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";
import { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { users, allowedDomains } from "../shared/schema";
import { eq } from "drizzle-orm";

// MSAL Configuration
const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    // Use "common" for multi-tenant, or specific tenant ID for single-tenant
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || 'common'}`,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3, // Info
    },
  },
};

const redirectUri = process.env.AZURE_AD_REDIRECT_URI || "http://localhost:5000/api/auth/callback";
const postLogoutRedirectUri = process.env.APP_URL || "http://localhost:5000";

export const msalClient = new ConfidentialClientApplication(msalConfig);

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      displayName: string;
      role: string;
      microsoftId: string;
    }
  }
}

export interface AuthRequest extends Request {
  user?: Express.User;
  isAuthenticated: () => boolean;
}

// Middleware to check if user is authenticated
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session && (req.session as any).user) {
    (req as AuthRequest).user = (req.session as any).user;
    (req as AuthRequest).isAuthenticated = () => true;
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// Middleware to check if user is admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session && (req.session as any).user && (req.session as any).user.role === "admin") {
    (req as AuthRequest).user = (req.session as any).user;
    (req as AuthRequest).isAuthenticated = () => true;
    return next();
  }
  return res.status(403).json({ error: "Forbidden: Admin access required" });
}

// Check if a domain is allowed
export async function isDomainAllowed(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  const allowedDomain = await db
    .select()
    .from(allowedDomains)
    .where(eq(allowedDomains.domain, domain))
    .limit(1);

  return allowedDomain.length > 0;
}

// Get or create user from Microsoft profile
export async function getOrCreateUser(profile: {
  oid: string;
  email: string;
  name: string;
}) {
  // Check if user already exists
  let existingUser = await db
    .select()
    .from(users)
    .where(eq(users.microsoftId, profile.oid))
    .limit(1);

  if (existingUser.length > 0) {
    // Update last login time
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, existingUser[0].id));

    return existingUser[0];
  }

  // Check by email if Microsoft ID not found
  existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  if (existingUser.length > 0) {
    // Update with Microsoft ID and last login
    await db
      .update(users)
      .set({
        microsoftId: profile.oid,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, existingUser[0].id));

    return existingUser[0];
  }

  // Check if domain is allowed or if this is the first admin
  const domainAllowed = await isDomainAllowed(profile.email);
  const firstAdminEmail = process.env.FIRST_ADMIN_EMAIL;
  const isFirstAdmin = profile.email === firstAdminEmail;

  if (!domainAllowed && !isFirstAdmin) {
    throw new Error("Domain not allowed. Please contact an administrator.");
  }

  // Create new user
  const role = isFirstAdmin ? "admin" : "user";
  const newUser = await db
    .insert(users)
    .values({
      microsoftId: profile.oid,
      email: profile.email,
      displayName: profile.name,
      role,
      lastLoginAt: new Date(),
    })
    .returning();

  return newUser[0];
}

// Generate auth code URL for Microsoft login
export async function getAuthCodeUrl(state: string) {
  const authCodeUrlParameters = {
    scopes: ["user.read"],
    redirectUri,
    state,
  };

  return await msalClient.getAuthCodeUrl(authCodeUrlParameters);
}

// Handle the callback and acquire token
export async function handleCallback(code: string) {
  const tokenRequest = {
    code,
    scopes: ["user.read"],
    redirectUri,
  };

  const response = await msalClient.acquireTokenByCode(tokenRequest);
  return response;
}
