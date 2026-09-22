import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, History, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  SalesCertificationAdminState,
  SalesCertificationAuthorityMode,
  salesCertificationService,
} from '../../lib/salesCertificationService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

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
  const [authorityMode, setAuthorityMode] = useState<SalesCertificationAuthorityMode>('SUPERVISED');
  const [evidenceType, setEvidenceType] = useState('MANAGEMENT_REVIEW');
  const [reason, setReason] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await salesCertificationService.getAdminState();
      setData(next);
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
  const grantEnabled = policy.grantingActive === true && policy.criteriaApproved === true;

  const grant = async () => {
    if (!sellerId || !productId || !reason.trim() || !evidenceNote.trim()) {
      setError('Seller, package, evidence note and grant reason are required.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await salesCertificationService.grant({
        salespersonId: sellerId,
        salesProductId: productId,
        authorityMode,
        evidenceType: evidenceType.trim(),
        evidence: { note: evidenceNote.trim() },
        reason: reason.trim(),
      });
      setMessage('Package certification grant recorded.');
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

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading && !data) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" data-testid="part16-certification-admin">
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => navigate('/admin/final-certification-controls')} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-600"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-[#000080]">Sales Academy · Part 16</div>
              <h1 className="text-xl font-black">Sales Certification + Deal Permissions</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Package authority is explicit, evidence-backed and revocable. General Final Certification never silently becomes package permission.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
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
                <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-800">Policy v{policy.policyVersion || 1} · {String(policy.rolloutState || 'STAGED_POLICY_REQUIRED').replaceAll('_', ' ')}</p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#000080]" /><h2 className="text-lg font-black">Seller package authority</h2></div>
          <p className="mt-1 text-xs text-slate-500">Current truth from the existing Sales Academy plus explicit Part 16 package-grant history.</p>
          <div className="mt-5 grid gap-4">
            {(data?.sellers || []).map(seller => (
              <article key={seller.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-sm font-black">{seller.name}</div><div className="text-[10px] text-slate-500">{seller.email}</div></div>
                  <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[9px] font-black ${seller.snapshot.generalCertificationReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>{seller.snapshot.generalCertificationReady ? 'GENERAL CERTIFICATION PASSED' : 'GENERAL CERTIFICATION NOT READY'}</span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {seller.snapshot.products.map(product => {
                    const granted = product.grantStatus === 'GRANTED';
                    return <div key={product.productId} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{product.productCode}</div>
                      <div className="mt-1 text-xs font-black">{product.productName}</div>
                      <div className={`mt-2 text-[9px] font-black ${granted ? 'text-emerald-700' : 'text-slate-400'}`}>{granted ? product.authorityMode : 'NOT GRANTED'}</div>
                    </div>;
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black">Issue an evidence-backed package grant</h2>
          <p className="mt-1 text-xs text-slate-500">This form stays disabled until Management-approved package criteria activate grant issuance. Revocation always remains available for safety.</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Seller"><select className={inputClass} value={sellerId} onChange={event => { setSellerId(event.target.value); const seller = data?.sellers.find(item => item.id === event.target.value); setProductId(seller?.snapshot.products[0]?.productId || ''); }}>{(data?.sellers || []).map(seller => <option key={seller.id} value={seller.id}>{seller.name} · {seller.email}</option>)}</select></Field>
            <Field label="Package"><select className={inputClass} value={productId} onChange={event => setProductId(event.target.value)}>{(selectedSeller?.snapshot.products || []).map(product => <option key={product.productId} value={product.productId}>{product.productName} · {product.productCode}</option>)}</select></Field>
            <Field label="Authority mode"><select className={inputClass} value={authorityMode} onChange={event => setAuthorityMode(event.target.value as SalesCertificationAuthorityMode)}><option value="SUPERVISED">Supervised</option><option value="INDEPENDENT">Independent</option></select></Field>
            <Field label="Evidence type"><input className={inputClass} value={evidenceType} onChange={event => setEvidenceType(event.target.value)} /></Field>
            <Field label="Evidence note"><textarea className={inputClass} rows={3} value={evidenceNote} onChange={event => setEvidenceNote(event.target.value)} placeholder="What verified evidence supports this package certification?" /></Field>
            <Field label="Grant reason"><textarea className={inputClass} rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="Why is this authority being issued?" /></Field>
          </div>
          <button type="button" onClick={() => void grant()} disabled={!grantEnabled || busy || !selectedProduct} className="mt-4 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{grantEnabled ? 'Record package certification grant' : 'Granting staged until criteria approval'}</button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><History className="h-5 w-5 text-[#000080]" /><h2 className="text-lg font-black">Grant history</h2></div>
          <p className="mt-1 text-xs text-slate-500">Historical grant evidence is never overwritten. Revocation closes the grant row and preserves its original evidence.</p>
          <div className="mt-4 space-y-3">
            {(data?.history || []).length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs font-bold text-slate-400">No package certification grants exist. This is the expected staged Part 16 starting state.</div>}
            {(data?.history || []).map(item => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="text-sm font-black">{item.salespersonName} · {item.productName}</div><div className="mt-1 text-[10px] text-slate-500">{item.productCode} · {item.authorityMode} · {item.evidenceType}</div><div className="mt-2 text-xs text-slate-600">{item.grantReason}</div></div>
                  {item.revokedAt ? <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[9px] font-black text-rose-700"><XCircle className="h-3 w-3" />REVOKED</span> : <button type="button" onClick={() => void revoke(item.id)} disabled={busy} className="rounded-xl border border-rose-200 px-3 py-2 text-[10px] font-black text-rose-700 disabled:opacity-40">Revoke</button>}
                </div>
                <div className="mt-3 text-[9px] text-slate-400">Granted {new Date(item.grantedAt).toLocaleString()}{item.revokedAt ? ` · Revoked ${new Date(item.revokedAt).toLocaleString()} · ${item.revocationReason || ''}` : ''}</div>
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
function Notice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) { return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
