import Anthropic from "@anthropic-ai/sdk";

const ownKey = process.env.ANTHROPIC_API_KEY;
const integrationKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const integrationBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!ownKey && !integrationKey) {
  throw new Error(
    "No Anthropic API key found. Set ANTHROPIC_API_KEY or provision the Replit Anthropic AI integration.",
  );
}

if (!ownKey && !integrationBaseUrl) {
  throw new Error(
    "AI_INTEGRATIONS_ANTHROPIC_BASE_URL must be set when using the Replit Anthropic AI integration.",
  );
}

export const anthropic = ownKey
  ? new Anthropic({ apiKey: ownKey })
  : new Anthropic({ apiKey: integrationKey!, baseURL: integrationBaseUrl! });
