import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  careerService,
  type CareerApplicationType,
  type CareerCatalogOption,
  type CareerJob,
  type CareerJobStatus,
  type SalesRoleDetails,
} from '../../lib/careerService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const blankJob = (): Partial<CareerJob> => ({
  slug: '',
  title: '',
  shortSummary: '',
  description: '',
  department: 'General',
  category: 'General',
  location: 'Remote',
  workplaceType: 'Remote',
  engagementType: 'Contract',
  experience: '',
  responsibilities: [],
  requirements: [],
  selectionProcess: [],
  compensation: [],
  roleDetails: {},
  coreProductCodes: [],
  additionalServiceCodes: [],
  applicationType: 'general',
  applicationUrl: '',
  applicationCta: 'Apply for this role',
  requiresIntroVideo: false,
  featured: false,
  displayOrder: 0,
  status: 'Draft',
  seoTitle: '',
  seoDescription: '',
});

export default function CareerJobsAdmin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<CareerJob[]>([]);
  const [catalog, setCatalog] = useState<CareerCatalogOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<Partial<CareerJob>>(blankJob());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selected = useMemo(() => jobs.find((job) => job.id === selectedId) || null, [jobs, selectedId]);
  const isSalesRole = form.applicationType === 'sales_representative';
  const packageOptions = useMemo(
    () => catalog.filter((item) => item.productType === 'package' || item.productType === 'custom'),
    [catalog],
  );
  const serviceOptions = useMemo(
    () => catalog.filter((item) => item.productType !== 'package' && item.productType !== 'custom'),
    [catalog],
  );

  const details = form.roleDetails || {};
  const applicationForm = details.applicationForm || {};
  const expectedHours = Number(details.workingArrangement?.expectedHoursPerWeek ?? 35);
  const minimumExperienceMonths = Number(applicationForm.minimumSalesExperienceMonths ?? 6);
  const derivedExperienceLabel = minimumExperienceMonths === 0
    ? 'Sales experience considered on merit'
    : `${minimumExperienceMonths}+ ${minimumExperienceMonths === 1 ? 'month' : 'months'} sales experience`;

  const load = async (preferredId?: string) => {
    setLoading(true);
    setError('');
    try {
      const [rows, products] = await Promise.all([
        careerService.getAdminJobs(),
        careerService.getActiveCatalogOptions(),
      ]);
      setJobs(rows);
      setCatalog(products);
      const id = preferredId && rows.some((job) => job.id === preferredId)
        ? preferredId
        : rows[0]?.id || '';
      setSelectedId(id);
      setForm(id ? rows.find((job) => job.id === id) || blankJob() : blankJob());
    } catch (err: any) {
      setError(err?.message || 'Job posts could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  useEffect(() => {
    if (selected) setForm(selected);
  }, [selected]);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;

  const update = <K extends keyof CareerJob>(key: K, value: CareerJob[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateDetails = (patch: Partial<SalesRoleDetails>) => {
    update('roleDetails', { ...details, ...patch });
  };

  const updateApplicationForm = (patch: NonNullable<SalesRoleDetails['applicationForm']>) => {
    updateDetails({ applicationForm: { ...applicationForm, ...patch } });
  };

  const createNew = () => {
    setSelectedId('');
    setForm(blankJob());
    setError('');
    setMessage('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const title = (form.title || '').trim();
      const slug = slugify(form.slug || title);
      if (!title || !slug) throw new Error('Job title and URL slug are required.');
      if (!(form.shortSummary || '').trim()) throw new Error('Add a short summary for the Careers listing and hero.');
      if (isSalesRole && !(form.coreProductCodes || []).length) throw new Error('Select at least one canonical Sales Catalog product for this Sales role.');
      if (isSalesRole && (minimumExperienceMonths < 0 || minimumExperienceMonths > 600)) throw new Error('Minimum sales experience must be between 0 and 600 months.');
      if (isSalesRole && (expectedHours < 1 || expectedHours > 80)) throw new Error('Expected weekly hours must be between 1 and 80.');
      if (isSalesRole && !(applicationForm.sourceOptions || []).length) throw new Error('Add at least one application source option.');

      const status = (form.status || 'Draft') as CareerJobStatus;
      const payload: Partial<CareerJob> = {
        ...form,
        title,
        slug,
        status,
        compensation: isSalesRole ? [] : form.compensation,
        publishedAt: status === 'Published' ? (form.publishedAt || new Date().toISOString()) : form.publishedAt,
        applicationCta: (form.applicationCta || 'Apply for this role').trim(),
        displayOrder: Number(form.displayOrder || 0),
      };
      if (payload.applicationType === 'external_link' && !payload.applicationUrl) {
        throw new Error('External-link jobs require an application URL.');
      }
      const saved = selectedId
        ? await careerService.updateJob(selectedId, payload)
        : await careerService.createJob(payload);
      await load(saved.id);
      setMessage(status === 'Published'
        ? 'Job saved and published. Careers, the application form and connected screening policy now use this record.'
        : 'Job saved. It is not public until Published.');
    } catch (err: any) {
      setError(err?.message || 'Job post could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !window.confirm('Delete this job post permanently? Closing it is safer if you may need the record later.')) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await careerService.deleteJob(selectedId);
      await load();
      setMessage('Job post deleted.');
    } catch (err: any) {
      setError(err?.message || 'Job post could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/admin/app/recruitment?tab=recruitment')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Back to Recruitment">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-black">Job Posts</h1>
              <p className="text-xs text-slate-500">One role record powers Careers, role expectations and public application policy.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/careers" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-[#000080]">
              Preview Careers <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button onClick={createNew} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-3 py-2 text-xs font-black text-white">
              <Plus className="h-3.5 w-3.5" /> New Job
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[300px_1fr]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6">
          <div className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Career posts</div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" /></div>
          ) : jobs.length ? (
            <div className="space-y-1">
              {jobs.map((job) => (
                <button key={job.id} onClick={() => setSelectedId(job.id)} className={`w-full rounded-2xl p-3 text-left transition ${selectedId === job.id ? 'bg-blue-50 ring-1 ring-[#000080]/15' : 'hover:bg-slate-50'}`}>
                  <div className="text-sm font-black text-slate-900">{job.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                    <span>{job.status}</span>{job.featured && <span className="text-[#000080]">Featured</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : <div className="px-3 py-8 text-center text-xs text-slate-500">No job posts yet.</div>}
        </aside>

        <section>
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}

          <Card title="Listing & hero" description="Featured affects hero priority. Every Published job remains visible in the main Careers list.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title"><input className={inputClass} value={form.title || ''} onChange={(e) => { update('title', e.target.value); if (!selectedId && !form.slug) update('slug', slugify(e.target.value)); }} /></Field>
              <Field label="URL slug"><input className={inputClass} value={form.slug || ''} onChange={(e) => update('slug', slugify(e.target.value))} /></Field>
              <Field label="Short hero/listing line"><input className={inputClass} value={form.shortSummary || ''} onChange={(e) => update('shortSummary', e.target.value)} /></Field>
              <Field label="Display order"><input type="number" className={inputClass} value={form.displayOrder ?? 0} onChange={(e) => update('displayOrder', Number(e.target.value))} /></Field>
              <Field label="Department"><input className={inputClass} value={form.department || ''} onChange={(e) => update('department', e.target.value)} /></Field>
              <Field label="Category"><input className={inputClass} value={form.category || ''} onChange={(e) => update('category', e.target.value)} /></Field>
              <Field label="Location"><input className={inputClass} value={form.location || ''} onChange={(e) => update('location', e.target.value)} /></Field>
              <Field label="Workplace"><select className={inputClass} value={form.workplaceType || 'Remote'} onChange={(e) => update('workplaceType', e.target.value as CareerJob['workplaceType'])}><option>Remote</option><option>Hybrid</option><option>On-site</option></select></Field>
              <Field label="Engagement type"><input className={inputClass} value={form.engagementType || ''} onChange={(e) => update('engagementType', e.target.value)} /></Field>
              <Field label={isSalesRole ? 'Experience label (derived)' : 'Experience'}><input className={`${inputClass} ${isSalesRole ? 'bg-slate-50 text-slate-500' : ''}`} value={isSalesRole ? derivedExperienceLabel : (form.experience || '')} disabled={isSalesRole} onChange={(e) => { if (!isSalesRole) update('experience', e.target.value); }} /></Field>
            </div>
            <Field label="About / role description"><textarea rows={5} className={`${inputClass} mt-4`} value={form.description || ''} onChange={(e) => update('description', e.target.value)} /></Field>
            <div className="mt-4 flex flex-wrap gap-5"><Check label="Feature this job" checked={!!form.featured} onChange={(value) => update('featured', value)} /><Check label="Introduction video required" checked={!!form.requiresIntroVideo} onChange={(value) => update('requiresIntroVideo', value)} /></div>
          </Card>

          <Card title="Core job content" description="Role-specific truth lives here. These values are not copied from the public frontend.">
            <TextArea label="Responsibilities" value={(form.responsibilities || []).join('\n')} onChange={(value) => update('responsibilities', splitLines(value))} rows={8} />
            <TextArea label="Requirements" value={(form.requirements || []).join('\n')} onChange={(value) => update('requirements', splitLines(value))} rows={8} />
            <TextArea label="Selection process" hint="One step per line: Title | Explanation" value={(form.selectionProcess || []).map((item) => `${item.title} | ${item.text}`).join('\n')} onChange={(value) => update('selectionProcess', parseRows(value, 2).map(([title, text]) => ({ title, text })))} rows={7} />
            {!isSalesRole && <TextArea label="Compensation blocks" hint="Generic jobs only. Sales-role pricing and commission remain in their canonical systems." value={(form.compensation || []).map((item) => [item.label, item.price, item.rate, item.example].filter(Boolean).join(' | ')).join('\n')} onChange={(value) => update('compensation', parseRows(value, 4).map(([label, price, rate, example]) => ({ label, price, rate, example })))} rows={5} />}
          </Card>

          <Card title="Application behavior" description="The Sales Representative keeps the protected Sales recruitment pipeline. Generic roles remain separate.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Application type"><select className={inputClass} value={form.applicationType || 'general'} onChange={(e) => update('applicationType', e.target.value as CareerApplicationType)}><option value="sales_representative">Sales Representative secure pipeline</option><option value="general">General / contact route</option><option value="external_link">External application link</option></select></Field>
              <Field label="CTA label"><input className={inputClass} value={form.applicationCta || ''} onChange={(e) => update('applicationCta', e.target.value)} /></Field>
              <Field label="Application URL"><input className={inputClass} value={form.applicationUrl || ''} onChange={(e) => update('applicationUrl', e.target.value)} placeholder="https://... or leave blank for /contact-us" /></Field>
            </div>
            {isSalesRole && <SourceNote title="Protected Sales flow" text="This role uses the canonical structured application, Recruitment pipeline, agreement, Sales Academy and activation gates." />}
          </Card>

          {isSalesRole && <>
            <Card title="Application screening policy" description="One editable source for eligibility and Admin readiness checks.">
              <Field label="Minimum sales experience (months)"><input type="number" min={0} max={600} className={inputClass} value={minimumExperienceMonths} onChange={(e) => updateApplicationForm({ minimumSalesExperienceMonths: Number(e.target.value) })} /></Field>
              <div className="mt-4"><SourceNote title="Weekly availability" text={`Controlled only by Working Arrangement → Expected hours / week (${expectedHours} hours). The application and Admin readiness gate derive from that value automatically.`} /></div>
              <TextArea label="How did you hear about ProFox? options" hint="One option per line. Used directly by the public application form." value={(applicationForm.sourceOptions || []).join('\n')} onChange={(value) => updateApplicationForm({ sourceOptions: splitLines(value) })} rows={7} />
              <SourceNote title="Historical audit" text="Each submitted application preserves a non-editable snapshot of the active requirements, while the current editable truth stays here in Job Posts." />
            </Card>

            <Card title="Connected commercial sources" description="Choose what this role sells. Names, prices and commission rates stay owned by their authoritative systems.">
              <SourceNote title="Sales Catalog" text="Owns product names, prices, scope and commercial descriptions." />
              <SourceNote title="Commission Management" text="Owns base commission, self-generated bonus, high-performance bonus and payout schedule." />
              <div className="mt-6 grid gap-6 lg:grid-cols-2"><ProductPicker title="Core products shown on the job page" options={packageOptions} selected={form.coreProductCodes || []} onChange={(value) => update('coreProductCodes', value)} /><ProductPicker title="Relevant additional services" options={serviceOptions} selected={form.additionalServiceCodes || []} onChange={(value) => update('additionalServiceCodes', value)} /></div>
            </Card>

            <Card title="Sales role operating model" description="These values drive the role page and structured application choices.">
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Role subtitle"><input className={inputClass} value={details.subtitle || ''} onChange={(e) => updateDetails({ subtitle: e.target.value })} /></Field><Field label="Experience note"><input className={inputClass} value={details.experienceNote || ''} onChange={(e) => updateDetails({ experienceNote: e.target.value })} /></Field></div>
              <Field label="Role overview"><textarea rows={4} className={`${inputClass} mt-4`} value={details.roleOverview || ''} onChange={(e) => updateDetails({ roleOverview: e.target.value })} /></Field>
              <TextArea label="Focus markets" hint="Also becomes the public application's target-market choices." value={(details.focusMarkets || []).join('\n')} onChange={(value) => updateDetails({ focusMarkets: splitLines(value) })} rows={5} />
              <TextArea label="Prospecting channels" hint="Also becomes the public application's prospecting-channel choices." value={(details.prospectingChannels || []).join('\n')} onChange={(value) => updateDetails({ prospectingChannels: splitLines(value) })} rows={7} />
              <TextArea label="CRM discipline" value={(details.crmDiscipline || []).join('\n')} onChange={(value) => updateDetails({ crmDiscipline: splitLines(value) })} rows={6} />
              <TextArea label="Ideal candidate traits" value={(details.idealCandidate || []).join('\n')} onChange={(value) => updateDetails({ idealCandidate: splitLines(value) })} rows={7} />
              <TextArea label="Preferred experience" value={(details.preferredExperience || []).join('\n')} onChange={(value) => updateDetails({ preferredExperience: splitLines(value) })} rows={6} />
            </Card>

            <Card title="Target customers & opportunity signals" description="Keep prospecting focused on businesses where ProFox can create legitimate value.">
              <TextArea label="Target customer segments" value={(details.targetCustomers || []).join('\n')} onChange={(value) => updateDetails({ targetCustomers: splitLines(value) })} rows={8} />
              <TextArea label="Digital problem signals" value={(details.digitalProblemSignals || []).join('\n')} onChange={(value) => updateDetails({ digitalProblemSignals: splitLines(value) })} rows={8} />
            </Card>

            <Card title="Working arrangement & performance" description="This is the single editable source for weekly-hours expectations and operating targets.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Working days"><input className={inputClass} value={details.workingArrangement?.workingDays || ''} onChange={(e) => updateDetails({ workingArrangement: { ...details.workingArrangement, workingDays: e.target.value } })} /></Field>
                <Field label="Expected hours / week"><input type="number" min={1} max={80} className={inputClass} value={expectedHours} onChange={(e) => updateDetails({ workingArrangement: { ...details.workingArrangement, expectedHoursPerWeek: Number(e.target.value) } })} /></Field>
                <Field label="Qualified prospects / day"><input className={inputClass} value={details.performanceExpectations?.qualifiedProspectsPerDay || ''} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, qualifiedProspectsPerDay: e.target.value } })} /></Field>
                <Field label="Qualified outreach / day"><input className={inputClass} value={details.performanceExpectations?.qualifiedOutreachPerDay || ''} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, qualifiedOutreachPerDay: e.target.value } })} /></Field>
                <Field label="Calls / day"><input className={inputClass} value={details.performanceExpectations?.callsPerDay || ''} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, callsPerDay: e.target.value } })} /></Field>
                <Field label="Minimum paid sales / month"><input type="number" min={0} className={inputClass} value={details.performanceExpectations?.minimumMonthlyPaidSales ?? 0} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, minimumMonthlyPaidSales: Number(e.target.value) } })} /></Field>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2"><Field label="Follow-up expectation"><input className={inputClass} value={details.performanceExpectations?.followUps || ''} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, followUps: e.target.value } })} /></Field><Field label="Meeting expectation"><input className={inputClass} value={details.performanceExpectations?.meetings || ''} onChange={(e) => updateDetails({ performanceExpectations: { ...details.performanceExpectations, meetings: e.target.value } })} /></Field></div>
              <TextArea label="Equipment requirements" value={(details.equipmentRequirements || []).join('\n')} onChange={(value) => updateDetails({ equipmentRequirements: splitLines(value) })} rows={7} />
            </Card>

            <Card title="Payments & sales authority" description="Candidate-facing boundaries. Protected workflows still enforce the actual financial authority.">
              <TextArea label="Customer payment rules" value={(details.paymentRules || []).join('\n')} onChange={(value) => updateDetails({ paymentRules: splitLines(value) })} rows={7} />
              <TextArea label="Sales authority restrictions" value={(details.authorityRestrictions || []).join('\n')} onChange={(value) => updateDetails({ authorityRestrictions: splitLines(value) })} rows={8} />
              <Field label="Authority note"><input className={inputClass} value={details.authorityNote || ''} onChange={(e) => updateDetails({ authorityNote: e.target.value })} /></Field>
            </Card>

            <Card title="Application & introduction video" description="Candidate-facing requirements and proof instructions for the structured V3 form.">
              <TextArea label="Application requirements shown publicly" value={(details.applicationRequirements || []).join('\n')} onChange={(value) => updateDetails({ applicationRequirements: splitLines(value) })} rows={9} />
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Minimum video seconds"><input type="number" min={1} className={inputClass} value={details.video?.minimumSeconds ?? 60} onChange={(e) => updateDetails({ video: { ...details.video, minimumSeconds: Number(e.target.value) } })} /></Field><Field label="Recommended maximum seconds"><input type="number" min={1} className={inputClass} value={details.video?.recommendedMaximumSeconds ?? 120} onChange={(e) => updateDetails({ video: { ...details.video, recommendedMaximumSeconds: Number(e.target.value) } })} /></Field></div>
              <TextArea label="Video prompts" value={(details.video?.questions || []).join('\n')} onChange={(value) => updateDetails({ video: { ...details.video, questions: splitLines(value) } })} rows={8} />
              <TextArea label="Video standards" value={(details.video?.standards || []).join('\n')} onChange={(value) => updateDetails({ video: { ...details.video, standards: splitLines(value) } })} rows={6} />
              <Field label="Video evaluation explanation"><textarea rows={3} className={`${inputClass} mt-2`} value={details.video?.evaluation || ''} onChange={(e) => updateDetails({ video: { ...details.video, evaluation: e.target.value } })} /></Field>
              <TextArea label="Additional service summary shown to candidates" value={(details.additionalServiceSummary || []).join('\n')} onChange={(value) => updateDetails({ additionalServiceSummary: splitLines(value) })} rows={7} />
            </Card>
          </>}

          <Card title="Publishing & SEO" description="Drafts never appear publicly. Closing a role removes it from Careers without deleting the record.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status"><select className={inputClass} value={form.status || 'Draft'} onChange={(e) => update('status', e.target.value as CareerJobStatus)}><option>Draft</option><option>Published</option><option>Closed</option></select></Field>
              <Field label="Closing date (optional)"><input type="datetime-local" className={inputClass} value={toLocalDateTime(form.closesAt)} onChange={(e) => update('closesAt', e.target.value ? new Date(e.target.value).toISOString() : undefined)} /></Field>
              <Field label="SEO title"><input className={inputClass} value={form.seoTitle || ''} onChange={(e) => update('seoTitle', e.target.value)} /></Field>
              <Field label="SEO description"><textarea rows={3} className={inputClass} value={form.seoDescription || ''} onChange={(e) => update('seoDescription', e.target.value)} /></Field>
            </div>
          </Card>

          <div className="sticky bottom-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
            <div>{selectedId && <button disabled={saving} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Delete</button>}</div>
            <button disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save job</button>
          </div>
        </section>
      </main>
    </div>
  );
}

function ProductPicker({ title, options, selected, onChange }: { title: string; options: CareerCatalogOption[]; selected: string[]; onChange: (codes: string[]) => void }) {
  return <div><h3 className="text-xs font-black text-slate-700">{title}</h3><div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">{options.map((item) => <label key={item.code} className="flex items-start gap-3 rounded-xl bg-white p-3 text-xs"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={selected.includes(item.code)} onChange={(e) => onChange(e.target.checked ? [...selected, item.code] : selected.filter((code) => code !== item.code))} /><span><strong className="block text-slate-800">{item.name}</strong><span className="mt-1 block text-[10px] text-slate-500">{item.category} · {catalogPrice(item)}</span></span></label>)}</div></div>;
}
function SourceNote({ title, text }: { title: string; text: string }) { return <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-slate-600"><strong className="text-[#000080]">{title}:</strong> {text}</div>; }
function Field({ label, children }: { label: string; children: any }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-2">{children}</div></label>; }
function Card({ title, description, children }: { title: string; description: string; children: any }) { return <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-black text-[#000080]">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p><div className="mt-5">{children}</div></section>; }
function TextArea({ label, hint, value, onChange, rows }: { label: string; hint?: string; value: string; onChange: (value: string) => void; rows: number }) { return <label className="mb-5 block text-xs font-black text-slate-600">{label}{hint && <span className="ml-2 font-medium text-slate-400">{hint}</span>}<textarea rows={rows} className={`${inputClass} mt-2 leading-6`} value={value} onChange={(e) => onChange(e.target.value)} /></label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />{label}</label>; }
function Notice({ tone, children }: { tone: 'error' | 'success'; children: any }) { return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
function splitLines(value: string) { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
function parseRows(value: string, count: number) { return splitLines(value).map((line) => { const values = line.split('|').map((item) => item.trim()); while (values.length < count) values.push(''); return values.slice(0, count); }); }
function toLocalDateTime(value?: string) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function catalogPrice(item: CareerCatalogOption) { if (item.priceMode === 'custom') return 'Custom quotation'; const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 0 }).format(item.basePrice); return item.priceMode === 'starting_at' ? `From ${formatted}` : formatted; }
