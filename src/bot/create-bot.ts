import { Bot } from "grammy";
import { env } from "../env";
import { authMiddleware } from "./middleware/auth";
import { activeGuard } from "./middleware/active-guard";
import { startHandler } from "./handlers/start";
import { helpHandler } from "./handlers/help";
import { projectsHandler } from "./handlers/projects";
import { sessionsHandler } from "./handlers/sessions";
import { exitHandler } from "./handlers/exit";
import { currentHandler } from "./handlers/current";
import { callbackHandler } from "./handlers/callback";
import { messageHandler } from "./handlers/message";
import { registerSkills } from "./handlers/skill";
import { modelHandler } from "./handlers/model";
import { modeHandler } from "./handlers/mode";
import { cancelHandler } from "./handlers/cancel";
import { teleportHandler } from "./handlers/teleport";

export async function createBot(): Promise<Bot> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // Middleware chain
  bot.use(authMiddleware);
  bot.use(activeGuard);

  // Commands
  bot.command("start", startHandler);
  bot.command("help", helpHandler);
  bot.command("projects", projectsHandler);
  bot.command("sessions", sessionsHandler);
  bot.command("exit", exitHandler);
  bot.command("current", currentHandler);
  bot.command("model", modelHandler);
  bot.command("mode", modeHandler);
  bot.command("cancel", cancelHandler);
  bot.command("teleport", teleportHandler);

  // Auto-discover and register skills from ~/.claude/skills/
  await registerSkills(bot);

  // Inline keyboard callbacks
  bot.on("callback_query:data", callbackHandler);

  // Free text messages -> Claude (must be LAST)
  bot.on("message:text", messageHandler);

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
