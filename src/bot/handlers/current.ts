import type { Context } from "grammy";
import { getState } from "../state";
import { escapeHtml } from "../../telegram/format";

export async function currentHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  if (!state.project) {
    await ctx.reply("Nenhum projeto selecionado. Use /projects.");
    return;
  }

  const lines = [
    `<b>Projeto:</b> ${escapeHtml(state.project.name)}`,
    `<b>Sessao:</b> ${state.session ? escapeHtml(state.session.summary) : "nenhuma"}`,
    `<b>Modelo:</b> ${state.model}`,
    `<b>Modo:</b> ${state.permissionMode}`,
  ];

  if (state.processingTurn && state.sdkSession) {
    const elapsed = ((Date.now() - state.sdkSession.startedAt) / 1000).toFixed(0);
    lines.push(`<b>Processo:</b> ativo (${elapsed}s)`);
  } else if (state.sdkSession) {
    lines.push(`<b>Sessao SDK:</b> ativa (aguardando mensagem)`);
  }

  if (state.agentTracker) {
    const pending = state.agentTracker.pendingCount;
    if (pending > 0) {
      lines.push(`<b>Agents em background:</b> ${pending} rodando`);
    }
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}
