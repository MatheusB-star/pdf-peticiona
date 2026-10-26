// Erros normalizados da integração. As mensagens são sempre definidas aqui:
// nunca exibimos texto bruto do servidor (pode conter detalhes técnicos ou dados sensíveis).

export const ErrorCode = Object.freeze({
  NOT_CONFIGURED: "NOT_CONFIGURED",
  INSECURE_CONNECTION: "INSECURE_CONNECTION",
  NETWORK: "NETWORK",
  TIMEOUT: "TIMEOUT",
  ABORTED: "ABORTED",
  TOO_LARGE: "TOO_LARGE",
  TOO_MANY_PAGES: "TOO_MANY_PAGES",
  UNSUPPORTED: "UNSUPPORTED",
  INVALID_FILE: "INVALID_FILE",
  RATE_LIMITED: "RATE_LIMITED",
  UNAUTHORIZED: "UNAUTHORIZED",
  SERVER: "SERVER",
  BAD_RESPONSE: "BAD_RESPONSE",
  PROCESSING_FAILED: "PROCESSING_FAILED",
});

const MESSAGES = {
  NOT_CONFIGURED: "O serviço de processamento ainda não está configurado neste ambiente.",
  INSECURE_CONNECTION: "Envio bloqueado: a conexão com o serviço não é segura (HTTPS).",
  NETWORK: "Não foi possível conectar ao serviço. Verifique sua internet e tente novamente.",
  TIMEOUT: "O processamento demorou mais que o esperado. Tente novamente em instantes.",
  ABORTED: "Envio cancelado.",
  TOO_LARGE: "O arquivo excede o tamanho máximo aceito pelo serviço.",
  TOO_MANY_PAGES: "O documento tem mais páginas do que o limite por envio. Divida o arquivo e tente novamente.",
  UNSUPPORTED: "Formato não aceito. Envie PDF, JPG, PNG ou TIFF.",
  INVALID_FILE: "Não foi possível ler este arquivo. Ele pode estar corrompido ou protegido por senha.",
  RATE_LIMITED: "Muitas solicitações em pouco tempo. Aguarde um momento e tente novamente.",
  UNAUTHORIZED: "Sua sessão não permite esta operação. Entre novamente e tente de novo.",
  SERVER: "O serviço encontrou um problema ao processar. Tente novamente em instantes.",
  BAD_RESPONSE: "O serviço respondeu de forma inesperada. Tente novamente.",
  PROCESSING_FAILED: "Não foi possível concluir o processamento deste documento.",
};

const RETRYABLE = new Set(["NETWORK", "TIMEOUT", "RATE_LIMITED", "SERVER", "BAD_RESPONSE", "PROCESSING_FAILED"]);

export class ApiError extends Error {
  /**
   * @param {keyof typeof ErrorCode} code
   * @param {{ status?: number }} [details]
   */
  constructor(code, details = {}) {
    super(MESSAGES[code] || MESSAGES.BAD_RESPONSE);
    this.name = "ApiError";
    this.code = ErrorCode[code] ? code : ErrorCode.BAD_RESPONSE;
    this.status = details.status ?? null;
    this.retryable = RETRYABLE.has(this.code);
  }
}

/** Converte um status HTTP em erro normalizado. */
export function errorFromStatus(status) {
  if (status === 401 || status === 403) return new ApiError("UNAUTHORIZED", { status });
  if (status === 413) return new ApiError("TOO_LARGE", { status });
  if (status === 415) return new ApiError("UNSUPPORTED", { status });
  if (status === 400 || status === 422) return new ApiError("INVALID_FILE", { status });
  if (status === 429) return new ApiError("RATE_LIMITED", { status });
  if (status >= 500) return new ApiError("SERVER", { status });
  return new ApiError("BAD_RESPONSE", { status });
}

/**
 * Códigos de erro que o backend pode devolver em { error: { code } }.
 * Mapeie aqui os códigos reais do serviço de OCR existente.
 */
const BACKEND_CODE_MAP = {
  file_too_large: "TOO_LARGE",
  too_many_pages: "TOO_MANY_PAGES",
  unsupported_format: "UNSUPPORTED",
  invalid_file: "INVALID_FILE",
  encrypted_pdf: "INVALID_FILE",
  rate_limited: "RATE_LIMITED",
  unauthorized: "UNAUTHORIZED",
  processing_failed: "PROCESSING_FAILED",
  timeout: "TIMEOUT",
};

export function errorFromBackendCode(code, status) {
  const mapped = typeof code === "string" ? BACKEND_CODE_MAP[code.toLowerCase()] : null;
  if (mapped) return new ApiError(mapped, { status });
  return status ? errorFromStatus(status) : new ApiError("PROCESSING_FAILED");
}

export function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err && err.name === "AbortError") return new ApiError("ABORTED");
  return new ApiError("NETWORK");
}
