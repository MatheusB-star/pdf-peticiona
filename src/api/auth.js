// Ponto de extensão para autenticação futura (login, planos, limites de uso).
// Hoje não há autenticação: retorna cabeçalhos vazios. Não guarde segredos no frontend;
// use tokens de sessão de curta duração emitidos pelo backend ou cookies HttpOnly (config.withCredentials).

/** @returns {Record<string, string>} */
export function getAuthHeaders() {
  return {};
}
