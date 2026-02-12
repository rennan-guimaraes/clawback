import type { Context } from "grammy";

export async function startHandler(ctx: Context): Promise<void> {
  await ctx.reply(
    "<b>ClawBack</b> -- Controle remoto pro Claude Code\n\n" +
    "Use /projects pra selecionar um projeto e comecar.\n\n" +
    "/help pra ver todos os comandos.",
    { parse_mode: "HTML" }
  );
}
