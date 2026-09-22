import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, History, Loader2, RefreshCw, Save, ShieldCheck, XCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SalesCertificationAdminState,
  SalesCertificationAuthorityMode,
  salesCertificationService,
} from '../../lib/salesCertificationService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const jsonClass = `${inputClass} min-h-52 font-mono text-xs leading-5`;

export default function SalesCertificationPermissionsAdmin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<SalesCertificationAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [productId, setProductId] = useState('');
  const [evidenceType, setEvidenceType] = useState('MANAGEMENT_REVIEW');
  const [reason, setReason] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [productRulesDraft, setProductRulesDraft] = useState('{}');
  const [addonRulesDraft, setAddonRulesDraft] = useState('{}');
  const [stagesDraft, setStagesDraft] = useState('[]');
  const [criteriaApproved, setCriteriaApproved] = useState(false);
  const [grantingActive, setGrantingActive] = useState(false);
  const [enforcementActive, setEnforcementActive] = useState(false);
  const [policyReason, setPolicyReason] = useState('');

  const applyPolicyDraft = (policy: Record<string, any>) => {
    setProductRulesDraft(JSON.stringify(policy.productRules || {}, null, 2));
    setAddonRulesDraft(JSON.stringify(policy.addonRules || {}, null, 2));
    setStagesDraft(JSON.stringify(policy.protectedCommitmentStages || [], null, 2));
    setCriteriaApproved(policy.criteriaApproved === true);
    setGrantingActive(policy.grantingActive === true);
    setEnforcementActive(policy.enforcementActive === true);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await salesCertificationService.getAdminState();
      setData(next);
      applyPolicyDraft(next.policy || {});
      const firstSeller = next.sellers[0];
      if (!sellerId && firstSeller) setSellerId(firstSeller.id);
      const firstProduct = firstSeller?.snapshot.products[0];
      if (!productId && firstProduct) setProductId(firstProduct.productId);
    } catch (err: any) {
      setError(err?.message || 'Sales certification controls could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const policy = data?.policy || {};
  const selectedSeller = useMemo(() => data?.sellers.find(item => item.id === sellerId) || null, [data, sellerId]);
  const selectedProduct = selectedSeller?.snapshot.products.find(item => item.productId === productId) || null;
  const configuredMode = selectedProduct?.configuredPermissionMode || null;
  const grantMode = configuredMode && ['INDEPENDENT', 'SUPERVISED', 'QUALIFY_ONLY'].includes(configuredMode)
    ? configuredMode as SalesCertificationAuthorityMode
    : null;
  const grantEnabled = policy.grantingActive === true && policy.criteriaApproved === true && grantMode !== null;

  const grant = async () => {
    if (!sellerId || !productId || !grantMode || !reason.trim() || !evidenceNote.trim()) {
      setError('Seller, configured package permission, evidence note and grant reason are required.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await salesCertificationService.grant({
        salespersonId: sellerId,
        salesProductId: productId,
        authorityMode: grantMode,
        evidenceType: evidenceType.trim(),
        evidence: { note: evidenceNote.trim() },
        reason: reason.trim(),
      });
      setMessage('Package certification grant recorded from the active approved policy.');
      setReason('');
      setEvidenceNote('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Package certification grant could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grantId: string) => {
    const revocationReason = window.prompt('Why is this package certification being revoked?')?.trim();
    if (!revocationReason) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await salesCertificationService.revoke(grantId, revocationReason);
      setMessage('Package certification grant revoked; historical evidence was preserved.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Package certification grant could not be revoked.');
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const productRules = JSON.parse(productRulesDraft);
      const addonRules = JSON.parse(addonRulesDraft);
      const protectedCommitmentStages = JSON.parse(stagesDraft);
      if (!productRules || Array.isArray(productRules) || typeof productRules !== 'object') throw new Error('Product rules must be a JSON object.');
      if (!addonRules || Array.isArray(addonRules) || typeof addonRules !== 'object') throw new Error('Add-on rules must be a JSON object.');
      if (!Array.isArray(protectedCommitmentStages)) throw new Error('Protected commitment stages must be a JSON array.');
      if (policyReason.trim().length < 10) throw new Error('Enter a meaningful policy-change reason (at least 10 characters).');
      await salesCertificationService.updatePolicy({
        productRules,
        addonRules,
        protectedCommitmentStages,
        criteriaApproved,
        grantingActive,
        enforcementActive,
        reason: policyReason.trim(),
      });
      setMessage('Part 16 certification policy saved through the audited Admin-only server path.');
      setPolicyReason('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Certification policy could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading && !data) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="part16-certification-admin">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" aria-label="Back to Final Certification" onClick={() => navigate('/admin/final-certification-controls')} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-100"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#000080]">Sales Academy · Part 16</div>
              <h1 className="text-xl font-black">Sales Certification + Deal Permissions</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Package authority is explicit, evidence-backed and revocable. General Final Certification never silently becomes package permission.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
        {error && <Notice danger>{error}</Notice>}
        {message && <Notice>{message}</Notice>}

        <section className="grid gap-4 lg:grid-cols-3">
          <StatusCard title="Criteria" active={policy.criteriaApproved === true} activeText="Approved" inactiveText="Not approved" />
          <StatusCard title="Grant issuance" active={policy.grantingActive === true} activeText="Active" inactiveText="Staged" />
          <StatusCard title="Deal enforcement" active={policy.enforcementActive === true} activeText="Active" inactiveText="Off" />
        </section>

        {!grantEnabled && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5" data-testid="part16-admin-staged-policy">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h2 className="text-sm font-black text-amber-950">Staged safely — no package criteria were invented</h2>
                <p className="mt-1 text-xs leading-5 text-amber-900">{String(policy.rolloutReason || 'Management-approved package certification criteria are required before grants can be issued or enforced.')}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-800">Policy v{policy.policyVersion || 1} · schema v{policy.schemaVersion || 1} · {String(policy.rolloutState || 'STAGED_POLICY_REQUIRED').replaceAll('_', ' ')}</p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" data-testid="part16-policy-admin">
          <div className="flex items-center gap-2"><Save className="h-5 w-5 text-[#000080]" /><h2 className="text-lg font-black">Certification policy</h2></div>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">Admin-only, validated, versioned and audited through <code>system_configuration</code>. Rules must reference current <code>sales_products.code</code>. Approval requires an explicit rule for every active package and add-on; Custom stays qualification-only with Sales Validation, and Scale must preserve escalation.</p>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[10px] leading-5 text-slate-700">
            Allowed certification keys: {(policy.allowedCertificationKeys || []).join(', ') || 'LAUNCH_CERTIFIED, GROWTH_CERTIFIED, SCALE_CERTIFIED, CUSTOM_QUALIFICATION_CERTIFIED'}<br />
            Permission modes: {(policy.permissionModes || []).join(', ') || 'INDEPENDENT, SUPERVISED, QUALIFY_ONLY, BLOCKED'}<br />
            Add-on behaviors: {(policy.addonBehaviors || []).join(', ') || 'INHERIT_BASE_PACKAGE, REQUIRE_GROWTH, REQUIRE_SCALE, REQUIRE_SPECIALIST_VALIDATION, CUSTOM_QUALIFICATION_ONLY'}
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Field label="Product rules · JSON object"><textarea data-testid="part16-policy-product-rules" className={jsonClass} value={productRulesDraft} onChange={event => setProductRulesDraft(event.target.value)} spellCheck={false} /></Field>
            <Field label="Add-on rules · JSON object"><textarea data-testid="part16-policy-addon-rules" className={jsonClass} value={addonRulesDraft} onChange={event => setAddonRulesDraft(event.target.value)} spellCheck={false} /></Field>
            <Field label="Protected commitment stages · JSON array"><textarea data-testid="part16-policy-protected-stages" className={`${inputClass} min-h-28 font-mono text-xs`} value={stagesDraft} onChange={event => setStagesDraft(event.target.value)} spellCheck={false} /></Field>
            <Field label="Policy change reason"><textarea data-testid="part16-policy-reason" className={`${inputClass} min-h-28`} value={policyReason} onChange={event => setPolicyReason(event.target.value)} placeholder="Document the approved product-policy decision and why it is changing." /></Field>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Toggle label="Criteria approved" checked={criteriaApproved} onChange={setCriteriaApproved} />
            <Toggle label="Grant issuance active" checked={grantingActive} onChange={setGrantingActive} />
            <Toggle label="Deal enforcement active" checked={enforcementActive} onChange={setEnforcementActive} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button data-testid="part16-save-policy" type="button" onClick={() => void savePolicy()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-40"><Save className="h-4 w-4" />Validate & save policy</button>
            <span className="text-[10px] font-bold text-slate-400">Saving can never bypass the server validator or the existing configuration audit log.</span>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#000080]" /><h2 className="text-lg font-black">Seller package authority</h2></div>
          <p className="mt-1 text-xs text-slate-500">Current truth from the existing Sales Academy plus explicit Part 16 package-grant history.</p>
          <div className="mt-5 grid gap-4">
            {(data?.sellers || []).map(seller => (
              <article key={seller.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-sm font-black">{seller.name}</div><div className="text-[10px] text-slate-500">{seller.email}</div></div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-black ${seller.snapshot.generalCertificationReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{seller.snapshot.generalCertificationReady ? 'GENERAL CERTIFICATION PASSED' : 'GENERAL CERTIFICATION NOT READY'}</span>
                    <span data-testid="part16-final-certification-evidence" className="text-[9px] font-bold text-slate-500">Final Certification: {String(seller.snapshot.finalCertification?.status || 'not verified').replaceAll('_', ' ')}{seller.snapshot.finalCertification?.score != null ? ` · ${seller.snapshot.finalCertification.score}%` : ''}</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {seller.snapshot.products.map(product => {
                    const active = product.grantStatus === 'ACTIVE';
                    return <div key={product.productId} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{product.productCode}</div>
                      <div className="mt-1 text-xs font-black">{product.productName}</div>
                      <div className="mt-1 text-[9px] text-slate-500">Required: {product.requiredCertification || 'Not configured'}</div>
                      <div className="mt-1 text-[9px] text-slate-500">Policy mode: {product.configuredPermissionMode || 'Not configured'}</div>
                      <div className={`mt-2 text-[9px] font-black ${active ? 'text-emerald-700' : 'text-slate-400'}`}>{active ? `${product.certificationKey} · ${product.authorityMode}` : product.grantStatus || 'NOT GRANTED'}</div>
                    </div>;
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black">Issue an evidence-backed package grant</h2>
          <p className="mt-1 text-xs text-slate-500">The authority mode is server-policy-derived, not selected by the browser. This form stays disabled until approved criteria activate grant issuance.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Seller"><select className={inputClass} value={sellerId} onChange={event => { setSellerId(event.target.value); const seller = data?.sellers.find(item => item.id === event.target.value); setProductId(seller?.snapshot.products[0]?.productId || ''); }}>{(data?.sellers || []).map(seller => <option key={seller.id} value={seller.id}>{seller.name} · {seller.email}</option>)}</select></Field>
            <Field label="Package"><select className={inputClass} value={productId} onChange={event => setProductId(event.target.value)}>{(selectedSeller?.snapshot.products || []).map(product => <option key={product.productId} value={product.productId}>{product.productName} · {product.productCode}</option>)}</select></Field>
            <Field label="Configured authority mode"><input className={inputClass} readOnly value={grantMode || configuredMode || 'Not configured'} /></Field>
            <Field label="Required certification"><input className={inputClass} readOnly value={selectedProduct?.requiredCertification || 'Not configured'} /></Field>
            <Field label="Evidence type"><input className={inputClass} value={evidenceType} onChange={event => setEvidenceType(event.target.value)} /></Field>
            <Field label="Evidence note"><textarea className={inputClass} rows={3} value={evidenceNote} onChange={event => setEvidenceNote(event.target.value)} placeholder="What verified evidence supports this package certification?" /></Field>
            <Field label="Grant reason"><textarea className={inputClass} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why is this authority being issued?" /></Field>
          </div>
          <button data-testid="part16-grant-button" type="button" onClick={() => void grant()} disabled={!grantEnabled || busy || !selectedProduct} className="mt-4 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-40">{grantEnabled ? 'Record package certification grant' : 'Granting staged until criteria approval'}</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#000080]" /><h2 className="text-lg font-black">Grant history</h2></div>
          <p className="mt-1 text-xs text-slate-500">Historical grant evidence is never overwritten. Revocation closes the grant row and preserves its original evidence.</p>
          <div className="mt-4 space-y-3">
            {(data?.history || []).length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs font-bold text-slate-400">No package certification grants exist. This is the expected staged Part 16 starting state.</div>}
            {(data?.history || []).map(item => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-sm font-black">{item.salespersonName} · {item.productName}</div><div className="mt-1 text-[10px] text-slate-500">{item.productCode} · {item.certificationKey || 'Certification key unavailable'} · {item.authorityMode} · {item.evidenceType}</div><div className="mt-2 text-xs text-slate-600">{item.grantReason}</div></div>
                  {item.revokedAt ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-black text-rose-700"><XCircle className="h-3 w-3" />REVOKED</span> : <button type="button" onClick={() => void revoke(item.id)} disabled={busy} className="rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black text-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:opacity-40">Revoke</button>}
                </div>
                <div className="mt-3 text-[9px] text-slate-400">Status {item.effectiveStatus || item.grantState || 'UNKNOWN'} · Policy v{item.policyVersion} · Granted {new Date(item.grantedAt).toLocaleString()}{item.expiresAt ? ` · Expires ${new Date(item.expiresAt).toLocaleString()}` : ''}{item.revokedAt ? ` · Revoked ${new Date(item.revokedAt).toLocaleString()} · ${item.revocationReason || ''}` : ''}</div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusCard({ title, active, activeText, inactiveText }: { title: string; active: boolean; activeText: string; inactiveText: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2">{active ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}<span className="text-xs font-black">{title}</span></div><div className={`mt-2 text-sm font-black ${active ? 'text-emerald-700' : 'text-amber-800'}`}>{active ? activeText : inactiveText}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-2">{children}</div></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4" />{label}</label>; }
function Notice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) { return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
