import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type {
  Query,
  SDKUserMessage,
  CanUseTool,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ModelShort, PermissionMode, SDKSessionHandle } from "../types/state";
import { MODEL_MAP } from "../types/state";

/**
 * Creates an AsyncIterable + push function for feeding messages to the SDK.
 * Each call to `push()` resolves the current pending read in `for await`.
 */
function createMessageChannel() {
  const queue: SDKUserMessage[] = [];
  let resolve: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  let done = false;

  const iterable: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<SDKUserMessage>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
          }
          return new Promise((r) => {
            resolve = r;
          });
        },
        return(): Promise<IteratorResult<SDKUserMessage>> {
          done = true;
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        },
      };
    },
  };

  function push(msg: SDKUserMessage): void {
    if (done) return;
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({ value: msg, done: false });
    } else {
      queue.push(msg);
    }
  }

  function end(): void {
    done = true;
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  return { iterable, push, end };
}

export interface CreateSessionOptions {
  cwd: string;
  model: ModelShort;
  permissionMode: PermissionMode;
  sessionId?: string;
  canUseTool: CanUseTool;
  initialPrompt: string;
}

/**
 * Creates a persistent SDK session.
 *
 * The process stays alive between messages -- background agents complete naturally,
 * exactly like the terminal. Multi-turn via AsyncIterable<SDKUserMessage>.
 */
export function createSDKSession(options: CreateSessionOptions): {
  handle: SDKSessionHandle;
  messages: AsyncGenerator<SDKMessage, void>;
} {
  const { cwd, model, permissionMode, sessionId, canUseTool, initialPrompt } = options;

  const channel = createMessageChannel();
  let sessionIdResolved = sessionId ?? "";

  // Push the initial prompt as the first message
  channel.push({
    type: "user",
    message: { role: "user", content: initialPrompt },
    parent_tool_use_id: null,
    session_id: sessionIdResolved,
  });

  const q: Query = sdkQuery({
    prompt: channel.iterable,
    options: {
      cwd,
      model: MODEL_MAP[model],
      permissionMode,
      resume: sessionId,
      canUseTool,
      includePartialMessages: true,
      settingSources: ["user", "project", "local"],
    },
  });

  const handle: SDKSessionHandle = {
    query: q,
    pushMessage(text: string) {
      channel.push({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
        session_id: sessionIdResolved,
      });
    },
    endInput() {
      channel.end();
    },
    startedAt: Date.now(),
  };

  // Wrap the query's async generator to capture session_id from messages
  async function* messageLoop(): AsyncGenerator<SDKMessage, void> {
    for await (const msg of q) {
      // Capture session_id from first message that has it
      if (!sessionIdResolved && "session_id" in msg && msg.session_id) {
        sessionIdResolved = msg.session_id;
      }
      yield msg;
    }
  }

  return { handle, messages: messageLoop() };
}

/**
 * Format a tool description for display in Telegram permission prompts.
 */
export function formatToolDescription(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Bash": {
      const cmd = typeof input.command === "string" ? input.command : "...";
      return `${name}: ${cmd.slice(0, 100)}`;
    }
    case "Read":
    case "Write":
    case "Edit": {
      const path = typeof input.file_path === "string" ? input.file_path : "...";
      return `${name}: ${path}`;
    }
    case "Glob":
    case "Grep": {
      const pattern = typeof input.pattern === "string" ? input.pattern : "...";
      return `${name}: ${pattern}`;
    }
    default: {
      const firstVal = Object.values(input).find((v) => typeof v === "string");
      return `${name}: ${typeof firstVal === "string" ? firstVal.slice(0, 60) : "..."}`;
    }
  }
}
