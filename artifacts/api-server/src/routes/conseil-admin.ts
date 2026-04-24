import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  conseilDocumentsTable,
  conseilChunksTable,
  conseilFeedbacksTable,
  conseilConfigTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

import OpenAI from "openai";

const router = Router();
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const JWT_SECRET = process.env.SESSION_SECRET || "conseil-secret-key";
const DEFAULT_ADMIN_PASSWORD = process.env.CONSEIL_ADMIN_PASSWORD || "admin123";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype === "text/plain" ||
      file.mimetype.includes("word")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and text files are supported"));
    }
  },
});

async function getConfig() {
  const rows = await db.select().from(conseilConfigTable).limit(1);
  if (rows.length === 0) {
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const [c] = await db
      .insert(conseilConfigTable)
      .values({ adminPasswordHash: hash })
      .returning();
    return c;
  }
  if (!rows[0].adminPasswordHash) {
    const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    const [updated] = await db
      .update(conseilConfigTable)
      .set({ adminPasswordHash: hash })
      .where(eq(conseilConfigTable.id, rows[0].id))
      .returning();
    return updated;
  }
  return rows[0];
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.slice(i, end));
    i += chunkSize - overlap;
    if (i >= text.length) break;
  }
  return chunks;
}

router.post("/conseil/admin/login", async (req, res) => {
  const { password } = req.body as { password: string };
  if (!password) return res.status(400).json({ error: "Password required" });

  try {
    const config = await getConfig();
    const valid = await bcrypt.compare(
      password,
      config.adminPasswordHash || ""
    );
    if (!valid) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/conseil/admin/config", authMiddleware, async (_req, res) => {
  try {
    const config = await getConfig();
    res.json({
      botName: config.botName,
      greeting: config.greeting,
      primaryColor: config.primaryColor,
      secondaryColor: config.secondaryColor,
      systemPrompt: config.systemPrompt,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });
  } catch {
    res.status(500).json({ error: "Failed to load config" });
  }
});

router.put("/conseil/admin/config", authMiddleware, async (req, res) => {
  const {
    botName,
    greeting,
    primaryColor,
    secondaryColor,
    systemPrompt,
    maxTokens,
    temperature,
    newPassword,
  } = req.body as {
    botName?: string;
    greeting?: string;
    primaryColor?: string;
    secondaryColor?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    newPassword?: string;
  };

  try {
    const config = await getConfig();
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (botName !== undefined) updates.botName = botName;
    if (greeting !== undefined) updates.greeting = greeting;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor;
    if (secondaryColor !== undefined) updates.secondaryColor = secondaryColor;
    if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
    if (maxTokens !== undefined) updates.maxTokens = maxTokens;
    if (temperature !== undefined) updates.temperature = temperature;
    if (newPassword) {
      updates.adminPasswordHash = await bcrypt.hash(newPassword, 10);
    }

    const [updated] = await db
      .update(conseilConfigTable)
      .set(updates)
      .where(eq(conseilConfigTable.id, config.id))
      .returning();

    res.json({
      botName: updated.botName,
      greeting: updated.greeting,
      primaryColor: updated.primaryColor,
      secondaryColor: updated.secondaryColor,
      systemPrompt: updated.systemPrompt,
      maxTokens: updated.maxTokens,
      temperature: updated.temperature,
    });
  } catch {
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.get("/conseil/admin/documents", authMiddleware, async (_req, res) => {
  try {
    const docs = await db
      .select({
        id: conseilDocumentsTable.id,
        name: conseilDocumentsTable.name,
        originalFilename: conseilDocumentsTable.originalFilename,
        size: conseilDocumentsTable.size,
        mimeType: conseilDocumentsTable.mimeType,
        active: conseilDocumentsTable.active,
        createdAt: conseilDocumentsTable.createdAt,
      })
      .from(conseilDocumentsTable)
      .orderBy(desc(conseilDocumentsTable.createdAt));
    res.json(docs);
  } catch {
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.post(
  "/conseil/admin/documents",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { name } = req.body as { name?: string };
    const file = req.file;

    try {
      let text = "";
      if (file.mimetype === "application/pdf") {
        const data = await pdfParse(file.buffer);
        text = data.text || "";
      } else {
        text = file.buffer.toString("utf-8");
      }

      if (!text.trim()) {
        return res
          .status(400)
          .json({ error: "Could not extract text from file" });
      }

      const [doc] = await db
        .insert(conseilDocumentsTable)
        .values({
          name: name || file.originalname.replace(/\.[^.]+$/, ""),
          originalFilename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          active: true,
        })
        .returning();

      const chunks = chunkText(text.replace(/\s+/g, " ").trim());
      let processed = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i].trim();
        if (!chunk) continue;

        const embedding = await getEmbedding(chunk);
        await db.insert(conseilChunksTable).values({
          documentId: doc.id,
          content: chunk,
          embedding: embedding as unknown as never,
          chunkIndex: i,
        });
        processed++;
      }

      res.json({
        ...doc,
        chunksProcessed: processed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(500).json({ error: msg });
    }
  }
);

router.patch(
  "/conseil/admin/documents/:id",
  authMiddleware,
  async (req, res) => {
    const { id } = req.params;
    const { active } = req.body as { active?: boolean };

    try {
      const [updated] = await db
        .update(conseilDocumentsTable)
        .set({ active: active ?? true })
        .where(eq(conseilDocumentsTable.id, Number(id)))
        .returning();
      res.json(updated);
    } catch {
      res.status(500).json({ error: "Failed to update document" });
    }
  }
);

router.delete(
  "/conseil/admin/documents/:id",
  authMiddleware,
  async (req, res) => {
    const { id } = req.params;
    try {
      await db
        .delete(conseilDocumentsTable)
        .where(eq(conseilDocumentsTable.id, Number(id)));
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to delete document" });
    }
  }
);

router.get(
  "/conseil/admin/documents/:id/download",
  authMiddleware,
  async (req, res) => {
    const { id } = req.params;
    try {
      const docs = await db
        .select()
        .from(conseilDocumentsTable)
        .where(eq(conseilDocumentsTable.id, Number(id)))
        .limit(1);
      if (docs.length === 0) return res.status(404).json({ error: "Document not found" });
      const doc = docs[0];

      const chunks = await db
        .select({ content: conseilChunksTable.content, chunkIndex: conseilChunksTable.chunkIndex })
        .from(conseilChunksTable)
        .where(eq(conseilChunksTable.documentId, Number(id)))
        .orderBy(conseilChunksTable.chunkIndex);

      const fullText = chunks.map(c => c.content).join("\n\n");
      const filename = encodeURIComponent(doc.originalFilename.replace(/\.[^.]+$/, "") + ".txt");

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
      res.send(fullText);
    } catch {
      res.status(500).json({ error: "Failed to download document" });
    }
  }
);

router.get("/conseil/admin/feedbacks", authMiddleware, async (_req, res) => {
  try {
    const feedbacks = await db
      .select()
      .from(conseilFeedbacksTable)
      .orderBy(desc(conseilFeedbacksTable.createdAt))
      .limit(200);
    res.json(feedbacks);
  } catch {
    res.status(500).json({ error: "Failed to load feedbacks" });
  }
});

export default router;
