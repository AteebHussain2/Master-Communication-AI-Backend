/**
 * Session Manager
 * Handles per-socket session state: personality, conversation history, analysis buffer.
 */

const MAX_HISTORY = 10; // max conversation turns to keep (pairs)
const ANALYSIS_BUFFER_SIZE = 3; // number of recent exchanges to analyze

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(socketId, personalityId) {
    const session = {
      socketId,
      personalityId,
      history: [], // { role: "user"|"assistant", content: string }[]
      analysisBuffer: [], // last N strings received (including empty)
      createdAt: Date.now(),
    };
    this.sessions.set(socketId, session);
    return session;
  }

  get(socketId) {
    return this.sessions.get(socketId);
  }

  delete(socketId) {
    this.sessions.delete(socketId);
  }

  /**
   * Add a user message and optional assistant reply to history.
   */
  addTurn(socketId, userMessage, assistantMessage = null) {
    const session = this.get(socketId);
    if (!session) return;

    if (userMessage) {
      session.history.push({ role: "user", content: userMessage });
    }
    if (assistantMessage) {
      session.history.push({ role: "assistant", content: assistantMessage });
    }

    // Trim history to prevent unbounded growth (keep last MAX_HISTORY messages)
    if (session.history.length > MAX_HISTORY) {
      session.history = session.history.slice(-MAX_HISTORY);
    }
  }

  /**
   * Push a new string to the analysis buffer (rolling window).
   */
  pushAnalysisEntry(socketId, text) {
    const session = this.get(socketId);
    if (!session) return;

    session.analysisBuffer.push(text);
    if (session.analysisBuffer.length > ANALYSIS_BUFFER_SIZE) {
      session.analysisBuffer.shift();
    }
  }

  /**
   * Get the last N history messages for context window.
   */
  getHistory(socketId, limit = 6) {
    const session = this.get(socketId);
    if (!session) return [];
    return session.history.slice(-limit);
  }

  /**
   * Build a readable transcript of the analysis buffer for the AI.
   */
  getAnalysisContext(socketId) {
    const session = this.get(socketId);
    if (!session) return "";

    // Pull last few history items to give context
    const recentHistory = session.history.slice(-6);
    if (recentHistory.length === 0) return "No conversation yet.";

    return recentHistory
      .map((m) => `${m.role === "user" ? "Caller" : "AI"}: ${m.content}`)
      .join("\n");
  }

  stats() {
    return {
      activeSessions: this.sessions.size,
    };
  }
}

export default new SessionManager();
