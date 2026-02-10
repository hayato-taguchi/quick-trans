import type { GoogleUser } from '../types/google-user';

const STORAGE_KEYS = {
  accessToken: 'qtransGoogleAccessToken',
  user: 'qtransGoogleUser',
} as const;

const OAUTH_SCOPES = ['openid', 'profile', 'email'];

type AuthState = {
  accessToken: string | null;
  user: GoogleUser | null;
};

function getOauthClientId(): string {
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  if (!clientId) {
    throw new Error('manifest.json に oauth2.client_id が設定されていません。');
  }
  return clientId;
}

function buildAuthUrl(): string {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', getOauthClientId());
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));
  authUrl.searchParams.set('prompt', 'select_account');
  return authUrl.toString();
}

function parseAccessTokenFromRedirectUrl(redirectUrl: string): string {
  const hash = redirectUrl.split('#')[1];
  if (!hash) {
    throw new Error('アクセストークンの取得に失敗しました。');
  }
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (!token) {
    const error = params.get('error');
    if (error) {
      throw new Error(`Google認証エラー: ${error}`);
    }
    throw new Error('アクセストークンがレスポンスに含まれていません。');
  }
  return token;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUser> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`ユーザー情報取得に失敗しました: ${response.status}`);
  }
  return (await response.json()) as GoogleUser;
}

function storageGet<T>(keys: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(items as T);
    });
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(keys: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function loadAuthState(): Promise<AuthState> {
  const stored = await storageGet<{ [key: string]: unknown }>([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.user,
  ]);
  return {
    accessToken: (stored[STORAGE_KEYS.accessToken] as string | undefined) ?? null,
    user: (stored[STORAGE_KEYS.user] as GoogleUser | undefined) ?? null,
  };
}

export async function signInWithGoogle(): Promise<AuthState> {
  const authUrl = buildAuthUrl();
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });
  if (!redirectUrl) {
    throw new Error('認証がキャンセルされました。');
  }
  const accessToken = parseAccessTokenFromRedirectUrl(redirectUrl);
  const user = await fetchGoogleUserInfo(accessToken);
  await storageSet({
    [STORAGE_KEYS.accessToken]: accessToken,
    [STORAGE_KEYS.user]: user,
  });
  return { accessToken, user };
}

export async function signOutFromGoogle(): Promise<void> {
  const current = await loadAuthState();
  if (current.accessToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(current.accessToken)}`,
        { method: 'POST', headers: { 'Content-type': 'application/x-www-form-urlencoded' } }
      );
    } catch {
      // revoke失敗時もローカル状態は確実に破棄する
    }
  }
  await storageRemove([STORAGE_KEYS.accessToken, STORAGE_KEYS.user]);
}
