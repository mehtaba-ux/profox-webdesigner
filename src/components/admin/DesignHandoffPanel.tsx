import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Palette } from 'lucide-react';
import { DesignProjectHandoff, designDeliveryService } from '../../lib/designDeliveryService';

function labelForType(type: string) {
  switch (type) {
    case 'design_file': return 'Approved Figma / Design';
    case 'prototype': return 'Prototype';
    case 'design_system': return 'Design System';
    case 'handoff_notes': return 'Handoff Notes';
    default: return type.replaceAll('_', ' ');
  }
}

export default function DesignHandoffPanel({ projectId }: { projectId: string }) {
  const [handoff, setHandoff] = useState<DesignProjectHandoff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await designDeliveryService.getProjectHandoff(projectId);
        if (active) setHandoff(data);
      } catch {
        if (active) setHandoff(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [projectId]);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" /></div>;
  }
  if (!handoff?.evidence?.length) return null;

  const approved = handoff.clientApproval?.action === 'Approved';
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#000080] shadow-sm"><Palette className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">Approved Design Handoff</div>
            {approved && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Client approved</span>}
            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-slate-600">{handoff.package?.depth || 'Project'} process</span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">Use these governed references as the implementation source of truth. Do not recreate or guess design behavior from screenshots.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {handoff.evidence.map(item => (
              <div key={item.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{labelForType(item.type)}</div>
                    <div className="mt-1 truncate text-[11px] font-bold text-slate-800">{item.label || item.version || labelForType(item.type)}</div>
                    {item.note && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500">{item.note}</p>}
                  </div>
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-[#000080] hover:bg-blue-50" title={`Open ${labelForType(item.type)}`}><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
