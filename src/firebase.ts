import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  Firestore,
  FirestoreSettings,
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const isBrowser = typeof window !== 'undefined';
const baseFirestoreSettings: FirestoreSettings = {
  ignoreUndefinedProperties: true,
  ...(isBrowser
    ? {
        experimentalAutoDetectLongPolling: true,
      }
    : {}),
};

let firestoreInstance: Firestore;
try {
  // Offline persistence & queue are handled by LocalIndexedDBRepository;
  // memoryLocalCache avoids multi-tab IndexedDB targetId (ca9/b815) desyncs across reloads.
  firestoreInstance = initializeFirestore(
    app,
    {
      ...baseFirestoreSettings,
      localCache: memoryLocalCache(),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const firestoreDb: Firestore = firestoreInstance;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  const serialized = JSON.stringify(errInfo);
  console.error('Firestore Error: ', serialized);
  throw new Error(serialized);
}

export async function ensureFirestoreNetwork(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await enableNetwork(firestoreDb);
  } catch {
    // ignore transient enableNetwork issues
  }
}

function extractRawErrorMessage(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const codeProp =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed && typeof parsed.error === 'string') {
      return { code: codeProp, message: parsed.error };
    }
  } catch {
    // not JSON
  }
  return { code: codeProp, message: raw };
}

export function formatFirebaseError(error: unknown, lang: 'uz' | 'ru' = 'uz'): string {
  const { code, message } = extractRawErrorMessage(error);
  const low = `${code} ${message}`.toLowerCase();

  if (low.includes('auth/unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return lang === 'ru'
      ? `Домен (${host}) не добавлен в Firebase Authentication -> Authorized domains.`
      : `Ushbu domen (${host}) Firebase Authentication -> Authorized domains ro'yxatiga kiritilmagan.`;
  }
  if (low.includes('auth/popup-blocked')) {
    return lang === 'ru'
      ? 'Браузер заблокировал всплывающее окно Google входа. Разрешите всплывающие окна.'
      : "Brauzer Google kirish oynasini blokladi. Qalqib chiquvchi oynalarga (Pop-up) ruxsat bering.";
  }
  if (low.includes('auth/popup-closed-by-user') || low.includes('auth/cancelled-popup-request')) {
    return lang === 'ru'
      ? 'Окно входа через Google было закрыто.'
      : "Google orqali kirish oynasi yopildi.";
  }
  if (low.includes('auth/operation-not-allowed')) {
    return lang === 'ru'
      ? 'В Firebase Console не включён Google Sign-In.'
      : "Firebase Console'da Google orqali kirish (Sign-in provider) yoqilmagan.";
  }
  if (low.includes('auth/network-request-failed')) {
    return lang === 'ru'
      ? 'Ошибка сети при подключении к Google/Firebase. Проверьте интернет.'
      : "Internet aloqasi uzilgan. Google/Firebase bilan bog'lanib bo'lmadi.";
  }
  if (low.includes('permission-denied') || low.includes('insufficient permissions') || low.includes('missing or insufficient')) {
    if (message.includes('Google hisobingiz') || message.includes('Umumiy baza')) {
      return message;
    }
    return lang === 'ru'
      ? 'Недостаточно прав доступа в Firebase (Firestore Security Rules).'
      : "Firebase ma'lumotlar bazasiga yozish/o'qish uchun ruxsat yetarli emas.";
  }
  if (low.includes('unavailable') || low.includes('client is offline') || low.includes('network')) {
    return lang === 'ru'
      ? 'Сервер Firebase временно недоступен. Изменения сохранены локально и синхронизируются при восстановлении связи.'
      : "Firebase serveri bilan aloqa vaqtincha uzildi. O'zgarishlar qurilmada saqlandi va aloqa tiklanganda yuboriladi.";
  }
  if (low.includes('resource-exhausted')) {
    return lang === 'ru'
      ? 'Превышен лимит запросов или размер данных Firebase.'
      : "Firebase so'rovlar limiti yoki hujjat hajmi chegarasidan oshdi.";
  }
  if (message.trim()) return message;
  return lang === 'ru'
    ? 'Произошла ошибка подключения к облачной базе Firebase.'
    : "Firebase bulutli bazasi bilan ishlashda xatolik yuz berdi.";
}

export const formatFirebaseErrorMessage = formatFirebaseError;

export async function probeFirestoreConnection(
  lang: 'uz' | 'ru' = 'uz'
): Promise<{ ok: boolean; error?: string; code?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      code: 'offline',
      error:
        lang === 'ru'
          ? 'Нет подключения к интернету (офлайн).'
          : 'Internet aloqasi mavjud emas (oflayn rejim).',
    };
  }

  const probe = async () => {
    await ensureFirestoreNetwork();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('firestore-probe-timeout')), 8000);
    });
    await Promise.race([
      getDocFromServer(doc(firestoreDb, 'test', 'connection')),
      timeoutPromise,
    ]);
  };

  try {
    await probe();
    return { ok: true };
  } catch (error) {
    const { code, message } = extractRawErrorMessage(error);
    const low = `${code} ${message}`.toLowerCase();
    // Unauthenticated permission-denied on /test/connection still proves server reachability
    if (low.includes('permission-denied') || low.includes('missing or insufficient')) {
      return { ok: true };
    }
    if (low.includes('the client is offline') || low.includes('unavailable') || low.includes('timeout')) {
      await new Promise((r) => setTimeout(r, 900));
      try {
        await probe();
        return { ok: true };
      } catch (retryErr) {
        const retryInfo = extractRawErrorMessage(retryErr);
        const retryLow = `${retryInfo.code} ${retryInfo.message}`.toLowerCase();
        if (retryLow.includes('permission-denied') || retryLow.includes('missing or insufficient')) {
          return { ok: true };
        }
        return {
          ok: false,
          code: retryInfo.code || 'unavailable',
          error: formatFirebaseError(retryErr, lang),
        };
      }
    }
    return {
      ok: false,
      code: code || 'unknown',
      error: formatFirebaseError(error, lang),
    };
  }
}

export async function testConnection(): Promise<boolean> {
  const res = await probeFirestoreConnection('uz');
  if (!res.ok) {
    console.error('Please check your Firebase configuration or network connection.');
  }
  return res.ok;
}

export async function signInWithGooglePopup(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    // ignore signout network issues
  }
}

export function watchAuthState(cb: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

