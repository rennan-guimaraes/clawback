import type { Context } from "grammy";
import { listEntries } from "../../claude/projects";
import { buildBrowseKeyboard } from "../keyboards/projects";
import { escapeHtml } from "../../telegram/format";

export async function projectsHandler(ctx: Context): Promise<void> {
  await browseDir(ctx, "");
}

export async function browseDir(ctx: Context, relativePath: string): Promise<void> {
  const entries = await listEntries(relativePath);

  if (entries.length === 0) {
    await ctx.reply("Nenhuma pasta ou projeto encontrado.");
    return;
  }

  const title = relativePath || "Projetos";

  await ctx.reply(`<b>${escapeHtml(title)}</b>`, {
    parse_mode: "HTML",
    reply_markup: buildBrowseKeyboard(entries, relativePath),
  });
}
