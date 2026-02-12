import type { Context } from "grammy";
import { getState } from "../state";
import { escapeHtml } from "../../telegram/format";

export async function exitHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  if (!state.project && !state.session) {
    await ctx.reply("Nenhuma sessao ativa.");
    return;
  }

  const projectName = state.project?.name ?? "";

  // Close SDK session if active
  if (state.sdkSession) {
    try {
      state.sdkSession.query.close();
    } catch { /* ignore */ }
    state.sdkSession = null;
  }

  state.session = null;
  state.processingTurn = false;
  state.currentStreaming = null;
  state.pendingPermissions = null;
  if (state.agentTracker) {
    state.agentTracker.stop();
    state.agentTracker = null;
  }

  const msg = projectName
    ? `Sessao encerrada. Projeto <b>${escapeHtml(projectName)}</b> ainda selecionado.\nUse /sessions pra escolher outra ou /projects pra trocar.`
    : "Sessao encerrada.";

  await ctx.reply(msg, { parse_mode: "HTML" });
}
