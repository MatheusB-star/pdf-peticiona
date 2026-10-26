// Controlador da ferramenta: liga estado, validação, API e renderização.

import { config, isServiceConfigured, resolveSecureBaseUrl } from "../config.js";
import { processDocument } from "../api/client.js";
import { toApiError } from "../api/errors.js";
import { validateFile, ACCEPT_ATTR } from "../core/validation.js";
import { formatBytes } from "../core/format.js";
import { logger } from "../core/logger.js";
import { createStore, ACTIVE_STATUSES } from "./store.js";
import { createView } from "./view.js";

function serviceState() {
  if (!isServiceConfigured()) return "not_configured";
  if (!resolveSecureBaseUrl()) return "insecure";
  return "ready";
}

function renderServiceNotice(root, state) {
  const notice = root.querySelector("[data-service-notice]");
  const badge = root.querySelector("[data-service-badge]");
  if (state === "ready") {
    notice.hidden = true;
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  notice.hidden = false;
  notice.querySelector("[data-service-notice-text]").textContent =
    state === "insecure"
      ? "O endereço do serviço configurado não usa HTTPS. Por segurança, nenhum arquivo será enviado."
      : "Você pode selecionar arquivos para conferir a validação, mas o processamento só ficará disponível quando o serviço for conectado.";
}

export function initTool(root) {
  if (!root) return null;

  const svc = serviceState();
  renderServiceNotice(root, svc);

  const input = root.querySelector("[data-file-input]");
  input.accept = ACCEPT_ATTR;
  root.querySelector("[data-limits]").textContent =
    `PDF, JPG, PNG ou TIFF · até ${formatBytes(config.maxFileSizeMB * 1024 * 1024)} por arquivo`;

  const store = createStore();
  const controllers = new Map(); // id -> AbortController

  async function addFiles(files) {
    const current = store.get().items.filter((i) => i.status !== "invalid").length;
    const room = Math.max(0, config.maxFiles - current);
    const accepted = files.slice(0, room);
    const overflow = files.slice(room);

    for (const file of accepted) {
      const id = store.addPending(file);
      const check = await validateFile(file);
      // O item pode ter sido removido enquanto era validado.
      if (!store.get().items.some((i) => i.id === id)) continue;
      store.updateItem(id, check.ok ? { status: "ready", label: check.label } : { status: "invalid", reason: check.reason });
    }
    for (const file of overflow) {
      const id = store.addPending(file);
      store.updateItem(id, { status: "invalid", reason: `Limite de ${config.maxFiles} arquivos por vez.` });
    }
  }

  async function runQueue() {
    if (store.get().running || svc !== "ready") return;
    store.setRunning(true);
    try {
      let next;
      while ((next = store.get().items.find((i) => i.status === "ready"))) {
        await processItem(next);
      }
    } finally {
      store.setRunning(false);
    }
  }

  async function processItem(item) {
    const ctrl = new AbortController();
    controllers.set(item.id, ctrl);
    store.updateItem(item.id, { status: "uploading", upload: 0, progress: null, stage: null, error: null, result: null });

    try {
      const result = await processDocument(item.file, {
        signal: ctrl.signal,
        onUploadProgress: (fraction) => {
          const it = store.get().items.find((i) => i.id === item.id);
          if (it?.status === "uploading") store.updateItem(item.id, { upload: fraction });
        },
        onStatus: (job) => {
          if (ctrl.signal.aborted) return;
          if (job.status === "queued" || job.status === "processing") {
            store.updateItem(item.id, {
              status: "processing",
              progress: job.progress,
              stage: job.status === "queued" ? "queued" : job.stage,
            });
          }
        },
      });
      store.updateItem(item.id, { status: "done", result, progress: 1 });
    } catch (err) {
      const apiErr = toApiError(err);
      logger.warn("process.failed", { code: apiErr.code, status: apiErr.status });
      if (!store.get().items.some((i) => i.id === item.id)) return;
      if (apiErr.code === "ABORTED") {
        store.updateItem(item.id, { status: "canceled", upload: null, progress: null });
      } else {
        store.updateItem(item.id, {
          status: "error",
          error: { code: apiErr.code, message: apiErr.message, retryable: apiErr.retryable },
        });
      }
    } finally {
      controllers.delete(item.id);
    }
  }

  function onAction(action, id) {
    switch (action) {
      case "start":
        runQueue();
        break;
      case "cancel":
        controllers.get(id)?.abort();
        break;
      case "retry":
        store.updateItem(id, { status: "ready", error: null, upload: null, progress: null, stage: null });
        if (!store.get().running) runQueue();
        break;
      case "remove":
        controllers.get(id)?.abort();
        store.removeItem(id);
        break;
      case "clear":
        store.clearFinished();
        if (store.get().items.length === 0) view.focusPicker();
        break;
      default:
        break;
    }
  }

  const view = createView(root, { serviceReady: svc === "ready", onFiles: addFiles, onAction });
  store.subscribe(view.render);
  view.render(store.get());

  // Evita perder a seleção ou um envio em andamento ao sair da página sem querer.
  window.addEventListener("beforeunload", (e) => {
    const pending = store.get().items.some((i) => i.status === "ready" || ACTIVE_STATUSES.has(i.status));
    if (pending) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  return { focus: view.focusPicker };
}
