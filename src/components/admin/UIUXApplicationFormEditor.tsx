import { ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, LockKeyhole, Settings2 } from 'lucide-react';
import type { CareerApplicationFieldConfig, CareerApplicationFormConfig, CareerApplicationStepConfig } from '../../lib/careerService';
import { getUIUXApplicationConfig, UIUX_FIELD_MAP } from '../../lib/uiuxApplicationFormConfig';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

export default function UIUXApplicationFormEditor({ config: rawConfig, slug, onChange }:{config?:CareerApplicationFormConfig;slug:string;onChange:(config:CareerApplicationFormConfig)=>void}) {
  const config = getUIUXApplicationConfig(rawConfig);
  const fields = config.fieldConfig || {};
  const steps = config.steps || [];

  const patch = (next: Partial<CareerApplicationFormConfig>) => onChange({ ...config, ...next });
  const patchIntro = (key: keyof NonNullable<CareerApplicationFormConfig['intro']>, value: string) => patch({ intro:{ ...(config.intro || {}), [key]:value } });
  const patchField = (id:string, next:Partial<CareerApplicationFieldConfig>) => patch({ fieldConfig:{ ...fields, [id]:{ ...(fields[id] || {}), ...next } } });
  const patchStep = (index:number, next:Partial<CareerApplicationStepConfig>) => patch({ steps:steps.map((step,i)=>i===index?{...step,...next}:step) });

  const moveField = (stepIndex:number, fieldIndex:number, direction:-1|1) => {
    const current = [...(steps[stepIndex]?.fields || [])];
    const target = fieldIndex + direction;
    if (target < 0 || target >= current.length) return;
    [current[fieldIndex],current[target]] = [current[target],current[fieldIndex]];
    patchStep(stepIndex,{fields:current});
  };

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-[#f8faff] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#FF0E0E]"><Settings2 className="h-3.5 w-3.5"/>UI/UX application form</div>
            <h2 className="mt-2 text-xl font-black text-[#071126]">Form content, requirements & order</h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">Changes saved with this job become the public form configuration. Security-critical fields stay locked so the form cannot accidentally lose identity, portfolio, CV or consent requirements.</p>
          </div>
          {slug && <a href={`/careers/${slug}#apply`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-[#000080]">Preview form <ExternalLink className="h-3.5 w-3.5"/></a>}
        </div>
      </div>

      <div className="space-y-8 p-6">
        <div>
          <AdminHeading title="Form introduction" description="Edit the copy shown beside the multi-step form." />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Eyebrow"><input className={inputClass} value={config.intro?.eyebrow || ''} onChange={(e)=>patchIntro('eyebrow',e.target.value)}/></Field>
            <Field label="Main heading"><input className={inputClass} value={config.intro?.title || ''} onChange={(e)=>patchIntro('title',e.target.value)}/></Field>
            <Field label="Description" full><textarea rows={3} className={inputClass} value={config.intro?.description || ''} onChange={(e)=>patchIntro('description',e.target.value)}/></Field>
            <Field label="Commercial notice" full><textarea rows={2} className={inputClass} value={config.intro?.notice || ''} onChange={(e)=>patchIntro('notice',e.target.value)}/></Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-7">
          <AdminHeading title="Screening defaults" description="These values are used by both the form and the protected submission workflow." />
          <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
            <Field label="Minimum weekly hours"><input type="number" min={1} max={80} className={inputClass} value={Number(config.minimumWeeklyHours || 20)} onChange={(e)=>patch({minimumWeeklyHours:Number(e.target.value)})}/></Field>
            <Field label="Recruitment source options"><textarea rows={4} className={inputClass} value={(config.sourceOptions || []).join('\n')} onChange={(e)=>patch({sourceOptions:splitLines(e.target.value)})}/><div className="mt-1 text-[10px] text-slate-400">One option per line. The public form reads this list directly.</div></Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-7">
          <AdminHeading title="Steps & fields" description="Edit labels, helper text, options, visibility, required status and field order. Field types remain controlled by the application code." />
          <div className="mt-5 space-y-5">
            {steps.map((step,stepIndex)=><div key={step.id} className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <Field label={`Step ${stepIndex+1} title`}><input className={inputClass} value={step.title || ''} onChange={(e)=>patchStep(stepIndex,{title:e.target.value})}/></Field>
                <Field label="Step description"><input className={inputClass} value={step.description || ''} onChange={(e)=>patchStep(stepIndex,{description:e.target.value})}/></Field>
              </div>
              <div className="divide-y divide-slate-100">
                {(step.fields || []).map((id,fieldIndex)=>{
                  const definition = UIUX_FIELD_MAP[id];
                  if (!definition) return null;
                  const current = fields[id] || {};
                  const locked = Boolean(definition.lockedRequired);
                  const visible = current.visible !== false;
                  return <div key={id} className="p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                      <div className="w-full xl:w-52">
                        <div className="flex items-center gap-2 text-xs font-black text-[#071126]">{current.label || definition.label}{locked&&<LockKeyhole className="h-3.5 w-3.5 text-[#000080]"/>}</div>
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{definition.kind} · {id}</div>
                        <div className="mt-3 flex items-center gap-1">
                          <button type="button" aria-label="Move field up" disabled={fieldIndex===0} onClick={()=>moveField(stepIndex,fieldIndex,-1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5"/></button>
                          <button type="button" aria-label="Move field down" disabled={fieldIndex===(step.fields || []).length-1} onClick={()=>moveField(stepIndex,fieldIndex,1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5"/></button>
                        </div>
                      </div>
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Field label="Label"><input className={inputClass} value={current.label || ''} onChange={(e)=>patchField(id,{label:e.target.value})}/></Field>
                        <Field label="Placeholder"><input className={inputClass} value={current.placeholder || ''} onChange={(e)=>patchField(id,{placeholder:e.target.value})}/></Field>
                        <Field label="Helper text" full><input className={inputClass} value={current.help || ''} onChange={(e)=>patchField(id,{help:e.target.value})}/></Field>
                        {(definition.kind==='select'||definition.kind==='multiselect') && id!=='heardAboutSource' && <Field label="Options" full><textarea rows={3} className={inputClass} value={(current.options || definition.options || []).join('\n')} onChange={(e)=>patchField(id,{options:splitLines(e.target.value)})}/><div className="mt-1 text-[10px] text-slate-400">One option per line.</div></Field>}
                      </div>
                      <div className="flex gap-2 xl:w-44 xl:flex-col">
                        <button type="button" disabled={locked} onClick={()=>patchField(id,{visible:!visible})} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black ${visible?'border-blue-100 bg-blue-50 text-[#000080]':'border-slate-200 bg-slate-50 text-slate-500'} disabled:cursor-not-allowed disabled:opacity-60`}>{visible?<Eye className="h-3.5 w-3.5"/>:<EyeOff className="h-3.5 w-3.5"/>}{visible?'Visible':'Hidden'}</button>
                        <button type="button" disabled={locked} onClick={()=>patchField(id,{required:!Boolean(current.required)})} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black ${locked||current.required?'border-red-100 bg-red-50 text-red-700':'border-slate-200 bg-white text-slate-500'} disabled:cursor-not-allowed disabled:opacity-70`}>{locked&&<LockKeyhole className="h-3.5 w-3.5"/>}{locked?'Required':current.required?'Required':'Optional'}</button>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </div>)}
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs leading-6 text-slate-600">
          <strong className="font-black text-[#000080]">How saving works:</strong> this editor changes only the UI/UX Designer application configuration inside the selected Job Post. Use the main <strong>Save Changes</strong> button below to publish the configuration. Previously submitted applications keep their captured policy snapshot.
        </div>
      </div>
    </section>
  );
}

function AdminHeading({title,description}:{title:string;description:string}) { return <div><h3 className="text-sm font-black text-[#071126]">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>; }
function Field({label,full=false,children}:{label:string;full?:boolean;children:React.ReactNode}) { return <label className={full?'sm:col-span-2':''}><div className="mb-1.5 text-[11px] font-black text-slate-600">{label}</div>{children}</label>; }
function splitLines(value:string) { return value.split('\n').map((item)=>item.trim()).filter(Boolean); }
