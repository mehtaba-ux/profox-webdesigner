import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Eye, Loader2, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { internalChatService, type ClientChatAccessOption } from '../../lib/internalChatService';
import { ROLE_LABELS } from '../../types';

const ACCESS_REFRESH_MS = 30_000;

type GrantDuration = '24h' | '7d' | '30d' | 'until_revoked';

function messageOf(error: any, fallback: string) {
  return error?.message || error?.details || fallback;
}

function expiresAtFor(duration: GrantDuration): string | null {
  if (duration === 'until_revoked') return null;
  const hours = duration === '24h' ? 24 : duration === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function formatExpiry(value?: string | null) {
  if (!value) return 'Until revoked';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time-bound' : `Until ${date.toLocaleString()}`;
}

export default function ClientChatAccessManager({ onChanged }: { onChanged?: () => void }) {
  const [options, setOptions] = useState<ClientChatAccessOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [durations, setDurations] = useState<Record<string, GrantDuration>>({});

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    const result = await internalChatService.listClientAccessOptions();
    if (result.error) setError(messageOf(result.error, 'Client-chat permissions could not be loaded.'));
    else setOptions(result.data);
    if (!quiet) setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, ACCESS_REFRESH_MS);
    const resume = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; customerName: string; rows: ClientChatAccessOption[] }>();
    options.forEach(row => {
      const current = map.get(row.projectId);
      if (current) current.rows.push(row);
      else map.set(row.projectId, { projectName: row.projectName, customerName: row.customerName, rows: [row] });
    });
    return Array.from(map.entries());
  }, [options]);

  const activeCount = useMemo(() => options.filter(row => row.isActive).length, [options]);

  const toggle = async (row: ClientChatAccessOption) => {
    const key = `${row.projectId}:${row.deliveryUserId}`;
    setBusyKey(key);
    setError('');
    const allow = !row.isActive;
    const duration = durations[key] || '7d';
    const result = await internalChatService.setDeliveryClientAccess(
      row.projectId,
      row.deliveryUserId,
      allow,
      allow ? expiresAtFor(duration) : null
    );
    if (result.error) setError(messageOf(result.error, 'Client-chat permission could not be changed.'));
    else {
      await load(true);
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black text-slate-900">Client ↔ Delivery Chat Access</h2>
            {activeCount > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800"><Eye className="h-3 w-3" />{activeCount} client-visible</span>}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Only the responsible Seller or an authorized project Manager can grant access. A grant creates a customer-visible project thread for that exact client, project and delivery member. New grants default to 7 days and are automatically removed when they expire or project access ends.</p>
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-4 text-amber-900"><strong>Visibility rule:</strong> anything sent inside an active granted client thread can be read by the customer in Client Portal. Private ProFox team discussion must stay in an Internal Only thread.</div>
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
              const duration = durations[key] || '7d';
              return <div key={key} className={`rounded-xl border bg-white px-3 py-3 ${row.isActive ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="truncate text-[11px] font-black text-slate-800">{row.deliveryName}</div><div className="truncate text-[10px] font-semibold text-slate-400">{(ROLE_LABELS as any)[row.deliveryRole] || row.deliveryRole}</div>{row.isActive && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-amber-900"><Eye className="h-2.5 w-2.5" />Client visible</div>}</div>
                  <button type="button" disabled={busy} onClick={() => void toggle(row)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-black disabled:opacity-50 ${row.isActive ? 'border border-red-200 bg-red-50 text-red-700' : 'bg-[#000080] text-white'}`}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}{row.isActive ? 'Revoke' : 'Allow'}
                  </button>
                </div>
                {row.isActive ? <div className="mt-2 flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700"><Clock3 className="h-3 w-3" />{formatExpiry(row.expiresAt)}</div> : <div className="mt-2"><label className="text-[9px] font-black uppercase tracking-wide text-slate-400">Access duration</label><select value={duration} onChange={event => setDurations(current => ({ ...current, [key]: event.target.value as GrantDuration }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-semibold text-slate-700 outline-none focus:border-[#000080]"><option value="24h">24 hours</option><option value="7d">7 days — recommended</option><option value="30d">30 days</option><option value="until_revoked">Until manually revoked</option></select></div>}
              </div>;
            })}
          </div>
        </div>)}
      </div>
    </section>
  );
}
