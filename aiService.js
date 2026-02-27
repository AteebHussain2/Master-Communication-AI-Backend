/**
 * AI Service
 * Handles all Google AI interactions:
 * - Voice response generation (fast, personality-driven)
 * - Conversation analysis (status + coaching)
 *
 * Uses Gemma 3 models via Google AI free tier — generous rate limits.
 * Get a free API key at: https://aistudio.google.com/apikey
 *
 * NOTE: Gemma models don't support systemInstruction natively.
 * We inject the system prompt as the first user/model exchange in history instead.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { PERSONALITIES, ANALYSIS_SYSTEM_PROMPT } from "./personalities.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemma 3 models — free tier, generous RPM/TPM limits
// gemma-3-12b  → fast, low-latency, ideal for voice responses
// gemma-3-27b  → more capable, better for structured analysis output
const VOICE_MODEL = "gemma-3-27b-it";
const ANALYSIS_MODEL = "gemma-3-12b-it";

/**
 * Convert our internal history format [{role, content}]
 * to Gemma's expected format [{role, parts: [{text}]}]
 * Gemma uses "model" instead of "assistant".
 */
function toGemmaHistory(history) {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/**
 * Gemma doesn't support systemInstruction — inject the system prompt
 * as a fake first user/model exchange prepended to the chat history.
 * This is the standard workaround for instruction-tuned Gemma models.
 */
function withSystemPrompt(systemPrompt, history) {
  return [
    { role: "user", parts: [{ text: `[SYSTEM INSTRUCTIONS]\n${systemPrompt}` }] },
    { role: "model", parts: [{ text: "Understood. I will follow these instructions." }] },
    ...history,
  ];
}

/**
 * Generate a voice response from the AI personality.
 * @param {string} personalityId
 * @param {Array}  history - [{role, content}]
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function generateVoiceResponse(personalityId, history, userMessage) {
  const personality = PERSONALITIES[personalityId];
  if (!personality) throw new Error(`Unknown personality: ${personalityId}`);

  const model = genAI.getGenerativeModel({
    model: VOICE_MODEL,
    generationConfig: {
      maxOutputTokens: 120, // Keep responses SHORT — this is a voice call
      temperature: 0.9,     // Slightly creative for natural feel
    },
  });

  const chat = model.startChat({
    history: withSystemPrompt(personality.systemPrompt, toGemmaHistory(history)),
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text().trim();
}

/**
 * Analyze the current conversation state.
 * @param {string} conversationContext - Formatted transcript string
 * @returns {Promise<{status: string, message: string}>}
 */
async function analyzeConversation(conversationContext) {
  const model = genAI.getGenerativeModel({
    model: ANALYSIS_MODEL,
    generationConfig: {
      maxOutputTokens: 80,
      temperature: 0.1, // Very low — we need reliable JSON output
    },
  });

  // For single-turn analysis we still use the system-as-first-turn pattern
  const chat = model.startChat({
    history: withSystemPrompt(ANALYSIS_SYSTEM_PROMPT, []),
  });

  const result = await chat.sendMessage(
    `Analyze this conversation:\n\n${conversationContext}`
  );

  const raw = result.response.text().trim();

  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { status: "CALM", message: "Unable to parse analysis." };
  }
}

export { generateVoiceResponse, analyzeConversation };