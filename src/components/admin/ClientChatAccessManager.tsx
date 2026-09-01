import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { internalChatService, type ClientChatAccessOption } from '../../lib/internalChatService';
import { ROLE_LABELS } from '../../types';

function messageOf(error: any, fallback: string) {
  return error?.message || error?.details || fallback;
}

export default function ClientChatAccessManager({ onChanged }: { onChanged?: () => void }) {
  const [options, setOptions] = useState<ClientChatAccessOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const result = await internalChatService.listClientAccessOptions();
    if (result.error) setError(messageOf(result.error, 'Client-chat permissions could not be loaded.'));
    else setOptions(result.data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; customerName: string; rows: ClientChatAccessOption[] }>();
    options.forEach(row => {
      const current = map.get(row.projectId);
      if (current) current.rows.push(row);
      else map.set(row.projectId, { projectName: row.projectName, customerName: row.customerName, rows: [row] });
    });
    return Array.from(map.entries());
  }, [options]);

  const toggle = async (row: ClientChatAccessOption) => {
    const key = `${row.projectId}:${row.deliveryUserId}`;
    setBusyKey(key);
    setError('');
    const result = await internalChatService.setDeliveryClientAccess(row.projectId, row.deliveryUserId, !row.isActive);
    if (result.error) setError(messageOf(result.error, 'Client-chat permission could not be changed.'));
    else {
      await load();
      onChanged?.();
    }
    setBusyKey('');
  };

  if (loading) return <div className="mb-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Checking project client-chat permissions…</div>;
  if (!error && grouped.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-[#000080]"><ShieldCheck className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-black text-slate-900">Client ↔ Delivery Chat Access</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Only the responsible Seller or an authorized project Manager can grant access. Access is limited to this exact project and is removed immediately when revoked or when project access ends.</p>
        </div>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">{error}</div>}
      <div className="mt-3 space-y-3">
        {grouped.map(([projectId, group]) => <div key={projectId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-2 text-[11px] font-black text-slate-800">{group.projectName} <span className="font-semibold text-slate-400">· Client: {group.customerName}</span></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {group.rows.map(row => {
              const key = `${row.projectId}:${row.deliveryUserId}`;
              const busy = busyKey === key;
              return <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div className="min-w-0"><div className="truncate text-[11px] font-black text-slate-800">{row.deliveryName}</div><div className="truncate text-[10px] font-semibold text-slate-400">{(ROLE_LABELS as any)[row.deliveryRole] || row.deliveryRole}</div></div>
                <button type="button" disabled={busy} onClick={() => void toggle(row)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-black disabled:opacity-50 ${row.isActive ? 'border border-red-200 bg-red-50 text-red-700' : 'bg-[#000080] text-white'}`}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{row.isActive ? 'Revoke' : 'Allow'}
                </button>
              </div>;
            })}
          </div>
        </div>)}
      </div>
    </section>
  );
}
