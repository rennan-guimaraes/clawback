import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Context } from "grammy";
import type { Bot } from "grammy";
import { getState } from "../state";
import { sendToSDK } from "./message";

interface SkillInfo {
  name: string;
  telegramCommand: string;
}

const SKILLS_DIR = join(homedir(), ".claude", "skills");

async function discoverSkills(): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = join(SKILLS_DIR, entry.name, "SKILL.md");

      try {
        const content = await readFile(skillPath, "utf-8");
        const name = parseSkillName(content) ?? entry.name;

        skills.push({
          name,
          telegramCommand: toTelegramCommand(name),
        });
      } catch {
        // No SKILL.md or unreadable
      }
    }
  } catch {
    // Skills dir doesn't exist
  }

  return skills;
}

function parseSkillName(content: string): string | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  return nameMatch ? nameMatch[1].trim() : null;
}

/**
 * Convert skill name to Telegram command.
 * Telegram commands can't have hyphens, so we strip them.
 * e.g. "validate-plan" -> "validate", "review-plan" -> "review"
 * If no hyphens, use as-is: "commit" -> "commit"
 */
function toTelegramCommand(name: string): string {
  // Remove common suffixes to keep commands short
  return name.replace(/-plan$/, "").replace(/-/g, "");
}

function createSkillHandler(skillName: string) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const state = getState(chatId);

    if (!state.project) {
      await ctx.reply("Nenhum projeto selecionado. Use /projects primeiro.");
      return;
    }

    if (!state.session) {
      await ctx.reply(
        "Nenhuma sessao ativa. Use /sessions ou envie uma mensagem primeiro."
      );
      return;
    }

    const text = ctx.message?.text ?? "";
    const args = text.replace(/^\/\w+\s*/, "").trim();
    const prompt = args ? `/${skillName} ${args}` : `/${skillName}`;

    await sendToSDK(ctx, chatId, prompt);
  };
}

export async function registerSkills(bot: Bot): Promise<SkillInfo[]> {
  const skills = await discoverSkills();

  for (const skill of skills) {
    bot.command(skill.telegramCommand, createSkillHandler(skill.name));
  }

  if (skills.length > 0) {
    const names = skills.map((s) => `/${s.telegramCommand}`).join(", ");
    console.log(`Skills registradas: ${names}`);
  }

  return skills;
}
