import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = join(__dirname, "memory.json");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_HISTORY = 20; // messages per user (keep context window manageable)

// --- Memory helpers ---

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load memory:", e.message);
  }
  return {};
}

function saveMemory(memory) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
  } catch (e) {
    console.error("Failed to save memory:", e.message);
  }
}

// Load once at startup
const memory = loadMemory();

function getHistory(chatId) {
  return memory[chatId] || [];
}

function addToHistory(chatId, role, content) {
  if (!memory[chatId]) memory[chatId] = [];
  memory[chatId].push({ role, content });

  // Trim oldest messages if over limit (keep system context tight)
  if (memory[chatId].length > MAX_HISTORY) {
    memory[chatId] = memory[chatId].slice(-MAX_HISTORY);
  }

  saveMemory(memory);
}

// --- Bot logic ---

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are a helpful and smart college assistant. Keep answers clear, simple, and useful for IT students. You have memory of the conversation history with this user.",
};

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id); // use string keys for JSON safety
  const userText = msg.text;

  if (!userText) return;

  // Handle /reset command to clear memory
  if (userText === "/reset") {
    memory[chatId] = [];
    saveMemory(memory);
    bot.sendMessage(chatId, "🧹 Memory cleared! Starting fresh.");
    return;
  }

  // Build message list: system prompt + history + new user message
  addToHistory(chatId, "user", userText);
  const messages = [SYSTEM_PROMPT, ...getHistory(chatId)];

  try {
    const response = await axios.post(
      GROQ_URL,
      {
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 800,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const reply = response.data.choices[0].message.content;

    // Save assistant reply to history too
    addToHistory(chatId, "assistant", reply);

    bot.sendMessage(chatId, reply);
  } catch (error) {
    console.error(error.response?.data || error.message);

    // Don't save failed turns to history
    // Remove the user message we just added since it wasn't answered
    if (memory[chatId]?.length) {
      memory[chatId].pop();
      saveMemory(memory);
    }

    bot.sendMessage(chatId, "⚠️ AI error. Please try again in a few seconds.");
  }
});