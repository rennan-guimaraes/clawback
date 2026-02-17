import { InlineKeyboard } from "grammy";
import type { DirEntry } from "../../claude/projects";

export function buildBrowseKeyboard(
  entries: DirEntry[],
  currentPath: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = entry.isProject ? entry.name : `${entry.name}/`;
    const callback = entry.isProject
      ? `project:${entry.path}`
      : `browse:${entry.path}`;

    keyboard.text(label, callback);
    if (i % 2 === 1) keyboard.row();
  }

  // Ensure we're on a new row
  if (entries.length % 2 === 1) keyboard.row();

  // New project button
  keyboard.text("+ Novo Projeto", `new_project:${currentPath || "__root__"}`).row();

  // Back button if not at root
  if (currentPath) {
    const lastSep = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
    const parent = lastSep > 0
      ? currentPath.slice(0, lastSep)
      : "";
    keyboard.text("<< Voltar", `browse:${parent || "__root__"}`).row();
  }

  return keyboard;
}
