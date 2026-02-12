import type { Context, NextFunction } from "grammy";
import { getState } from "../state";

const BYPASS_COMMANDS = new Set(["cancel", "current", "help", "exit", "teleport"]);

export async function activeGuard(ctx: Context, next: NextFunction): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const state = getState(chatId);

  // Always allow callback queries (for permission buttons)
  if (ctx.callbackQuery) {
    await next();
    return;
  }

  // Allow bypass commands even when process is active
  if (ctx.message?.text?.startsWith("/")) {
    const command = ctx.message.text.split(" ")[0].slice(1).split("@")[0];
    if (BYPASS_COMMANDS.has(command)) {
      await next();
      return;
    }
  }

  // Block new messages while a turn is being processed
  if (state.processingTurn) {
    await ctx.reply("Processo em execucao. Use /cancel pra abortar ou aguarde.");
    return;
  }

  await next();
}
