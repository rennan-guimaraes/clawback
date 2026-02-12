/**
 * Escape text for Telegram HTML parse mode.
 * Only &, <, > need escaping per Telegram spec.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert basic markdown patterns to Telegram HTML.
 * Handles: bold, italic, code blocks, inline code, links.
 * Falls back to escaped HTML for anything unsupported.
 */
export function markdownToHtml(text: string): string {
  let result = text;

  // Escape HTML entities first
  result = escapeHtml(result);

  // Code blocks: ```lang\ncode\n``` -> <pre><code>code</code></pre>
  result = result.replace(
    /```(?:\w*)\n([\s\S]*?)```/g,
    "<pre><code>$1</code></pre>"
  );

  // Inline code: `code` -> <code>code</code>
  result = result.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  result = result.replace(/__(.+?)__/g, "<b>$1</b>");

  // Italic: *text* or _text_ (but not inside words)
  result = result.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "<i>$1</i>");
  result = result.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, "<i>$1</i>");

  return result;
}
