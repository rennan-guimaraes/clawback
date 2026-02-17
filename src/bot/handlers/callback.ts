import type { Context } from "grammy";
import { getState } from "../state";
import { resolveProject } from "../../claude/projects";
import { listSessions } from "../../claude/sessions";
import { browseDir } from "./projects";
import { buildSessionsKeyboard } from "../keyboards/sessions";
import { escapeHtml } from "../../telegram/format";
import { handleModeSelect } from "./mode";
import { handleModelSelect } from "./model";

export async function callbackHandler(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  if (!data || !chatId) return;

  await ctx.answerCallbackQuery();

  const [action, ...rest] = data.split(":");
  const value = rest.join(":");

  switch (action) {
    case "browse":
      await browseDir(ctx, value === "__root__" ? "" : value);
      break;
    case "project":
      await handleProjectSelect(ctx, chatId, value);
      break;
    case "session":
      await handleSessionSelect(ctx, chatId, value);
      break;
    case "sessions_page":
      await handleSessionsPage(ctx, chatId, parseInt(value, 10));
      break;
    case "perm_approve":
      await handlePermissionApprove(ctx, chatId, parseInt(value, 10));
      break;
    case "perm_deny":
      await handlePermissionDeny(ctx, chatId, parseInt(value, 10));
      break;
    case "perm_approve_all":
      await handlePermissionApproveAll(ctx, chatId);
      break;
    case "perm_deny_all":
      await handlePermissionDenyAll(ctx, chatId);
      break;
    case "new_project":
      await handleNewProject(ctx, chatId, value);
      break;
    case "mode":
      await handleModeSelect(ctx, chatId, value);
      break;
    case "model":
      await handleModelSelect(ctx, chatId, value);
      break;
    default:
      break;
  }
}

async function handleProjectSelect(
  ctx: Context,
  chatId: number,
  relativePath: string
): Promise<void> {
  const project = resolveProject(relativePath);

  const state = getState(chatId);
  state.project = project;
  state.session = null;

  const sessions = await listSessions(project.path);

  if (sessions.length === 0) {
    await ctx.reply(
      `<b>${escapeHtml(project.name)}</b> -- Nenhuma sessao.\n\nEnvie uma mensagem pra criar uma nova.`,
      { parse_mode: "HTML" }
    );
  } else {
    await ctx.reply(
      `<b>Sessoes de ${escapeHtml(project.name)}</b>`,
      {
        parse_mode: "HTML",
        reply_markup: buildSessionsKeyboard(sessions),
      }
    );
  }
}

async function handleSessionSelect(
  ctx: Context,
  chatId: number,
  sessionId: string
): Promise<void> {
  const state = getState(chatId);

  if (!state.project) {
    await ctx.reply("Selecione um projeto primeiro. Use /projects.");
    return;
  }

  if (sessionId === "new") {
    state.session = null;
    await ctx.reply(
      `<b>${escapeHtml(state.project.name)}</b> -- Nova sessao.\n\nEnvie uma mensagem pra comecar.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Find session info
  const sessions = await listSessions(state.project.path);
  const session = sessions.find((s) => s.id === sessionId);

  state.session = {
    id: sessionId,
    summary: session?.summary ?? "Sessao",
  };

  await ctx.reply(
    `Sessao ativa: <b>${escapeHtml(state.session.summary)}</b> (${escapeHtml(state.project.name)})`,
    { parse_mode: "HTML" }
  );
}

async function handleSessionsPage(
  ctx: Context,
  chatId: number,
  page: number
): Promise<void> {
  const state = getState(chatId);

  if (!state.project) return;

  const sessions = await listSessions(state.project.path);

  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: buildSessionsKeyboard(sessions, page),
    });
  } catch {
    // Edit may fail if message is too old
  }
}

/**
 * Permission handlers now resolve the canUseTool Promise directly.
 * No need to re-spawn -- the SDK process is still alive waiting for our answer.
 */
async function handlePermissionApprove(
  ctx: Context,
  chatId: number,
  index: number
): Promise<void> {
  const state = getState(chatId);
  if (!state.pendingPermissions) {
    await ctx.reply("Nenhuma permissao pendente.");
    return;
  }

  const denial = state.pendingPermissions[index];
  if (!denial?.resolve) return;

  // Resolve the promise -- SDK will continue executing the tool
  denial.resolve({ behavior: "allow" });

  // Remove from pending
  state.pendingPermissions.splice(index, 1);
  if (state.pendingPermissions.length === 0) {
    state.pendingPermissions = null;
  }

  try {
    await ctx.editMessageText(`Aprovado: <code>${escapeHtml(denial.description)}</code>`, {
      parse_mode: "HTML",
    });
  } catch { /* ignore */ }
}

async function handlePermissionDeny(
  ctx: Context,
  chatId: number,
  index: number
): Promise<void> {
  const state = getState(chatId);
  if (!state.pendingPermissions) return;

  const denial = state.pendingPermissions[index];
  if (!denial?.resolve) return;

  denial.resolve({ behavior: "deny", message: "User denied via Telegram" });

  state.pendingPermissions.splice(index, 1);
  if (state.pendingPermissions.length === 0) {
    state.pendingPermissions = null;
  }

  try {
    await ctx.editMessageText(`Negado: <code>${escapeHtml(denial.description)}</code>`, {
      parse_mode: "HTML",
    });
  } catch { /* ignore */ }
}

async function handlePermissionApproveAll(
  ctx: Context,
  chatId: number
): Promise<void> {
  const state = getState(chatId);
  if (!state.pendingPermissions) {
    await ctx.reply("Nenhuma permissao pendente.");
    return;
  }

  const count = state.pendingPermissions.length;

  for (const denial of state.pendingPermissions) {
    denial.resolve?.({ behavior: "allow" });
  }

  state.pendingPermissions = null;

  try {
    await ctx.editMessageText(`Aprovadas ${count} permissoes.`, {
      parse_mode: "HTML",
    });
  } catch { /* ignore */ }
}

async function handlePermissionDenyAll(
  ctx: Context,
  chatId: number
): Promise<void> {
  const state = getState(chatId);
  const count = state.pendingPermissions?.length ?? 0;

  if (state.pendingPermissions) {
    for (const denial of state.pendingPermissions) {
      denial.resolve?.({ behavior: "deny", message: "User denied all via Telegram" });
    }
  }

  state.pendingPermissions = null;

  try {
    await ctx.editMessageText(`Negadas ${count} permissoes.`);
  } catch { /* ignore */ }
}

async function handleNewProject(
  ctx: Context,
  chatId: number,
  value: string
): Promise<void> {
  const browsePath = value === "__root__" ? "" : value;
  const state = getState(chatId);
  state.awaitingInput = { type: "project_name", context: { browsePath } };

  await ctx.reply("Digite o nome do novo projeto:");
}
