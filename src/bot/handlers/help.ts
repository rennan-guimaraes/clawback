import type { Context } from "grammy";

export async function helpHandler(ctx: Context): Promise<void> {
  const text = [
    "<b>Comandos</b>\n",
    "/projects -- Selecionar projeto",
    "/sessions -- Ver sessoes do projeto",
    "/current -- Contexto ativo",
    "/exit -- Sair da sessao",
    "/cancel -- Abortar processo",
    "/teleport -- Comando pra continuar no terminal",
    "/model &lt;s|o|h&gt; -- Trocar modelo",
    "/mode &lt;plan|default&gt; -- Trocar modo",
    "\n<b>Skills</b>\n",
    "/commit [desc] -- Commits semanticos",
    "/verify -- Type check + lint + build",
    "/validate -- Validar plano",
    "/review -- Buscar pontas soltas",
    "/checkpoint [desc] -- Salvar snapshot",
    "\n<b>Uso</b>\n",
    "Texto livre envia pro Claude na sessao ativa.",
    "Permissoes aparecem como botoes inline.",
  ].join("\n");

  await ctx.reply(text, { parse_mode: "HTML" });
}
