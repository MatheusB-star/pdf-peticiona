// Formatação para pt-BR.

const numberFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${intFmt.format(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${intFmt.format(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${numberFmt.format(mb)} MB`;
  return `${numberFmt.format(mb / 1024)} GB`;
}

/** Redução percentual calculada a partir de tamanhos reais. Null se não houver dados suficientes. */
export function reductionPercent(original, output) {
  if (!original || output == null || original <= 0) return null;
  return Math.round((1 - output / original) * 100);
}

export function formatPercent(value) {
  return value == null ? "—" : `${intFmt.format(value)}%`;
}

export function formatPages(pages) {
  if (pages == null) return "—";
  return pages === 1 ? "1 página" : `${intFmt.format(pages)} páginas`;
}

/** Nome do arquivo de saída: mantém o nome original e indica a otimização. */
export function outputFileName(name) {
  const base = name.replace(/\.[^.]+$/, "") || "documento";
  return `${base}-otimizado.pdf`;
}

export function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
