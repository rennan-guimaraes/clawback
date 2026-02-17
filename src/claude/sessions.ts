import { readFile, readdir, stat as fsStat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { SessionEntry } from "../types/state";

function getClaudeProjectDir(projectPath: string): string {
  // Claude encodes path by replacing separators with dashes:
  //   /Users/foo/code/myproject -> -Users-foo-code-myproject
  //   C:\Users\foo\code\myproject -> C-Users-foo-code-myproject
  const encoded = projectPath.replace(/[\\/]/g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

interface SessionIndexEntry {
  sessionId: string;
  summary?: string;
  firstPrompt?: string;
  messageCount?: number;
  created?: string;
  modified?: string;
  gitBranch?: string;
}

export async function listSessions(projectPath: string): Promise<SessionEntry[]> {
  const claudeDir = getClaudeProjectDir(projectPath);

  // Try sessions-index.json first
  try {
    const indexPath = join(claudeDir, "sessions-index.json");
    const raw = await readFile(indexPath, "utf-8");
    const index = JSON.parse(raw) as SessionIndexEntry[];

    return index.map((entry) => ({
      id: entry.sessionId,
      summary: entry.summary ?? entry.firstPrompt?.slice(0, 60) ?? "Sem titulo",
      firstPrompt: entry.firstPrompt,
      messageCount: entry.messageCount ?? 0,
      created: entry.created ?? "",
      modified: entry.modified ?? "",
      gitBranch: entry.gitBranch,
    })).sort((a, b) => {
      // Most recently modified first
      if (a.modified && b.modified) {
        return b.modified.localeCompare(a.modified);
      }
      return 0;
    });
  } catch {
    // Fallback: scan .jsonl files
    return listSessionsFromFiles(claudeDir);
  }
}

async function listSessionsFromFiles(claudeDir: string): Promise<SessionEntry[]> {
  try {
    const entries = await readdir(claudeDir);
    const sessions: SessionEntry[] = [];

    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;

      const sessionId = basename(file, ".jsonl");
      const filePath = join(claudeDir, file);

      try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const firstLine = lines[0];
        let firstPrompt = "Sem titulo";

        if (firstLine) {
          try {
            const parsed = JSON.parse(firstLine);
            if (parsed.type === "user" && parsed.message?.content?.[0]?.text) {
              firstPrompt = parsed.message.content[0].text.slice(0, 60);
            }
          } catch {
            // ignore
          }
        }

        const fileStat = await fsStat(filePath);

        sessions.push({
          id: sessionId,
          summary: firstPrompt,
          messageCount: lines.length,
          created: fileStat.birthtime.toISOString(),
          modified: fileStat.mtime.toISOString(),
        });
      } catch {
        // Skip unreadable files
      }
    }

    return sessions.sort((a, b) => b.modified.localeCompare(a.modified));
  } catch {
    return [];
  }
}

export function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return "";

  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;
  return `${diffDay}d`;
}
