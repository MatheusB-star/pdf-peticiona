// Transporte HTTP: envio com progresso real, consulta de status e cancelamento.
// Não conhece a interface; comunica-se por callbacks e Promises.

import { config, isServiceConfigured, resolveSecureBaseUrl } from "../config.js";
import { getAuthHeaders } from "./auth.js";
import { routes, FILE_FIELD, buildFormFields, parseJob, parseSyncPdf } from "./adapter.js";
import { ApiError, errorFromStatus, errorFromBackendCode, toApiError } from "./errors.js";
import { logger } from "../core/logger.js";

function getBaseUrl() {
  if (!isServiceConfigured()) throw new ApiError("NOT_CONFIGURED");
  const base = resolveSecureBaseUrl();
  if (!base) throw new ApiError("INSECURE_CONNECTION");
  return base;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError("ABORTED"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ApiError("ABORTED"));
      },
      { once: true },
    );
  });
}

async function readErrorBody(blobOrText, status) {
  try {
    const text = typeof blobOrText === "string" ? blobOrText : await blobOrText.text();
    const json = JSON.parse(text);
    if (json?.error?.code) return errorFromBackendCode(json.error.code, status);
  } catch {
    /* corpo não é JSON: usa o status */
  }
  return errorFromStatus(status);
}

/**
 * Envia o arquivo. Usa XMLHttpRequest porque fetch não informa progresso de upload.
 * Resolve com um JobStatus (modo assíncrono ou síncrono).
 */
function upload(base, file, { signal, onUploadProgress }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError("ABORTED"));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", base + routes.createJob());
    xhr.responseType = "blob";
    xhr.withCredentials = config.withCredentials;
    xhr.setRequestHeader("Accept", "application/json, application/pdf");
    for (const [k, v] of Object.entries(getAuthHeaders())) xhr.setRequestHeader(k, v);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) onUploadProgress(e.loaded / e.total);
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError("NETWORK"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new ApiError("ABORTED"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError("TIMEOUT"));
    };

    xhr.onload = async () => {
      cleanup();
      const status = xhr.status;
      const body = xhr.response;
      try {
        if (status < 200 || status >= 300) throw await readErrorBody(body, status);

        const type = (xhr.getResponseHeader("Content-Type") || "").toLowerCase();
        if (type.includes("application/pdf")) {
          resolve(parseSyncPdf(body, (h) => xhr.getResponseHeader(h), file));
          return;
        }
        let json;
        try {
          json = JSON.parse(await body.text());
        } catch {
          throw new ApiError("BAD_RESPONSE", { status });
        }
        resolve(parseJob(json, base));
      } catch (err) {
        reject(toApiError(err));
      }
    };

    const form = new FormData();
    form.append(FILE_FIELD, file, file.name);
    for (const [k, v] of Object.entries(buildFormFields())) form.append(k, v);
    xhr.send(form);
  });
}

async function fetchJob(base, id, signal) {
  let res;
  try {
    res = await fetch(base + routes.jobStatus(id), {
      method: "GET",
      headers: { Accept: "application/json", ...getAuthHeaders() },
      credentials: config.withCredentials ? "include" : "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    throw toApiError(err);
  }
  if (!res.ok) throw await readErrorBody(await res.text().catch(() => ""), res.status);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", { status: res.status });
  }
  return parseJob(json, base);
}

/**
 * Processa um arquivo de ponta a ponta.
 * @param {File} file
 * @param {{
 *   signal?: AbortSignal,
 *   onUploadProgress?: (fraction: number) => void,
 *   onStatus?: (job: object) => void,
 * }} handlers
 * @returns {Promise<object>} JobResult
 */
export async function processDocument(file, { signal, onUploadProgress, onStatus } = {}) {
  const base = getBaseUrl();
  let job = await upload(base, file, { signal, onUploadProgress });
  onStatus?.(job);
  logger.debug("job.created", { status: job.status });

  const deadline = Date.now() + config.processingTimeoutMs;
  let transientFailures = 0;

  while (job.status === "queued" || job.status === "processing") {
    if (Date.now() > deadline) {
      cancelJob(job.id);
      throw new ApiError("TIMEOUT");
    }
    try {
      await sleep(config.pollIntervalMs, signal);
      job = await fetchJob(base, job.id, signal);
      transientFailures = 0;
      onStatus?.(job);
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === "ABORTED") {
        cancelJob(job.id);
        throw apiErr;
      }
      // Falhas momentâneas de rede durante a consulta não perdem o processamento.
      if ((apiErr.code === "NETWORK" || apiErr.code === "SERVER") && transientFailures < 3) {
        transientFailures += 1;
        logger.warn("job.poll.retry", { attempt: transientFailures });
        continue;
      }
      throw apiErr;
    }
  }

  if (job.status === "failed") throw job.error || new ApiError("PROCESSING_FAILED");
  if (!job.result) throw new ApiError("BAD_RESPONSE");
  return job.result;
}

/** Cancelamento de melhor esforço no servidor (se o backend suportar DELETE). */
export function cancelJob(id) {
  if (!id) return;
  let base;
  try {
    base = getBaseUrl();
  } catch {
    return;
  }
  fetch(base + routes.cancelJob(id), {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: config.withCredentials ? "include" : "same-origin",
    keepalive: true,
  }).catch(() => {});
}
