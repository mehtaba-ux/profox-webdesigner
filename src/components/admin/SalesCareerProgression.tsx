import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Loader2, RefreshCw, Save, ShieldCheck, Target, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { careerService, type CareerCatalogOption } from '../../lib/careerService';
import {
  careerProgressionService,
  type CareerProgressionAdminPayload,
  type CareerProgressionCriterion,
  type CareerProgressionProgress,
  type CareerProgressionReviewStatus,
  type CareerProgressionSettings
} from '../../lib/careerProgressionService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-50';
const reviewStatuses: CareerProgressionReviewStatus[] = ['Eligible','Under Review','Proposal Offered','Accepted','Declined','Not Offered','No Longer Eligible'];

export default function SalesCareerProgression() {
  const navigate = useNavigate();
  const { isAdmin, role, status, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mine, setMine] = useState<CareerProgressionProgress | null>(null);
  const [adminData, setAdminData] = useState<CareerProgressionAdminPayload | null>(null);
  const [settings, setSettings] = useState<CareerProgressionSettings | null>(null);
  const [thresholds, setThresholds] = useState<CareerProgressionCriterion[]>([]);
  const [catalog, setCatalog] = useState<CareerCatalogOption[]>([]);

  const isSales = ['sales','sales_rep','sales_team'].includes(String(role));

  const load = async () => {
    setLoading(true); setError('');
    try {
      if (isAdmin) {
        const [data, products] = await Promise.all([careerProgressionService.getAdmin(), careerService.getActiveCatalogOptions()]);
        setAdminData(data); setSettings(data.settings); setThresholds(data.thresholds);
        setCatalog(products.filter(item => item.productType === 'package'));
      } else if (isSales && status === 'active') {
        setMine(await careerProgressionService.getMine());
      }
    } catch (err: any) { setError(err?.message || 'Career progression could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!authLoading) void load(); }, [authLoading, isAdmin, isSales, status]);

  const savePolicy = async () => {
    if (!settings) return;
    if (!thresholds.length) { setError('Add at least one verified-sales threshold.'); return; }
    if (new Set(thresholds.map(item => item.productCode)).size !== thresholds.length) { setError('Each product can appear only once in the progression policy.'); return; }
    if (thresholds.some(item => !item.productCode || Number(item.requiredSales) <= 0)) { setError('Every threshold needs a Sales Catalog product and a target greater than zero.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      const data = await careerProgressionService.save(settings, thresholds);
      setAdminData(data); setSettings(data.settings); setThresholds(data.thresholds);
      setMessage('Career progression policy saved. A new policy version is now active.');
    } catch (err: any) { setError(err?.message || 'Career progression policy could not be saved.'); }
    finally { setSaving(false); }
  };

  const updateReview = async (person: CareerProgressionAdminPayload['salespeople'][number], next: CareerProgressionReviewStatus) => {
    const review = person.review;
    if (!review?.id) { setError('This salesperson does not have an eligibility review yet.'); return; }
    let notes = review.review_notes || '';
    let salary: number | null = review.proposal_monthly_salary ?? settings?.defaultMonthlySalary ?? null;
    let currency = review.proposal_currency || settings?.salaryCurrency || 'USD';
    let incentive = review.proposal_incentive_notes || settings?.incentiveDescription || '';
    if (next === 'Proposal Offered') {
      const salaryRaw = window.prompt('Monthly salary for this proposal. Leave blank if it will be stated separately:', salary == null ? '' : String(salary));
      if (salaryRaw === null) return;
      salary = salaryRaw.trim() === '' ? null : Number(salaryRaw);
      if (salary !== null && (!Number.isFinite(salary) || salary < 0)) { setError('Enter a valid monthly salary or leave it blank.'); return; }
      currency = window.prompt('Proposal currency:', currency) || currency;
      incentive = window.prompt('Commission or incentive terms for this proposal:', incentive) ?? incentive;
    }
    const noteInput = window.prompt('Management note for this review:', notes);
    if (noteInput === null) return;
    notes = noteInput;
    if (!window.confirm(`Change ${person.name || person.email} to "${next}"? This is a management decision and will be recorded.`)) return;
    setSaving(true); setError(''); setMessage('');
    try {
      await careerProgressionService.updateReview(review.id, next, notes, salary, currency, incentive);
      await load();
      setMessage(`Career progression review updated to ${next}.`);
    } catch (err: any) { setError(err?.message || 'Review could not be updated.'); }
    finally { setSaving(false); }
  };

  if (authLoading || loading) return <div className="flex min-h-[520px] items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!isAdmin && !(isSales && status === 'active')) return <div className="min-h-screen bg-slate-50 p-10 text-center text-sm text-slate-500">Active Sales or Admin access is required.</div>;

  return <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/app/commissions?tab=my_commissions')} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div><h1 className="text-xl font-black">Sales Career Progression</h1><p className="text-xs text-slate-500">Verified-sales progress and management-reviewed salaried opportunity eligibility.</p></div>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-[#000080]"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
    </header>

    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
      <div className="rounded-3xl bg-gradient-to-r from-[#000080] via-[#11153d] to-[#00005c] p-6 text-white shadow-xl sm:p-8">
        <div className="flex items-start gap-4"><div className="rounded-2xl bg-white/10 p-3"><TrendingUp className="h-6 w-6" /></div><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Performance to opportunity</div><h2 className="mt-2 text-2xl font-black">Earn the review. Management makes the decision.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100/85">Only unique sales backed by verified customer payments count. Payment installments do not multiply a sale. Meeting a configured threshold creates eligibility for management review, not an automatic employment or salary decision.</p></div></div>
      </div>

      {isAdmin && settings && adminData ? <AdminView settings={settings} setSettings={setSettings} thresholds={thresholds} setThresholds={setThresholds} catalog={catalog} data={adminData} saving={saving} onSave={savePolicy} onReview={updateReview} /> : mine ? <SellerView progress={mine} /> : null}
    </main>
  </div>;
}

function AdminView({ settings, setSettings, thresholds, setThresholds, catalog, data, saving, onSave, onReview }: {
  settings: CareerProgressionSettings; setSettings: (value: CareerProgressionSettings) => void;
  thresholds: CareerProgressionCriterion[]; setThresholds: (value: CareerProgressionCriterion[]) => void;
  catalog: CareerCatalogOption[]; data: CareerProgressionAdminPayload; saving: boolean; onSave: () => Promise<void>;
  onReview: (person: CareerProgressionAdminPayload['salespeople'][number], status: CareerProgressionReviewStatus) => Promise<void>;
}) {
  const pending = useMemo(() => data.salespeople.filter(person => ['Eligible','Under Review','Proposal Offered'].includes(person.review?.status || '')), [data.salespeople]);
  const patch = (partial: Partial<CareerProgressionSettings>) => setSettings({ ...settings, ...partial });
  return <>
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">One policy source</div><h2 className="mt-2 text-xl font-black text-[#000080]">Eligibility policy</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">These settings drive the public job page, seller progress and Admin review detection. Package prices are still controlled only in Sales Catalog; commission rates remain only in Commission Management.</p></div><div className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-[#000080]">Policy v{settings.policyVersion}</div></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Check label="Program enabled" checked={settings.enabled} onChange={value => patch({ enabled:value })} />
        <Check label="Show progression on public job page" checked={settings.publicVisible} onChange={value => patch({ publicVisible:value })} />
        <Check label="Show salary amount publicly" checked={settings.publicShowSalaryAmount} onChange={value => patch({ publicShowSalaryAmount:value })} />
        <Field label="Qualification rule"><select className={inputClass} value={settings.qualificationMode} onChange={e => patch({ qualificationMode:e.target.value as 'ANY'|'ALL' })}><option value="ANY">Any enabled threshold qualifies</option><option value="ALL">All enabled thresholds are required</option></select></Field>
        <Field label="Measurement period"><select className={inputClass} value={settings.periodType} onChange={e => patch({ periodType:e.target.value as CareerProgressionSettings['periodType'] })}><option value="calendar_month">Calendar month</option><option value="rolling_30_days">Rolling 30 days</option><option value="quarter">Calendar quarter</option></select></Field>
        <Field label="Minimum total verified sales"><input type="number" min="0" className={inputClass} value={settings.minimumTotalSales} onChange={e => patch({ minimumTotalSales:Number(e.target.value) })} /></Field>
        <Field label="Minimum active days"><input type="number" min="0" className={inputClass} value={settings.minimumActiveDays} onChange={e => patch({ minimumActiveDays:Number(e.target.value) })} /></Field>
        <Field label="Default monthly salary (internal)"><input type="number" min="0" className={inputClass} value={settings.defaultMonthlySalary ?? ''} onChange={e => patch({ defaultMonthlySalary:e.target.value === '' ? null : Number(e.target.value) })} /></Field>
        <Field label="Salary currency"><input className={inputClass} value={settings.salaryCurrency} onChange={e => patch({ salaryCurrency:e.target.value.toUpperCase() })} /></Field>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="Public heading"><input className={inputClass} value={settings.publicTitle} onChange={e => patch({ publicTitle:e.target.value })} /></Field><Field label="Incentive description"><input className={inputClass} value={settings.incentiveDescription} onChange={e => patch({ incentiveDescription:e.target.value })} /></Field></div>
      <Field label="Public explanation"><textarea rows={3} className={`${inputClass} mt-2`} value={settings.publicDescription} onChange={e => patch({ publicDescription:e.target.value })} /></Field>

      <div className="mt-8 border-t border-slate-200 pt-6"><div className="flex items-center justify-between gap-3"><div><h3 className="font-black text-slate-900">Verified-sales thresholds</h3><p className="mt-1 text-xs text-slate-500">Select canonical Sales Catalog packages. Do not enter package prices here.</p></div><button onClick={() => setThresholds([...thresholds,{ productCode:catalog.find(item => !thresholds.some(t => t.productCode===item.code))?.code || '', productName:'', requiredSales:1, enabled:true, sortOrder:thresholds.length+1 }])} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-[#000080]">Add threshold</button></div>
        <div className="mt-4 space-y-3">{thresholds.map((threshold,index) => <div key={`${threshold.productCode}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_150px_auto] sm:items-end"><Field label="Sales Catalog package"><select className={inputClass} value={threshold.productCode} onChange={e => { const next=[...thresholds]; const product=catalog.find(item=>item.code===e.target.value); next[index]={...threshold,productCode:e.target.value,productName:product?.name || e.target.value}; setThresholds(next); }}><option value="">Select package</option>{catalog.map(product => <option key={product.code} value={product.code}>{product.name} ({money(product.basePrice,product.currency,product.priceMode)})</option>)}</select></Field><Field label="Verified sales required"><input type="number" min="1" className={inputClass} value={threshold.requiredSales} onChange={e => { const next=[...thresholds]; next[index]={...threshold,requiredSales:Number(e.target.value)}; setThresholds(next); }} /></Field><button onClick={() => setThresholds(thresholds.filter((_,i)=>i!==index))} className="rounded-xl border border-red-200 px-3 py-2.5 text-xs font-black text-red-600">Remove</button></div>)}</div>
      </div>
      <div className="mt-6 flex justify-end"><button disabled={saving} onClick={() => void onSave()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save progression policy</button></div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Management queue</div><h2 className="mt-2 text-xl font-black text-[#000080]">Sales progression reviews</h2></div><div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{pending.length} open</div></div>
      {data.salespeople.length ? <div className="mt-5 space-y-4">{data.salespeople.map(person => <div key={person.userId} className="rounded-2xl border border-slate-200 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="font-black text-slate-900">{person.name || 'Sales Representative'}</div><div className="mt-1 text-xs text-slate-500">{person.email}</div></div><div className={`rounded-full px-3 py-1 text-xs font-black ${person.progress.eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{person.review?.status || (person.progress.eligible ? 'Eligible' : 'In progress')}</div></div><Progress progress={person.progress} />{person.review?.id && <div className="mt-4 flex flex-wrap gap-2">{reviewStatuses.filter(item => item !== person.review?.status).map(next => <button key={next} disabled={saving} onClick={() => void onReview(person,next)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-600 hover:border-[#000080] hover:text-[#000080] disabled:opacity-50">{next}</button>)}</div>}</div>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No active Sales users yet. Progress will appear here automatically after activation.</div>}
    </section>
  </>;
}

function SellerView({ progress }: { progress: CareerProgressionProgress }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start gap-4"><div className={`rounded-2xl p-3 ${progress.eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-[#000080]'}`}>{progress.eligible ? <CheckCircle2 className="h-6 w-6" /> : <Target className="h-6 w-6" />}</div><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Your verified-sales progress</div><h2 className="mt-2 text-2xl font-black text-[#000080]">{progress.eligible ? 'Eligible for management review' : 'Keep building verified sales'}</h2><p className="mt-2 text-sm leading-6 text-slate-600">Period: {dateLabel(progress.periodStart)} to {dateLabel(progress.periodEnd)}. Only unique deals with verified customer payments count. Eligibility is not an automatic salary or employment offer.</p></div></div><Progress progress={progress} />{progress.review && <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700"><strong className="text-[#000080]">Management review status:</strong> {progress.review.status}</div>}</section>;
}

function Progress({ progress }: { progress: CareerProgressionProgress }) { return <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{progress.criteria.map(item => { const pct=Math.min(100,Math.round((Number(item.currentSales||0)/Math.max(1,Number(item.requiredSales)))*100)); return <div key={item.productCode} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex justify-between gap-2 text-xs font-black"><span>{item.productName}</span><span className={item.met ? 'text-emerald-700' : 'text-slate-500'}>{item.currentSales || 0}/{item.requiredSales}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#000080] transition-all" style={{ width:`${pct}%` }} /></div></div>; })}</div>; }
function Field({ label, children }: { label:string; children:any }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-2">{children}</div></label>; }
function Check({ label, checked, onChange }: { label:string; checked:boolean; onChange:(value:boolean)=>void }) { return <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-700"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="h-4 w-4" />{label}</label>; }
function Notice({ tone, children }: { tone:'error'|'success'; children:any }) { return <div className={`rounded-2xl border p-4 text-sm font-semibold ${tone==='error'?'border-red-200 bg-red-50 text-red-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
function money(value:number,currency='USD',mode='fixed'){ if(mode==='custom') return 'Custom'; return `${mode==='starting_at'?'From ':''}${new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(value)}`; }
function dateLabel(value:string){ if(!value) return ''; return new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); }
