import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
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

let secondaryAuthInstance: Auth | null = null;
function getSecondaryAuth(): Auth {
  if (secondaryAuthInstance) return secondaryAuthInstance;
  const existing = getApps().find((a) => a.name === 'staff-provisioner');
  const secApp = existing || initializeApp(firebaseConfig, 'staff-provisioner');
  try {
    secondaryAuthInstance = initializeAuth(secApp, {
      persistence: inMemoryPersistence,
    });
  } catch {
    secondaryAuthInstance = getAuth(secApp);
  }
  return secondaryAuthInstance;
}

export function normalizePhoneDigits(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `998${digits}`;
  return digits;
}

export function phoneToInternalEmail(phone: string): string {
  const digits = normalizePhoneDigits(phone);
  return digits ? `staff.${digits}@shubrend.internal` : '';
}

export function deriveFirebaseAuthPassword(phone: string, rawSecret: string): string {
  const digits = normalizePhoneDigits(phone);
  const secret = String(rawSecret || '').trim();
  // Deterministic high-entropy password >= 24 chars so even 4-digit PINs satisfy Firebase Auth minimum length
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const seed = `shu_brend_v1:${digits}:${secret}`;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i << 1);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hex1 = h1.toString(16).padStart(8, '0');
  const hex2 = h2.toString(16).padStart(8, '0');
  return `Sb!${hex1}${hex2}${digits.slice(-4) || '0000'}#${secret.length}`;
}

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

  if (low.includes('auth/invalid-credential') || low.includes('auth/wrong-password') || low.includes('auth/user-not-found')) {
    return lang === 'ru'
      ? 'Неверный номер телефона или пароль/PIN.'
      : "Telefon raqami yoki parol/PIN noto'g'ri.";
  }
  if (low.includes('auth/too-many-requests')) {
    return lang === 'ru'
      ? 'Слишком много попыток входа. Попробуйте через несколько минут.'
      : "Juda ko'p urinish. Bir necha daqiqadan so'ng qayta urinib ko'ring.";
  }
  if (low.includes('auth/operation-not-allowed')) {
    return lang === 'ru'
      ? 'В Firebase Authentication не включён вход по Email/Password.'
      : "Firebase Authentication'da Email/Password kirish usuli yoqilmagan.";
  }
  if (low.includes('auth/network-request-failed')) {
    return lang === 'ru'
      ? 'Ошибка сети при подключении к серверу. Проверьте интернет.'
      : "Internet aloqasi uzilgan. Server bilan bog'lanib bo'lmadi.";
  }
  if (low.includes('permission-denied') || low.includes('insufficient permissions') || low.includes('missing or insufficient')) {
    if (message.includes('Umumiy baza') || message.includes('ish maydoniga')) {
      return message;
    }
    const rawStr = error instanceof Error ? error.message.toLowerCase() : '';
    if (rawStr.includes('"path":"admins/') || rawStr.includes('"path":"userprofiles/')) {
      return lang === 'ru'
        ? 'Правила безопасности Firestore (firestore.rules) на сервере Firebase ещё не обновлены. Опубликуйте актуальный firestore.rules в Firebase Console.'
        : "Firebase serveridagi Firestore Security Rules hali yangilanmagan. Firebase Console orqali firestore.rules qoidalarini nashr qiling.";
    }
    return lang === 'ru'
      ? 'Недостаточно прав доступа в Firebase (Firestore Security Rules).'
      : "Ushbu amalni bulutga yozish uchun ruxsat yetarli emas. Administrator bilan bog'laning.";
  }
  if (low.includes('unavailable') || low.includes('client is offline') || low.includes('network')) {
    return lang === 'ru'
      ? 'Сервер временно недоступен. Изменения сохранены локально и синхронизируются при восстановлении связи.'
      : "Server bilan aloqa vaqtincha uzildi. O'zgarishlar qurilmada saqlandi va aloqa tiklanganda yuboriladi.";
  }
  if (low.includes('resource-exhausted')) {
    return lang === 'ru'
      ? 'Превышен лимит запросов или размер данных Firebase.'
      : "So'rovlar limiti yoki hujjat hajmi chegarasidan oshdi.";
  }
  if (message.trim()) return message;
  return lang === 'ru'
    ? 'Произошла ошибка подключения к облачной базе.'
    : "Bulutli baza bilan ishlashda xatolik yuz berdi.";
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

export async function signInStaffWithEmailPassword(
  email: string,
  password: string
): Promise<FirebaseUser> {
  const res = await signInWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function createStaffWithEmailPassword(
  email: string,
  password: string
): Promise<FirebaseUser> {
  const res = await createUserWithEmailAndPassword(auth, email, password);
  return res.user;
}

export async function provisionStaffAccountOnSecondaryApp(
  email: string,
  nextPassword: string,
  previousPasswords?: string | string[]
): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (!email || !nextPassword) {
    return { ok: false, code: 'invalid-input', error: 'Missing email or password' };
  }
  const candidates = (
    Array.isArray(previousPasswords)
      ? previousPasswords
      : previousPasswords
      ? [previousPasswords]
      : []
  ).filter((p) => Boolean(p) && p !== nextPassword);

  const secAuth = getSecondaryAuth();
  try {
    try {
      await createUserWithEmailAndPassword(secAuth, email, nextPassword);
      return { ok: true };
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/email-already-in-use') {
        for (const prev of candidates) {
          try {
            const cred = await signInWithEmailAndPassword(secAuth, email, prev);
            await updatePassword(cred.user, nextPassword);
            return { ok: true };
          } catch {
            // try next candidate
          }
        }
        // Account already exists in Auth; treat as provisioned unless explicitly blocked
        return { ok: true, code };
      }
      return {
        ok: false,
        code,
        error: formatFirebaseError(err, 'uz'),
      };
    }
  } finally {
    try {
      await signOut(secAuth);
    } catch {
      // ignore cleanup error
    }
  }
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

