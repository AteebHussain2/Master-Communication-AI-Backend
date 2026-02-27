/**
 * Voice-to-Voice AI Communication Backend
 * ----------------------------------------
 * Socket.IO server with two independent channels:
 *   1. voice   — real-time AI personality responses
 *   2. analysis — conversation status every 5s tick
 */

import 'dotenv/config';
// require("dotenv").config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

import sessionManager from './sessionManager.js';
import { generateVoiceResponse, analyzeConversation } from "./aiService.js";
import { PERSONALITIES } from './personalities.js';

// ── Server Setup ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Tighten this in production
    methods: ["GET", "POST"],
  },
  // Optimize for low-latency
  pingTimeout: 10000,
  pingInterval: 5000,
});

// ── REST: Health & Info ───────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    activeSessions: sessionManager.stats().activeSessions,
    personalities: Object.keys(PERSONALITIES),
  });
});

app.get("/personalities", (req, res) => {
  const list = Object.values(PERSONALITIES).map(({ id, name, voiceStyle }) => ({
    id,
    name,
    voiceStyle,
  }));
  res.json(list);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────

// ── Middleware: validate personality on connect ───────────────────────────────
// Client passes personality in handshake: io({ auth: { personalityId } })
io.use((socket, next) => {
  const pid = socket.handshake.auth?.personalityId;
  if (!pid || !PERSONALITIES[pid]) {
    return next(new Error(`Invalid personalityId. Valid options: ${Object.keys(PERSONALITIES).join(", ")}`));
  }
  socket.personalityId = pid; // attach to socket for use in handlers
  next();
});

io.on("connection", (socket) => {
  const pid = socket.personalityId;
  sessionManager.create(socket.id, pid);

  console.log(`[+] Call started: ${socket.id} → "${pid}"`);

  // Immediately confirm the call is live
  socket.emit("call_started", {
    personalityId: pid,
    personalityName: PERSONALITIES[pid].name,
  });

  // ── Event: voice_message ─────────────────────────────────────────────────────
  // Client sends transcribed speech text.
  // Payload: { text: string }
  // Response event: voice_response → { text: string, personalityId: string }
  socket.on("voice_message", async ({ text } = {}) => {
    const session = sessionManager.get(socket.id);
    if (!session) {
      socket.emit("error", { code: "NO_SESSION", message: "No active session." });
      return;
    }

    const userText = (text ?? "").trim();
    if (!userText) return; // ignore empty

    try {
      const history = sessionManager.getHistory(socket.id);
      const aiReply = await generateVoiceResponse(
        session.personalityId,
        history,
        userText
      );

      // Persist turn to session memory
      sessionManager.addTurn(socket.id, userText, aiReply);

      socket.emit("voice_response", {
        text: aiReply,
        personalityId: session.personalityId,
      });
    } catch (err) {
      console.error(`[!] voice_message error for ${socket.id}:`, err.message);
      socket.emit("error", { code: "AI_ERROR", message: "Failed to generate response." });
    }
  });

  // ── Event: analysis_tick ──────────────────────────────────────────────────────
  // Client sends a 5-second tick with whatever was spoken (may be empty).
  // Payload: { text: string }  (empty string = silence)
  // Response event: analysis_result → { status: string, message: string }
  socket.on("analysis_tick", async ({ text } = {}) => {
    const session = sessionManager.get(socket.id);
    if (!session) return;

    // Store tick text in rolling buffer
    sessionManager.pushAnalysisEntry(socket.id, (text ?? "").trim());

    const context = sessionManager.getAnalysisContext(socket.id);
    if (context === "No conversation yet.") {
      socket.emit("analysis_result", { status: "CALM", message: "Waiting for conversation." });
      return;
    }

    try {
      const result = await analyzeConversation(context);
      socket.emit("analysis_result", result);
    } catch (err) {
      console.error(`[!] analysis_tick error for ${socket.id}:`, err.message);
      socket.emit("analysis_result", { status: "CALM", message: "Analysis unavailable." });
    }
  });

  // ── Event: disconnect ────────────────────────────────────────────────────────
  socket.on("disconnect", (reason) => {
    sessionManager.delete(socket.id);
    console.log(`[-] Call ended: ${socket.id} (${reason})`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎙  Voice Backend running on port ${PORT}`);
  console.log(`   Personalities: ${Object.keys(PERSONALITIES).join(", ")}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
