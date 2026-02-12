import type { Context } from "grammy";
import { getState } from "../state";

export async function teleportHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  if (!state.session) {
    await ctx.reply("Nenhuma sessao ativa pra teleportar.");
    return;
  }

  if (!state.project) {
    await ctx.reply("Nenhum projeto selecionado.");
    return;
  }

  const cmd = `cd ${state.project.path} && claude --resume ${state.session.id}`;

  await ctx.reply(
    "Pra continuar no terminal:\n\n" +
    `<code>${escapeHtml(cmd)}</code>`,
    { parse_mode: "HTML" }
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
