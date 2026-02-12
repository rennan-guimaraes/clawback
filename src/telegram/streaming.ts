import type { Api } from "grammy";
import { escapeHtml, markdownToHtml } from "./format";
import { editMessageSafe, sendChunked, deleteMessageSafe } from "./sender";

const EDIT_INTERVAL_MS = 1500;
const MAX_EDIT_LENGTH = 3800;

export interface StreamingController {
  setStatus: (status: string) => Promise<void>;
  onTextDelta: (text: string) => void;
  onToolUse: (toolName: string, toolInput: Record<string, unknown>) => void;
  onToolResult: () => void;
  onAgentComplete: (summary: string, taskId: string) => void;
  flush: () => Promise<void>;
  finalize: (cost: number, durationMs: number, resultText?: string) => Promise<void>;
}

export function createStreamingController(
  api: Api,
  chatId: number,
  header: string
): StreamingController {
  let buffer = "";
  let messageId: number | null = null;
  let statusMsgId: number | null = null;
  let lastEditAt = 0;
  let editTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSentText = "";
  let statusCreating = false;
  let messageCreating = false;

  async function setStatus(status: string): Promise<void> {
    if (statusCreating) return;

    const text = `${header}\n\n<i>${escapeHtml(status)}</i>`;

    if (statusMsgId) {
      await editMessageSafe(api, chatId, statusMsgId, text);
    } else {
      statusCreating = true;
      try {
        const msg = await api.sendMessage(chatId, text, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        statusMsgId = msg.message_id;
      } finally {
        statusCreating = false;
      }
    }
  }

  async function deleteStatus(): Promise<void> {
    if (statusMsgId) {
      await deleteMessageSafe(api, chatId, statusMsgId);
      statusMsgId = null;
    }
  }

  /**
   * Freeze the current content message (final edit with current buffer)
   * and reset so next text goes to a new message.
   */
  async function freezeCurrentMessage(): Promise<void> {
    if (editTimer) {
      clearTimeout(editTimer);
      editTimer = null;
    }

    if (messageId && buffer) {
      const finalContent = `${header}\n\n${markdownToHtml(buffer)}`;
      if (finalContent.length <= 4000) {
        await editMessageSafe(api, chatId, messageId, finalContent);
      } else {
        await deleteMessageSafe(api, chatId, messageId);
        await sendChunked(api, chatId, finalContent);
      }
    }

    buffer = "";
    messageId = null;
    lastSentText = "";
  }

  async function ensureMessage(): Promise<void> {
    if (messageId || messageCreating) return;

    messageCreating = true;
    try {
      const msg = await api.sendMessage(chatId, `${header}\n\n...`, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
      messageId = msg.message_id;
    } finally {
      messageCreating = false;
    }
  }

  function buildContent(): string {
    const body = markdownToHtml(buffer) || "...";
    return `${header}\n\n${body}`;
  }

  async function doEdit(): Promise<void> {
    if (!messageId) return;

    const content = buildContent();
    if (content === lastSentText) return;

    if (content.length > MAX_EDIT_LENGTH) {
      await freezeCurrentMessage();
      return;
    }

    const ok = await editMessageSafe(api, chatId, messageId, content);
    if (ok) {
      lastSentText = content;
      lastEditAt = Date.now();
    }
  }

  function scheduleEdit(): void {
    if (editTimer) return;
    const elapsed = Date.now() - lastEditAt;
    const delay = Math.max(0, EDIT_INTERVAL_MS - elapsed);
    editTimer = setTimeout(async () => {
      editTimer = null;
      await doEdit();
    }, delay);
  }

  return {
    setStatus,

    onTextDelta(text: string) {
      buffer += text;
      ensureMessage().then(() => scheduleEdit());
    },

    onToolUse(toolName: string, toolInput: Record<string, unknown>) {
      // Don't mark stale -- keep accumulating in the same content message.
      // Status messages are separate and get edited in place.
      // This prevents the flood of empty "..." messages when many tools run.
      const inputPreview = getToolPreview(toolName, toolInput);
      setStatus(`Usando ${toolName}: ${inputPreview}`).catch(() => {});
    },

    onToolResult() {
      setStatus("Processando...").catch(() => {});
    },

    onAgentComplete(summary: string, taskId: string) {
      const shortId = taskId.slice(0, 7);
      setStatus(`Agent concluido [${shortId}]: ${summary}`).catch(() => {});
    },

    async flush() {
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      if (buffer) {
        await ensureMessage();
        await doEdit();
      }
    },

    async finalize(cost: number, durationMs: number, resultText?: string) {
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }

      const finalBuffer = buffer || resultText || "";

      const duration = (durationMs / 1000).toFixed(1);
      const costStr = cost.toFixed(4);
      const footer = `\n\n<i>$${costStr} | ${duration}s</i>`;

      if (!finalBuffer) {
        const empty = `${header}\n\n<i>(sem resposta)</i>${footer}`;
        if (statusMsgId) {
          await editMessageSafe(api, chatId, statusMsgId, empty);
          statusMsgId = null;
        } else if (messageId) {
          await editMessageSafe(api, chatId, messageId, empty);
        } else {
          await sendChunked(api, chatId, empty);
        }
        return;
      }

      await deleteStatus();

      const body = markdownToHtml(finalBuffer);
      const content = `${header}\n\n${body}${footer}`;

      if (messageId) {
        if (content.length <= 4000) {
          await editMessageSafe(api, chatId, messageId, content);
        } else {
          await deleteMessageSafe(api, chatId, messageId);
          await sendChunked(api, chatId, content);
        }
      } else {
        await sendChunked(api, chatId, content);
      }
    },
  };
}

function getToolPreview(
  toolName: string,
  input: Record<string, unknown>
): string {
  if (toolName === "Bash" && typeof input.command === "string") {
    return input.command.slice(0, 80);
  }
  if (toolName === "Read" && typeof input.file_path === "string") {
    return input.file_path;
  }
  if (toolName === "Write" && typeof input.file_path === "string") {
    return input.file_path;
  }
  if (toolName === "Edit" && typeof input.file_path === "string") {
    return input.file_path;
  }
  if (toolName === "Glob" && typeof input.pattern === "string") {
    return input.pattern;
  }
  if (toolName === "Grep" && typeof input.pattern === "string") {
    return input.pattern;
  }

  const firstVal = Object.values(input).find((v) => typeof v === "string");
  if (typeof firstVal === "string") return firstVal.slice(0, 60);
  return "...";
}
