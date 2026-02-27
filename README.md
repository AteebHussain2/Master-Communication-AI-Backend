# Voice-to-Voice AI Backend

Real-time voice call simulation with AI personalities via Socket.IO.

## Setup

```bash
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm run dev
```

---

## Architecture

```
Client clicks personality → socket connects with auth → call is live

Client (browser/app)
  │
  ├── io({ auth: { personalityId: "cold-professional" } })
  │   └── socket.on("call_started") ← { personalityId, personalityName }
  │
  ├── socket.emit("voice_message")   → AI generates reply (fast, concise)
  │   └── socket.on("voice_response") ← { text, personalityId }
  │
  └── socket.emit("analysis_tick")   → Every 5s with current text (or empty)
      └── socket.on("analysis_result") ← { status, message }
```

Both channels are **independent** — analysis never blocks voice responses.

---

## Socket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `voice_message` | `{ text }` | Send transcribed speech. Returns AI reply. |
| `analysis_tick` | `{ text }` | 5s tick. `text` can be empty string. |

> Personality is set at **connection time** via `auth`, not as a separate event.

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `call_started` | `{ personalityId, personalityName }` | Confirms call is live. |
| `voice_response` | `{ text, personalityId }` | AI's reply (TTS-ready). |
| `analysis_result` | `{ status, message }` | Conversation state + coaching note. |
| `error` | `{ code, message }` | Error details. |

---

## Personalities

| ID | Name | Style |
|----|------|-------|
| `friendly-warm` | Friendly & Warm | Upbeat, casual, welcoming |
| `cold-professional` | Cold & Professional | Clipped, formal, efficient |
| `aggressive-impatient` | Aggressive & Impatient | Terse, frustrated, in a rush |
| `calm-empathetic` | Calm & Empathetic | Slow, reflective, caring |

GET `/personalities` returns the full list at runtime.

---

## Analysis Statuses

`CALM` · `COLD` · `WARM` · `ANGER` · `SMOOTH` · `LISTENING` · `LOSING` · `TENSE` · `ENGAGED` · `DISCONNECTED`

---

## Frontend Example (browser)

```javascript
import { io } from "socket.io-client";

// User clicked "Cold & Professional" — connect immediately
const socket = io("http://localhost:3000", {
  auth: { personalityId: "cold-professional" }  // ← personality in handshake
});

// Call is live
socket.on("call_started", ({ personalityName }) => {
  console.log(`📞 Call connected with ${personalityName}`);
});

// Connection refused if personalityId is invalid
socket.on("connect_error", (err) => {
  console.error("Call failed:", err.message);
});

// Send speech (from STT)
socket.emit("voice_message", { text: "Hey, I'm calling about my order." });

socket.on("voice_response", ({ text }) => {
  // Pass `text` to your TTS engine
  console.log("AI says:", text);
});

// Every 5 seconds — analysis tick
setInterval(() => {
  socket.emit("analysis_tick", { text: getCurrentSpeechBuffer() });
}, 5000);

socket.on("analysis_result", ({ status, message }) => {
  console.log(`Status: ${status} | Tip: ${message}`);
  // e.g. Status: LOSING | Tip: Caller losing interest, ask a question
});

// Hang up
socket.disconnect();
```

---

## REST Endpoints

- `GET /health` — Server status + active session count
- `GET /personalities` — List all available personalities
