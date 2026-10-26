// Ponto de entrada: comportamento da página institucional e inicialização da ferramenta.

import { config } from "./config.js";
import { initTool } from "./tool/index.js";
import { initDemo } from "./ui/demo.js";
import { formatBytes } from "./core/format.js";

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const motionOk = () => !motionQuery.matches;

function initHeader() {
  const header = document.querySelector("[data-header]");
  if (!header) return;
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 4);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function initMobileMenu() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-mobile-menu]");
  if (!toggle || !menu) return;

  const focusables = () => [...menu.querySelectorAll("a, button")];

  const setOpen = (open, { returnFocus = true } = {}) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    menu.classList.toggle("is-open", open);
    menu.setAttribute("aria-hidden", String(!open));
    focusables().forEach((el) => (el.tabIndex = open ? 0 : -1));
    if (open) focusables()[0]?.focus({ preventScroll: true });
    else if (returnFocus) toggle.focus({ preventScroll: true });
  };

  setOpen(false, { returnFocus: false });
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));

  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false, { returnFocus: false });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) setOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("is-open")) return;
    if (!menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false, { returnFocus: false });
  });

  // Ao voltar para o layout desktop, o menu é fechado para não ficar preso aberto.
  window.matchMedia("(min-width: 881px)").addEventListener("change", (e) => {
    if (e.matches) setOpen(false, { returnFocus: false });
  });
}

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!motionOk() || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion-ok");
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  items.forEach((el) => io.observe(el));
}

/** Todas as CTAs "Otimizar meu PDF" levam à ferramenta e colocam o foco no seletor de arquivos. */
function initToolCtas(tool) {
  const target = document.getElementById("ferramenta");
  if (!target || !tool) return;
  document.querySelectorAll("[data-cta-tool]").forEach((cta) => {
    cta.addEventListener("click", (e) => {
      e.preventDefault();
      target.classList.add("is-visible");
      target.scrollIntoView({ behavior: motionOk() ? "smooth" : "auto", block: "center" });
      tool.focus();
      if (motionOk()) {
        target.classList.remove("is-highlighted");
        void target.offsetWidth;
        target.classList.add("is-highlighted");
      }
      history.replaceState(null, "", "#ferramenta");
    });
  });
}

/** Preenche a seção de privacidade somente com o que está configurado; o resto aparece como "em definição". */
function initPrivacy() {
  const { retentionHours, supportEmail } = config.privacy;

  const retention = document.querySelector("[data-retention]");
  if (retention) {
    if (retentionHours) {
      const label = retentionHours === 1 ? "1 hora" : `${retentionHours} horas`;
      retention.querySelector("[data-retention-text]").textContent =
        `Os arquivos enviados e os resultados são excluídos automaticamente do servidor em até ${label} após o processamento.`;
    } else {
      retention.classList.add("is-pending");
    }
  }

  const support = document.querySelector("[data-support]");
  const contactLink = document.querySelector("[data-contact-link]");
  if (supportEmail) {
    if (support) {
      const p = support.querySelector("[data-support-text]");
      p.textContent = "Dúvidas ou pedidos de exclusão de um documento: ";
      const a = document.createElement("a");
      a.href = `mailto:${supportEmail}`;
      a.textContent = supportEmail;
      p.appendChild(a);
    }
    if (contactLink) {
      contactLink.href = `mailto:${supportEmail}`;
      contactLink.hidden = false;
    }
  } else if (support) {
    support.classList.add("is-pending");
  }
}

function initFooter() {
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
}

initHeader();
initMobileMenu();
initReveal();
initPrivacy();
initFooter();
initDemo(document.querySelector("[data-demo]"), { formatBytes });
initToolCtas(initTool(document.querySelector("[data-tool]")));
