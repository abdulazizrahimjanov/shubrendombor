import React, { useMemo, useState } from 'react';
import { UserPlus, Download, X, Edit3, Trash2, ShieldCheck, KeyRound, Eye, EyeOff, Plus, Check } from 'lucide-react';
import { useAppStore, uid } from '../store/useAppStore';
import { formatDateTime, formatMoney, useT } from '../i18n';
import { Employee, Permission, Role, RoleId } from '../types/models';
import { exportToExcel } from '../utils/export';

const PERMISSION_GROUPS: { title: string; items: { id: Permission; label: string }[] }[] = [
  {
    title: 'Sotuvlar va Kassa',
    items: [
      { id: 'use_pos', label: 'Sotuvlar (Savatcha / Tranzaksiyalar)' },
      { id: 'process_returns', label: 'Tovar qaytarish (Vozvrat)' },
      { id: 'manage_shifts', label: 'Kassa smenasini ochish/yopish' },
      { id: 'apply_big_discount', label: 'Katta chegirma berish' },
    ],
  },
  {
    title: 'Katalog va Narxlar',
    items: [
      { id: 'view_catalog', label: 'Katalogni ko\'rish' },
      { id: 'edit_catalog', label: 'Tovar qo\'shish / tahrirlash' },
      { id: 'bulk_edit_prices', label: 'Ommaviy narx o\'zgartirish' },
      { id: 'view_profit_cost', label: 'Tannarx va foydani ko\'rish' },
    ],
  },
  {
    title: 'Ombor va Mijozlar',
    items: [
      { id: 'view_inventory', label: 'Ombor qoldiqlarini ko\'rish' },
      { id: 'manage_inventory', label: 'Kirim / Transfer / Inventarizatsiya' },
      { id: 'view_customers', label: 'Mijozlarni ko\'rish' },
      { id: 'manage_customers', label: 'Mijoz qo\'shish / tahrirlash' },
      { id: 'manage_debts', label: 'Nasiya va qarzlarni boshqarish' },
    ],
  },
  {
    title: 'Boshqaruv va Moliya',
    items: [
      { id: 'view_dashboard', label: 'Asosiy dashboard (Analitika)' },
      { id: 'view_reports', label: 'Hisobotlar' },
      { id: 'view_finance', label: 'Moliyani ko\'rish' },
      { id: 'manage_finance', label: 'Xarajat va hisoblarni boshqarish' },
      { id: 'view_employees', label: 'Xodimlarni ko\'rish' },
      { id: 'manage_employees', label: 'Xodim qo\'shish / o\'chirish / huquq' },
      { id: 'manage_online_orders', label: 'Onlayn buyurtmalar' },
      { id: 'manage_settings', label: 'Sozlamalar va API' },
      { id: 'view_audit_log', label: 'Audit jurnali' },
    ],
  },
];

const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export const EmployeesPage: React.FC = () => {
  const db = useAppStore((s) => s.db);
  const can = useAppStore((s) => s.can);
  const currentUser = useAppStore((s) => s.getCurrentUser());
  const language = useAppStore((s) => s.language);
  const upsertEmployee = useAppStore((s) => s.upsertEmployee);
  const deleteEmployee = useAppStore((s) => s.deleteEmployee);
  const upsertTarget = useAppStore((s) => s.upsertTarget);
  const upsertRole = useAppStore((s) => s.upsertRole);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const notify = useAppStore((s) => s.notify);
  const t = useT();

  const canManage = can('manage_employees');
  const canManageRoles = can('manage_employees') || can('manage_settings');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+99890');
  const [roleId, setRoleId] = useState<RoleId>('cashier');
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>([]);
  const [baseSalary, setBaseSalary] = useState(3500000);
  const [commissionPct, setCommissionPct] = useState(1.5);
  const [schedule, setSchedule] = useState('2/2 smena, 09:00–21:00');
  const [pin, setPin] = useState('6666');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [useCustomPerms, setUseCustomPerms] = useState(false);
  const [customPerms, setCustomPerms] = useState<Permission[]>([]);

  // Quick Role Create / Edit / Delete Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<Permission[]>(['use_pos', 'view_catalog']);
  const [roleError, setRoleError] = useState('');
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<Role | null>(null);

  const payrollRows = useMemo(() => {
    if (!db) return [];
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const saleById = new Map(db.sales.map((s) => [s.id, s]));

    return db.employees.map((emp) => {
      const linkedUser = db.users.find((u) => u.id === emp.userId);
      const empSales = db.sales.filter(
        (s) =>
          s.cashierId === emp.userId &&
          s.status !== 'deferred' &&
          s.createdAt.slice(0, 7) === monthKey
      );
      const empReturns = db.returns.filter((r) => {
        if (r.createdAt.slice(0, 7) !== monthKey) return false;
        const orig = saleById.get(r.saleId);
        return orig?.cashierId === emp.userId;
      });
      const salesTotal = Math.max(
        0,
        empSales.reduce((sum, s) => sum + s.totalAmount, 0) -
          empReturns.reduce((sum, r) => sum + r.totalRefund, 0)
      );
      const activeSalesCount = empSales.filter((s) => s.status !== 'returned').length;
      const avgCheck = activeSalesCount > 0 ? Math.round(salesTotal / activeSalesCount) : 0;
      const target = db.targets.find((tg) => tg.employeeId === emp.id && tg.month === monthKey)?.targetAmount ?? 30000000;
      const kpiPct = target > 0 ? Math.round((salesTotal / target) * 100) : 0;
      const commission = Math.round((salesTotal * emp.commissionPercent) / 100);
      const bonus = kpiPct >= 100 ? 500000 : 0;
      const totalPay = emp.baseSalary + commission + bonus;
      return { emp, linkedUser, salesCount: activeSalesCount, salesTotal, avgCheck, target, kpiPct, commission, bonus, totalPay };
    });
  }, [db]);

  if (!db) return null;

  const getRoleLabel = (rId: RoleId) => {
    const found = db.roles.find((r) => r.id === rId);
    if (found) return language === 'ru' ? found.nameRu : found.nameUz;
    return t.auth.roles[rId as keyof typeof t.auth.roles] ?? rId;
  };

  const openCreateModal = () => {
    setEditingEmp(null);
    setName('');
    setPhone('+99890');
    setRoleId('cashier');
    setAssignedStoreIds(db.stores[0] ? [db.stores[0].id] : []);
    setBaseSalary(3500000);
    setCommissionPct(1.5);
    setSchedule('2/2 smena, 09:00–21:00');
    setPin(String(Math.floor(1000 + Math.random() * 8999)));
    setPassword('');
    setUseCustomPerms(false);
    const defaultRolePerms = db.roles.find((r) => r.id === 'cashier')?.permissions ?? ['use_pos', 'view_catalog'];
    setCustomPerms(defaultRolePerms);
    setShowPass(false);
    setModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    const linkedUser = db.users.find((u) => u.id === emp.userId);
    setEditingEmp(emp);
    setName(emp.name);
    setPhone(emp.phone);
    setRoleId(emp.roleId);
    setAssignedStoreIds(linkedUser?.assignedStoreIds?.length ? linkedUser.assignedStoreIds : [emp.storeId]);
    setBaseSalary(emp.baseSalary);
    setCommissionPct(emp.commissionPercent);
    setSchedule(emp.schedule);
    setPin(linkedUser?.pin ?? '4444');
    setPassword('');
    const hasCustom = Array.isArray(linkedUser?.customPermissions);
    setUseCustomPerms(hasCustom);
    const rolePerms = db.roles.find((r) => r.id === emp.roleId)?.permissions ?? [];
    setCustomPerms(hasCustom ? linkedUser!.customPermissions! : rolePerms);
    setShowPass(false);
    setModalOpen(true);
  };

  const applyPreset = (preset: 'role' | 'sales_only' | 'cashier' | 'warehouse' | 'full') => {
    if (preset === 'role') {
      setUseCustomPerms(false);
      const rolePerms = db.roles.find((r) => r.id === roleId)?.permissions ?? [];
      setCustomPerms(rolePerms);
      return;
    }
    setUseCustomPerms(true);
    if (preset === 'sales_only') {
      setCustomPerms(['use_pos', 'view_catalog']);
    } else if (preset === 'cashier') {
      setCustomPerms(['use_pos', 'view_catalog', 'process_returns', 'manage_shifts', 'view_customers', 'manage_customers']);
    } else if (preset === 'warehouse') {
      setCustomPerms(['use_pos', 'view_catalog', 'edit_catalog', 'view_inventory', 'manage_inventory', 'manage_online_orders']);
    } else {
      setCustomPerms([...ALL_PERMISSIONS]);
    }
  };

  const togglePerm = (perm: Permission) => {
    setUseCustomPerms(true);
    setCustomPerms((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const toggleStore = (id: string) => {
    setAssignedStoreIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return [...prev, id];
    });
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleanPin = pin.replace(/\D/g, '');
    if (cleanPin.length < 4 || cleanPin.length > 6) {
      notify("PIN-kod 4–6 ta raqamdan iborat bo'lishi kerak", 'error');
      return;
    }
    const targetUserId = editingEmp ? editingEmp.userId : uid('usr');
    const duplicatePin = db.users.find((u) => u.id !== targetUserId && u.pin === cleanPin && u.isActive);
    if (duplicatePin) {
      notify(`PIN-kod (${cleanPin}) ${duplicatePin.name} da band! Boshqa PIN tanlang.`, 'error');
      return;
    }

    if (!editingEmp && password.trim().length < 4) {
      notify("Kamida 4 ta belgidan iborat kirish parolini kiriting", 'error');
      return;
    }
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      notify("Oylik maosh manfiy bo'lishi mumkin emas", 'error');
      return;
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      notify("Komissiya foizi 0 dan 100 gacha bo'lishi kerak", 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const primaryStoreId = assignedStoreIds[0] || db.stores[0]?.id || 'store-chilonzor';
    const empId = editingEmp ? editingEmp.id : uid('emp');

    try {
      await upsertEmployee(
        {
          id: empId,
          userId: targetUserId,
          name: name.trim(),
          phone: phone.trim(),
          roleId,
          baseSalary,
          commissionPercent: commissionPct,
          schedule: schedule.trim() || '2/2 smena, 09:00–21:00',
          hiredAt: editingEmp ? editingEmp.hiredAt : nowIso,
          storeId: primaryStoreId,
          createdAt: editingEmp ? editingEmp.createdAt : nowIso,
          updatedAt: nowIso,
          createdBy: currentUser?.id ?? 'system',
        },
        {
          pin: cleanPin,
          ...(password.trim() ? { password: password.trim() } : {}),
          assignedStoreIds: assignedStoreIds.length ? assignedStoreIds : [primaryStoreId],
          ...(useCustomPerms ? { customPermissions: customPerms } : {}),
        },
        { clearCustomPermissions: !useCustomPerms }
      );

      if (!editingEmp) {
        const now = new Date();
        await upsertTarget({
          id: uid('tgt'),
          employeeId: empId,
          month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          targetAmount: 30000000,
          storeId: primaryStoreId,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: currentUser?.id ?? 'system',
        });
      }

      notify(editingEmp ? 'Xodim ma\'lumotlari yangilandi' : "Yangi xodim qo'shildi", 'success');
      setModalOpen(false);
    } catch (err) {
      notify((err as Error)?.message || 'Xodimni saqlashda xatolik', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold">{t.employees.title}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              exportToExcel(
                payrollRows.map((r) => ({
                  Xodim: r.emp.name,
                  Rol: getRoleLabel(r.emp.roleId),
                  Sotuvlar: r.salesTotal,
                  OylikMaosh: r.emp.baseSalary,
                  FoizBonus: r.commission + r.bonus,
                  JamiTolov: r.totalPay,
                })),
                'xodimlar-oylik'
              )
            }
            className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t.employees.addEmployee}</span>
            </button>
          )}
        </div>
      </div>

      {/* Staff Performance & Payroll Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-slate-500 font-semibold">
              <th className="py-3 px-3">Xodim va Huquq</th>
              <th className="py-3 px-3">PIN / Jadval</th>
              <th className="py-3 px-3 text-right">Cheklar / Savdo</th>
              <th className="py-3 px-3 text-right">Reja / KPI</th>
              <th className="py-3 px-3 text-right">{t.employees.baseSalary}</th>
              <th className="py-3 px-3 text-right">{t.employees.commission}</th>
              <th className="py-3 px-3 text-right">{t.employees.totalPay}</th>
              {canManage && <th className="py-3 px-3 text-right">{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payrollRows.map((r) => {
              const isCustom = Array.isArray(r.linkedUser?.customPermissions);
              const permCount = isCustom
                ? r.linkedUser!.customPermissions!.length
                : db.roles.find((rl) => rl.id === r.emp.roleId)?.permissions.length ?? 0;

              return (
                <tr key={r.emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{r.emp.name}</span>
                      {isCustom && (
                        <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                          Maxsus ({permCount})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {getRoleLabel(r.emp.roleId)} · {r.emp.phone}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    <div className="font-mono text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-slate-400" />
                      <span>PIN: {r.linkedUser?.pin ?? '—'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">{r.emp.schedule}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div>{formatMoney(r.salesTotal, { lang: language })}</div>
                    <div className="text-[11px] text-slate-400">
                      {r.salesCount} ta chek · o'rt. {formatMoney(r.avgCheck, { lang: language })}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    <div className="font-semibold">{r.kpiPct}%</div>
                    <div className="text-[11px] text-slate-400">{formatMoney(r.target, { lang: language })}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    {formatMoney(r.emp.baseSalary, { lang: language })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-teal-700 dark:text-teal-400">
                    +{formatMoney(r.commission + r.bonus, { lang: language })} ({r.emp.commissionPercent}%)
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-bold">
                    {formatMoney(r.totalPay, { lang: language })}
                  </td>
                  {canManage && (
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(r.emp)}
                          title="Tahrirlash va huquqlar"
                          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {r.emp.roleId !== 'owner' && r.emp.userId !== 'usr-owner' && r.emp.userId !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r.emp)}
                            title="Xodimni o'chirish"
                            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Attendance from Cash Shifts */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-semibold text-sm">
          {t.employees.attendance}
        </div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500">
              <th className="py-2.5 px-3">Smena</th>
              <th className="py-2.5 px-3">Kassir</th>
              <th className="py-2.5 px-3">Ochildi</th>
              <th className="py-2.5 px-3">Yopildi</th>
              <th className="py-2.5 px-3 text-right">Naqd savdo</th>
              <th className="py-2.5 px-3">Holat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.cashShifts.map((sh) => (
              <tr key={sh.id}>
                <td className="py-2.5 px-3 font-mono font-bold">{sh.number}</td>
                <td className="py-2.5 px-3">{sh.cashierName}</td>
                <td className="py-2.5 px-3 font-mono text-slate-500">{formatDateTime(sh.openedAt, language)}</td>
                <td className="py-2.5 px-3 font-mono text-slate-500">
                  {sh.closedAt ? formatDateTime(sh.closedAt, language) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono">
                  {formatMoney(sh.cashSalesTotal, { lang: language })}
                </td>
                <td className="py-2.5 px-3 font-semibold">{sh.status === 'open' ? 'Ochiq' : 'Yopiq'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Employee + Permissions Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <form
            onSubmit={handleSaveEmployee}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-display text-base font-bold">
                {editingEmp ? `${editingEmp.name} — tahrirlash` : t.employees.addEmployee}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">F.I.Sh. *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masalan: Jasur Alimov"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Telefon *</label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998901234567"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Asosiy rol</label>
                <div className="flex items-center gap-2">
                  <select
                    value={roleId}
                    onChange={(e) => {
                      const nextRole = e.target.value as RoleId;
                      setRoleId(nextRole);
                      if (!useCustomPerms) {
                        setCustomPerms(db.roles.find((r) => r.id === nextRole)?.permissions ?? []);
                      }
                    }}
                    disabled={editingEmp?.roleId === 'owner' || editingEmp?.userId === 'usr-owner'}
                    className="flex-1 min-w-0 h-10 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                  >
                    {db.roles
                      .filter((r) => r.id !== 'owner' || editingEmp?.roleId === 'owner' || editingEmp?.userId === 'usr-owner')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {language === 'ru' ? r.nameRu : r.nameUz}
                        </option>
                      ))}
                  </select>
                  {canManageRoles &&
                    editingEmp?.roleId !== 'owner' &&
                    editingEmp?.userId !== 'usr-owner' && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewRoleName('');
                          setNewRolePerms(['use_pos', 'view_catalog', 'view_customers', 'manage_customers']);
                          setRoleError('');
                          setEditingRole(null);
                          setDeleteRoleConfirm(null);
                          setRoleModalOpen(true);
                        }}
                        title="Yangi rol yaratish"
                        aria-label="Yangi rol yaratish"
                        className="w-10 h-10 shrink-0 rounded-lg bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Ish jadvali</label>
                <input
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Kirish paroli</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingEmp ? "O'zgartirmaslik uchun bo'sh qoldiring" : 'Kamida 4 ta belgi'}
                    className="w-full h-10 pl-3 pr-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">PIN-kod (4–6 raqam)</label>
                <input
                  maxLength={6}
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono tracking-widest text-center"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">{t.employees.baseSalary} (so'm)</label>
                <input
                  type="number"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">{t.employees.commission} (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                />
              </div>
            </div>

            {/* Branch Assignment */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="font-semibold text-slate-700 dark:text-slate-200">Biriktirilgan filiallar</div>
              <div className="flex flex-wrap gap-2">
                {db.stores.map((st) => {
                  const checked = assignedStoreIds.includes(st.id);
                  return (
                    <label
                      key={st.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer ${
                        checked
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleStore(st.id)} />
                      <span>{st.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Granular Permissions */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Xodim huquqlari</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('role')}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                      !useCustomPerms
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    Rol standarti
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('sales_only')}
                    className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] font-semibold"
                  >
                    Faqat sotuv va katalog
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('cashier')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    Kassir
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('warehouse')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    Omborchi
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('full')}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium"
                  >
                    To'liq huquq
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                {PERMISSION_GROUPS.map((grp) => (
                  <div key={grp.title} className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{grp.title}</div>
                    {grp.items.map((item) => {
                      const activeList = useCustomPerms
                        ? customPerms
                        : db.roles.find((r) => r.id === roleId)?.permissions ?? [];
                      const checked = activeList.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-700 dark:text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={editingEmp?.roleId === 'owner' || editingEmp?.userId === 'usr-owner'}
                            onChange={() => togglePerm(item.id)}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="h-10 px-5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create / Edit / Delete Role Modal inside Employee Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-base font-bold">Yangi rol yaratish</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRoleModalOpen(false);
                  setEditingRole(null);
                  setDeleteRoleConfirm(null);
                  setRoleError('');
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setRoleError('');
                const cleanName = newRoleName.trim();
                if (!cleanName) {
                  setRoleError('Rol nomini kiriting (masalan: Aziz ishchi)');
                  return;
                }
                const newRoleId: RoleId = `role-${Date.now().toString(36)}`;
                const newRole: Role = {
                  id: newRoleId,
                  nameUz: cleanName,
                  nameRu: cleanName,
                  permissions: newRolePerms,
                };
                const res = await upsertRole(newRole);
                if (!res.ok) {
                  setRoleError(res.error || 'Rolni saqlashda xatolik');
                  return;
                }
                setRoleId(newRoleId);
                setUseCustomPerms(false);
                setCustomPerms(newRolePerms);
                setNewRoleName('');
                setRoleModalOpen(false);
                notify(`"${cleanName}" roli yaratildi va tanlandi`, 'success');
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Rol nomi *
                </label>
                <input
                  autoFocus
                  value={newRoleName}
                  onChange={(e) => {
                    setNewRoleName(e.target.value);
                    if (roleError) setRoleError('');
                  }}
                  placeholder="Masalan: Aziz ishchi"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Huquqlar shabloni</span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(['use_pos', 'view_catalog', 'view_customers', 'manage_customers'])}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      Kassir
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(['use_pos', 'view_catalog', 'edit_catalog', 'view_inventory', 'manage_inventory', 'manage_online_orders'])}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      Omborchi
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRolePerms(['view_dashboard', 'use_pos', 'process_returns', 'manage_shifts', 'view_catalog', 'edit_catalog', 'view_inventory', 'manage_inventory', 'view_customers', 'manage_customers', 'manage_debts', 'view_reports'])}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      Menejer
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRolePerms([...ALL_PERMISSIONS])}
                      className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px]"
                    >
                      To'liq
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-44 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                  {PERMISSION_GROUPS.map((grp) => (
                    <div key={grp.title} className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{grp.title}</div>
                      {grp.items.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={newRolePerms.includes(item.id)}
                            onChange={() =>
                              setNewRolePerms((prev) =>
                                prev.includes(item.id) ? prev.filter((p) => p !== item.id) : [...prev, item.id]
                              )
                            }
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {roleError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 font-medium">
                  {roleError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-medium"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                >
                  {t.common.save}
                </button>
              </div>
            </form>

            {/* Manage existing roles (edit name / delete non-owner roles) */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="font-semibold text-slate-600 dark:text-slate-300">
                Mavjud rollar ({db.roles.length})
              </div>

              {deleteRoleConfirm && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 p-3 space-y-2">
                  <div className="font-bold text-amber-900 dark:text-amber-200">
                    "{deleteRoleConfirm.nameUz}" rolini o'chirmoqchimisiz?
                  </div>
                  <p className="text-amber-800 dark:text-amber-300">
                    {db.employees.some((e) => e.roleId === deleteRoleConfirm.id)
                      ? "Bu rol xodimlarga biriktirilgan — o'chirilsa ular avtomatik boshqa rolga o'tkaziladi."
                      : "Ushbu rol tizimdan o'chiriladi."}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteRoleConfirm(null)}
                      className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await deleteRole(deleteRoleConfirm.id);
                        if (!res.ok) {
                          notify(res.error || "O'chirib bo'lmadi", 'error');
                        } else {
                          if (roleId === deleteRoleConfirm.id) {
                            const fallback = db.roles.find((r) => r.id === 'cashier' && r.id !== deleteRoleConfirm.id)?.id ?? 'cashier';
                            setRoleId(fallback);
                          }
                          notify(`"${deleteRoleConfirm.nameUz}" roli o'chirildi`, 'info');
                        }
                        setDeleteRoleConfirm(null);
                      }}
                      className="h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl max-h-44 overflow-y-auto">
                {db.roles
                  .filter((r) => r.id !== 'owner')
                  .map((r) => {
                    const isEditing = editingRole?.id === r.id;
                    const empCount = db.employees.filter((e) => e.roleId === r.id).length;
                    return (
                      <div key={r.id} className="p-2.5 flex items-center justify-between gap-2">
                        {isEditing ? (
                          <div className="flex-1 flex gap-1.5">
                            <input
                              value={editingRole.nameUz}
                              onChange={(e) =>
                                setEditingRole({ ...editingRole, nameUz: e.target.value, nameRu: e.target.value })
                              }
                              className="flex-1 h-8 px-2.5 rounded-lg border border-teal-500 bg-white dark:bg-slate-950"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await upsertRole({
                                  ...editingRole,
                                  nameUz: editingRole.nameUz.trim(),
                                  nameRu: editingRole.nameRu.trim() || editingRole.nameUz.trim(),
                                });
                                if (!res.ok) {
                                  notify(res.error || 'Saqlashda xatolik', 'error');
                                  return;
                                }
                                setEditingRole(null);
                                notify('Rol nomi yangilandi', 'success');
                              }}
                              className="h-8 px-2.5 rounded-lg bg-teal-700 text-white font-semibold"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white truncate">
                                {language === 'ru' ? r.nameRu : r.nameUz}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {r.permissions.length} ta huquq{empCount > 0 ? ` · ${empCount} ta xodim` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingRole(structuredClone(r))}
                                title={t.common.edit}
                                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {db.roles.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteRoleConfirm(r)}
                                  title={t.common.delete}
                                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Employee Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Xodimni o'chirish
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold">{deleteTarget.name}</span> ({deleteTarget.phone}) hisobini tizimdan o'chirmoqchimisiz? Bu xodim endi tizimga kira olmaydi.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await deleteEmployee(deleteTarget.id);
                  if (!res.ok) {
                    notify(res.error || 'O\'chirib bo\'lmadi', 'error');
                  } else {
                    notify("Xodim o'chirildi", 'info');
                  }
                  setDeleteTarget(null);
                }}
                className="h-9 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
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
