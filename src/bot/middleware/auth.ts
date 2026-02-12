import type { Context, NextFunction } from "grammy";
import { env } from "../../env";

export async function authMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId || userId !== env.ALLOWED_USER_ID) {
    await ctx.reply("Acesso nao autorizado.");
    return;
  }

  await next();
}
