import { InlineKeyboard } from "grammy";
import type { PermissionDenial } from "../../types/state";
import { escapeHtml } from "../../telegram/format";

export function buildPermissionsKeyboard(denials: PermissionDenial[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (let i = 0; i < denials.length; i++) {
    keyboard
      .text(`Aprovar: ${denials[i].description.slice(0, 30)}`, `perm_approve:${i}`)
      .text("Negar", `perm_deny:${i}`)
      .row();
  }

  // Bulk actions
  keyboard
    .text("Aprovar Todos", "perm_approve_all")
    .text("Negar Todos", "perm_deny_all")
    .row();

  return keyboard;
}

export function formatPermissionsMessage(denials: PermissionDenial[]): string {
  const lines = ["<b>Permissoes necessarias:</b>\n"];

  for (const denial of denials) {
    lines.push(`<code>${escapeHtml(denial.description)}</code>`);
  }

  return lines.join("\n");
}
