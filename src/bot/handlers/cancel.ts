import type { Context } from "grammy";
import { getState } from "../state";

export async function cancelHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  if (!state.sdkSession && !state.processingTurn) {
    await ctx.reply("Nenhum processo ativo.");
    return;
  }

  let elapsed = "0";
  if (state.sdkSession) {
    elapsed = ((Date.now() - state.sdkSession.startedAt) / 1000).toFixed(0);

    try {
      await state.sdkSession.query.interrupt();
    } catch {
      // Interrupt may fail if already done
    }

    try {
      state.sdkSession.query.close();
    } catch {
      // Close may fail if already closed
    }
  }

  state.sdkSession = null;
  state.processingTurn = false;
  state.currentStreaming = null;
  state.pendingPermissions = null;
  if (state.agentTracker) {
    state.agentTracker.stop();
    state.agentTracker = null;
  }

  await ctx.reply(`Processo cancelado (${elapsed}s).`);
}
