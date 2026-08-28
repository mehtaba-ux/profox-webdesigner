import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckSquare2, Loader2, RefreshCw, Search, Shuffle, UserPlus, UsersRound, X } from 'lucide-react';
import { crmService } from '../../../lib/crmService';
import { leadAssignmentService, type LeadAssignmentStatus } from '../../../lib/leadAssignmentService';
import type { CRMLead, CRMLeadPerson } from '../../../types';

function errorMessage(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || fallback) : fallback;
}

export default function CRMLeadAssignmentQueue() {
  const [status, setStatus] = useState<LeadAssignmentStatus | null>(null);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [people, setPeople] = useState<CRMLeadPerson[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  const [search, setSearch] = useState('');
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const nextStatus = await leadAssignmentService.getStatus();
      setStatus(nextStatus);
      if (!nextStatus.canManage) {
        setLeads([]); setPeople([]); setSelected([]);
        return;
      }
      const [leadRows, assignees] = await Promise.all([crmService.getLeads(), crmService.getLeadAssignees()]);
      setLeads(leadRows);
      setPeople(assignees);
      setTarget(current => assignees.some(person => person.id === current) ? current : assignees[0]?.id || '');
      setSelected(current => current.filter(id => leadRows.some(lead => lead.id === id)));
    } catch (err) { setError(errorMessage(err, 'The lead assignment queue could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter(lead => (includeAssigned || !lead.salespersonId) && (!query || `${lead.title} ${lead.companyName} ${lead.contactName || ''} ${lead.email || ''} ${lead.source}`.toLowerCase().includes(query)));
  }, [leads, includeAssigned, search]);

  if (!loading && status && !status.canManage) return null;
  if (loading && !status) return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Checking lead assignment permissions…</div></div>;
  if (!status?.canManage) return null;

  const selectedVisible = visible.filter(lead => selected.includes(lead.id));
  const allVisibleSelected = visible.length > 0 && visible.every(lead => selected.includes(lead.id));
  const selectAll = () => setSelected(current => allVisibleSelected ? current.filter(id => !visible.some(lead => lead.id === id)) : Array.from(new Set([...current, ...visible.map(lead => lead.id)])));

  const assignOneSeller = async () => {
    if (!target || selected.length === 0) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const count = await leadAssignmentService.bulkAssign(selected, target);
      const person = people.find(item => item.id === target);
      setMessage(`${count} lead${count === 1 ? '' : 's'} assigned to ${person?.name || 'the selected Sales Representative'}.`);
      setSelected([]);
      await load(true);
    } catch (err) { setError(errorMessage(err, 'Selected leads could not be assigned.')); }
    finally { setBusy(false); }
  };

  const distribute = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Distribute ${selected.length} selected lead${selected.length === 1 ? '' : 's'} equally across the eligible active Sales team?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const count = await leadAssignmentService.distributeRoundRobin(selected);
      setMessage(`${count} lead${count === 1 ? '' : 's'} distributed through the same fair round-robin used for automatic assignment.`);
      setSelected([]);
      await load(true);
    } catch (err) { setError(errorMessage(err, 'Selected leads could not be distributed.')); }
    finally { setBusy(false); }
  };

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50 via-white to-blue-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-[#000080]"><UsersRound className="h-4 w-4" />Management assignment pool</div><h2 className="mt-2 text-lg font-black text-slate-950">Review first. Assign when ready.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Website leads enter this shared management queue when manual mode is active. Select one or many leads and assign them to one seller, or distribute them evenly across the eligible Sales team.</p></div>
          <div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${status.mode === 'manual' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{status.mode === 'manual' ? 'New leads: Management pool' : 'New leads: Auto round-robin'}</span><button type="button" onClick={() => void load()} disabled={loading || busy} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        {message && <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><span>{message}</span><button type="button" onClick={() => setMessage('')}><X className="h-4 w-4" /></button></div>}

        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search the assignment pool" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#000080] focus:bg-white" /></label>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"><input type="checkbox" checked={includeAssigned} onChange={event => setIncludeAssigned(event.target.checked)} className="h-4 w-4 accent-[#000080]" />Include already assigned leads</label>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="text-xs font-black text-slate-900">{selected.length} selected</div><div className="mt-0.5 text-[10px] text-slate-500">Maximum 200 leads per bulk operation. Assignment changes are recorded in the existing CRM timeline.</div></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={target} onChange={event => setTarget(event.target.value)} disabled={busy || people.length === 0} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none disabled:opacity-50"><option value="">Choose seller</option>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
            <button type="button" onClick={() => void assignOneSeller()} disabled={busy || selected.length === 0 || !target} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Assign selected</button>
            <button type="button" onClick={() => void distribute()} disabled={busy || selected.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#000080]/20 bg-white px-4 text-xs font-black text-[#000080] disabled:opacity-40"><Shuffle className="h-4 w-4" />Distribute equally</button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3"><button type="button" onClick={selectAll} className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-600"><CheckSquare2 className="h-4 w-4 text-[#000080]" />{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button><span className="text-[10px] font-bold text-slate-400">{visible.length} lead{visible.length === 1 ? '' : 's'} shown</span></div>
          {visible.length === 0 ? <div className="px-6 py-10 text-center"><div className="text-sm font-black text-slate-700">No leads waiting in this view</div><p className="mt-1 text-xs text-slate-400">New unassigned website enquiries will appear here automatically in manual mode.</p></div> : <div className="max-h-[360px] divide-y divide-slate-100 overflow-auto">{visible.slice(0, 200).map(lead => {
            const owner = lead.salespersonId ? people.find(person => person.id === lead.salespersonId) : undefined;
            return <label key={lead.id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(lead.id)} onChange={() => setSelected(current => current.includes(lead.id) ? current.filter(id => id !== lead.id) : current.length >= 200 ? current : [...current, lead.id])} className="h-4 w-4 accent-[#000080]" /><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-900">{lead.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">{lead.companyName}{lead.contactName ? ` · ${lead.contactName}` : ''} · {lead.source}</span></span><span className="text-right"><span className={`block text-[10px] font-black ${lead.leadQuality === 'High' ? 'text-emerald-700' : lead.leadQuality === 'Medium' ? 'text-amber-700' : 'text-slate-500'}`}>{lead.leadQuality} · {lead.leadScore}</span><span className="mt-0.5 block max-w-[130px] truncate text-[9px] text-slate-400">{owner?.name || 'Unassigned'}</span></span></label>;
          })}</div>}
        </div>
      </div>
    </section>
  );
}
