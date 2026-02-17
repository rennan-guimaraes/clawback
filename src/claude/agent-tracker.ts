import type { Api } from "grammy";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { escapeHtml } from "../telegram/format";

const ALLOWED_OUTPUT_PREFIXES = [
  resolve(homedir(), ".claude"),
  resolve(tmpdir()),
];

const POLL_INTERVAL_MS = 5_000;
const STABLE_THRESHOLD_MS = 10_000;

export interface TrackedAgent {
  agentId: string;
  outputFile: string;
  description: string;
  launchedAt: number;
  completed: boolean;
  lastSize: number;
  lastSizeChangedAt: number;
}

/**
 * Monitors background agent output files and notifies when they complete.
 *
 * Detection heuristic: if the output file hasn't grown for STABLE_THRESHOLD_MS
 * seconds, the agent is considered complete. This works because agents
 * continuously write to their jsonl while running and stop when done.
 */
export class AgentTracker {
  private agents = new Map<string, TrackedAgent>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private api: Api;
  private chatId: number;
  private onAllComplete: (agents: TrackedAgent[]) => void;

  constructor(
    api: Api,
    chatId: number,
    onAllComplete: (agents: TrackedAgent[]) => void
  ) {
    this.api = api;
    this.chatId = chatId;
    this.onAllComplete = onAllComplete;
  }

  track(agentId: string, outputFile: string, description: string): void {
    if (this.agents.has(agentId)) return;

    const resolved = resolve(outputFile);
    const isSafe = ALLOWED_OUTPUT_PREFIXES.some(
      (prefix) => resolved.startsWith(prefix + sep) || resolved === prefix
    );
    if (!isSafe) {
      console.warn(
        `[AgentTracker] Rejected output file outside allowed dirs: ${resolved}`
      );
      return;
    }

    this.agents.set(agentId, {
      agentId,
      outputFile,
      description,
      launchedAt: Date.now(),
      completed: false,
      lastSize: 0,
      lastSizeChangedAt: Date.now(),
    });

    console.log(`[AgentTracker] Tracking agent ${agentId}: ${description}`);

    if (!this.pollTimer) {
      this.startPolling();
    }
  }

  get pendingCount(): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (!agent.completed) count++;
    }
    return count;
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.agents.clear();
  }

  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) =>
        console.error("[AgentTracker] Poll error:", err)
      );
    }, POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (agent.completed) continue;

      try {
        const fileStat = await stat(agent.outputFile);
        const fileSize = fileStat.size;

        if (fileSize !== agent.lastSize) {
          agent.lastSize = fileSize;
          agent.lastSizeChangedAt = now;
          continue;
        }

        // File hasn't grown and it has content -- agent might be done
        if (
          fileSize > 0 &&
          now - agent.lastSizeChangedAt > STABLE_THRESHOLD_MS
        ) {
          agent.completed = true;
          console.log(
            `[AgentTracker] Agent ${agent.agentId} completed (file stable for ${STABLE_THRESHOLD_MS}ms)`
          );
          await this.notifyCompletion(agent);

          // Check if ALL agents are now done
          if (this.pendingCount === 0) {
            this.onAllComplete([...this.agents.values()]);
            clearInterval(this.pollTimer!);
            this.pollTimer = null;
          }
        }
      } catch {
        // File doesn't exist yet or other error -- keep waiting
      }
    }
  }

  private async notifyCompletion(agent: TrackedAgent): Promise<void> {
    const elapsed = ((Date.now() - agent.launchedAt) / 1000).toFixed(0);
    const shortId = agent.agentId.slice(0, 7);
    const text = `<i>Agent concluido [${shortId}] (${elapsed}s): ${escapeHtml(agent.description)}</i>`;

    await this.api
      .sendMessage(this.chatId, text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      })
      .catch((err) =>
        console.error("[AgentTracker] Failed to send notification:", err)
      );
  }
}

/**
 * Parse an SDK tool_result text to extract agentId and outputFile.
 *
 * The text looks like:
 *   "Async agent launched successfully.\nagentId: a1eb093 (...)\n...output_file: /path/to/file"
 */
export function parseAgentLaunchResult(text: string): {
  agentId: string;
  outputFile: string;
} | null {
  const agentIdMatch = text.match(/agentId:\s*(\w+)/);
  const outputFileMatch = text.match(/output_file:\s*(\S+)/);

  if (!agentIdMatch || !outputFileMatch) return null;

  return {
    agentId: agentIdMatch[1],
    outputFile: outputFileMatch[1],
  };
}
