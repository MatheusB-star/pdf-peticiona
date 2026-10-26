// Validação local de arquivos antes do envio. Confere extensão, tipo e assinatura binária.
// É uma conveniência para o usuário: o backend deve validar novamente.

import { config } from "../config.js";
import { formatBytes } from "./format.js";

export const ACCEPTED = [
  { ext: ["pdf"], mime: ["application/pdf"], label: "PDF" },
  { ext: ["jpg", "jpeg"], mime: ["image/jpeg"], label: "JPG" },
  { ext: ["png"], mime: ["image/png"], label: "PNG" },
  { ext: ["tif", "tiff"], mime: ["image/tiff"], label: "TIFF" },
];

export const ACCEPT_ATTR = ACCEPTED.flatMap((t) => [...t.ext.map((e) => `.${e}`), ...t.mime]).join(",");

const SIGNATURES = {
  PDF: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  JPG: [[0xff, 0xd8, 0xff]],
  PNG: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  TIFF: [
    [0x49, 0x49, 0x2a, 0x00],
    [0x4d, 0x4d, 0x00, 0x2a],
  ],
};

function extOf(name) {
  const m = /\.([^.]+)$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function matchType(file) {
  const ext = extOf(file.name);
  return ACCEPTED.find((t) => t.ext.includes(ext) || (file.type && t.mime.includes(file.type))) || null;
}

async function hasSignature(file, label) {
  // PDFs podem ter bytes antes do cabeçalho; procuramos %PDF no primeiro KB.
  const head = new Uint8Array(await file.slice(0, label === "PDF" ? 1024 : 16).arrayBuffer());
  return SIGNATURES[label].some((sig) => {
    if (label !== "PDF") return sig.every((b, i) => head[i] === b);
    for (let i = 0; i + sig.length <= head.length; i++) {
      if (sig.every((b, j) => head[i + j] === b)) return true;
    }
    return false;
  });
}

/**
 * @param {File} file
 * @returns {Promise<{ ok: true, label: string } | { ok: false, reason: string }>}
 */
export async function validateFile(file) {
  if (file.size === 0) return { ok: false, reason: "O arquivo está vazio." };

  const type = matchType(file);
  if (!type) return { ok: false, reason: "Formato não aceito. Envie PDF, JPG, PNG ou TIFF." };

  const maxBytes = config.maxFileSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, reason: `Arquivo maior que o limite de ${formatBytes(maxBytes)} por envio.` };
  }

  try {
    if (!(await hasSignature(file, type.label))) {
      return { ok: false, reason: `O conteúdo não corresponde a um arquivo ${type.label} válido.` };
    }
  } catch {
    return { ok: false, reason: "Não foi possível ler o arquivo." };
  }

  return { ok: true, label: type.label };
}
