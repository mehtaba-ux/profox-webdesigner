import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { projectService } from '../../lib/projectService';

const SELLER_ROLES = ['sales', 'sales_rep', 'sales_team'];

export default function SalesProjectHandoverView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [project, setProject] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const allowed = Boolean(
    user && profile && profile.status === 'active' && SELLER_ROLES.includes(profile.role)
  );

  useEffect(() => {
    if (!allowed || !id) return;
    let mounted = true;
    setLoading(true);
    projectService.getProjectById(id).then(({ data, error: projectError }) => {
      if (!mounted) return;
      if (projectError || !data) {
        setError(projectError?.message || 'Project not found or you do not have access.');
      } else {
        setProject(data);
        setNotes(data.salesHandoverNotes || data.sales_handover_notes || '');
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [allowed, id]);

  const submit = async () => {
    if (!project || saving) return;
    const clean = notes.trim();
    if (clean.length < 10) {
      setError('Add meaningful customer and delivery context before submitting the handover.');
      return;
    }
    setSaving(true);
    setError('');
    const { data, error: submitError } = await projectService.submitSalesHandover(project.id, clean);
    if (submitError || !data) {
      setError(submitError?.message || 'Sales handover could not be submitted.');
    } else {
      setProject((current: any) => current ? { ...current, salesHandoverNotes: clean, sales_handover_notes: clean } : current);
      setSubmitted(true);
    }
    setSaving(false);
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50" />;
  if (!allowed) return <Navigate to="/admin" replace />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate('/admin/app/projects?tab=projects')}
          className="mb-5 inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#000080]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 bg-slate-50/80 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[#000080] p-3 text-white"><FileText className="h-5 w-5" /></div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales to Delivery</div>
                <h1 className="mt-1 text-2xl font-black">Sales Handover</h1>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">Submit the customer context the delivery team needs. This writes to the canonical project and completes only your Sales Handover submission task.</p>
              </div>
            </div>
          </header>

          <div className="p-6 sm:p-8">
            {loading ? (
              <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div>
            ) : error && !project ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
            ) : project ? (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Project" value={project.projectName || project.project_name || 'Project'} />
                  <Info label="Project Number" value={project.projectNumber || project.project_number || 'Pending'} />
                  <Info label="Client" value={project.client?.companyName || project.client?.company_name || 'Client'} />
                  <Info label="Current Stage" value={project.stage || 'Sales Handover'} />
                </div>

                {project.stage !== 'Sales Handover' ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-center gap-2 font-black text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Sales Handover is already closed.</div>
                    <p className="mt-2 text-xs leading-5 text-emerald-700">The project has progressed to {project.stage}. Your submitted context remains on the canonical project record.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Customer & Delivery Context</label>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Include agreed expectations, requirements, scope clarifications, exclusions, promises made, stakeholders, access/assets discussed, deadlines, risks and anything Project Management must know before Client Onboarding.</p>
                      <textarea
                        value={notes}
                        onChange={event => { setNotes(event.target.value); setSubmitted(false); setError(''); }}
                        rows={11}
                        maxLength={10000}
                        className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-[#000080] focus:ring-2 focus:ring-[#000080]/10"
                        placeholder="Record the full sales-to-delivery handover context..."
                      />
                      <div className="mt-2 text-right text-[10px] font-bold text-slate-400">{notes.length.toLocaleString()} / 10,000</div>
                    </div>

                    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
                    {submitted && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Sales Handover submitted. Project Management has been notified to review it.</div>}

                    <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Protected workflow: this does not give Sales general project-edit permission.</div>
                      <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={saving || notes.trim().length < 10}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Submit Sales Handover
                      </button>
                    </div>
                  </>
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
