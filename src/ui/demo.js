// Demonstração ilustrativa: alternância original/otimizado e busca no texto do documento de exemplo.
// Os valores são EXEMPLOS fixos, identificados como tal na página. Não representam medições do serviço.

import { reductionPercent, formatPercent } from "../core/format.js";

const EXAMPLE = Object.freeze({
  originalBytes: 18.4 * 1024 * 1024,
  finalBytes: 2.6 * 1024 * 1024,
  pages: 12,
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove acentos para que "procuracao" encontre "PROCURAÇÃO". */
function fold(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function initTabs(root) {
  const tabs = root.querySelector("[data-demo-tabs]");
  const stage = root.querySelector(".demo__stage");
  const buttons = [...tabs.querySelectorAll("[data-view]")];

  const select = (view, focus = false) => {
    stage.dataset.active = view;
    tabs.dataset.active = view;
    buttons.forEach((b) => {
      const on = b.dataset.view === view;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
  };

  buttons.forEach((b) => b.addEventListener("click", () => select(b.dataset.view)));
  tabs.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const current = buttons.findIndex((b) => b.getAttribute("aria-selected") === "true");
    let next = current;
    if (e.key === "ArrowRight") next = (current + 1) % buttons.length;
    if (e.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = buttons.length - 1;
    select(buttons[next].dataset.view, true);
  });

  select("after");
  return select;
}

function initSearch(root, selectView) {
  const input = root.querySelector("[data-demo-search]");
  const nodes = [...root.querySelectorAll("[data-demo-doc] [data-searchable]")];
  const afterStatus = root.querySelector("[data-demo-after-status]");
  const beforeStatus = root.querySelector("[data-demo-before-status]");
  const defaultAfter = afterStatus.innerHTML;
  const defaultBefore = beforeStatus.innerHTML;
  // Guarda o HTML original (com <b>) para restaurar; a busca opera sobre nós de texto.
  const originals = nodes.map((n) => n.innerHTML);

  const setStatus = (el, text, cls) => {
    el.classList.remove("is-hit", "is-miss");
    if (cls) el.classList.add(cls);
    el.textContent = text;
  };

  function highlight(node, query) {
    let count = 0;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    const q = fold(query);
    for (const t of texts) {
      const folded = fold(t.nodeValue);
      // fold() preserva o comprimento para letras latinas, então os índices coincidem.
      if (folded.length !== t.nodeValue.length) continue;
      const re = new RegExp(escapeRegExp(q), "g");
      const parts = [];
      let last = 0;
      let m;
      while ((m = re.exec(folded))) {
        parts.push(document.createTextNode(t.nodeValue.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.textContent = t.nodeValue.slice(m.index, m.index + q.length);
        parts.push(mark);
        last = m.index + q.length;
        count++;
      }
      if (!parts.length) continue;
      parts.push(document.createTextNode(t.nodeValue.slice(last)));
      t.replaceWith(...parts);
    }
    return count;
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();
    nodes.forEach((n, i) => (n.innerHTML = originals[i]));

    if (query.length < 2) {
      afterStatus.classList.remove("is-hit", "is-miss");
      beforeStatus.classList.remove("is-hit", "is-miss");
      afterStatus.innerHTML = defaultAfter;
      beforeStatus.innerHTML = defaultBefore;
      return;
    }

    const total = nodes.reduce((sum, n) => sum + highlight(n, query), 0);
    if (total > 0) {
      setStatus(afterStatus, total === 1 ? "1 ocorrência encontrada." : `${total} ocorrências encontradas.`, "is-hit");
      selectView("after");
    } else {
      setStatus(afterStatus, "Nenhuma ocorrência neste trecho de exemplo.", "is-miss");
    }
    setStatus(beforeStatus, "0 ocorrências: no arquivo digitalizado o texto é apenas imagem.", "is-miss");
  });
}

function initMetrics(root, formatBytes) {
  const set = (key, value) => {
    const el = root.querySelector(`[data-metric="${key}"]`);
    if (el) el.textContent = value;
  };
  set("original", formatBytes(EXAMPLE.originalBytes));
  set("final", formatBytes(EXAMPLE.finalBytes));
  set("reduction", formatPercent(reductionPercent(EXAMPLE.originalBytes, EXAMPLE.finalBytes)));
  set("pages", String(EXAMPLE.pages));
}

export function initDemo(root, { formatBytes }) {
  if (!root) return;
  const selectView = initTabs(root);
  initSearch(root, selectView);
  initMetrics(root, formatBytes);
}
