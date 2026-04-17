import { Router } from "express";
import OpenAI from "openai";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { feedbacksTable, analyticsTable, settingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_69e0499e7fb081919b0157d8195caed6";

const cache = new Map<string, { answer: string; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.answer;
}

function getSystemPrompt(customPrompt?: string) {
  return customPrompt || `Tu es Monafassa, l'assistant juridique officiel du Conseil de la Concurrence du Maroc.

RÈGLE ABSOLUE — SOURCE DES RÉPONSES :
Tu dois EXCLUSIVEMENT utiliser les informations trouvées dans les documents de la base documentaire fournis par l'outil file_search. Tu ne dois JAMAIS utiliser tes connaissances générales, ta mémoire de pré-entraînement, ni aucune source externe.

Si l'outil file_search ne trouve aucun passage pertinent dans les documents pour répondre à la question, tu dois répondre exactement :
"Je n'ai pas trouvé d'information sur ce sujet dans la base documentaire du Conseil de la Concurrence. Veuillez consulter directement le site officiel : www.conseil-concurrence.ma"

Si la question ne concerne pas le droit de la concurrence marocain, réponds :
"Je suis spécialisé uniquement dans le droit de la concurrence marocain. Je ne peux pas répondre à des questions hors de ce domaine."

Quand tu as des passages pertinents dans la base documentaire :
- Réponds en français de manière claire, précise et professionnelle
- Cite les articles de loi et leur source documentaire
- Adapte le format : paragraphes pour questions simples, listes pour critères/éléments
- Ne complète JAMAIS avec des connaissances extérieures aux documents fournis`;
}

router.post("/monafassa/chat", async (req, res) => {
  try {
    const { message, conversation_id, session_messages = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message requis" });

    const cacheKey = `${conversation_id || ""}:${message}`;
    const cached = getCached(cacheKey);
    if (cached) {
      await trackAnalytics("cache_hit");
      return res.json({ answer: cached, from_cache: true });
    }

    const settings = await getSettings();

    const messages: OpenAI.Responses.ResponseInput = [
      ...session_messages.slice(-10),
      { role: "user", content: message }
    ];

    const response = await openai.responses.create({
      model: "gpt-4o",
      instructions: getSystemPrompt(settings.system_prompt),
      input: messages,
      tools: [{ type: "file_search", vector_store_ids: [VECTOR_STORE_ID] }],
      temperature: 0.1,
      max_output_tokens: 3000,
    });

    const answer = response.output_text || "";
    cache.set(cacheKey, { answer, ts: Date.now() });
    await trackAnalytics("query");

    res.json({ answer, conversation_id });
  } catch (err: any) {
    logger.error({ err }, "Chat error");
    res.status(500).json({ error: "Erreur lors du traitement de la requête" });
  }
});

router.post("/monafassa/chat/stream", async (req, res) => {
  try {
    const { message, session_messages = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Message requis" });

    const settings = await getSettings();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const messages: OpenAI.Responses.ResponseInput = [
      ...session_messages.slice(-10),
      { role: "user", content: message }
    ];

    const stream = await openai.responses.create({
      model: "gpt-4o",
      instructions: getSystemPrompt(settings.system_prompt),
      input: messages,
      tools: [{ type: "file_search", vector_store_ids: [VECTOR_STORE_ID] }],
      temperature: 0.1,
      max_output_tokens: 3000,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
      }
    }

    await trackAnalytics("stream_query");
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    logger.error({ err }, "Stream error");
    res.write(`data: ${JSON.stringify({ error: "Erreur streaming" })}\n\n`);
    res.end();
  }
});

router.get("/monafassa/settings", async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      welcome_message: settings.welcome_message || "Bonjour ! Je suis Monafassa, votre assistant juridique du Conseil de la Concurrence du Maroc. Comment puis-je vous aider ?",
    });
  } catch {
    res.json({ welcome_message: "Bonjour ! Je suis Monafassa, votre assistant juridique du Conseil de la Concurrence du Maroc. Comment puis-je vous aider ?" });
  }
});

router.post("/monafassa/feedback", async (req, res) => {
  try {
    const { message, answer, rating, comment } = req.body;
    if (!message || !answer || !rating) {
      return res.status(400).json({ error: "Données manquantes" });
    }
    await db.insert(feedbacksTable).values({ message, answer, rating, comment: comment || null });
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Feedback error");
    res.status(500).json({ error: "Erreur feedback" });
  }
});

async function trackAnalytics(eventType: string) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db.select().from(analyticsTable)
      .where(eq(analyticsTable.date, today)).limit(1);
    
    if (existing.length > 0) {
      const row = existing[0];
      if (eventType === "cache_hit") {
        await db.update(analyticsTable)
          .set({ queries: row.queries + 1, cache_hits: row.cache_hits + 1 })
          .where(eq(analyticsTable.date, today));
      } else {
        await db.update(analyticsTable)
          .set({ queries: row.queries + 1 })
          .where(eq(analyticsTable.date, today));
      }
    } else {
      await db.insert(analyticsTable).values({
        date: today,
        queries: 1,
        cache_hits: eventType === "cache_hit" ? 1 : 0
      });
    }
  } catch (err) {
    logger.warn({ err }, "Analytics tracking failed");
  }
}

async function getSettings() {
  try {
    const rows = await db.select().from(settingsTable).limit(1);
    if (rows.length > 0) return rows[0] as any;
  } catch {}
  return { system_prompt: null };
}

export default router;
