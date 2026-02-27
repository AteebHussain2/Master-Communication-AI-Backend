#!/usr/bin/env node
/**
 * CLI Test Client — Voice Backend
 * --------------------------------
 * Simulates the full call flow from terminal:
 *   - Pick a personality
 *   - Type messages as "speech"
 *   - See AI voice responses + live analysis ticks
 *
 * Usage:
 *   node cli-test.js
 *   node cli-test.js --personality cold-professional
 *   node cli-test.js --url http://localhost:3000
 */

import { io } from "socket.io-client";
import readline from "readline";

// ── Config ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
};

const SERVER_URL = getArg("--url") || "http://localhost:3000";
const PERSONALITIES = {
    1: "friendly-warm",
    2: "cold-professional",
    3: "aggressive-impatient",
    4: "calm-empathetic",
};

// ── Terminal Colors ───────────────────────────────────────────────────────────

const c = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
    gray: "\x1b[90m",
};

const STATUS_COLORS = {
    CALM: c.blue,
    COLD: c.cyan,
    WARM: c.green,
    ANGER: c.red,
    SMOOTH: c.green,
    LISTENING: c.gray,
    LOSING: c.yellow,
    TENSE: c.yellow,
    ENGAGED: c.magenta,
    DISCONNECTED: c.red,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clearLine() {
    process.stdout.write("\r\x1b[K");
}

function printBanner() {
    console.log(`\n${c.bold}${c.cyan}┌─────────────────────────────────────┐`);
    console.log(`│      🎙  Voice Backend CLI Test      │`);
    console.log(`└─────────────────────────────────────┘${c.reset}\n`);
}

function printStatus(status, message) {
    const col = STATUS_COLORS[status] || c.gray;
    clearLine();
    process.stdout.write(
        `${c.dim}[Analysis]${c.reset} ${col}${c.bold}${status}${c.reset} ${c.gray}— ${message}${c.reset}\n`
    );
}

async function pickPersonality() {
    const argPid = getArg("--personality");
    if (argPid && Object.values(PERSONALITIES).includes(argPid)) {
        return argPid;
    }

    console.log(`${c.bold}Choose a personality:${c.reset}`);
    Object.entries(PERSONALITIES).forEach(([num, id]) => {
        const labels = {
            "friendly-warm": "😊  Friendly & Warm",
            "cold-professional": "🧊  Cold & Professional",
            "aggressive-impatient": "😤  Aggressive & Impatient",
            "calm-empathetic": "🌿  Calm & Empathetic",
        };
        console.log(`  ${c.bold}${num}${c.reset}. ${labels[id]}`);
    });
    console.log();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`${c.cyan}Enter number (1-4): ${c.reset}`, (answer) => {
            rl.close();
            const pid = PERSONALITIES[answer.trim()] || "friendly-warm";
            resolve(pid);
        });
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────
let lastSpokenText = "";

async function main() {
    printBanner();

    const personalityId = await pickPersonality();
    console.log(`\n${c.gray}Connecting to ${SERVER_URL}...${c.reset}`);

    // ── Connect ──────────────────────────────────────────────────────────────────
    const socket = io(SERVER_URL, {
        auth: { personalityId },
        reconnection: false,
    });

    let analysisInterval = null;

    // ── Socket Events ─────────────────────────────────────────────────────────────

    socket.on("connect_error", (err) => {
        console.error(`\n${c.red}✗ Connection failed: ${err.message}${c.reset}`);
        console.error(`${c.gray}Make sure the server is running: npm run dev${c.reset}\n`);
        process.exit(1);
    });

    socket.on("call_started", ({ personalityName }) => {
        console.log(`${c.green}${c.bold}✓ Call connected${c.reset} — speaking with ${c.cyan}${c.bold}${personalityName}${c.reset}`);
        console.log(`${c.gray}Type your message and press Enter. Type ${c.bold}exit${c.gray} to hang up.\n${c.reset}`);

        // Start analysis ticks every 5s
        analysisInterval = setInterval(() => {
            socket.emit("analysis_tick", { text: lastSpokenText });
            lastSpokenText = ""; // reset buffer after each tick
        }, 1000 * 60); // every 10s

        startInputLoop(socket);
    });

    socket.on("voice_response", ({ text }) => {
        clearLine();
        console.log(`${c.magenta}${c.bold}  AI ›${c.reset} ${text}\n`);
        promptUser();
    });

    socket.on("analysis_result", ({ status, message }) => {
        printStatus(status, message);
        promptUser();
    });

    socket.on("error", ({ code, message }) => {
        console.error(`\n${c.red}[Error] ${code}: ${message}${c.reset}\n`);
    });

    socket.on("disconnect", () => {
        clearInterval(analysisInterval);
        console.log(`\n${c.yellow}📵 Call ended.${c.reset}\n`);
        process.exit(0);
    });
}

// ── Input Loop ────────────────────────────────────────────────────────────────

let rl;

function promptUser() {
    if (rl) process.stdout.write(`${c.cyan}You › ${c.reset}`);
}

function startInputLoop(socket) {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    promptUser();

    rl.on("line", (line) => {
        const text = line.trim();

        if (!text) {
            promptUser();
            return;
        }

        if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") {
            console.log(`\n${c.gray}Hanging up...${c.reset}`);
            socket.disconnect();
            rl.close();
            return;
        }

        // Accumulate spoken text for next analysis tick
        lastSpokenText += (lastSpokenText ? " " : "") + text;

        process.stdout.write(`${c.dim}  [sending...]${c.reset}\r`);
        socket.emit("voice_message", { text });
    });

    rl.on("close", () => {
        process.exit(0);
    });
}

main().catch(console.error);