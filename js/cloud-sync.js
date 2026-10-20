// ---------- Sincronização com o Google Drive do próprio jogador ----------
// Tudo corre no browser: os dados vão diretamente do telemóvel para o
// Google Drive da conta que a criança/pais escolherem, usando OAuth do
// Google. Não há nenhum servidor do autor do jogo envolvido — os dados
// nunca passam por nós, só entre este site e o Google.
//
// O ficheiro fica na "pasta de dados da aplicação" do Drive (appDataFolder):
// uma área escondida, própria desta app, que não aparece no Drive do
// utilizador e que mais nenhuma app consegue ler. Guardamos lá um único
// JSON (ver BACKUP_FILE_NAME) com uma cópia de tudo o que está guardado
// localmente (perfis, progresso, testes de avaliação, revisão diária).
//
// A sincronização é automática: ao abrir o jogo e sempre que os dados
// locais mudam (fim de um estágio, teste, revisão...). O utilizador só vê
// o Google uma vez, quando liga a conta.
import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE, BACKUP_FILE_NAME } from './config.js';
import { onLocalChange } from './storage.js';

const STORAGE_PREFIXES = ['td_profiles_v1', 'td_active_profile_v1', 'td_progress_v1_', 'td_assessments_v1_', 'td_review_v1_'];
const KEY_FILE_ID = 'td_drive_file_id_v1';
const KEY_LAST_SYNC = 'td_last_sync_v1';       // "savedAt" da cópia remota que este telemóvel já tem
const KEY_LOCAL_CHANGE = 'td_local_change_v1'; // última alteração feita neste telemóvel
const KEY_ENABLED = 'td_cloud_enabled_v1';

// Espera um pouco depois de uma alteração antes de enviar, para não fazer
// um pedido por cada resposta certa — no fim de um estágio há várias
// escritas seguidas e queremos só um envio.
const BACKUP_DELAY_MS = 4000;

let accessToken = null;
let tokenExpiresAt = 0;
let tokenClient = null;
let gisLoadPromise = null;
let backupTimer = null;
let syncInFlight = null;
let pendingConflict = false;
let applyGuard = () => true;
let status = 'off'; // off | syncing | ready | reconnect | error
const listeners = [];

// ---------- Estado e avisos para a interface ----------

export function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

export function isEnabled() {
  return isConfigured() && localStorage.getItem(KEY_ENABLED) === '1';
}

export function isSignedIn() {
  return Boolean(accessToken) && Date.now() < tokenExpiresAt;
}

export function getStatus() {
  return status;
}

export function hasPendingConflict() {
  return pendingConflict;
}

/**
 * A interface diz-nos quando é seguro substituir os dados locais pelos da
 * nuvem. A meio de um estágio não é: perderíamos a ronda a que a criança
 * está a jogar.
 */
export function setApplyGuard(fn) {
  applyGuard = fn;
}

export function subscribe(cb) {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emit(event) {
  listeners.forEach((cb) => {
    try {
      cb(event);
    } catch (e) {
      // um ouvinte com erro não pode partir a sincronização
    }
  });
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  emit({ type: 'status', status });
}

export function getLastSyncLabel() {
  const raw = localStorage.getItem(KEY_LAST_SYNC);
  if (!raw) return null;
  try {
    return new Date(raw).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return null;
  }
}

// ---------- Ligação à conta Google ----------

function loadGis() {
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar o Google Sign-In.'));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/**
 * Pede um token de acesso. prompt '' mostra o ecrã do Google (só pode ser
 * chamado a partir de um toque do utilizador); prompt 'none' tenta em
 * silêncio e falha se o Google precisar de perguntar alguma coisa.
 */
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: () => {},
        error_callback: () => {},
      });
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      accessToken = response.access_token;
      // Tiramos um minuto de margem para não usar um token quase a expirar.
      tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) - 60) * 1000;
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => reject(new Error((err && err.type) || 'token-failed'));
    tokenClient.requestAccessToken({ prompt });
  });
}

async function ensureToken(interactive) {
  if (isSignedIn()) return accessToken;
  await loadGis();
  return requestToken(interactive ? '' : 'none');
}

/** Ligar a conta. Tem de ser chamado a partir de um toque do utilizador. */
export async function connect() {
  if (!isConfigured()) throw new Error('not-configured');
  await loadGis();
  await requestToken('');
  localStorage.setItem(KEY_ENABLED, '1');
  return syncNow(true);
}

export function disconnect() {
  if (accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  pendingConflict = false;
  localStorage.removeItem(KEY_ENABLED);
  localStorage.removeItem(KEY_FILE_ID);
  setStatus('off');
}

// ---------- Acesso ao Drive (pasta escondida da app) ----------

async function driveFetch(url, options = {}, retry = true) {
  const headers = Object.assign({ Authorization: `Bearer ${accessToken}` }, options.headers || {});
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401 && retry) {
    // Token expirado a meio: tenta renovar em silêncio e repete uma vez.
    accessToken = null;
    tokenExpiresAt = 0;
    await ensureToken(false);
    return driveFetch(url, options, false);
  }
  return res;
}

async function findBackupFileId(useCache = true) {
  if (useCache) {
    const cached = localStorage.getItem(KEY_FILE_ID);
    if (cached) return cached;
  }

  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`);
  if (!res.ok) throw new Error('drive-list-failed');
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    localStorage.setItem(KEY_FILE_ID, data.files[0].id);
    return data.files[0].id;
  }
  localStorage.removeItem(KEY_FILE_ID);
  return null;
}

async function createBackupFile() {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: BACKUP_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] }),
  });
  if (!res.ok) throw new Error('drive-create-failed');
  const data = await res.json();
  localStorage.setItem(KEY_FILE_ID, data.id);
  return data.id;
}

/** Devolve { savedAt, data } ou null se ainda não houver cópia lá. */
async function downloadBackup(useCache = true) {
  const fileId = await findBackupFileId(useCache);
  if (!fileId) return null;

  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (res.status === 404 && useCache) {
    // O ficheiro em cache já não existe (apagado noutro sítio): procura outra vez.
    localStorage.removeItem(KEY_FILE_ID);
    return downloadBackup(false);
  }
  if (!res.ok) throw new Error('drive-download-failed');
  return res.json();
}

async function uploadBackup() {
  let fileId = await findBackupFileId();
  if (!fileId) fileId = await createBackupFile();

  const savedAt = new Date().toISOString();
  const payload = { savedAt, data: gatherLocalData() };
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('drive-upload-failed');
  markSynced(savedAt);
  return savedAt;
}

// ---------- Cópia local <-> cópia remota ----------

function isSyncedKey(key) {
  return STORAGE_PREFIXES.some((p) => key === p || key.startsWith(p));
}

function gatherLocalData() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isSyncedKey(key)) dump[key] = localStorage.getItem(key);
  }
  return dump;
}

function applyRemoteData(dump) {
  // Apaga primeiro o que já não existe na nuvem, para que apagar um
  // jogador num telemóvel o apague também nos outros.
  const keep = new Set(Object.keys(dump));
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (isSyncedKey(key) && !keep.has(key)) toRemove.push(key);
  }
  toRemove.forEach((key) => localStorage.removeItem(key));

  Object.keys(dump).forEach((key) => {
    if (isSyncedKey(key)) localStorage.setItem(key, dump[key]);
  });
}

function markSynced(savedAt) {
  localStorage.setItem(KEY_LAST_SYNC, savedAt);
  // A partir daqui o que está cá e o que está lá é o mesmo, por isso a
  // "última alteração local" passa a ser esse mesmo momento.
  localStorage.setItem(KEY_LOCAL_CHANGE, savedAt);
}

function readTime(key) {
  return Date.parse(localStorage.getItem(key) || '') || 0;
}

function hasLocalProfiles() {
  try {
    const raw = localStorage.getItem('td_profiles_v1');
    return Boolean(raw && JSON.parse(raw).length);
  } catch (e) {
    return false;
  }
}

// ---------- Sincronização ----------

/**
 * Compara a cópia local com a da nuvem e envia ou traz, conforme o lado que
 * mudou desde a última sincronização deste telemóvel.
 * Devolve { action: 'uploaded' | 'downloaded' | 'conflict' | 'deferred' | 'none' }.
 */
export function syncNow(interactive = false) {
  if (!isConfigured()) return Promise.reject(new Error('not-configured'));
  if (syncInFlight) return syncInFlight;
  syncInFlight = doSync(interactive).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function doSync(interactive) {
  setStatus('syncing');

  try {
    await ensureToken(interactive);
  } catch (e) {
    // Sem token e sem poder perguntar: fica a pedir que voltem a ligar.
    setStatus('reconnect');
    throw new Error('needs-reconnect');
  }

  try {
    const remote = await downloadBackup();
    if (!remote) {
      await uploadBackup();
      pendingConflict = false;
      setStatus('ready');
      return { action: 'uploaded' };
    }

    const lastSync = readTime(KEY_LAST_SYNC);
    const localChange = readTime(KEY_LOCAL_CHANGE);
    const remoteAt = Date.parse(remote.savedAt || '') || 0;
    const remoteIsNew = remoteAt > lastSync;
    const localIsNew = localChange > lastSync;

    if (remoteIsNew && localIsNew) {
      if (lastSync === 0 && hasLocalProfiles()) {
        // Primeira vez neste telemóvel e já havia jogo feito dos dois lados.
        // Não decidimos por eles: perguntamos.
        pendingConflict = true;
        setStatus('ready');
        return { action: 'conflict', remoteSavedAt: remote.savedAt };
      }
      // Os dois lados mexeram desde a última sincronização. Ganha este
      // telemóvel: é onde a criança está a jogar agora, e perder o que
      // acabou de ganhar seria o pior que podia acontecer. A cópia da
      // nuvem continua acessível pelo botão "Restaurar".
      await uploadBackup();
      pendingConflict = false;
      setStatus('ready');
      return { action: 'uploaded' };
    }

    if (remoteIsNew) {
      if (!applyGuard()) {
        setStatus('ready');
        return { action: 'deferred' };
      }
      applyRemoteData(remote.data || {});
      markSynced(remote.savedAt);
      pendingConflict = false;
      setStatus('ready');
      emit({ type: 'data-replaced' });
      return { action: 'downloaded' };
    }

    if (localIsNew) {
      await uploadBackup();
      pendingConflict = false;
      setStatus('ready');
      return { action: 'uploaded' };
    }

    setStatus('ready');
    return { action: 'none' };
  } catch (e) {
    setStatus('error');
    throw e;
  }
}

/** Resposta do utilizador ao conflito da primeira ligação. */
export async function resolveConflict(choice) {
  pendingConflict = false;
  if (choice === 'remote') return restoreNow();
  await ensureToken(false);
  await uploadBackup();
  setStatus('ready');
  return { action: 'uploaded' };
}

/** Trazer a cópia da nuvem por cima do que está neste telemóvel. */
export async function restoreNow() {
  await ensureToken(false);
  const remote = await downloadBackup();
  if (!remote) throw new Error('no-backup-found');
  applyRemoteData(remote.data || {});
  markSynced(remote.savedAt);
  pendingConflict = false;
  setStatus('ready');
  emit({ type: 'data-replaced' });
  return { action: 'downloaded' };
}

// ---------- Arranque e sincronização automática ----------

function handleLocalChange() {
  localStorage.setItem(KEY_LOCAL_CHANGE, new Date().toISOString());
  if (!isEnabled()) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    syncNow(false).catch(() => {});
  }, BACKUP_DELAY_MS);
}

/** Se houver envio à espera, faz já — o jogo pode estar a ser fechado. */
function flushBackup() {
  if (!backupTimer) return;
  clearTimeout(backupTimer);
  backupTimer = null;
  syncNow(false).catch(() => {});
}

export function init() {
  onLocalChange(handleLocalChange);

  // Registados sempre, porque a conta pode ser ligada mais tarde, já com o
  // jogo aberto. Quem decide se há alguma coisa a fazer é o isEnabled().
  document.addEventListener('visibilitychange', () => {
    if (!isEnabled()) return;
    if (document.visibilityState === 'hidden') flushBackup();
    else syncNow(false).catch(() => {});
  });
  window.addEventListener('pagehide', () => {
    if (isEnabled()) flushBackup();
  });

  if (!isEnabled()) {
    setStatus('off');
    return;
  }
  syncNow(false).catch(() => {});
}
