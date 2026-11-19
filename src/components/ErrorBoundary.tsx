import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FirestoreErrorInfo } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  firestoreInfo: FirestoreErrorInfo | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      firestoreInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsed: FirestoreErrorInfo | null = null;
    try {
      const candidate = JSON.parse(error.message) as FirestoreErrorInfo;
      if (candidate && typeof candidate.error === 'string' && 'operationType' in candidate) {
        parsed = candidate;
      }
    } catch {
      // plain runtime error
    }
    return {
      hasError: true,
      errorMessage: parsed ? parsed.error : error.message || "Noma'lum xatolik yuz berdi",
      firestoreInfo: parsed,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const isPermission =
      this.state.errorMessage.toLowerCase().includes('permission') ||
      this.state.errorMessage.toLowerCase().includes('insufficient');

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {isPermission
              ? "Ruxsat yetarli emas / Недостаточно прав"
              : "Tizimda xatolik yuz berdi / Произошла ошибка"}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {isPermission
              ? "Ushbu amal yoki ma'lumotlarga kirish uchun sizning rolingizda ruxsat yo'q. Administratorga murojaat qiling."
              : this.state.errorMessage}
          </p>
          {this.state.firestoreInfo && (
            <div className="text-[11px] font-mono text-left bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-500 overflow-x-auto">
              <div>Op: {this.state.firestoreInfo.operationType}</div>
              {this.state.firestoreInfo.path && <div>Path: {this.state.firestoreInfo.path}</div>}
            </div>
          )}
          <div className="flex gap-2 justify-center pt-1">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '', firestoreInfo: null })}
              className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Orqaga qaytish
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Qayta yuklash</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
