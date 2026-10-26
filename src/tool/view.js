// Renderização da ferramenta. Recebe o estado e atualiza o DOM de forma incremental
// (por id), para que animações de entrada/saída e o foco não se percam entre renderizações.

import { formatBytes, formatPages, formatPercent, reductionPercent, outputFileName, formatTime } from "../core/format.js";
import { STAGE_LABELS } from "../api/adapter.js";
import { ACTIVE_STATUSES } from "./store.js";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  return node;
}

function icon(name, extra = "") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", `icon ${extra}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function iconButton(iconName, label, action, extra = "") {
  const b = el("button", `btn btn--ghost btn--icon ${extra}`.trim(), { type: "button", "aria-label": label, title: label });
  b.dataset.action = action;
  b.appendChild(icon(iconName));
  return b;
}

const STATUS_TEXT = {
  validating: "Verificando arquivo…",
  ready: "Pronto para otimizar",
  uploading: "Enviando",
  processing: "Processando",
  done: "Concluído",
  error: "Falhou",
  canceled: "Cancelado",
  invalid: "Não aceito",
};

function statusLine(item) {
  if (item.status === "invalid") return item.reason;
  if (item.status === "error") return item.error?.message || STATUS_TEXT.error;
  if (item.status === "uploading") {
    return item.upload != null ? `Enviando… ${Math.round(item.upload * 100)}%` : "Enviando…";
  }
  if (item.status === "processing") {
    const stage = item.stage && (STAGE_LABELS[item.stage] || null);
    const pct = item.progress != null ? ` · ${Math.round(item.progress * 100)}%` : "";
    return `${stage || "Processando no servidor"}…${pct}`;
  }
  return STATUS_TEXT[item.status];
}

/** Retorna a fração para a barra ou null para barra indeterminada. */
function progressFraction(item) {
  if (item.status === "uploading") return item.upload;
  if (item.status === "processing") return item.progress;
  return null;
}

function buildItem(item) {
  const li = el("li", "file-item", { "data-id": item.id });
  li.innerHTML = `
    <div class="file-item__row">
      <div class="file-item__thumb" aria-hidden="true">
        <svg class="icon icon--lg"><use href="#i-file"></use></svg>
        <span class="file-item__type"></span>
      </div>
      <div class="file-item__body">
        <p class="file-item__name"></p>
        <p class="file-item__meta"><span class="file-item__size"></span><span class="file-item__dot" aria-hidden="true">·</span><span class="file-item__status"></span></p>
      </div>
      <div class="file-item__actions"></div>
    </div>
    <div class="file-item__progress progress" hidden><div class="progress__bar"></div></div>
    <div class="file-item__result" hidden></div>`;
  return li;
}

function renderActions(container, item, running) {
  const key = `${item.status}|${running}`;
  if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.replaceChildren();

  if (ACTIVE_STATUSES.has(item.status)) {
    container.appendChild(iconButton("x", `Cancelar ${item.name}`, "cancel"));
    return;
  }
  if ((item.status === "error" && item.error?.retryable) || item.status === "canceled") {
    container.appendChild(iconButton("retry", `Tentar novamente ${item.name}`, "retry"));
  }
  if (item.status !== "validating" && !(running && item.status === "ready")) {
    container.appendChild(iconButton("trash", `Remover ${item.name}`, "remove"));
  }
}

function renderResult(container, item, objectUrls) {
  const r = item.result;
  const key = r ? "done" : "";
  if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.replaceChildren();
  if (!r) return;

  const original = r.originalBytes ?? item.size;
  const reduction = reductionPercent(original, r.outputBytes);

  const stats = el("dl", "result-stats");
  const addStat = (label, value, mod = "") => {
    const wrap = el("div", `result-stats__item ${mod}`.trim());
    wrap.append(el("dt", null, { text: label }), el("dd", null, { text: value }));
    stats.appendChild(wrap);
  };
  addStat("Original", formatBytes(original));
  addStat("Final", formatBytes(r.outputBytes), "is-strong");
  if (reduction != null) {
    if (reduction > 0) addStat("Redução", formatPercent(reduction), "is-positive");
    else if (reduction < 0) addStat("Variação", `+${formatPercent(-reduction)}`, "is-negative");
    else addStat("Redução", "Sem redução");
  }
  if (r.pages != null) addStat("Páginas", formatPages(r.pages).replace(/ páginas?$/, ""));

  const ocrText = {
    applied: "OCR aplicado",
    not_needed: "Já era pesquisável",
    not_applied: "OCR não aplicado",
    unknown: "OCR: não informado",
  }[r.ocr];
  const ocrClass = { applied: "badge--success", not_needed: "badge--success", not_applied: "badge--warning", unknown: "" }[r.ocr];
  const badges = el("div", "result-badges");
  const ocr = el("span", `badge ${ocrClass}`.trim());
  const searchable = r.ocr === "applied" || r.ocr === "not_needed";
  ocr.append(icon(searchable ? "text-search" : "info", "icon--sm"), document.createTextNode(ocrText));
  badges.appendChild(ocr);
  if (r.expiresAt && formatTime(r.expiresAt)) {
    badges.appendChild(el("span", "badge", { text: `Disponível até ${formatTime(r.expiresAt)}` }));
  }

  const download = el("a", "btn btn--primary btn--sm result-download", { download: outputFileName(item.name) });
  download.dataset.action = "download";
  if (r.download.kind === "blob") {
    if (!objectUrls.has(item.id)) objectUrls.set(item.id, URL.createObjectURL(r.download.blob));
    download.href = objectUrls.get(item.id);
  } else {
    download.href = r.download.url;
    download.rel = "noopener";
  }
  download.append(icon("download", "icon--sm"), el("span", "btn__label", { text: "Baixar PDF" }));

  const footer = el("div", "result-footer");
  footer.append(badges, download);
  container.append(stats);

  // Arquivos pequenos ou que já tinham texto podem crescer: a camada de texto e a reestruturação
  // do PDF pesam mais que o ganho de compressão. Avisamos em vez de esconder.
  if (r.outputBytes != null && original != null && r.outputBytes >= original) {
    const grew = r.outputBytes > original;
    const note = el("p", "result-note", { role: "note" });
    note.append(
      icon("info", "icon--sm"),
      el("span", null, {
        text:
          (grew ? "O arquivo final ficou maior que o original. " : "O arquivo final não ficou menor que o original. ") +
          "Isso pode acontecer com PDFs muito pequenos ou que já possuem texto pesquisável. " +
          "Se o original já atende ao limite do sistema de destino, você pode enviá-lo como está.",
      }),
    );
    container.appendChild(note);
  }
  container.appendChild(footer);
}

function updateItem(li, item, running, objectUrls) {
  li.dataset.status = item.status;
  li.querySelector(".file-item__type").textContent = item.label || "";
  const nameEl = li.querySelector(".file-item__name");
  if (nameEl.textContent !== item.name) {
    nameEl.textContent = item.name;
    nameEl.title = item.name;
  }
  li.querySelector(".file-item__size").textContent = formatBytes(item.size);
  li.querySelector(".file-item__status").textContent = statusLine(item);

  const progress = li.querySelector(".file-item__progress");
  const showProgress = ACTIVE_STATUSES.has(item.status);
  progress.hidden = !showProgress;
  if (showProgress) {
    const frac = progressFraction(item);
    progress.classList.toggle("progress--indeterminate", frac == null);
    progress.style.setProperty("--progress", frac ?? 0);
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", `Progresso de ${item.name}`);
    if (frac != null) progress.setAttribute("aria-valuenow", String(Math.round(frac * 100)));
    else progress.removeAttribute("aria-valuenow");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
  }

  const result = li.querySelector(".file-item__result");
  result.hidden = item.status !== "done";
  renderResult(result, item, objectUrls);
  renderActions(li.querySelector(".file-item__actions"), item, running);
}

/**
 * @param {HTMLElement} root
 * @param {{ serviceReady: boolean, onFiles: (files: File[]) => void, onAction: (action: string, id?: string) => void }} opts
 */
export function createView(root, { serviceReady, onFiles, onAction }) {
  const input = root.querySelector("[data-file-input]");
  const dropzone = root.querySelector("[data-dropzone]");
  const list = root.querySelector("[data-file-list]");
  const footer = root.querySelector("[data-footer]");
  const summary = root.querySelector("[data-summary]");
  const startBtn = root.querySelector('[data-action="start"]');
  const clearBtn = root.querySelector('[data-action="clear"]');
  const live = root.querySelector("[data-live]");
  const nodes = new Map();
  const lastStatus = new Map();
  const objectUrls = new Map();

  // Seleção por clique e teclado.
  const openPicker = () => input.click();
  dropzone.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    openPicker();
  });
  root.querySelector("[data-pick]").addEventListener("click", openPicker);
  input.addEventListener("change", () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = "";
  });

  // Arrastar e soltar. O contador evita piscar ao passar sobre elementos filhos.
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  dropzone.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  dropzone.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.classList.remove("is-dragging");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("is-dragging");
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onFiles(files);
  });
  // Evita que um arquivo solto fora da área abra o PDF no navegador e descarte a seleção.
  window.addEventListener("dragover", (e) => hasFiles(e) && e.preventDefault());
  window.addEventListener("drop", (e) => hasFiles(e) && e.preventDefault());

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    const li = e.target.closest(".file-item");
    // O link de download funciona nativamente; não é interceptado.
    if (!btn || !li || btn.dataset.action === "download") return;
    onAction(btn.dataset.action, li.dataset.id);
  });
  startBtn.addEventListener("click", () => onAction("start"));
  clearBtn.addEventListener("click", () => onAction("clear"));

  function announce(msg) {
    live.textContent = "";
    // Pequeno atraso para leitores de tela perceberem a troca.
    setTimeout(() => (live.textContent = msg), 50);
  }

  function removeNode(id, li) {
    nodes.delete(id);
    lastStatus.delete(id);
    if (objectUrls.has(id)) {
      URL.revokeObjectURL(objectUrls.get(id));
      objectUrls.delete(id);
    }
    if (reduceMotion()) {
      li.remove();
      return;
    }
    li.style.height = `${li.offsetHeight}px`;
    li.classList.add("is-leaving");
    requestAnimationFrame(() => {
      li.style.height = "0px";
    });
    li.addEventListener("transitionend", () => li.remove(), { once: true });
    setTimeout(() => li.remove(), 500);
  }

  function render(state) {
    const { items, running } = state;
    const ids = new Set(items.map((i) => i.id));

    for (const [id, li] of nodes) if (!ids.has(id)) removeNode(id, li);

    items.forEach((item, index) => {
      let li = nodes.get(item.id);
      if (!li) {
        li = buildItem(item);
        nodes.set(item.id, li);
        li.classList.add("is-entering");
        list.appendChild(li);
        requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove("is-entering")));
      }
      // Mantém a ordem do DOM igual à do estado.
      const children = [...list.children].filter((c) => !c.classList.contains("is-leaving"));
      if (children[index] !== li) list.insertBefore(li, children[index] || null);
      updateItem(li, item, running, objectUrls);

      const prev = lastStatus.get(item.id);
      if (prev && prev !== item.status) {
        if (item.status === "done") announce(`${item.name}: processamento concluído.`);
        if (item.status === "error") announce(`${item.name}: ${item.error?.message || "falhou"}`);
        if (item.status === "invalid") announce(`${item.name}: ${item.reason}`);
      }
      lastStatus.set(item.id, item.status);
    });

    const hasItems = items.length > 0;
    root.classList.toggle("has-items", hasItems);
    dropzone.classList.toggle("dropzone--compact", hasItems);
    footer.hidden = !hasItems;
    list.hidden = !hasItems;

    const ready = items.filter((i) => i.status === "ready").length;
    const done = items.filter((i) => i.status === "done").length;
    const active = items.filter((i) => ACTIVE_STATUSES.has(i.status)).length;
    const validating = items.some((i) => i.status === "validating");
    const finished = items.filter((i) => ["done", "error", "canceled", "invalid"].includes(i.status)).length;

    startBtn.classList.toggle("is-loading", running);
    startBtn.setAttribute("aria-busy", running ? "true" : "false");
    startBtn.disabled = !serviceReady || running || ready === 0 || validating;
    // Sem nada na fila, o botão principal sai de cena e "Processar outro documento" assume.
    startBtn.hidden = !running && ready === 0 && !validating && finished > 0;
    startBtn.querySelector(".btn__label").textContent =
      ready > 1 ? `Otimizar ${ready} arquivos` : "Otimizar";

    clearBtn.hidden = running || finished === 0;
    clearBtn.classList.toggle("btn--dark", startBtn.hidden);
    clearBtn.classList.toggle("btn--ghost", !startBtn.hidden);
    clearBtn.querySelector(".btn__label").textContent =
      ready > 0 ? "Limpar finalizados" : "Processar outro documento";

    if (!serviceReady && ready > 0) summary.textContent = "O serviço de processamento não está conectado neste ambiente.";
    else if (running) summary.textContent = `Processando ${active ? "1 arquivo" : "…"}${ready ? ` · ${ready} na fila` : ""}`;
    else if (done && !ready) summary.textContent = done === 1 ? "Documento pronto para download." : `${done} documentos prontos para download.`;
    else if (ready) summary.textContent = ready === 1 ? "1 arquivo pronto para otimizar." : `${ready} arquivos prontos para otimizar.`;
    else summary.textContent = "";
  }

  return { render, focusPicker: () => root.querySelector("[data-pick]").focus({ preventScroll: true }) };
}
