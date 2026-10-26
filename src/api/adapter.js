// ADAPTADOR DO BACKEND
// ---------------------------------------------------------------------------
// Este é o único arquivo que precisa mudar para conectar o serviço de OCR existente.
// Ele define as rotas e converte as respostas do backend no formato interno usado pela interface.
// O contrato abaixo é uma PROPOSTA (ver INTEGRACAO.md); ajuste-o ao contrato real do serviço.
// ---------------------------------------------------------------------------

import { ApiError, errorFromBackendCode } from "./errors.js";

/** Rotas relativas à apiBaseUrl. */
export const routes = {
  createJob: () => "/v1/jobs",
  jobStatus: (id) => `/v1/jobs/${encodeURIComponent(id)}`,
  cancelJob: (id) => `/v1/jobs/${encodeURIComponent(id)}`,
};

/** Nome do campo multipart que leva o arquivo. */
export const FILE_FIELD = "file";

/** Campos extras enviados junto com o arquivo. */
export function buildFormFields() {
  return {
    language: "por",
  };
}

/**
 * Formato interno (o que a interface consome):
 *
 * JobStatus = {
 *   id: string,
 *   status: "queued" | "processing" | "done" | "failed",
 *   progress: number | null,   // 0..1, somente se o backend informar
 *   stage: string | null,      // ex.: "ocr", "compress"
 *   result: JobResult | null,
 *   error: ApiError | null,
 * }
 *
 * JobResult = {
 *   originalBytes: number | null,
 *   outputBytes: number | null,
 *   pages: number | null,
 *   ocr: "applied" | "not_needed" | "not_applied" | "unknown",
 *   download: { kind: "url", url: string } | { kind: "blob", blob: Blob },
 *   expiresAt: string | null,  // ISO 8601
 * }
 */

const STATUS_MAP = {
  queued: "queued",
  pending: "queued",
  waiting: "queued",
  processing: "processing",
  running: "processing",
  in_progress: "processing",
  done: "done",
  completed: "done",
  succeeded: "done",
  success: "done",
  failed: "failed",
  error: "failed",
};

function num(value) {
  // Number(null) e Number("") valem 0; ausência de dado não pode virar zero.
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeProgress(value) {
  const n = num(value);
  if (n == null) return null;
  // Aceita 0..1 ou 0..100.
  return Math.min(1, n > 1 ? n / 100 : n);
}

function normalizeOcr(ocr) {
  if (ocr === true) return "applied";
  if (ocr === false) return "not_applied";
  if (ocr && typeof ocr === "object") {
    // O motor pula páginas que já têm texto; se todas tinham, o OCR não era necessário.
    if (ocr.alreadySearchable === true) return "not_needed";
    if (ocr.applied === true) return "applied";
    if (ocr.applied === false) return "not_applied";
  }
  return "unknown";
}

/** Converte o objeto "result" do backend. baseUrl resolve URLs relativas de download. */
function parseResult(raw, baseUrl) {
  if (!raw || typeof raw !== "object") throw new ApiError("BAD_RESPONSE");
  const href = raw.downloadUrl ?? raw.download_url ?? raw.url;
  if (typeof href !== "string" || href === "") throw new ApiError("BAD_RESPONSE");

  let url;
  try {
    url = new URL(href, baseUrl + "/").href;
  } catch {
    throw new ApiError("BAD_RESPONSE");
  }

  return {
    originalBytes: num(raw.originalBytes ?? raw.original_bytes ?? raw.inputSize),
    outputBytes: num(raw.outputBytes ?? raw.output_bytes ?? raw.outputSize),
    pages: num(raw.pages ?? raw.pageCount ?? raw.page_count),
    ocr: normalizeOcr(raw.ocr),
    download: { kind: "url", url },
    expiresAt: typeof (raw.expiresAt ?? raw.expires_at) === "string" ? raw.expiresAt ?? raw.expires_at : null,
  };
}

/** Converte a resposta de criação ou consulta de job. */
export function parseJob(json, baseUrl) {
  if (!json || typeof json !== "object") throw new ApiError("BAD_RESPONSE");

  const id = json.id ?? json.jobId ?? json.job_id;
  const status = STATUS_MAP[String(json.status ?? "").toLowerCase()];
  if ((typeof id !== "string" && typeof id !== "number") || !status) throw new ApiError("BAD_RESPONSE");

  const job = {
    id: String(id),
    status,
    progress: normalizeProgress(json.progress),
    stage: typeof json.stage === "string" ? json.stage : null,
    result: null,
    error: null,
  };

  if (status === "done") job.result = parseResult(json.result, baseUrl);
  if (status === "failed") job.error = errorFromBackendCode(json.error?.code);
  return job;
}

/**
 * Modo síncrono: o backend devolve o PDF diretamente na resposta do POST.
 * Metadados opcionais vêm em cabeçalhos (expostos via Access-Control-Expose-Headers se for outra origem).
 */
export function parseSyncPdf(blob, getHeader, originalFile) {
  const ocrHeader = (getHeader("X-OCR-Applied") || "").toLowerCase();
  return {
    id: null,
    status: "done",
    progress: 1,
    stage: null,
    error: null,
    result: {
      originalBytes: num(getHeader("X-Original-Bytes")) ?? originalFile.size,
      outputBytes: blob.size,
      pages: num(getHeader("X-Page-Count")),
      ocr: ocrHeader === "true" ? "applied" : ocrHeader === "false" ? "not_applied" : "unknown",
      download: { kind: "blob", blob },
      expiresAt: null,
    },
  };
}

/** Rótulos legíveis para etapas informadas pelo backend. */
export const STAGE_LABELS = {
  queued: "Na fila",
  upload: "Recebendo arquivo",
  analyze: "Analisando páginas",
  preprocess: "Ajustando imagens",
  ocr: "Reconhecendo texto (OCR)",
  compress: "Reduzindo tamanho",
  finalize: "Finalizando documento",
};
