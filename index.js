require("dotenv").config();

const express = require("express");
const { Bot, webhookCallback } = require("grammy");
const questions = require("./questions");
const { ensureSheet, upsertStarted, updateProgress } = require("./sheets");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");

const bot = new Bot(token);
const sessions = new Map();
const bonusAmount = process.env.BONUS_AMOUNT || "20";

function parseSource(startPayload) {
  if (!startPayload) return "не указан";

  const value = String(startPayload).trim();

  // Supported links:
  // https://t.me/BOT?start=channel1
  // https://t.me/BOT?start=pickme_main
  // https://t.me/BOT?start=source_channel_1
  if (!value || value === "survey") return "не указан";

  return value
    .replace(/^source[_-]?/i, "")
    .replace(/_/g, " ")
    .slice(0, 64);
}

function getSession(userId) {
  return sessions.get(userId);
}

function setSession(userId, session) {
  sessions.set(userId, session);
}

function clearSession(userId) {
  sessions.delete(userId);
}

async function askCurrentQuestion(ctx, session) {
  if (session.step < questions.length) {
    await ctx.reply(questions[session.step].text);
    return;
  }

  session.waitingForPhone = true;
  setSession(ctx.from.id, session);
  await updateProgress({
    user: ctx.from,
    source: session.source,
    answers: session.answers,
    currentStatus: "Опрос пройден, ожидаем номер телефона"
  });

  await ctx.reply(
    "Спасибо, ты ответил(а) на вопросы 🙌\n\n" +
      "Теперь напиши номер телефона, к которому привязана бонусная карта Pick me.\n" +
      `На этот номер начислим ${bonusAmount} бонусов 🎁`
  );
}

async function startSurvey(ctx, source) {
  const user = ctx.from;
  const session = {
    source,
    step: 0,
    answers: {},
    waitingForPhone: false
  };

  setSession(user.id, session);

  await upsertStarted({
    user,
    source,
    currentStatus: "Начал опрос"
  });

  await ctx.reply(
    `Спасибо за участие 🙌\n\n` +
      `Я задам тебе несколько коротких вопросов. Это займёт 1–2 минуты.\n` +
      `В конце попросим номер телефона для начисления ${bonusAmount} бонусов на карту Pick me 🎁`
  );

  await askCurrentQuestion(ctx, session);
}

bot.command("start", async (ctx) => {
  const payload = ctx.match;
  const source = parseSource(payload);
  await startSurvey(ctx, source);
});

bot.on("message:text", async (ctx) => {
  const user = ctx.from;
  const text = ctx.message.text.trim();
  let session = getSession(user.id);

  if (!session) {
    await ctx.reply(
      "Чтобы начать опрос, перейди по ссылке из публикации или нажми /start."
    );
    return;
  }

  if (session.waitingForPhone) {
    session.phone = text;

    await updateProgress({
      user,
      source: session.source,
      answers: session.answers,
      phone: session.phone,
      completed: true
    });

    clearSession(user.id);

    await ctx.reply(
      `Готово, спасибо! 🙌\n\n` +
        `Мы записали твои ответы и номер телефона. ${bonusAmount} бонусов скоро начислим на карту Pick me 🎁`
    );
    return;
  }

  const currentQuestion = questions[session.step];
  session.answers[currentQuestion.key] = text;
  session.step += 1;

  const status = session.step < questions.length
    ? `Ответил на ${session.step} из ${questions.length} вопросов`
    : "Ответил на все вопросы, ожидаем номер телефона";

  await updateProgress({
    user,
    source: session.source,
    answers: session.answers,
    currentStatus: status
  });

  setSession(user.id, session);
  await askCurrentQuestion(ctx, session);
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

async function main() {
  await ensureSheet();

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const secret = process.env.WEBHOOK_SECRET || "webhook";
  const secretPath = `/telegram/${secret}`;
  const telegramWebhook = webhookCallback(bot, "express");

  app.post(secretPath, (req, res, next) => {
    if (!req.body || typeof req.body.update_id === "undefined") {
      console.warn("Ignored invalid webhook request:", req.body);
      return res.sendStatus(200);
    }
    return telegramWebhook(req, res, next);
  });

  app.get(secretPath, (_req, res) => {
    res.status(200).send("Telegram webhook endpoint is active");
  });

  const port = process.env.PORT || 8080;
  app.listen(port, async () => {
    console.log(`Server listening on port ${port}`);

    if (process.env.PUBLIC_URL) {
      const webhookUrl = `${process.env.PUBLIC_URL.replace(/\/$/, "")}${secretPath}`;
      await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ["message"]
      });
      console.log(`Webhook set: ${webhookUrl}`);
    } else {
      console.warn("PUBLIC_URL is empty. Webhook was not set automatically.");
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
