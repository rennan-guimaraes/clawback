import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getState } from "../state";
import type { PermissionMode } from "../../types/state";

const MODE_LABELS: Record<PermissionMode, string> = {
  default: "Default",
  plan: "Plan",
  acceptEdits: "Accept Edits",
  bypassPermissions: "Bypass All",
};

export async function modeHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);
  const keyboard = new InlineKeyboard();

  for (const [mode, label] of Object.entries(MODE_LABELS)) {
    const current = mode === state.permissionMode ? `${label} (atual)` : label;
    keyboard.text(current, `mode:${mode}`);
  }

  await ctx.reply(`Modo atual: <b>${MODE_LABELS[state.permissionMode]}</b>`, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

export async function handleModeSelect(
  ctx: Context,
  chatId: number,
  mode: string
): Promise<void> {
  if (!(mode in MODE_LABELS)) return;

  const state = getState(chatId);
  const selected = mode as PermissionMode;
  state.permissionMode = selected;

  if (state.sdkSession) {
    try {
      await state.sdkSession.query.setPermissionMode(selected);
    } catch {
      // May fail if session just ended
    }
  }

  try {
    await ctx.editMessageText(`Modo alterado para <b>${MODE_LABELS[selected]}</b>.`, {
      parse_mode: "HTML",
    });
  } catch { /* ignore */ }
}
