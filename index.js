// OpenClaw Bot - Multi-platform AI Assistant
import Anthropic from "@anthropic-ai/sdk";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.json({
    name: "OpenClaw Bot",
    version: "1.0.0",
    customer: process.env.CUSTOMER_EMAIL,
    plan: process.env.PLAN,
  });
});

app.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for the AI
const SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise, friendly, and helpful.
Customer: ${process.env.CUSTOMER_NAME || "User"}
Plan: ${process.env.PLAN || "standard"}`;

// Chat with Claude
async function chat(message, conversationHistory = []) {
  try {
    const messages = [
      ...conversationHistory,
      { role: "user", content: message },
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    return response.content[0].text;
  } catch (error) {
    console.error("Anthropic API error:", error);
    return "Sorry, I encountered an error. Please try again.";
  }
}

// Store conversation history per user
const conversations = new Map();

function getConversation(userId) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  return conversations.get(userId);
}

function addToConversation(userId, role, content) {
  const history = getConversation(userId);
  history.push({ role, content });
  // Keep only last 20 messages
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
}

// ========== TELEGRAM BOT ==========
async function startTelegram() {
  const { Telegraf } = await import("telegraf");
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log("Telegram: No bot token provided, skipping");
    return;
  }

  const bot = new Telegraf(token);

  bot.start((ctx) => {
    ctx.reply(`Hello! I'm your AI assistant. How can I help you today?`);
  });

  bot.on("text", async (ctx) => {
    const userId = `telegram:${ctx.from.id}`;
    const message = ctx.message.text;

    try {
      await ctx.sendChatAction("typing");
      const history = getConversation(userId);
      const response = await chat(message, history);

      addToConversation(userId, "user", message);
      addToConversation(userId, "assistant", response);

      await ctx.reply(response);
    } catch (error) {
      console.error("Telegram error:", error);
      await ctx.reply("Sorry, something went wrong. Please try again.");
    }
  });

  bot.launch();
  console.log("Telegram bot started");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

// ========== DISCORD BOT ==========
async function startDiscord() {
  const { Client, GatewayIntentBits } = await import("discord.js");
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    console.log("Discord: No bot token provided, skipping");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
  });

  client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  });

  client.on("messageCreate", async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only respond to DMs or mentions
    const isMentioned = message.mentions.has(client.user);
    const isDM = !message.guild;

    if (!isMentioned && !isDM) return;

    const userId = `discord:${message.author.id}`;
    const content = message.content.replace(/<@!?\d+>/g, "").trim();

    if (!content) return;

    try {
      await message.channel.sendTyping();
      const history = getConversation(userId);
      const response = await chat(content, history);

      addToConversation(userId, "user", content);
      addToConversation(userId, "assistant", response);

      // Split long messages
      if (response.length > 2000) {
        const chunks = response.match(/[\s\S]{1,2000}/g);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
      } else {
        await message.reply(response);
      }
    } catch (error) {
      console.error("Discord error:", error);
      await message.reply("Sorry, something went wrong. Please try again.");
    }
  });

  client.login(token);
}

// ========== SLACK BOT ==========
async function startSlack() {
  const { App } = await import("@slack/bolt");
  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;

  if (!botToken || !appToken) {
    console.log("Slack: Missing bot token or app token, skipping");
    return;
  }

  const slackApp = new App({
    token: botToken,
    appToken: appToken,
    socketMode: true,
  });

  slackApp.message(async ({ message, say }) => {
    if (message.subtype) return; // Ignore edited messages, etc.

    const userId = `slack:${message.user}`;
    const text = message.text;

    try {
      const history = getConversation(userId);
      const response = await chat(text, history);

      addToConversation(userId, "user", text);
      addToConversation(userId, "assistant", response);

      await say(response);
    } catch (error) {
      console.error("Slack error:", error);
      await say("Sorry, something went wrong. Please try again.");
    }
  });

  await slackApp.start();
  console.log("Slack bot started in socket mode");
}

// ========== MAIN ==========
async function main() {
  console.log("OpenClaw Bot starting...");
  console.log(`Customer: ${process.env.CUSTOMER_EMAIL}`);
  console.log(`Plan: ${process.env.PLAN}`);
  console.log(`Deployment ID: ${process.env.DEPLOYMENT_ID}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  // Start all configured bots
  await Promise.all([
    startTelegram(),
    startDiscord(),
    startSlack(),
  ]);

  console.log("OpenClaw Bot is running!");
}

main().catch(console.error);
