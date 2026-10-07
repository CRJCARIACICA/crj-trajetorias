// Compatibilidade: a exportação da lista de presença de aula agora é
// roteada pelo mesmo gateway documental dos demais documentos.
// O gateway identifica plan_lesson_id e encaminha ao gerador oficial do
// Anexo 2, mantendo o mesmo contrato visual de PDF/DOCX/impressão.
//
// Este arquivo permanece carregado para não quebrar versões em cache que
// esperam o módulo, mas não substitui mais window.fetch nem cria uma rota
// paralela de exportação.
window.__crjAttendanceExportHandledByCanonicalGateway = true;
