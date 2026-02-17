import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getState } from "../state";
import type { ModelShort } from "../../types/state";
import { MODEL_MAP } from "../../types/state";

const MODEL_LABELS: Record<ModelShort, string> = {
  sonnet: "Sonnet",
  opus: "Opus",
  haiku: "Haiku",
};

export async function modelHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);
  const keyboard = new InlineKeyboard();

  for (const [model, label] of Object.entries(MODEL_LABELS)) {
    const current = model === state.model ? `${label} (atual)` : label;
    keyboard.text(current, `model:${model}`);
  }

  await ctx.reply(`Modelo atual: <b>${MODEL_LABELS[state.model]}</b>`, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleModelSelect(
  ctx: Context,
  chatId: number,
  model: string
): Promise<void> {
  if (!(model in MODEL_LABELS)) return;

  const state = getState(chatId);
  const selected = model as ModelShort;
  state.model = selected;

  if (state.sdkSession) {
    try {
      await state.sdkSession.query.setModel(MODEL_MAP[selected]);
    } catch {
      // May fail if session just ended
    }
  }

  try {
    await ctx.editMessageText(`Modelo alterado para <b>${MODEL_LABELS[selected]}</b>.`, {
      parse_mode: "HTML",
    });
  } catch { /* ignore */ }
}
