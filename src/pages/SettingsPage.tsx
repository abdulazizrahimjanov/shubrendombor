import React, { useEffect, useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  Plus,
  Check,
  Trash2,
  Edit3,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
  X,
  Save,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { useT } from '../i18n';
import { repository } from '../data/repository';
import { AppSettings, Permission, PaymentMethod, Role, RoleId, Store } from '../types/models';

const STORE_COLORS = ['#2563EB', '#16A34A', '#9333EA', '#EA580C', '#0D9488', '#DB2777'];

export const SettingsPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const upsertStore = useAppStore((s) => s.upsertStore);
  const deleteStore = useAppStore((s) => s.deleteStore);
  const upsertWarehouse = useAppStore((s) => s.upsertWarehouse);
  const updateRolePermissions = useAppStore((s) => s.updateRolePermissions);
  const upsertRole = useAppStore((s) => s.upsertRole);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const updateUserCredentials = useAppStore((s) => s.updateUserCredentials);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const clearAllTestData = useAppStore((s) => s.clearAllTestData);
  const importBackupJson = useAppStore((s) => s.importBackupJson);
  const migrateLocalDataToCloud = useAppStore((s) => s.migrateLocalDataToCloud);
  const cloudConnected = useAppStore((s) => s.cloudConnected);
  const isOnline = useAppStore((s) => s.isOnline);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const [tab, setTab] = useState<'general' | 'stores' | 'security' | 'receipts' | 'roles' | 'integrations' | 'backup' | 'plan'>('general');

  // Stores state
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddr, setNewStoreAddr] = useState('');
  const [newStorePhone, setNewStorePhone] = useState('+998 71 200 00 00');
  const [newStoreColor, setNewStoreColor] = useState('#2563EB');
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [deleteStoreTarget, setDeleteStoreTarget] = useState<Store | null>(null);

  // Security (Own & Staff Password/PIN)
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPin, setNewPin] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [staffNewPass, setStaffNewPass] = useState('');
  const [staffNewPin, setStaffNewPin] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);

  // Integrations draft state
  const [integDraft, setIntegDraft] = useState<AppSettings['integrations'] | null>(null);

  // Clear all confirmation modal
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [migratingCloud, setMigratingCloud] = useState(false);

  // Roles CRUD state
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleBaseId, setNewRoleBaseId] = useState<string>('cashier');
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<Role | null>(null);

  useEffect(() => {
    if (db) {
      setIntegDraft(structuredClone(db.settings.integrations));
      if (!selectedUserId && db.users[0]) {
        setSelectedUserId(db.users[0].id);
      }
      if (currentUser && !newPin) {
        setNewPin(currentUser.pin);
      }
    }
  }, [db, currentUser, selectedUserId, newPin]);

  if (!db) return null;

  const s = db.settings;
  const activeInteg = integDraft ?? s.integrations;

  const handleDownloadBackup = () => {
    const json = repository.exportJson(db);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shu-brend-ombor-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Zaxira nusxa yuklandi', 'success');
  };

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await importBackupJson(text);
      if (res.syncedToCloud) {
        notify(
          `Zaxira tiklandi: ${res.uploadedCount} ta yozuv bulutga yuklandi${
            res.skippedDuplicates > 0 ? ` (${res.skippedDuplicates} ta takroriy o'tkazildi)` : ''
          }`,
          'success'
        );
      } else {
        notify("Zaxira qurilmada tiklandi. Internetga ulanganda avtomatik sinxronlanadi", 'info');
      }
    } catch {
      notify("Fayl formati noto'g'ri", 'error');
    } finally {
      e.target.value = '';
    }
  };

  const togglePermission = async (roleId: RoleId, perm: Permission) => {
    const role = db.roles.find((r) => r.id === roleId);
    if (!role) return;
    const has = role.permissions.includes(perm);
    const next = has ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    await updateRolePermissions(roleId, next);
  };

  const generateApiKey = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = 'sbo_live_';
    for (let i = 0; i < 32; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
    setIntegDraft({ ...activeInteg, externalApiKey: token });
  };

  const copyText = (txt?: string) => {
    if (!txt) return;
    navigator.clipboard?.writeText(txt);
    notify('Buferga nusxalandi', 'info');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ['general', t.settings.generalCurrency],
            ['stores', t.settings.storesWarehouses],
            ['security', 'Parol va PIN'],
            ['integrations', 'API va Integratsiyalar'],
            ['receipts', t.settings.receiptLabels],
            ['roles', t.settings.rolesPermissions],
            ['backup', t.settings.backupData],
            ['plan', t.settings.subscription],
          ] as [typeof tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${
              tab === id
                ? 'bg-teal-700 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4 max-w-2xl text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-500 mb-1">Brend nomi</label>
              <input
                value={s.brandName}
                onChange={(e) => updateSettings({ brandName: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Til (Language)</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'uz' | 'ru')}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="uz">O'zbekcha (Lotin)</option>
                <option value="ru">Русский</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">USD kursi (so'm)</label>
              <input
                type="number"
                value={s.usdRate}
                onChange={(e) => updateSettings({ usdRate: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Chegirma menejer tasdig'i (%)</label>
              <input
                type="number"
                value={s.discountApprovalThresholdPercent}
                onChange={(e) => updateSettings({ discountApprovalThresholdPercent: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.showUsdOption}
                onChange={(e) => updateSettings({ showUsdOption: e.target.checked })}
              />
              <span>Summalar yonida USD ekvivalentini ko'rsatish</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.vatEnabled}
                onChange={(e) => updateSettings({ vatEnabled: e.target.checked })}
              />
              <span>QQS (12% VAT) hisoblashni yoqish</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={s.allowNegativeStock}
                onChange={(e) => updateSettings({ allowNegativeStock: e.target.checked })}
              />
              <span>Qoldiq 0 bo'lganda ham sotishga ruxsat berish (minus qoldiq)</span>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              Yoqilgan to'lov turlari (To'lov ekranida ko'rinadi)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(
                ['cash', 'card', 'uzcard', 'humo', 'visa', 'mastercard', 'unionpay', 'click', 'payme', 'uzum', 'transfer', 'debt'] as PaymentMethod[]
              ).map((m) => {
                const enabled = s.enabledPaymentMethods.includes(m);
                return (
                  <label
                    key={m}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                      enabled
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => {
                        const next = enabled
                          ? s.enabledPaymentMethods.filter((x) => x !== m)
                          : [...s.enabledPaymentMethods, m];
                        if (next.length === 0) return;
                        updateSettings({ enabledPaymentMethods: next });
                      }}
                    />
                    <span className="font-semibold">{t.pos.methods[m]}</span>
                  </label>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Stores / Branches Management (Add, Edit, Delete) */}
      {tab === 'stores' && (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="font-bold text-sm">Yangi filial (do'kon va ombor) qo'shish</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="Filial nomi (masalan: Yunusobod)"
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <input
                value={newStoreAddr}
                onChange={(e) => setNewStoreAddr(e.target.value)}
                placeholder="Manzil"
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <input
                value={newStorePhone}
                onChange={(e) => setNewStorePhone(e.target.value)}
                placeholder="Telefon"
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Filial rangi:</span>
                {STORE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewStoreColor(c)}
                    className={`w-6 h-6 rounded-full border-2 ${newStoreColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!newStoreName.trim()) {
                    notify('Filial nomini kiriting', 'error');
                    return;
                  }
                  const nowIso = new Date().toISOString();
                  const sId = uid('store');
                  const wId = uid('wh');
                  const nextCode = String(db.stores.length + 1).padStart(2, '0');
                  await upsertWarehouse({
                    id: wId,
                    name: `${newStoreName.trim()} Ombori`,
                    address: newStoreAddr.trim(),
                    isMain: false,
                    storeId: sId,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    createdBy: currentUser?.id ?? 'usr-owner',
                  });
                  await upsertStore({
                    id: sId,
                    name: newStoreName.trim(),
                    address: newStoreAddr.trim() || "Toshkent sh.",
                    phone: newStorePhone.trim() || '+998 71 200 00 00',
                    isActive: true,
                    defaultWarehouseId: wId,
                    storeCode: nextCode,
                    color: newStoreColor,
                    storeId: sId,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    createdBy: currentUser?.id ?? 'usr-owner',
                  });
                  setNewStoreName('');
                  setNewStoreAddr('');
                  notify("Yangi filial va ombor yaratildi", 'success');
                }}
                className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Filial qo'shish</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {db.stores.map((st) => (
              <div
                key={st.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs flex items-start justify-between gap-2.5"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: st.color || '#2563EB' }}
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <span className="truncate">{st.name}</span>
                      {st.storeCode && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-500">
                          #{st.storeCode}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 mt-1">{st.address}</div>
                    <div className="font-mono text-slate-400 mt-0.5">{st.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingStore(structuredClone(st))}
                    title="Tahrirlash"
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {db.stores.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDeleteStoreTarget(st)}
                      title="Filialni o'chirish"
                      className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security: Admin/User Password & PIN Change */}
      {tab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl text-xs">
          {/* Own Password & PIN */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!currentUser) return;
              const res = await updateUserCredentials(currentUser.id, {
                currentPassword: curPass,
                newPassword: newPass.trim() ? newPass : undefined,
                newPin: newPin.trim() ? newPin : undefined,
              });
              if (!res.ok) {
                notify(res.error || 'Xatolik', 'error');
                return;
              }
              setCurPass('');
              setNewPass('');
              notify("Shaxsiy parol va PIN-kod yangilandi", 'success');
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 font-display font-bold text-sm">
              <Lock className="w-4 h-4 text-teal-700" />
              <span>Joriy akkaunt paroli va PIN-kodi ({currentUser?.name})</span>
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Joriy parol *</label>
              <input
                type="password"
                required
                value={curPass}
                onChange={(e) => setCurPass(e.target.value)}
                placeholder="••••••"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Yangi parol</label>
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="O'zgartirmaslik uchun bo'sh qoldiring"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Yangi PIN-kod (4–6 raqam)</label>
              <input
                maxLength={6}
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tracking-widest"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Saqlash</span>
            </button>
          </form>

          {/* Admin Reset Any User Password & PIN */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedUserId) return;
              const res = await updateUserCredentials(selectedUserId, {
                newPassword: staffNewPass.trim() ? staffNewPass : undefined,
                newPin: staffNewPin.trim() ? staffNewPin : undefined,
              });
              if (!res.ok) {
                notify(res.error || 'Xatolik', 'error');
                return;
              }
              setStaffNewPass('');
              setStaffNewPin('');
              notify("Tanlangan foydalanuvchi parol/PINi yangilandi", 'success');
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 font-display font-bold text-sm">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span>Admin / Xodim parol va PIN-kodini almashtirish</span>
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Foydalanuvchini tanlang</label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  const uidVal = e.target.value;
                  setSelectedUserId(uidVal);
                  const found = db.users.find((u) => u.id === uidVal);
                  setStaffNewPin(found?.pin ?? '');
                  setStaffNewPass('');
                }}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                {db.users.map((u) => {
                  const roleObj = db.roles.find((r) => r.id === u.roleId);
                  const roleLabel = roleObj
                    ? (language === 'ru' ? roleObj.nameRu : roleObj.nameUz)
                    : t.auth.roles[u.roleId as keyof typeof t.auth.roles] ?? u.roleId;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} ({roleLabel}) — PIN: {u.pin}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Yangi parol</label>
              <input
                type="text"
                value={staffNewPass}
                onChange={(e) => setStaffNewPass(e.target.value)}
                placeholder="Yangi parol (kamida 4 belgi)"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-500 mb-1">Yangi PIN-kod (4–6 raqam)</label>
              <input
                maxLength={6}
                inputMode="numeric"
                value={staffNewPin}
                onChange={(e) => setStaffNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="•••••"
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tracking-widest"
              />
            </div>
            <button
              type="submit"
              className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Yangilash</span>
            </button>
          </form>
        </div>
      )}

      {/* API Keys & Integrations */}
      {tab === 'integrations' && (
        <div className="space-y-4 max-w-4xl text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
            <div>
              <div className="font-display font-bold text-sm">API kalitlar va tashqi integratsiyalar</div>
              <div className="text-slate-500">Fiskal modul, to'lov tizimlari, SMS, Telegram bot va tashqi ERP/Webhook API kalitlarini sozlang.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSecrets((v) => !v)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 font-medium inline-flex items-center gap-1.5"
              >
                {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showSecrets ? 'Yashirish' : "Ko'rsatish"}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updateSettings({ integrations: activeInteg });
                  notify('API kalitlari saqlandi', 'success');
                }}
                className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Saqlash</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* External ERP / Webhook API */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-sm">Tashqi API va Webhook (1C / Sayt / ERP)</div>
              <div>
                <label className="block text-slate-500 mb-1">API Kalit (Secret Key)</label>
                <div className="flex gap-1.5">
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={activeInteg.externalApiKey ?? ''}
                    onChange={(e) => setIntegDraft({ ...activeInteg, externalApiKey: e.target.value })}
                    placeholder="sbo_live_..."
                    className="flex-1 h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                  />
                  <button
                    type="button"
                    onClick={generateApiKey}
                    title="Yangi API kalit generatsiya qilish"
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(activeInteg.externalApiKey)}
                    title="Nusxalash"
                    className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Webhook URL (Sotuv / Qoldiq hodisalari)</label>
                <input
                  value={activeInteg.externalWebhookUrl ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, externalWebhookUrl: e.target.value })}
                  placeholder="https://api.sizning-sayt.uz/webhook/ombor"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
            </div>

            {/* Online-NKM / OFD */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-sm">Online-NKM / OFD (Multikassa, E-POS)</div>
              <select
                value={activeInteg.fiscalProvider}
                onChange={(e) =>
                  setIntegDraft({
                    ...activeInteg,
                    fiscalProvider: e.target.value as AppSettings['integrations']['fiscalProvider'],
                  })
                }
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="none">Ulanmagan</option>
                <option value="multikassa">Multikassa OFD</option>
                <option value="epos">E-POS / Soliq.uz</option>
              </select>
              <input
                value={activeInteg.ofdMerchantId ?? ''}
                onChange={(e) => setIntegDraft({ ...activeInteg, ofdMerchantId: e.target.value })}
                placeholder="OFD Terminal / Kassa ID"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
              <input
                type={showSecrets ? 'text' : 'password'}
                value={activeInteg.ofdApiKey ?? ''}
                onChange={(e) => setIntegDraft({ ...activeInteg, ofdApiKey: e.target.value })}
                placeholder="OFD API Token / Key"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>

            {/* Click / Payme / Uzum */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-sm">To'lov tizimlari (Click, Payme, Uzum)</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={activeInteg.clickMerchantId ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, clickMerchantId: e.target.value })}
                  placeholder="Click Merchant ID"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={activeInteg.clickSecretKey ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, clickSecretKey: e.target.value })}
                  placeholder="Click Secret Key"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
                <input
                  value={activeInteg.paymeMerchantId ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, paymeMerchantId: e.target.value })}
                  placeholder="Payme Merchant ID"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={activeInteg.paymeSecretKey ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, paymeSecretKey: e.target.value })}
                  placeholder="Payme Secret Key"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={activeInteg.uzumApiKey ?? ''}
                onChange={(e) => setIntegDraft({ ...activeInteg, uzumApiKey: e.target.value })}
                placeholder="Uzum Bank / Nasiya API Key"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>

            {/* SMS & Telegram Bot */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="font-bold text-sm">SMS (Eskiz.uz) va Telegram Bot</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={activeInteg.smsLogin ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, smsLogin: e.target.value })}
                  placeholder="Eskiz.uz Email / Login"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={activeInteg.smsApiKey ?? ''}
                  onChange={(e) => setIntegDraft({ ...activeInteg, smsApiKey: e.target.value })}
                  placeholder="SMS API Token"
                  className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
              <input
                type={showSecrets ? 'text' : 'password'}
                value={activeInteg.telegramBotToken ?? ''}
                onChange={(e) =>
                  setIntegDraft({
                    ...activeInteg,
                    telegramBotToken: e.target.value,
                    telegramBotConfigured: Boolean(e.target.value.trim()),
                  })
                }
                placeholder="Telegram Bot Token (123456:ABC...)"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
              <input
                type={showSecrets ? 'text' : 'password'}
                value={activeInteg.marketplaceApiKey ?? ''}
                onChange={(e) => setIntegDraft({ ...activeInteg, marketplaceApiKey: e.target.value })}
                placeholder="Uzum Market Seller API Key"
                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'receipts' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 max-w-xl text-xs">
          <div>
            <label className="block font-medium text-slate-500 mb-1">Chek kengligi</label>
            <select
              value={s.receiptWidth}
              onChange={(e) => updateSettings({ receiptWidth: e.target.value as '58mm' | '80mm' })}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            >
              <option value="58mm">58 mm (Mini printer)</option>
              <option value="80mm">80 mm (Standart POS)</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-500 mb-1">Chek sarlavhasi (Header)</label>
            <textarea
              rows={3}
              value={s.receiptHeader}
              onChange={(e) => updateSettings({ receiptHeader: e.target.value })}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-500 mb-1">Chek pastki matni (Footer)</label>
            <textarea
              rows={2}
              value={s.receiptFooter}
              onChange={(e) => updateSettings({ receiptFooter: e.target.value })}
              className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.showReceiptQr}
              onChange={(e) => updateSettings({ showReceiptQr: e.target.checked })}
            />
            <span>Chekda QR-kod ko'rsatish</span>
          </label>
        </div>
      )}

      {tab === 'roles' && (
        <div className="space-y-4">
          {/* Create New Role & Quick Role Cards */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="font-display font-bold text-sm">Yangi rol yaratish</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Rol nomi (masalan: Sotuvchi-konsultant)"
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <select
                value={newRoleBaseId}
                onChange={(e) => setNewRoleBaseId(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              >
                <option value="empty">Bo'sh ruxsatlar bilan</option>
                {db.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    Shablon: {language === 'ru' ? r.nameRu : r.nameUz}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  const clean = newRoleName.trim();
                  if (!clean) {
                    notify('Rol nomini kiriting', 'error');
                    return;
                  }
                  const baseRole = db.roles.find((r) => r.id === newRoleBaseId);
                  await upsertRole({
                    id: uid('role'),
                    nameUz: clean,
                    nameRu: clean,
                    permissions: baseRole ? [...baseRole.permissions] : ['view_dashboard', 'use_pos', 'view_catalog'],
                  });
                  setNewRoleName('');
                  notify(`"${clean}" roli yaratildi`, 'success');
                }}
                className="h-10 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Rol qo'shish</span>
              </button>
            </div>

            {/* Roles summary list with Edit & Delete */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {db.roles.map((r) => {
                const usersCount = db.users.filter((u) => u.roleId === r.id).length;
                return (
                  <div
                    key={r.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {language === 'ru' ? r.nameRu : r.nameUz}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.permissions.length} ta ruxsat · {usersCount} ta xodim
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingRole(structuredClone(r))}
                        title="Rolni tahrirlash"
                        className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {r.id !== 'owner' && db.roles.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setDeleteRoleTarget(r)}
                          title="Rolni o'chirish"
                          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <th className="py-2.5 px-3">Ruxsat</th>
                  {db.roles.map((r) => (
                    <th key={r.id} className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <span>{language === 'ru' ? r.nameRu : r.nameUz}</span>
                        <button
                          type="button"
                          onClick={() => setEditingRole(structuredClone(r))}
                          className="p-0.5 text-slate-400 hover:text-blue-600"
                          title="Nomini tahrirlash"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        {r.id !== 'owner' && db.roles.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setDeleteRoleTarget(r)}
                            className="p-0.5 text-slate-400 hover:text-red-600"
                            title="Rolni o'chirish"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(
                  [
                    'view_dashboard',
                    'view_profit_cost',
                    'use_pos',
                    'apply_big_discount',
                    'process_returns',
                    'manage_shifts',
                    'view_catalog',
                    'edit_catalog',
                    'bulk_edit_prices',
                    'view_inventory',
                    'manage_inventory',
                    'view_customers',
                    'manage_customers',
                    'manage_debts',
                    'view_finance',
                    'manage_finance',
                    'view_employees',
                    'manage_employees',
                    'view_reports',
                    'manage_online_orders',
                    'manage_settings',
                    'view_audit_log',
                  ] as Permission[]
                ).map((perm) => (
                  <tr key={perm}>
                    <td className="py-2 px-3 font-mono">{perm}</td>
                    {db.roles.map((r) => (
                      <td key={r.id} className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={r.permissions.includes(perm)}
                          disabled={r.id === 'owner'}
                          onChange={() => togglePermission(r.id, perm)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backup, Demo Restore & Clear All Test Data */}
      {tab === 'backup' && (
        <div className="space-y-4 max-w-xl text-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <p className="text-slate-500">
              Barcha ma'lumotlar qurilmangizda (IndexedDB) saqlanadi. Istalgan vaqtda JSON zaxira nusxasini yuklab olishingiz yoki demo ma'lumotlarni tiklashingiz mumkin.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="h-10 px-4 rounded-lg bg-teal-700 text-white font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>JSON Zaxira yuklash</span>
              </button>
              <label className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>JSON dan tiklash</span>
                <input type="file" accept=".json" onChange={handleUploadBackup} className="hidden" />
              </label>
              <button
                type="button"
                onClick={async () => {
                  await resetDemoData();
                  notify("Demo ma'lumotlar qayta tiklandi", 'info');
                }}
                className="h-10 px-4 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Demo bazani tiklash</span>
              </button>
              <button
                type="button"
                disabled={migratingCloud || !isOnline}
                onClick={async () => {
                  if (!cloudConnected) {
                    notify("Tizim internet va server bilan ulanmoqda, birozdan so'ng qayta urinib ko'ring", 'info');
                    return;
                  }
                  setMigratingCloud(true);
                  try {
                    const res = await migrateLocalDataToCloud();
                    if (!res.ok) {
                      notify(res.error || "Bulutga ko'chirishda xatolik", 'error');
                    } else if (res.uploadedCount === 0) {
                      notify(
                        res.skippedDuplicates > 0
                          ? `Barcha ma'lumotlar allaqachon bulutda (${res.skippedDuplicates} ta takroriy mahsulot o'tkazildi)`
                          : "Barcha lokal ma'lumotlar allaqachon bulut bilan sinxronlangan",
                        'info'
                      );
                    } else {
                      notify(
                        `${res.uploadedCount} ta lokal yozuv bulutga ko'chirildi${
                          res.skippedDuplicates > 0 ? ` (${res.skippedDuplicates} ta takroriy o'tkazildi)` : ''
                        }`,
                        'success'
                      );
                    }
                  } finally {
                    setMigratingCloud(false);
                  }
                }}
                className="h-10 px-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4" />
                <span>{migratingCloud ? "Ko'chirilmoqda..." : "Lokal ma'lumotlarni bulutga ko'chirish"}</span>
              </button>
            </div>
          </div>

          <div className="bg-red-50/70 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 font-display font-bold text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span>Testlar tugagach barcha ma'lumotlarni tozalash</span>
            </div>
            <p className="text-red-700/80 dark:text-red-300/80">
              Barcha test mahsulotlari, sotuv cheklari, ombor qoldiqlari, mijozlar, qarzlar va moliya yozuvlari o'chiriladi. Filiallar, xodimlar va API sozlamalari saqlanib qoladi.
            </p>
            <button
              type="button"
              onClick={() => {
                setClearConfirmText('');
                setClearModalOpen(true);
              }}
              className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Barchasini o'chirish (Toza baza)</span>
            </button>
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl text-xs">
          {[
            { name: "Start (1 do'kon)", price: "0 so'm / oy", features: ['1 kassa va 1 ombor', '500 tagacha mahsulot', 'Oflayn PWA rejim'] },
            { name: 'Biznes (Tavsiya)', price: "290 000 so'm / oy", features: ['5 tagacha filial va ombor', 'Cheksiz mahsulot va xodimlar', 'CRM, Nasiya va ABC hisobotlar'] },
            { name: 'Tarmoq (Enterprise)', price: "690 000 so'm / oy", features: ["Cheksiz do'konlar", 'OFD / Click / Payme API', 'Shaxsiy menejer va SLA'] },
          ].map((pl, idx) => (
            <div
              key={pl.name}
              className={`bg-white dark:bg-slate-900 border rounded-xl p-5 space-y-3 ${
                idx === 1 ? 'border-teal-600' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="font-display font-bold text-sm">{pl.name}</div>
              <div className="font-mono font-bold text-lg text-teal-700 dark:text-teal-400">{pl.price}</div>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                {pl.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-teal-600" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Edit Store Modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Filialni tahrirlash</h3>
              <button type="button" onClick={() => setEditingStore(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={editingStore.name}
              onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })}
              placeholder="Filial nomi"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            <input
              value={editingStore.address}
              onChange={(e) => setEditingStore({ ...editingStore, address: e.target.value })}
              placeholder="Manzil"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
            />
            <input
              value={editingStore.phone}
              onChange={(e) => setEditingStore({ ...editingStore, phone: e.target.value })}
              placeholder="Telefon"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
            />
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Rang:</span>
              {STORE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditingStore({ ...editingStore, color: c })}
                  className={`w-6 h-6 rounded-full border-2 ${editingStore.color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!editingStore.name.trim()) return;
                await upsertStore({ ...editingStore, updatedAt: new Date().toISOString() });
                notify('Filial yangilandi', 'success');
                setEditingStore(null);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Delete Store Confirmation Modal */}
      {deleteStoreTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="font-display text-base font-bold">Filialni o'chirish</h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteStoreTarget.name}</span> filialini va unga biriktirilgan omborni o'chirmoqchimisiz?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteStoreTarget(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteStore(deleteStoreTarget.id);
                  if (!res.ok) {
                    notify(res.error || "O'chirib bo'lmadi", 'error');
                  } else {
                    notify("Filial o'chirildi", 'info');
                  }
                  setDeleteStoreTarget(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Clear All Test Data Modal */}
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-red-600">Barchasini o'chirish</h3>
              <button type="button" onClick={() => setClearModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-300">
              Barcha test mahsulotlar, sotuvlar, qaytarishlar, ombor harakatlari, mijozlar, qarzlar va xarajatlar butunlay o'chiriladi. Tasdiqlash uchun pastga <span className="font-mono font-bold">TOZALASH</span> deb yozing:
            </p>
            <input
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder="TOZALASH"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono uppercase"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={clearConfirmText.trim().toUpperCase() !== 'TOZALASH'}
                onClick={async () => {
                  await clearAllTestData();
                  setClearModalOpen(false);
                  notify("Barcha test ma'lumotlari tozalandi. Baza yangi ishga tayyor!", 'success');
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-semibold"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Role Modal */}
      {editingRole && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 text-xs shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Rolni tahrirlash</h3>
              <button type="button" onClick={() => setEditingRole(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Rol nomi (O'zbekcha)</label>
              <input
                value={editingRole.nameUz}
                onChange={(e) => setEditingRole({ ...editingRole, nameUz: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Rol nomi (Ruscha)</label>
              <input
                value={editingRole.nameRu}
                onChange={(e) => setEditingRole({ ...editingRole, nameRu: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!editingRole.nameUz.trim()) return;
                await upsertRole({
                  ...editingRole,
                  nameUz: editingRole.nameUz.trim(),
                  nameRu: editingRole.nameRu.trim() || editingRole.nameUz.trim(),
                });
                notify('Rol yangilandi', 'success');
                setEditingRole(null);
              }}
              className="w-full h-10 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            >
              {t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Delete Role Confirmation Modal */}
      {deleteRoleTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl text-xs">
            <h3 className="font-display text-base font-bold">Rolni o'chirish</h3>
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteRoleTarget.nameUz}</span> rolini o'chirmoqchimisiz? Shu roldagi xodimlar avtomatik boshqa rolga o'tkaziladi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteRoleTarget(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteRole(deleteRoleTarget.id);
                  if (!res.ok) notify(res.error || "O'chirib bo'lmadi", 'error');
                  else notify("Rol o'chirildi", 'info');
                  setDeleteRoleTarget(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
