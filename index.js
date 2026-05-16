import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = join(__dirname, "memory.json");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_HISTORY = 20;

// --- Memory helpers ---

function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE))
      return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
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

const memory = loadMemory();

function getHistory(chatId) {
  return memory[chatId] || [];
}

function addToHistory(chatId, role, content) {
  if (!memory[chatId]) memory[chatId] = [];
  memory[chatId].push({ role, content });
  if (memory[chatId].length > MAX_HISTORY)
    memory[chatId] = memory[chatId].slice(-MAX_HISTORY);
  saveMemory(memory);
}

function popLastUserMessage(chatId) {
  if (memory[chatId]?.length) {
    memory[chatId].pop();
    saveMemory(memory);
  }
}

// --- File helpers ---

// Download a Telegram file and return it as a Buffer
async function downloadTelegramFile(fileId) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;

  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
  });
}

// Extract plain text from a PDF buffer
async function extractPdfText(buffer) {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocument({ data: uint8 }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
}

// --- Groq call ---

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "You are a helpful and smart college assistant. Keep answers clear, simple, and useful for IT students. You have memory of the conversation history with this user.",
};

async function askGroq(messages, useVision = false) {
  const model = useVision
    ? "meta-llama/llama-4-scout-17b-16e-instruct"  // vision model
    : "llama-3.3-70b-versatile";         // text model

  const response = await axios.post(
    GROQ_URL,
    { model, messages, temperature: 0.7, max_tokens: 800 },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.choices[0].message.content;
}

// --- Bot logic ---

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const userText = msg.text;
  const caption = msg.caption || "";

  // /reset command
  if (userText === "/reset") {
    memory[chatId] = [];
    saveMemory(memory);
    bot.sendMessage(chatId, "🧹 Memory cleared! Starting fresh.");
    return;
  }

  // --- Image handling ---
  if (msg.photo) {
    await bot.sendChatAction(chatId, "typing");
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const fileInfo = await bot.getFile(fileId)
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`
      const prompt = caption || "Describe this image in detail.";
      const messages = [
        SYSTEM_PROMPT,
        ...getHistory(chatId),
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: fileUrl } },
          ],
        },
      ];

      const reply = await askGroq(messages, true);
      addToHistory(chatId, "assistant", `[Image analysis]: ${reply}`);
      bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error(err.response?.data || err.message);
      bot.sendMessage(chatId, "⚠️ Could not analyze the image. Try again.");
    }
    return;
  }

  // --- PDF / Document handling ---
  if (msg.document) {
    const mime = msg.document.mime_type || "";
    await bot.sendChatAction(chatId, "typing");

    try {
      const buffer = await downloadTelegramFile(msg.document.file_id);
      let fileContent = "";

      if (mime === "application/pdf") {
        fileContent = await extractPdfText(buffer);
        if (!fileContent) {
          bot.sendMessage(chatId, "⚠️ Couldn't extract text from this PDF. It may be scanned/image-based.");
          return;
        }
      } else if (mime.startsWith("text/")) {
        // .txt, .csv, .js, .py, etc.
        fileContent = buffer.toString("utf-8");
      } else {
        bot.sendMessage(chatId, "⚠️ Unsupported file type. I can read PDFs and text files.");
        return;
      }

      // Truncate if too large (~12k chars is safe for context)
      const truncated = fileContent.length > 12000
        ? fileContent.slice(0, 12000) + "\n\n[...file truncated due to length]"
        : fileContent;

      const prompt = caption
        ? `${caption}\n\nFile contents:\n${truncated}`
        : `Please summarize and explain the following file:\n\n${truncated}`;

      addToHistory(chatId, "user", prompt);
      const messages = [SYSTEM_PROMPT, ...getHistory(chatId)];
      const reply = await askGroq(messages);
      addToHistory(chatId, "assistant", reply);
      bot.sendMessage(chatId, reply);
    } catch (err) {
      console.error(err.response?.data || err.message);
      popLastUserMessage(chatId);
      bot.sendMessage(chatId, "⚠️ Failed to process the file. Try again.");
    }
    return;
  }

  // --- Plain text message ---
  if (!userText) return;

  await bot.sendChatAction(chatId, "typing");
  addToHistory(chatId, "user", userText);
  const messages = [SYSTEM_PROMPT, ...getHistory(chatId)];

  try {
    const reply = await askGroq(messages);
    addToHistory(chatId, "assistant", reply);
    bot.sendMessage(chatId, reply);
  } catch (err) {
    console.error(err.response?.data || err.message);
    popLastUserMessage(chatId);
    bot.sendMessage(chatId, "⚠️ AI error. Please try again in a few seconds.");
  }
});