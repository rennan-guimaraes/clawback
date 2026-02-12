import type { Context } from "grammy";
import { getState } from "../state";
import type { ModelShort } from "../../types/state";
import { MODEL_MAP } from "../../types/state";

const MODEL_ALIASES: Record<string, ModelShort> = {
  s: "sonnet",
  sonnet: "sonnet",
  o: "opus",
  opus: "opus",
  h: "haiku",
  haiku: "haiku",
};

export async function modelHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = ctx.message?.text ?? "";
  const arg = text.replace(/^\/model\s*/, "").trim().toLowerCase();

  if (!arg) {
    const state = getState(chatId);
    await ctx.reply(
      `Modelo atual: <b>${state.model}</b>\n\nUso: /model &lt;s|o|h&gt;\n` +
      "s = sonnet, o = opus, h = haiku",
      { parse_mode: "HTML" }
    );
    return;
  }

  const model = MODEL_ALIASES[arg];
  if (!model) {
    await ctx.reply("Modelo invalido. Use: s (sonnet), o (opus), h (haiku)");
    return;
  }

  const state = getState(chatId);
  state.model = model;

  // If there's an active SDK session, update the model live
  if (state.sdkSession) {
    try {
      await state.sdkSession.query.setModel(MODEL_MAP[model]);
    } catch {
      // May fail if session just ended
    }
  }

  await ctx.reply(`Modelo alterado para <b>${model}</b>.`, { parse_mode: "HTML" });
}
