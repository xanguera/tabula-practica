// ---------- Sincronização com o Google Drive do próprio jogador ----------
// Tudo corre no browser: os dados vão diretamente do telemóvel para o
// Google Drive da conta que a criança/pais escolherem, usando OAuth do
// Google. Não há nenhum servidor do autor do jogo envolvido — os dados
// nunca passam por nós, só entre este site e o Google.
//
// Guarda-se um único ficheiro JSON (ver BACKUP_FILE_NAME) no Drive do
// utilizador, com uma cópia de tudo o que está guardado localmente
// (perfis, progresso, testes de avaliação, sequência de revisão).
import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE, BACKUP_FILE_NAME } from './config.js';

const STORAGE_PREFIXES = ['td_profiles_v1', 'td_active_profile_v1', 'td_progress_v1_', 'td_assessments_v1_', 'td_review_v1_'];
const KEY_FILE_ID = 'td_drive_file_id_v1';
const KEY_LAST_SYNC = 'td_last_sync_v1';

let accessToken = null;
let tokenClient = null;
let gisLoadPromise = null;

export function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID);
}

export function isSignedIn() {
  return Boolean(accessToken);
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

export async function signIn() {
  if (!isConfigured()) throw new Error('not-configured');
  await loadGis();

  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: () => {}, // substituído a cada pedido, ver abaixo
    });
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      accessToken = response.access_token;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  if (accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${accessToken}`, ...extra };
}

async function findBackupFileId() {
  const cached = localStorage.getItem(KEY_FILE_ID);
  if (cached) return cached;

  const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('drive-list-failed');
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    localStorage.setItem(KEY_FILE_ID, data.files[0].id);
    return data.files[0].id;
  }
  return null;
}

async function createBackupFile() {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: BACKUP_FILE_NAME, mimeType: 'application/json' }),
  });
  if (!res.ok) throw new Error('drive-create-failed');
  const data = await res.json();
  localStorage.setItem(KEY_FILE_ID, data.id);
  return data.id;
}

function gatherLocalData() {
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (STORAGE_PREFIXES.some((p) => key === p || key.startsWith(p))) {
      dump[key] = localStorage.getItem(key);
    }
  }
  return dump;
}

function applyRemoteData(dump) {
  Object.keys(dump).forEach((key) => {
    if (STORAGE_PREFIXES.some((p) => key === p || key.startsWith(p))) {
      localStorage.setItem(key, dump[key]);
    }
  });
}

export async function backupNow() {
  if (!isSignedIn()) throw new Error('not-signed-in');
  let fileId = await findBackupFileId();
  if (!fileId) fileId = await createBackupFile();

  const payload = { savedAt: new Date().toISOString(), data: gatherLocalData() };
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('drive-upload-failed');

  localStorage.setItem(KEY_LAST_SYNC, new Date().toISOString());
  return true;
}

export async function restoreNow() {
  if (!isSignedIn()) throw new Error('not-signed-in');
  const fileId = await findBackupFileId();
  if (!fileId) throw new Error('no-backup-found');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('drive-download-failed');
  const payload = await res.json();
  applyRemoteData(payload.data || {});

  localStorage.setItem(KEY_LAST_SYNC, new Date().toISOString());
  return true;
}
