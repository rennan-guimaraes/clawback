import type { Context } from "grammy";
import { getState } from "../state";
import { listSessions } from "../../claude/sessions";
import { buildSessionsKeyboard } from "../keyboards/sessions";

export async function sessionsHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  if (!state.project) {
    await ctx.reply("Nenhum projeto selecionado. Use /projects primeiro.");
    return;
  }

  const sessions = await listSessions(state.project.path);

  if (sessions.length === 0) {
    await ctx.reply(
      `<b>${escapeHtml(state.project.name)}</b> -- Nenhuma sessao.\n\nEnvie uma mensagem pra criar uma nova.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  await ctx.reply(
    `<b>Sessoes de ${escapeHtml(state.project.name)}</b>`,
    {
      parse_mode: "HTML",
      reply_markup: buildSessionsKeyboard(sessions),
    }
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
