import React from 'react';
import {ArrowLeft,ArrowUpRight,Focus,ShieldCheck} from 'lucide-react';
import {Navigate,useNavigate,useParams} from 'react-router-dom';
import {useAuth} from '../../lib/AuthContext';
import NextBestActionCard from './NextBestActionCard';
import ProductivityPlaybookChecklist from './ProductivityPlaybookChecklist';
import ProductivityCopilot from './ProductivityCopilot';

const labels:Record<string,string>={lead:'Lead',opportunity:'Opportunity',activity:'CRM Activity',meeting:'Meeting',quotation:'Quotation',payment:'Payment',client:'Client',project:'Project',project_task:'Project Task',applicant:'Candidate',notification:'Notification'};
const originalPaths:Record<string,string>={lead:'/admin/app/crm?tab=crm_leads',opportunity:'/admin/app/crm?tab=pipeline',activity:'/admin/app/crm?tab=activities',meeting:'/admin/meetings',quotation:'/admin/app/sales?tab=quotations',payment:'/admin/app/sales?tab=payments',client:'/admin/app/clients?tab=clients',project:'/admin/app/projects?tab=projects',project_task:'/admin/app/projects?tab=myWork',applicant:'/admin/app/recruitment?tab=recruitment',notification:'/admin/today'};

export default function ProductivityRecordFocus(){
 const nav=useNavigate();const {entityType='',entityId=''}=useParams();const {user,profile,loading}=useAuth();const allowed=Boolean(user&&profile?.status==='active'&&!['customer','pending'].includes(profile.role));
 if(loading)return <div className="min-h-screen bg-slate-50"/>;
 if(!allowed)return <Navigate to="/admin" replace/>;
 if(!entityId||!labels[entityType])return <Navigate to="/admin/today" replace/>;
 return <div className="min-h-screen bg-slate-50 text-slate-900">
   <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={()=>nav('/admin/today')} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><div className="flex items-center gap-2"><Focus className="h-4 w-4 text-[#000080]"/><h1 className="text-lg font-black">{labels[entityType]} focus</h1></div><p className="mt-0.5 text-xs text-slate-500">One record. One next action. No dashboard hopping.</p></div></div><button onClick={()=>nav(originalPaths[entityType]||'/admin/workspace')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:text-[#000080]">Open full module <ArrowUpRight className="h-3.5 w-3.5"/></button></div></header>
   <main className="mx-auto max-w-5xl px-5 py-7 sm:px-8"><div className="mb-5 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/><span>This focus view does not copy the record. It reads the same secured CRM/meeting/project data and sends actions back through the existing business workflow.</span></div><div className="grid gap-5 lg:grid-cols-2"><NextBestActionCard entityType={entityType} entityId={entityId}/><ProductivityPlaybookChecklist entityType={entityType} entityId={entityId}/><div className="lg:col-span-2"><ProductivityCopilot entityType={entityType} entityId={entityId}/></div></div></main>
 </div>;
}
