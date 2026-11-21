import React, { useState } from 'react';
import { Phone, Lock, Eye, EyeOff, ArrowRight, Globe, Sun, Moon, Store as StoreIcon, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useT } from '../i18n';
import { PWAInstallButton } from './PWAInstallButton';

export const AuthScreen: React.FC<{ onOpenCatalog?: () => void }> = ({ onOpenCatalog }) => {
  const loginWithPhone = useAppStore((s) => s.loginWithPhone);
  const cloudError = useAppStore((s) => s.cloudError);
  const clearCloudError = useAppStore((s) => s.clearCloudError);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const t = useT();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    clearCloudError();
    setSubmitting(true);
    try {
      const ok = await loginWithPhone(phone.trim(), password.trim());
      if (!ok) {
        const latestCloudError = useAppStore.getState().cloudError;
        setError(latestCloudError || t.auth.invalidCredentials);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between p-4 md:p-8">
      <div className="flex items-center justify-between max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <img
            src="/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg"
            alt="SHU BREND OMBOR"
            className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shadow-xs"
          />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            SHU BREND OMBOR
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCatalog && (
            <button
              type="button"
              onClick={onOpenCatalog}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <StoreIcon className="w-3.5 h-3.5" />
              <span>{t.nav.storefront}</span>
            </button>
          )}
          <PWAInstallButton />
          <button
            type="button"
            onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{language.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="w-full max-w-md mx-auto my-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <img
              src="/assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg"
              alt="SHU BREND OMBOR"
              className="w-16 h-16 rounded-2xl mx-auto object-cover border border-slate-200 dark:border-slate-800 shadow-xs"
            />
            <p className="text-xs font-medium text-teal-700 dark:text-teal-400 pt-1">
              {language === 'uz' ? 'Chakana savdo va ombor platformasi' : 'Платформа розничной торговли и склада'}
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {t.auth.loginTitle}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t.auth.loginSubtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.auth.phone}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="+998 XX XXX XX XX"
                  autoComplete="tel"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t.auth.passwordOrPin}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="•••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Parolni ko'rsatish"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {(error || (cloudError && cloudError !== error)) && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
                {error || cloudError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{t.auth.signIn}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="text-center text-xs text-slate-400 dark:text-slate-600">
        SHU BREND OMBOR · {language === 'uz' ? "O'zbekiston chakana savdo tizimi" : 'Система розничной торговли'}
      </div>
    </div>
  );
};
