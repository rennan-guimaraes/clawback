import { InlineKeyboard } from "grammy";
import type { SessionEntry } from "../../types/state";
import { formatRelativeTime } from "../../claude/sessions";

const PAGE_SIZE = 5;

export function buildSessionsKeyboard(
  sessions: SessionEntry[],
  page: number = 0
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, sessions.length);
  const pageSessions = sessions.slice(start, end);

  for (const session of pageSessions) {
    const branch = session.gitBranch ? ` (${session.gitBranch})` : "";
    const time = formatRelativeTime(session.modified);
    const msgs = session.messageCount;
    const label = `${session.summary.slice(0, 30)}${branch} ${msgs}msg ${time}`;
    keyboard.text(label, `session:${session.id}`).row();
  }

  // Pagination row
  const navRow: boolean = page > 0 || end < sessions.length;
  if (navRow) {
    if (page > 0) {
      keyboard.text("<< Anterior", `sessions_page:${page - 1}`);
    }
    if (end < sessions.length) {
      keyboard.text("Proxima >>", `sessions_page:${page + 1}`);
    }
    keyboard.row();
  }

  // New session button
  keyboard.text("+ Nova sessao", "session:new").row();

  return keyboard;
}
