import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Edit2, Eye, FilePlus2, Loader2, Plus, Search, Settings2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { QUOTATION_STATUSES, Quotation, QuotationStatus } from '../../types';
import { salesService } from '../../lib/salesService';
import { quotationCpqService } from '../../lib/quotationCpqService';
import { useAuth } from '../../lib/AuthContext';

function money(value:number,currency='USD'){try{return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value||0));}catch{return `${currency} ${Number(value||0).toFixed(2)}`;}}
function date(value?:string|null){if(!value)return '—';const d=new Date(value.length===10?`${value}T00:00:00`:value);return Number.isNaN(d.getTime())?value:d.toLocaleDateString();}

export default function QuotationsManager({ onNavigate: _onNavigate }: { onNavigate?: (tab: any, metadata?: any) => void }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams,setSearchParams] = useSearchParams();
  const [quotations,setQuotations] = useState<Quotation[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [status,setStatus] = useState<QuotationStatus|'All'>('All');
  const [search,setSearch] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    const result = await salesService.getQuotations();
    if (result.error) setError(result.error.message); else setQuotations(result.data || []);
    setLoading(false);
  };
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(searchParams.get('action')!=='new')return;
    const next=new URLSearchParams(searchParams);next.delete('action');setSearchParams(next,{replace:true});
    navigate('/admin/quotations/new');
  },[searchParams,setSearchParams,navigate]);

  const visible=useMemo(()=>quotations.filter(q=>(isAdmin||q.salespersonId===user?.id)&&(status==='All'||q.status===status)&&(`${q.quotationNumber} ${q.customerName} ${q.contactName||''} ${q.email||''}`.toLowerCase().includes(search.trim().toLowerCase()))),[quotations,isAdmin,user?.id,status,search]);
  const duplicate=async(id:string)=>{const result=await quotationCpqService.duplicate(id);if(result.error){setError(result.error.message);return;}navigate(`/admin/quotations/${String(result.data)}`);};
  const revision=async(id:string)=>{const result=await quotationCpqService.createRevision(id);if(result.error){setError(result.error.message);return;}navigate(`/admin/quotations/${String(result.data)}`);};
  const statusClass=(value:string)=>value==='Approved'?'bg-emerald-50 text-emerald-700 border-emerald-200':value==='Ready for Approval'?'bg-amber-50 text-amber-700 border-amber-200':value==='Sent'?'bg-blue-50 text-blue-700 border-blue-200':value==='Accepted'?'bg-indigo-50 text-indigo-700 border-indigo-200':value==='Rejected'?'bg-red-50 text-red-700 border-red-200':'bg-slate-100 text-slate-600 border-slate-200';

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h1 className="text-2xl font-black text-slate-900">Quotations & CPQ</h1><p className="mt-1 text-sm text-slate-500">Build, approve, send and track professional catalog-driven ProFox proposals.</p></div><div className="flex gap-2">{isAdmin&&<button onClick={()=>navigate('/admin/quotation-settings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><Settings2 className="h-4 w-4"/>Settings</button>}<button onClick={()=>navigate('/admin/quotations/new')} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-sm font-black text-white"><Plus className="h-4 w-4"/>New Quotation</button></div></div>
    {error&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div className="flex gap-1 overflow-x-auto pb-1">{['All',...QUOTATION_STATUSES].map(value=><button key={value} onClick={()=>setStatus(value as any)} className={`whitespace-nowrap rounded-xl border px-3 py-2 text-[11px] font-extrabold ${status===value?'border-[#000080] bg-[#000080] text-white':'border-slate-200 bg-white text-slate-600'}`}>{value}</button>)}</div><div className="relative min-w-[250px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search quotations…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"/></div></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Quotation</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Valid Until</th><th className="px-4 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">
      {loading?<tr><td colSpan={6} className="p-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#000080]"/></td></tr>:visible.length===0?<tr><td colSpan={6} className="p-12 text-center text-slate-400">No quotations match this view.</td></tr>:visible.map((q:any)=><tr key={q.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><button onClick={()=>navigate(`/admin/quotations/${q.id}`)} className="font-black text-[#000080] hover:underline">{q.quotationNumber}</button>{Number(q.revisionNumber||1)>1&&<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">R{q.revisionNumber}</span>}<p className="mt-1 text-[10px] text-slate-400">Created {date(q.createdAt)}</p></td><td className="px-4 py-4"><p className="font-bold text-slate-900">{q.customerName}</p><p className="text-xs text-slate-500">{q.contactName||q.email||'—'}</p></td><td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusClass(q.status)}`}>{q.status}</span></td><td className="px-4 py-4 text-slate-600">{date(q.validUntil)}</td><td className="px-4 py-4 text-right font-black">{money(q.total,q.currency)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={()=>navigate(`/admin/quotations/${q.id}`)} title="Open workspace" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit2 className="h-4 w-4"/></button><button onClick={()=>navigate(`/admin/quotations/${q.id}`)} title="Preview in workspace" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Eye className="h-4 w-4"/></button><button onClick={()=>void duplicate(q.id)} title="Duplicate" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Copy className="h-4 w-4"/></button>{['Sent','Rejected','Expired'].includes(q.status)&&!q.supersededById&&<button onClick={()=>void revision(q.id)} title="Create revision" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><FilePlus2 className="h-4 w-4"/></button>}</div></td></tr>)}
    </tbody></table></div></div>
  </div>;
}
