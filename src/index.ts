import { createBot } from "./bot/create-bot";

async function main() {
  const bot = await createBot();

  function shutdown() {
    console.log("Shutting down...");
    bot.stop();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("ClawBack starting...");

  bot.start({
    onStart: () => {
      console.log("ClawBack online.");
    },
  });
}

main();
