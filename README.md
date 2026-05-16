# 🤖 ChatBot AWS — Telegram AI Assistant

A Telegram bot powered by **Groq** (Llama 3.3 70B) with **persistent per-user memory**. Built for IT students as a smart college assistant.

---

## ✨ Features

- 💬 **AI-powered replies** via Groq's Llama 3.3 70B model
- 🧠 **Persistent memory** — conversations survive bot restarts
- 👤 **Per-user isolation** — each user has their own conversation history
- 🔄 **`/reset` command** — users can wipe their own memory anytime
- ⚡ **Fast & lightweight** — no database required, uses a local JSON file

---

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Telegram Bot Token](https://t.me/BotFather)
- A [Groq API Key](https://console.groq.com/)

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ChatBot_AWS.git
cd ChatBot_AWS
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root of the project:

```env
BOT_TOKEN=your_telegram_bot_token_here
GROQ_KEY=your_groq_api_key_here
```

### 4. Run the bot

```bash
node index.js
```

---

## 💬 Commands

| Command  | Description                          |
|----------|--------------------------------------|
| `/reset` | Clears your conversation history and starts fresh |

Any other message is sent to the AI and answered in context.

---

## 🗂️ Project Structure

```
ChatBot_AWS/
├── index.js        # Main bot logic
├── memory.json     # Auto-generated — stores conversation history
├── .env            # Environment variables (never commit this)
├── .gitignore
└── package.json
```

---

## ⚙️ Configuration

You can tweak these constants in `index.js`:

| Constant      | Default | Description                              |
|---------------|---------|------------------------------------------|
| `MAX_HISTORY` | `20`    | Max messages kept per user               |
| `model`       | `llama-3.3-70b-versatile` | Groq model to use       |
| `temperature` | `0.7`   | Response creativity (0 = focused, 1 = creative) |
| `max_tokens`  | `800`   | Max length of each AI reply              |

---

## 🔒 .gitignore

Make sure your `.gitignore` includes:

```
.env
memory.json
node_modules/
```

---

## 📦 Dependencies

| Package                | Purpose                        |
|------------------------|--------------------------------|
| `node-telegram-bot-api`| Telegram Bot SDK               |
| `axios`                | HTTP requests to Groq API      |
| `dotenv`               | Load environment variables     |

---

## 🛠️ Scaling Up

The memory layer is intentionally simple. To scale:

- **SQLite** — swap `memory.json` with `better-sqlite3` for concurrent writes
- **Redis** — use `ioredis` for distributed/multi-instance deployments
- Only `loadMemory`, `saveMemory`, `getHistory`, and `addToHistory` need to change

---
