// worker.js - Hard-coded BOT_TOKEN + CHAT_ID test version
// ONLY use this in a truly private repo for quick testing.

const BOT_TOKEN = "8284876153:AAFMlqxBWhF2rhAgWjpqnz09B3jHe3_qZTo";
const CHAT_ID = "6585524199";

export default {
  async fetch(request, env) {
    if (request.method === "GET") return new Response("Telegram Quiz Worker is up!");

    // skip secret header check for quick private test
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const telegramCall = async (method, payload) => {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    };

    // Handle button presses
    if (update.callback_query) {
      try {
        const cq = update.callback_query;
        const [chapter, qidStr, optIndexStr] = cq.data.split("|");
        const qid = Number(qidStr);
        const optIndex = Number(optIndexStr);

        const rawUrl = env.GITHUB_RAW_BASE + `${chapter}.json`;
        const res = await fetch(rawUrl);
        const questions = await res.json();
        const question = questions.find(q => Number(q.id) === qid);
        if (!question) {
          await telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text: "Question data missing." });
          return new Response("ok");
        }

        const correctIndex = question.options.findIndex(o => o.correct);
        const selectedOption = question.options[optIndex];

        let text = `📚 <b>${escapeHtml(chapter)}</b>\n\n❓ ${escapeHtml(question.question)}\n\n`;
        question.options.forEach((o, i) => {
          const prefix = i === correctIndex ? "✅" : (i === optIndex ? "❌" : "▫️");
          text += `${prefix} ${escapeHtml(o.text)}\n`;
        });
        text += `\n💡 ${escapeHtml(selectedOption.explanation || "")}`;

        await telegramCall("editMessageText", {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text,
          parse_mode: "HTML"
        });

        await telegramCall("answerCallbackQuery", { callback_query_id: cq.id });
      } catch (err) {
        console.error("callback handling error:", err);
      }
      return new Response("ok");
    }

    // Handle /start
    if (update.message && update.message.text && update.message.text.startsWith("/start")) {
      await telegramCall("sendMessage", {
        chat_id: update.message.chat.id,
        text: "Hi — you'll receive daily quiz questions here ✅"
      });
    }

    return new Response("ok");
  },

  async scheduled(controller, env, ctx) {
    const telegramCall = async (method, payload) => {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    };

    try {
      const chapters = (env.CHAPTERS || "").split(",").map(s => s.trim()).filter(Boolean);
      const chapter = chapters.length ? chapters[Math.floor(Math.random() * chapters.length)] : "chapter1";

      const rawUrl = env.GITHUB_RAW_BASE + `${chapter}.json`;
      const res = await fetch(rawUrl);
      const questions = await res.json();
      const q = questions[Math.floor(Math.random() * questions.length)];

      const inline_keyboard = q.options.map((opt, idx) => [
        { text: opt.text, callback_data: `${chapter}|${q.id}|${idx}` }
      ]);

      await telegramCall("sendMessage", {
        chat_id: CHAT_ID,
        text: `📚 <b>${escapeHtml(chapter)}</b>\n\n❓ ${escapeHtml(q.question)}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard }
      });
    } catch (err) {
      console.error("scheduled job error:", err);
    }
  }
};

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

