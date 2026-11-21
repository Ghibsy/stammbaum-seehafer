import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser';

/**
 * Anmeldung mit privatem Microsoft-Konto (MSAL, Authorization Code + PKCE, kein Geheimnis).
 * Berechtigung nur für den App-Ordner: OneDrive/Apps/Stammbaum Seehafer/.
 */
export const SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read'];

const CLIENT_ID_KEY = 'stammbaum.clientId';

export function getClientId(): string {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || import.meta.env.VITE_MSAL_CLIENT_ID || '';
  } catch {
    return import.meta.env.VITE_MSAL_CLIENT_ID || '';
  }
}

export function setClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim());
  pca = undefined;
}

let pca: PublicClientApplication | undefined;
let initPromise: Promise<PublicClientApplication | undefined> | undefined;

export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).toString();
}

async function client(): Promise<PublicClientApplication | undefined> {
  const clientId = getClientId();
  if (!clientId) return undefined;
  if (pca) return pca;
  if (!initPromise) {
    initPromise = (async () => {
      const config: Configuration = {
        auth: {
          clientId,
          authority: 'https://login.microsoftonline.com/consumers',
          redirectUri: redirectUri(),
          postLogoutRedirectUri: redirectUri(),
        },
        cache: { cacheLocation: 'localStorage' },
      };
      const app = new PublicClientApplication(config);
      await app.initialize();
      const res = await app.handleRedirectPromise().catch((e) => {
        console.warn('Anmeldung fehlgeschlagen', e);
        return null;
      });
      if (res?.account) app.setActiveAccount(res.account);
      else if (!app.getActiveAccount() && app.getAllAccounts()[0]) app.setActiveAccount(app.getAllAccounts()[0]);
      pca = app;
      return app;
    })().finally(() => {
      initPromise = undefined;
    });
  }
  return initPromise;
}

export async function initAuth(): Promise<AccountInfo | null> {
  const app = await client();
  return app?.getActiveAccount() ?? null;
}

export async function account(): Promise<AccountInfo | null> {
  const app = await client();
  return app?.getActiveAccount() ?? null;
}

export async function login() {
  const app = await client();
  if (!app) throw new Error('Keine Client-ID eingetragen (Einstellungen → Microsoft-Anmeldung).');
  await app.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

/** Meldet nur auf diesem Gerät ab (Microsoft-Sitzung im Browser bleibt bestehen). */
export async function logoutLocal() {
  const app = await client();
  if (!app) return;
  const acc = app.getActiveAccount();
  await app.clearCache({ account: acc ?? undefined });
}

export class LoginRequired extends Error {
  constructor() {
    super('Anmeldung erforderlich');
  }
}

export async function getToken(): Promise<string> {
  const app = await client();
  const acc = app?.getActiveAccount();
  if (!app || !acc) throw new LoginRequired();
  try {
    const r = await app.acquireTokenSilent({ scopes: SCOPES, account: acc });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) throw new LoginRequired();
    throw e;
  }
}
