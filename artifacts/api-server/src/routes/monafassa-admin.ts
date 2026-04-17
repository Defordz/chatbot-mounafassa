import { Router, type Request, type Response, type NextFunction } from "express";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { feedbacksTable, analyticsTable, settingsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_69e0499e7fb081919b0157d8195caed6";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_change_in_prod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Seuls les fichiers PDF sont acceptés"));
  },
});

function adminAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token manquant" });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
    if (payload.role !== "admin") return res.status(403).json({ error: "Accès refusé" });
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

router.post("/monafassa/admin/login", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Mot de passe requis" });

    const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
    if (!ADMIN_HASH) return res.status(500).json({ error: "Admin non configuré" });

    const valid = await bcryptjs.compare(password, ADMIN_HASH);
    if (!valid) return res.status(401).json({ error: "Mot de passe incorrect" });

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ token, expires_in: 28800 });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/monafassa/admin/documents", adminAuth, async (req, res) => {
  try {
    const files = await openai.vectorStores.files.list(VECTOR_STORE_ID);
    const docs = await Promise.all(
      files.data.map(async (f) => {
        try {
          const meta = await openai.files.retrieve(f.id);
          return {
            id: f.id,
            name: (meta as any).filename || f.id,
            size: (meta as any).bytes || 0,
            status: f.status,
            created_at: f.created_at,
          };
        } catch {
          return { id: f.id, name: f.id, size: 0, status: f.status, created_at: f.created_at };
        }
      })
    );
    res.json({ documents: docs, total: docs.length });
  } catch (err: any) {
    logger.error({ err }, "Documents list error");
    res.status(500).json({ error: "Erreur récupération documents" });
  }
});

router.post("/monafassa/admin/documents", adminAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    const blob = new Blob([req.file.buffer], { type: "application/pdf" });
    const file = new File([blob], req.file.originalname, { type: "application/pdf" });

    const uploaded = await openai.files.create({ file, purpose: "assistants" });
    await openai.vectorStores.files.create(VECTOR_STORE_ID, { file_id: uploaded.id });

    res.json({ success: true, file_id: uploaded.id, filename: req.file.originalname });
  } catch (err: any) {
    logger.error({ err }, "Upload error");
    res.status(500).json({ error: "Erreur upload: " + err.message });
  }
});

router.delete("/monafassa/admin/documents/:fileId", adminAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    await openai.vectorStores.files.del(VECTOR_STORE_ID, fileId);
    await openai.files.del(fileId);
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Delete document error");
    res.status(500).json({ error: "Erreur suppression" });
  }
});

router.get("/monafassa/admin/feedbacks", adminAuth, async (req, res) => {
  try {
    const feedbacks = await db.select().from(feedbacksTable)
      .orderBy(desc(feedbacksTable.created_at))
      .limit(100);
    
    const stats = await db.select({
      total: sql<number>`count(*)`,
      avg_rating: sql<number>`avg(${feedbacksTable.rating})`,
      positive: sql<number>`sum(case when ${feedbacksTable.rating} >= 4 then 1 else 0 end)`,
    }).from(feedbacksTable);

    res.json({ feedbacks, stats: stats[0] || { total: 0, avg_rating: 0, positive: 0 } });
  } catch (err: any) {
    logger.error({ err }, "Feedbacks error");
    res.status(500).json({ error: "Erreur feedbacks" });
  }
});

router.get("/monafassa/admin/analytics", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(analyticsTable)
      .orderBy(desc(analyticsTable.date))
      .limit(30);

    const totals = await db.select({
      total_queries: sql<number>`sum(${analyticsTable.queries})`,
      total_cache_hits: sql<number>`sum(${analyticsTable.cache_hits})`,
    }).from(analyticsTable);

    res.json({ 
      daily: rows,
      totals: totals[0] || { total_queries: 0, total_cache_hits: 0 }
    });
  } catch (err: any) {
    logger.error({ err }, "Analytics error");
    res.status(500).json({ error: "Erreur analytiques" });
  }
});

router.get("/monafassa/admin/settings", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    if (rows.length > 0) return res.json(rows[0]);
    res.json({
      id: null,
      system_prompt: null,
      welcome_message: "Bonjour ! Je suis Monafassa, votre assistant juridique du Conseil de la Concurrence. Comment puis-je vous aider ?",
      max_tokens: 3000,
      temperature: 0.1,
    });
  } catch (err: any) {
    logger.error({ err }, "Get settings error");
    res.status(500).json({ error: "Erreur paramètres" });
  }
});

router.put("/monafassa/admin/settings", adminAuth, async (req, res) => {
  try {
    const { system_prompt, welcome_message, max_tokens, temperature } = req.body;
    const existing = await db.select().from(settingsTable).limit(1);
    
    const data = {
      system_prompt: system_prompt || null,
      welcome_message: welcome_message || null,
      max_tokens: max_tokens || 3000,
      temperature: temperature ?? 0.1,
    };

    if (existing.length > 0) {
      await db.update(settingsTable).set(data).where(eq(settingsTable.id, existing[0].id));
    } else {
      await db.insert(settingsTable).values(data);
    }
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Update settings error");
    res.status(500).json({ error: "Erreur mise à jour paramètres" });
  }
});

export default router;
