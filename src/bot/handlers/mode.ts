import type { Context } from "grammy";
import { getState } from "../state";
import type { PermissionMode } from "../../types/state";

const VALID_MODES: PermissionMode[] = ["default", "plan"];

export async function modeHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const text = ctx.message?.text ?? "";
  const arg = text.replace(/^\/mode\s*/, "").trim().toLowerCase();

  if (!arg) {
    const state = getState(chatId);
    await ctx.reply(
      `Modo atual: <b>${state.permissionMode}</b>\n\nUso: /mode &lt;plan|default&gt;`,
      { parse_mode: "HTML" }
    );
    return;
  }

  if (!VALID_MODES.includes(arg as PermissionMode)) {
    await ctx.reply(`Modo invalido. Use: ${VALID_MODES.join(", ")}`);
    return;
  }

  const state = getState(chatId);
  state.permissionMode = arg as PermissionMode;

  // If there's an active SDK session, update the permission mode live
  if (state.sdkSession) {
    try {
      await state.sdkSession.query.setPermissionMode(arg as PermissionMode);
    } catch {
      // May fail if session just ended
    }
  }

  await ctx.reply(`Modo alterado para <b>${arg}</b>.`, { parse_mode: "HTML" });
}
