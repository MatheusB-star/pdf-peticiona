// Estado da ferramenta: fila de arquivos e seu ciclo de vida. Sem DOM, sem rede.

/**
 * Item = {
 *   id: string,
 *   file: File,
 *   name: string,
 *   size: number,
 *   label: string | null,          // PDF, JPG...
 *   status: "validating" | "invalid" | "ready" | "uploading" | "processing" | "done" | "error" | "canceled",
 *   upload: number | null,         // fração enviada (real, do navegador)
 *   progress: number | null,       // fração processada (somente se o backend informar)
 *   stage: string | null,
 *   result: object | null,
 *   error: { code: string, message: string, retryable: boolean } | null,
 *   reason: string | null,         // motivo de invalidação local
 * }
 */

let seq = 0;
const nextId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

export function createStore() {
  let state = { items: [], running: false };
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn(state));

  const set = (patch) => {
    state = { ...state, ...patch };
    emit();
  };

  const updateItem = (id, patch) => {
    let changed = false;
    const items = state.items.map((it) => {
      if (it.id !== id) return it;
      changed = true;
      return { ...it, ...patch };
    });
    if (changed) set({ items });
  };

  return {
    get: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    addPending(file) {
      const item = {
        id: nextId(),
        file,
        name: file.name || "documento",
        size: file.size,
        label: null,
        status: "validating",
        upload: null,
        progress: null,
        stage: null,
        result: null,
        error: null,
        reason: null,
      };
      set({ items: [...state.items, item] });
      return item.id;
    },

    updateItem,

    removeItem(id) {
      set({ items: state.items.filter((it) => it.id !== id) });
    },

    /** Remove itens já finalizados (concluídos, inválidos, com erro ou cancelados). */
    clearFinished() {
      set({ items: state.items.filter((it) => ["validating", "ready", "uploading", "processing"].includes(it.status)) });
    },

    setRunning(running) {
      set({ running });
    },
  };
}

export const ACTIVE_STATUSES = new Set(["uploading", "processing"]);
export const FINISHED_STATUSES = new Set(["done", "error", "canceled", "invalid"]);
