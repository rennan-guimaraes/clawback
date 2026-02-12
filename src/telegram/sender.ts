import type { Api } from "grammy";
import { escapeHtml } from "./format";

const MAX_MESSAGE_LENGTH = 4000;

export async function sendChunked(
  api: Api,
  chatId: number,
  text: string,
  parseMode: "HTML" | undefined = "HTML"
): Promise<number[]> {
  const chunks = chunkText(text, MAX_MESSAGE_LENGTH);
  const messageIds: number[] = [];

  for (const chunk of chunks) {
    const msg = await api.sendMessage(chatId, chunk, {
      parse_mode: parseMode,
      link_preview_options: { is_disabled: true },
    });
    messageIds.push(msg.message_id);
  }

  return messageIds;
}

export async function editMessageSafe(
  api: Api,
  chatId: number,
  messageId: number,
  text: string
): Promise<boolean> {
  try {
    // Telegram rejects edits with identical content
    await api.editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Ignore "message is not modified" errors
    if (errMsg.includes("message is not modified")) return true;
    // Ignore "message to edit not found" (deleted by user)
    if (errMsg.includes("message to edit not found")) return false;
    console.error("Edit message error:", errMsg);
    return false;
  }
}

export async function deleteMessageSafe(
  api: Api,
  chatId: number,
  messageId: number
): Promise<void> {
  try {
    await api.deleteMessage(chatId, messageId);
  } catch {
    // Ignore
  }
}

export function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let breakAt = remaining.lastIndexOf("\n", maxLen);
    if (breakAt === -1 || breakAt < maxLen / 2) {
      breakAt = maxLen;
    }

    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }

  return chunks;
}

export function buildContextHeader(
  projectName: string,
  sessionSummary: string,
  model: string
): string {
  return `<b>[${escapeHtml(projectName)} &gt; ${escapeHtml(sessionSummary)} | ${model}]</b>`;
}
