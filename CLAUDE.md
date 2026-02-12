# ClawBack

Bot Telegram para controle remoto do Claude Code.

## Stack
- Runtime: Bun
- Bot: grammY (long polling)
- Validacao: zod
- CLI: claude via Bun.spawn()

## Convencoes
- TypeScript strict, functional style
- Early return pattern
- Nomes descritivos em ingles
- Conventional commits em ingles

## Estrutura
- src/bot/ -- grammY bot, handlers, keyboards, middleware
- src/claude/ -- spawn do CLI, parser de eventos, sessoes
- src/telegram/ -- sender, format, streaming
- src/types/ -- tipos compartilhados

## Comandos uteis
- `bun run dev` -- inicia com watch
- `bun run check` -- type check
