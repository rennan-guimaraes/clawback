import type { Query } from "@anthropic-ai/claude-agent-sdk";
import type { StreamingController } from "../telegram/streaming";
import type { AgentTracker } from "../claude/agent-tracker";

export interface Project {
  name: string;
  path: string;
}

export interface SessionEntry {
  id: string;
  summary: string;
  firstPrompt?: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
}

export type ModelId = "claude-sonnet-4-5-20250929" | "claude-opus-4-6" | "claude-haiku-4-5-20251001";
export type ModelShort = "sonnet" | "opus" | "haiku";

export const MODEL_MAP: Record<ModelShort, ModelId> = {
  sonnet: "claude-sonnet-4-5-20250929",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export type PermissionMode = "default" | "plan";

export interface PermissionDenial {
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  /** Resolver to allow or deny this specific tool use */
  resolve?: (result: { behavior: "allow" } | { behavior: "deny"; message: string }) => void;
}

/**
 * Active SDK session -- a persistent Claude process with multi-turn support.
 * The Query stays alive between messages, so background agents complete naturally.
 */
export interface SDKSessionHandle {
  query: Query;
  /** Push a new user message into the session */
  pushMessage: (text: string) => void;
  /** Signal that no more messages will be sent (closes the input stream) */
  endInput: () => void;
  startedAt: number;
}

export interface ChatState {
  project: Project | null;
  session: { id: string; summary: string } | null;
  model: ModelShort;
  permissionMode: PermissionMode;
  /** Persistent SDK session (lives across turns) */
  sdkSession: SDKSessionHandle | null;
  /** True while Claude is actively processing a turn (between message push and result) */
  processingTurn: boolean;
  /** Current streaming controller for the active turn */
  currentStreaming: StreamingController | null;
  pendingPermissions: PermissionDenial[] | null;
  /** Tracks background agents launched during the session */
  agentTracker: AgentTracker | null;
}

export function createDefaultState(): ChatState {
  return {
    project: null,
    session: null,
    model: "sonnet",
    permissionMode: "default",
    sdkSession: null,
    processingTurn: false,
    currentStreaming: null,
    pendingPermissions: null,
    agentTracker: null,
  };
}
