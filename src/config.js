// Lê e normaliza a configuração de execução (window.__APP_CONFIG__, definida em /config.js).

const DEFAULTS = {
  apiBaseUrl: "",
  withCredentials: false,
  maxFileSizeMB: 50,
  maxFiles: 10,
  pollIntervalMs: 1500,
  processingTimeoutMs: 10 * 60 * 1000,
  privacy: { retentionHours: null, supportEmail: null },
  debug: false,
};

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readConfig() {
  const raw = (typeof window !== "undefined" && window.__APP_CONFIG__) || {};
  const privacy = { ...DEFAULTS.privacy, ...(raw.privacy || {}) };

  return Object.freeze({
    apiBaseUrl: typeof raw.apiBaseUrl === "string" ? raw.apiBaseUrl.trim().replace(/\/+$/, "") : "",
    withCredentials: Boolean(raw.withCredentials),
    maxFileSizeMB: positiveNumber(raw.maxFileSizeMB, DEFAULTS.maxFileSizeMB),
    maxFiles: Math.floor(positiveNumber(raw.maxFiles, DEFAULTS.maxFiles)),
    pollIntervalMs: positiveNumber(raw.pollIntervalMs, DEFAULTS.pollIntervalMs),
    processingTimeoutMs: positiveNumber(raw.processingTimeoutMs, DEFAULTS.processingTimeoutMs),
    privacy: Object.freeze({
      retentionHours: privacy.retentionHours == null ? null : positiveNumber(privacy.retentionHours, null),
      supportEmail:
        typeof privacy.supportEmail === "string" && privacy.supportEmail.includes("@")
          ? privacy.supportEmail.trim()
          : null,
    }),
    debug: Boolean(raw.debug),
  });
}

export const config = readConfig();

/** A ferramenta só envia arquivos quando há um serviço configurado. */
export function isServiceConfigured() {
  return config.apiBaseUrl !== "";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Documentos jurídicos só trafegam por HTTPS. HTTP é aceito apenas em ambiente local de desenvolvimento.
 * Retorna a URL base resolvida ou null quando a conexão seria insegura.
 */
export function resolveSecureBaseUrl() {
  if (!isServiceConfigured()) return null;
  let url;
  try {
    url = new URL(config.apiBaseUrl, window.location.href);
  } catch {
    return null;
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol === "https:" || (url.protocol === "http:" && isLocal)) {
    return url.href.replace(/\/+$/, "");
  }
  return null;
}
