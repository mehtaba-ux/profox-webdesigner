import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  UserRoundCheck
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { SalesHandoffBrief, salesHandoffService } from '../../lib/salesHandoffService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team', 'seller'];
const VIEW_ROLES = [...SELLER_ROLES, 'project_manager'];

const ONBOARDING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'projectGoals', label: 'Project Goals' },
  { key: 'targetAudience', label: 'Target Audience' },
  { key: 'primaryOffer', label: 'Primary Offer' },
  { key: 'competitors', label: 'Competitors / References' },
  { key: 'communicationPreference', label: 'Communication Preference' },
  { key: 'timezone', label: 'Timezone' },
  { key: 'generalDeliveryNotes', label: 'Client Delivery Notes' }
];

function formatMoney(value?: number | null, currency?: string | null) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${amount.toLocaleString()}`;
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SalesProjectHandoverView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const active = Boolean(user && profile && profile.status === 'active');
  const isSeller = Boolean(active && profile && SELLER_ROLES.includes(profile.role));
  const allowed = Boolean(active && profile && (isAdmin || VIEW_ROLES.includes(profile.role)));
  const canCorrectRequirements = Boolean(isSeller || isAdmin);
  const [brief, setBrief] = useState<SalesHandoffBrief | null>(null);
  const [notes, setNotes] = useState('');
  const [requirementsDraft, setRequirementsDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requirementsSaving, setRequirementsSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [requirementsMessage, setRequirementsMessage] = useState('');

  const load = async () => {
    if (!allowed || !id) return;
    setLoading(true);
    setError('');
    try {
      const next = await salesHandoffService.getBrief(id);
      setBrief(next);
      setNotes(next.sellerNotes || '');
      setRequirementsDraft(next.requirementsSummary || '');
    } catch (err: any) {
      setError(err?.message || 'The protected Sales handoff brief could not be loaded.');
      setBrief(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, id]);

  const saveRequirements = async () => {
    if (!brief || !canCorrectRequirements || requirementsSaving || brief.requirementsComplete) return;
    setRequirementsSaving(true);
    setRequirementsMessage('');
    setError('');
    try {
      await salesHandoffService.correctRequirements(brief.projectId, requirementsDraft.trim());
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setRequirementsDraft(refreshed.requirementsSummary || '');
      setRequirementsMessage('Seller requirements saved to the canonical Sales opportunity and project.');
    } catch (err: any) {
      setError(err?.message || 'Seller requirements could not be saved.');
    } finally {
      setRequirementsSaving(false);
    }
  };

  const submit = async () => {
    if (!brief || saving || !isSeller || !brief.readyToSend) return;
    setSaving(true);
    setSubmitted(false);
    setError('');
    try {
      await salesHandoffService.submit(brief.projectId, notes.trim());
      const refreshed = await salesHandoffService.getBrief(brief.projectId);
      setBrief(refreshed);
      setNotes(refreshed.sellerNotes || '');
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'The client brief could not be sent to Project Management.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin" replace />;

  const onboardingInputs = brief
    ? ONBOARDING_FIELDS.filter(field => String(brief.discovery?.[field.key] || '').trim())
    : [];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={() => navigate('/admin/seller-command-center')}
          className="mb-5 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#000080]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Seller Command Center
        </button>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 bg-slate-50/80 p-6 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#000080] p-3 text-white"><ClipboardCheck className="h-5 w-5" /></div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales → Project Management</div>
                  <h1 className="mt-1 text-2xl font-black">Review & Send Production Brief</h1>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
                    Seller requirements are confirmed before quotation. The accepted quotation, verified payment and completed client onboarding then complete the production brief. Review those canonical records here before handoff.
                  </p>
                </div>
              </div>
              {brief && <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${brief.readyToSend ? 'bg-amber-100 text-amber-800' : brief.sellerHandoffDone ? 'bg-emerald-100 text-emerald-800' : !brief.requirementsComplete ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{brief.readyToSend ? 'Ready for Handoff' : brief.sellerHandoffDone ? 'Sales Handoff Sent' : !brief.requirementsComplete ? 'Seller Requirements Needed' : brief.projectStage}</span>}
            </div>
          </header>

          <div className="p-6 sm:p-8">
            {loading ? (
              <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>
            ) : error && !brief ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
            ) : brief ? (
              <div className="space-y-7">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Project" value={brief.projectName || 'Project'} />
                  <Info label="Project Number" value={brief.projectNumber || 'Pending'} />
                  <Info label="Package" value={brief.packageSnapshot || 'Accepted custom scope'} />
                  <Info label="Current Stage" value={brief.projectStage || 'Sales Handover'} />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <SummaryCard
                    icon={<FileText className="h-4 w-4 text-[#000080]" />}
                    title="Accepted Quotation"
                    primary={brief.quotation.number || 'Quotation'}
                    secondary={`${brief.quotation.status || 'Accepted'} · ${formatMoney(brief.quotation.total, brief.quotation.currency)}`}
                    foot={`Accepted ${formatDate(brief.quotation.acceptedAt)}`}
                  />
                  <SummaryCard
                    icon={<CreditCard className="h-4 w-4 text-emerald-700" />}
                    title="Verified Payment"
                    primary={brief.payment.reference || 'Verified payment'}
                    secondary={`${brief.payment.type || 'Payment'} · ${formatMoney(brief.payment.amountPaid, brief.payment.currency)}`}
                    foot={brief.payment.verified ? `Verified ${formatDate(brief.payment.verifiedAt)}` : 'Payment verification is required'}
                  />
                  <SummaryCard
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />}
                    title="Client Onboarding"
                    primary={brief.onboarding.status || 'Not available'}
                    secondary={`${brief.onboarding.responseCount} responses / ${brief.onboarding.questionCount} questions`}
                    foot={brief.onboarding.completed ? `Completed ${formatDate(brief.onboarding.completedAt)}` : 'Must be completed before handoff'}
                  />
                </div>

                {brief.requirementsComplete ? (
                  <BriefSection title="Seller Requirements — Confirmed Before Quotation" empty="Seller requirements are required before production handoff.">
                    {brief.requirementsSummary}
                  </BriefSection>
                ) : (
                  <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
                    <h2 className="text-sm font-black text-amber-950">Legacy record: Seller requirements are missing</h2>
                    <p className="mt-2 text-xs leading-5 text-amber-800">
                      This paid project was created before the requirements safeguard existed. Do not repeat client onboarding and do not invent requirements. The source Seller must enter the real requirements already confirmed with the client before this brief can be sent.
                    </p>
                    {canCorrectRequirements ? (
                      <>
                        <textarea
                          value={requirementsDraft}
                          onChange={event => { setRequirementsDraft(event.target.value); setRequirementsMessage(''); setError(''); }}
                          rows={6}
                          maxLength={20000}
                          className="mt-4 w-full rounded-2xl border border-amber-200 bg-white p-4 text-sm leading-6 outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10"
                          placeholder="Enter the real requirements confirmed by the Seller before quotation..."
                        />
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-[10px] font-semibold text-amber-800">This updates the existing Opportunity + Project requirements only. It creates no duplicate record.</span>
                          <button
                            type="button"
                            onClick={() => void saveRequirements()}
                            disabled={requirementsSaving || requirementsDraft.trim().length < 10}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {requirementsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Save Seller Requirements
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-3 text-xs font-bold text-amber-900">The source Seller or an Administrator must correct this historical requirements record.</p>
                    )}
                  </section>
                )}

                {requirementsMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{requirementsMessage}</div>}

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
                  <div className="flex items-center gap-2 font-black"><ShieldCheck className="h-4 w-4" /> Requirements and client onboarding are pre-production prerequisites.</div>
                  <p className="mt-1">Project Management validates the production brief once. After the handoff review is complete, the protected delivery workflow releases the project directly to Content.</p>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <BriefSection title="Purchased Scope" empty="The accepted quotation/package remains the canonical scope record.">
                    {brief.scopeSummary}
                  </BriefSection>
                  <BriefSection title="Exclusions" empty="No additional exclusions are recorded outside the accepted quotation.">
                    {brief.exclusions}
                  </BriefSection>
                </div>

                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black">Completed Client Onboarding Inputs</h2>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">Read-only answers captured from the secure client onboarding form after the verified first payment.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-slate-600">{brief.onboarding.responseCount} captured answers</span>
                  </div>
                  {onboardingInputs.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">No summarized onboarding fields are available. The complete onboarding record remains attached to the project.</div>
                  ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {onboardingInputs.map(field => <OnboardingItem key={field.key} label={field.label} value={String(brief.discovery[field.key] || '')} />)}
                    </div>
                  )}
                </section>

                <section className={`rounded-2xl border p-5 ${brief.projectManager.id ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="flex items-start gap-3">
                    <UserRoundCheck className={`mt-0.5 h-5 w-5 ${brief.projectManager.id ? 'text-blue-700' : 'text-amber-700'}`} />
                    <div>
                      <div className={`text-sm font-black ${brief.projectManager.id ? 'text-blue-950' : 'text-amber-950'}`}>{brief.projectManager.id ? 'Project Manager assigned' : 'Project Manager assignment pending'}</div>
                      <p className={`mt-1 text-xs leading-5 ${brief.projectManager.id ? 'text-blue-800' : 'text-amber-800'}`}>
                        {brief.projectManager.id
                          ? `${brief.projectManager.name || 'Assigned Project Manager'} will receive the protected production brief for final validation before Content.`
                          : 'You can send the completed Sales handoff once all prerequisites are present. Management will be notified automatically to assign a Project Manager before Content can begin.'}
                      </p>
                    </div>
                  </div>
                </section>

                {brief.sellerHandoffDone ? (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 className="h-5 w-5" /> Sales handoff has been sent.</div>
                    <p className="mt-2 text-xs leading-5 text-emerald-800">Sales ownership is complete. Project Management now validates the canonical production brief and releases the project to Content.</p>
                    {brief.sellerNotes && <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Final Sales note</div><div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{brief.sellerNotes}</div></div>}
                  </section>
                ) : (
                  <section>
                    <label className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Additional Sales commitments / exceptions</label>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Optional. Record only something promised or clarified by Sales that is not already in the confirmed Seller requirements, accepted quotation or completed client onboarding. Leave blank when there is nothing additional.</p>
                    <textarea
                      value={notes}
                      onChange={event => { setNotes(event.target.value); setSubmitted(false); setError(''); }}
                      rows={6}
                      maxLength={10000}
                      disabled={!isSeller || !brief.readyToSend}
                      className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10 disabled:cursor-not-allowed disabled:opacity-60"
                      placeholder="Optional: add only a Sales-only commitment or exception not already captured..."
                    />
                    <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-400">
                      <span>Blank is valid and will be recorded as no additional Sales commitments.</span>
                      <span className="font-bold">{notes.length.toLocaleString()} / 10,000</span>
                    </div>
                  </section>
                )}

                {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
                {submitted && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Production brief sent through the protected Sales-to-Project-Management workflow.</div>}

                {!brief.sellerHandoffDone && (
                  <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> No duplicate requirements, onboarding, project, or handoff record is created.</div>
                    {isSeller ? (
                      <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={saving || !brief.readyToSend}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send Production Brief to Project Manager
                      </button>
                    ) : (
                      <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[10px] font-black text-slate-500">Read-only handoff review</span>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>;
}

function SummaryCard({ icon, title, primary, secondary, foot }: { icon: React.ReactNode; title: string; primary: string; secondary: string; foot: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{icon}{title}</div><div className="mt-3 text-sm font-black text-slate-900">{primary}</div><div className="mt-1 text-xs font-bold text-slate-600">{secondary}</div><div className="mt-3 text-[10px] text-slate-400">{foot}</div></div>;
}

function BriefSection({ title, empty, children }: { title: string; empty: string; children?: string | null }) {
  const value = String(children || '').trim();
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black">{title}</h2><p className={`mt-3 whitespace-pre-wrap text-xs leading-5 ${value ? 'text-slate-700' : 'text-slate-400'}`}>{value || empty}</p></section>;
}

function OnboardingItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{value}</div></div>;
}
