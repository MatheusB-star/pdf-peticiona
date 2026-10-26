/*
 * Configuração de execução do frontend.
 *
 * Este arquivo é público: é servido ao navegador como está.
 * NUNCA coloque aqui chaves de API, tokens ou senhas.
 *
 * Em produção, gere este arquivo no deploy a partir de variáveis de ambiente
 * (veja scripts/generate-config.py e o README).
 */
window.__APP_CONFIG__ = {
  // URL base do serviço de processamento (OCR + compressão).
  // Vazio = ferramenta exibida como "serviço não configurado", sem simular resultados.
  // Ex.: "https://api.seudominio.com.br" ou "/api" (mesma origem, via proxy reverso).
  // Somente HTTPS é aceito, exceto em localhost.
  apiBaseUrl: "",

  // Envia cookies de sessão nas requisições (para autenticação futura por cookie).
  withCredentials: false,

  // Limites validados no navegador. O backend deve validar novamente.
  maxFileSizeMB: 50,
  maxFiles: 10,

  // Intervalo entre consultas de status do processamento (ms).
  pollIntervalMs: 1500,

  // Tempo máximo aguardando um processamento antes de desistir (ms).
  processingTimeoutMs: 10 * 60 * 1000,

  // Informações exibidas na seção de privacidade. Preencha somente com o que o backend realmente faz.
  privacy: {
    // Horas até a exclusão automática dos arquivos no servidor. null = ainda não definido.
    retentionHours: null,
    // E-mail para suporte e solicitações sobre documentos. null = ainda não definido.
    supportEmail: null,
  },

  // Exibe logs técnicos no console (sem nomes de arquivo nem conteúdo). Desligue em produção.
  debug: false,
};
