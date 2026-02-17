import { readdir, access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Project } from "../types/state";
import { env } from "../env";

function assertWithinProjectsDir(fullPath: string): void {
  const resolved = resolve(fullPath);
  const allowed = resolve(env.PROJECTS_DIR);
  if (!resolved.startsWith(allowed + "/") && resolved !== allowed) {
    throw new Error("Path outside PROJECTS_DIR");
  }
}

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "deno.json",
  "bun.lock",
];

const IGNORED = new Set(["node_modules", ".git", "dist", "build", ".next"]);

export interface DirEntry {
  name: string;
  path: string;
  isProject: boolean;
}

async function checkIsProject(dirPath: string): Promise<boolean> {
  for (const marker of PROJECT_MARKERS) {
    try {
      await access(join(dirPath, marker));
      return true;
    } catch {
      // marker not found
    }
  }
  return false;
}

/**
 * List entries at a specific path inside PROJECTS_DIR.
 * Returns folders and projects at that level.
 * relativePath is relative to PROJECTS_DIR (empty string = root).
 */
export async function listEntries(relativePath: string = ""): Promise<DirEntry[]> {
  const fullPath = relativePath
    ? join(env.PROJECTS_DIR, relativePath)
    : env.PROJECTS_DIR;

  assertWithinProjectsDir(fullPath);

  let entries;
  try {
    entries = await readdir(fullPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: DirEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (IGNORED.has(entry.name)) continue;

    const entryPath = join(fullPath, entry.name);
    const relPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    results.push({
      name: entry.name,
      path: relPath,
      isProject: await checkIsProject(entryPath),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a relative path to a full Project.
 */
export function resolveProject(relativePath: string): Project {
  const fullPath = join(env.PROJECTS_DIR, relativePath);
  assertWithinProjectsDir(fullPath);
  return { name: relativePath, path: fullPath };
}

const INVALID_NAME_CHARS = /[<>:"|?*\\]/;

/**
 * Validate a project name. Returns an error message or null if valid.
 */
export function validateProjectName(name: string): string | null {
  const trimmed = name.trim();

  if (!trimmed) return "Nome nao pode ser vazio.";
  if (trimmed.includes("/")) return "Nome nao pode conter '/'.";
  if (trimmed.includes("..")) return "Nome nao pode conter '..'.";
  if (trimmed.startsWith(".")) return "Nome nao pode comecar com '.'.";
  if (INVALID_NAME_CHARS.test(trimmed)) return "Nome contem caracteres invalidos.";
  if (IGNORED.has(trimmed)) return `'${trimmed}' e um nome reservado.`;

  return null;
}

/**
 * Create a new project directory with git init.
 */
export async function createProject(browsePath: string, name: string): Promise<Project> {
  const relativePath = browsePath ? `${browsePath}/${name}` : name;
  const fullPath = join(env.PROJECTS_DIR, relativePath);
  assertWithinProjectsDir(fullPath);

  // Check if already exists
  try {
    await access(fullPath);
    throw new Error(`Diretorio '${name}' ja existe.`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("ja existe")) throw err;
    // access threw = does not exist, good
  }

  await mkdir(fullPath, { recursive: true });

  const proc = Bun.spawn(["git", "init"], { cwd: fullPath, stdout: "ignore", stderr: "ignore" });
  await proc.exited;

  return resolveProject(relativePath);
}
