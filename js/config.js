// ---------- Configuração ----------
// Para ativar a sincronização com o Google Drive (ver js/cloud-sync.js),
// preenche este valor com o "Client ID" de um cliente OAuth 2.0 do tipo
// "Web application", criado na Google Cloud Console para este site.
//
// Passos (uma vez só, feitos pelo dono do site, não pelo Claude):
//   1. https://console.cloud.google.com/ → cria um projeto (ou usa um existente)
//   2. Activa a "Google Drive API" em "APIs e serviços" → "Biblioteca"
//   3. "APIs e serviços" → "Ecrã de consentimento OAuth": configura como
//      "Externo", preenche o essencial (nome da app, email) e publica-o
//      (ou mantém em "Testing" e adiciona o teu email como utilizador de teste)
//   4. "Credenciais" → "Criar credenciais" → "ID de cliente OAuth" →
//      tipo "Aplicação Web" → em "Origens JavaScript autorizadas" adiciona
//      o URL exacto onde o jogo fica publicado (ex.: https://<user>.github.io)
//   5. Copia o "Client ID" gerado (algo como "123...apps.googleusercontent.com")
//      e cola-o abaixo, entre aspas.
//
// Sem isto preenchido, o botão de sincronização fica desativado mas o
// resto do jogo funciona normalmente (tudo continua a ser guardado no
// próprio telemóvel).
export const GOOGLE_CLIENT_ID = '';

// Âmbito mínimo: só dá acesso a ficheiros que esta própria app cria no
// Drive do jogador — nunca ao resto do Drive dele.
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const BACKUP_FILE_NAME = 'tabuada-divertida-backup.json';
