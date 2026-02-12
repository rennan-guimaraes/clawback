import type { Context } from "grammy";
import type { Api } from "grammy";
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKTaskNotificationMessage,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { getState } from "../state";
import { createSDKSession, formatToolDescription } from "../../claude/sdk-session";
import { createStreamingController, type StreamingController } from "../../telegram/streaming";
import { buildContextHeader } from "../../telegram/sender";
import { escapeHtml } from "../../telegram/format";
import { buildPermissionsKeyboard, formatPermissionsMessage } from "../keyboards/permissions";
import { AgentTracker, parseAgentLaunchResult } from "../../claude/agent-tracker";
import type { PermissionDenial } from "../../types/state";

export async function messageHandler(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const text = ctx.message?.text;
  if (!chatId || !text) return;

  const state = getState(chatId);

  if (!state.project) {
    await ctx.reply("Nenhuma sessao ativa. Use /projects pra comecar.");
    return;
  }

  await sendToSDK(ctx, chatId, text);
}

/**
 * Send a message to Claude via the SDK.
 *
 * If there's already an active SDK session, push the message into it.
 * Otherwise, create a new session with a background event loop.
 *
 * CRITICAL: The event loop runs fire-and-forget so it does NOT block
 * grammY's update processing. Otherwise /teleport, /cancel, etc would hang.
 */
export async function sendToSDK(
  ctx: Context,
  chatId: number,
  prompt: string
): Promise<void> {
  const state = getState(chatId);
  if (!state.project) return;

  const sessionSummary = state.session?.summary ?? prompt.slice(0, 40);
  const header = buildContextHeader(state.project.name, sessionSummary, state.model);
  const streaming = createStreamingController(ctx.api, chatId, header);

  // Set turn state BEFORE any awaits (so active-guard sees it immediately)
  state.processingTurn = true;
  state.currentStreaming = streaming;

  if (state.sdkSession) {
    // Existing session -- push message, event loop already running
    state.sdkSession.pushMessage(prompt);
    await streaming.setStatus("Enviando...");
    return;
  }

  // Create new SDK session
  const { handle, messages } = createSDKSession({
    cwd: state.project.path,
    model: state.model,
    permissionMode: state.permissionMode,
    sessionId: state.session?.id,
    initialPrompt: prompt,
    canUseTool: createPermissionHandler(ctx.api, chatId),
  });

  state.sdkSession = handle;
  await streaming.setStatus("Conectando...");

  // Fire and forget! This runs in the background, does NOT block grammY.
  runEventLoop(messages, chatId, ctx.api).catch((err) => {
    console.error("Event loop error:", err);
    const s = getState(chatId);
    s.sdkSession = null;
    s.processingTurn = false;
    s.currentStreaming = null;
  });
}

/**
 * Background event loop that processes SDK messages for the lifetime of the session.
 *
 * Dispatches events to `state.currentStreaming` (set per turn by sendToSDK).
 * When a `result` event arrives, it finalizes the current streaming and clears
 * `processingTurn`, freeing the bot to accept new commands.
 *
 * The loop stays alive between turns, waiting for the next message push.
 *
 * BACKGROUND AGENTS: The SDK/CLI does NOT reliably emit task_notification events.
 * Instead, we use AgentTracker to poll output files and detect when agents complete.
 * When an agent completes, we push a follow-up message to Claude so it processes
 * the results automatically.
 */
async function runEventLoop(
  messages: AsyncGenerator<SDKMessage, void>,
  chatId: number,
  api: Api
): Promise<void> {
  const state = getState(chatId);
  const sessionSummary = state.session?.summary ?? "Sessao";
  let gotFirstEvent = false;

  // Track tool_use IDs that are background agents, so we can match them
  // to their tool_result and extract agentId/outputFile.
  const pendingBackgroundTools = new Map<string, string>();

  /**
   * Ensure a streaming controller exists for the current turn.
   * If Claude auto-continues after a background agent completes,
   * this creates a fresh controller so the new turn streams properly.
   */
  function ensureStreaming(): StreamingController {
    if (state.currentStreaming) return state.currentStreaming;

    const header = buildContextHeader(
      state.project?.name ?? "?",
      state.session?.summary ?? sessionSummary,
      state.model
    );
    const streaming = createStreamingController(api, chatId, header);
    state.currentStreaming = streaming;
    state.processingTurn = true;
    gotFirstEvent = false;
    return streaming;
  }

  /**
   * Ensure an AgentTracker exists for this session.
   * When an agent completes, it pushes a follow-up message to Claude
   * so it can process the results.
   */
  function ensureTracker(): AgentTracker {
    if (state.agentTracker) return state.agentTracker;

    const tracker = new AgentTracker(api, chatId, (completedAgents) => {
      // ALL agents done -- single push to Claude
      if (state.sdkSession && !state.processingTurn) {
        const agentList = completedAgents
          .map((a) => `- "${a.description}" (${a.agentId})`)
          .join("\n");
        const followUp =
          `All ${completedAgents.length} background agents have completed:\n${agentList}\n` +
          `Please use the TaskOutput tool to retrieve their results and synthesize a response.`;

        const header = buildContextHeader(
          state.project?.name ?? "?",
          state.session?.summary ?? sessionSummary,
          state.model
        );
        const streaming = createStreamingController(api, chatId, header);
        state.currentStreaming = streaming;
        state.processingTurn = true;

        state.sdkSession.pushMessage(followUp);
        streaming.setStatus("Processando resultados dos agents...").catch(() => {});
      }
    });

    state.agentTracker = tracker;
    return tracker;
  }

  for await (const msg of messages) {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          if (msg.session_id && !state.session) {
            state.session = { id: msg.session_id, summary: sessionSummary };
          }
        } else if (msg.subtype === "task_notification") {
          // SDK task_notification (may or may not arrive -- CLI bug)
          const taskMsg = msg as SDKTaskNotificationMessage;
          const streaming = state.currentStreaming;
          if (streaming) {
            streaming.onAgentComplete(taskMsg.summary, taskMsg.task_id);
          } else {
            const shortId = taskMsg.task_id.slice(0, 7);
            const text = `<i>Agent concluido [${shortId}]: ${escapeHtml(taskMsg.summary)}</i>`;
            await api
              .sendMessage(chatId, text, {
                parse_mode: "HTML",
                link_preview_options: { is_disabled: true },
              })
              .catch((err) => console.error("Failed to send agent notification:", err));
          }
        }
        break;
      }

      case "stream_event": {
        const streaming = ensureStreaming();
        if (!gotFirstEvent) {
          gotFirstEvent = true;
          await streaming.setStatus("Aguardando resposta...");
        }
        handleStreamEvent(msg as SDKPartialAssistantMessage, streaming);
        break;
      }

      case "assistant": {
        const assistantMsg = msg as SDKAssistantMessage;
        if (assistantMsg.session_id && !state.session) {
          state.session = { id: assistantMsg.session_id, summary: sessionSummary };
        }
        const streaming = ensureStreaming();
        for (const part of assistantMsg.message.content) {
          if (part.type === "tool_use") {
            const input = part.input as Record<string, unknown>;
            streaming.onToolUse(part.name, input);

            // Detect background agent launches
            if (input.run_in_background === true) {
              const desc = typeof input.description === "string"
                ? input.description
                : "background agent";
              pendingBackgroundTools.set(part.id, desc);
            }
          }
        }
        break;
      }

      case "user": {
        state.currentStreaming?.onToolResult();

        // Check tool_result blocks for background agent launch confirmations
        const userMsg = msg as SDKUserMessage;
        if (pendingBackgroundTools.size > 0 && userMsg.message?.content) {
          for (const block of userMsg.message.content) {
            if (block.type !== "tool_result") continue;

            const toolUseId = "tool_use_id" in block ? (block as Record<string, unknown>).tool_use_id as string : "";
            const desc = pendingBackgroundTools.get(toolUseId);
            if (!desc) continue;

            pendingBackgroundTools.delete(toolUseId);

            // Extract text from tool_result content
            const content = block.content;
            let resultText = "";
            if (typeof content === "string") {
              resultText = content;
            } else if (Array.isArray(content)) {
              for (const c of content) {
                if (typeof c === "object" && c && "text" in c) {
                  resultText += (c as { text: string }).text;
                }
              }
            }

            const parsed = parseAgentLaunchResult(resultText);
            if (parsed) {
              ensureTracker().track(parsed.agentId, parsed.outputFile, desc);
            }
          }
        }
        break;
      }

      case "result": {
        const result = msg as SDKResultMessage;
        const cost = result.total_cost_usd;
        const duration = result.duration_ms;
        const resultText = result.subtype === "success" ? result.result : undefined;

        await state.currentStreaming?.finalize(cost, duration, resultText);

        // Turn is done -- free the bot for new commands
        state.processingTurn = false;
        state.currentStreaming = null;
        gotFirstEvent = false;
        break;
      }
    }
  }

  // Generator ended (process exited) -- full cleanup
  state.sdkSession = null;
  state.processingTurn = false;
  state.currentStreaming = null;
  if (state.agentTracker) {
    state.agentTracker.stop();
    state.agentTracker = null;
  }
}

/**
 * Handle stream_event messages (partial deltas for live streaming).
 */
function handleStreamEvent(
  msg: SDKPartialAssistantMessage,
  streaming: ReturnType<typeof createStreamingController>
): void {
  const event = msg.event;

  if (event.type === "content_block_delta") {
    const delta = event.delta;
    if (delta.type === "text_delta" && "text" in delta) {
      streaming.onTextDelta(delta.text);
    }
  }
}

/**
 * Creates a canUseTool callback that shows Telegram inline buttons
 * and waits for the user to approve/deny.
 */
function createPermissionHandler(api: Api, chatId: number) {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; toolUseID: string }
  ): Promise<PermissionResult> => {
    const state = getState(chatId);
    const description = formatToolDescription(toolName, input);

    return new Promise<PermissionResult>((resolve) => {
      const denial: PermissionDenial = {
        toolName,
        toolInput: input,
        description,
        resolve: (result) => {
          if (result.behavior === "allow") {
            resolve({ behavior: "allow" });
          } else {
            resolve({ behavior: "deny", message: result.message });
          }
        },
      };

      if (!state.pendingPermissions) {
        state.pendingPermissions = [];
      }
      state.pendingPermissions.push(denial);

      const denials = state.pendingPermissions;
      api.sendMessage(
        chatId,
        formatPermissionsMessage(denials),
        {
          parse_mode: "HTML",
          reply_markup: buildPermissionsKeyboard(denials),
        }
      ).catch((err) => {
        console.error("Failed to send permission prompt:", err);
        resolve({ behavior: "deny", message: "Failed to send permission prompt" });
      });

      options.signal.addEventListener("abort", () => {
        resolve({ behavior: "deny", message: "Operation cancelled" });
      });
    });
  };
}
