// Logger mínimo. Só escreve no console com debug ativo e nunca recebe nomes de arquivo ou conteúdo.
import { config } from "../config.js";

function write(level, event, data) {
  if (!config.debug) return;
  // eslint-disable-next-line no-console
  console[level](`[app] ${event}`, data ?? "");
}

export const logger = {
  debug: (event, data) => write("debug", event, data),
  warn: (event, data) => write("warn", event, data),
  error: (event, data) => write("error", event, data),
};
