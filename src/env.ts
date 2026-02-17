import { z } from "zod/v4";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_USER_ID: z.coerce.number().int().positive(),
  PROJECTS_DIR: z.string().default("~/Desktop/code"),
});

export type Env = z.infer<typeof envSchema>;

function resolveHome(path: string): string {
  if (path.startsWith("~/") || path === "~") {
    const { homedir } = require("node:os") as typeof import("node:os");
    return path.replace("~", homedir());
  }
  return path;
}

function loadEnv(): Env {
  const parsed = envSchema.parse(Bun.env);
  return {
    ...parsed,
    PROJECTS_DIR: resolveHome(parsed.PROJECTS_DIR),
  };
}

export const env = loadEnv();
