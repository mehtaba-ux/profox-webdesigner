import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { SalesCertificationSnapshot, salesCertificationService } from '../../lib/salesCertificationService';

const tone = (mode?: string | null, active?: boolean) => {
  if (!active) return 'border-slate-200 bg-slate-50 text-slate-500';
  if (mode === 'INDEPENDENT') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (mode === 'QUALIFY_ONLY') return 'border-blue-200 bg-blue-50 text-[#000080]';
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

export default function SalesCertificationPermissionsPanel() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [data, setData] = useState<SalesCertificationSnapshot | null>(null);
  const [loading, setLoading] = useState(!isAdmin);
  const [error, setError] = useState('');

  const load = async () => {
    if (isAdmin) return;
    setLoading(true);
    setError('');
    try {
      setData(await salesCertificationService.getMyPermissions());
    } catch (err: any) {
      setError(err?.message || 'Sales certification permissions could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin && profile?.role === 'sales') void load();
  }, [isAdmin, profile?.role]);

  if (isAdmin) {
    return (
      <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8" data-testid="part16-certification-panel-admin-link">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-[#000080]">Sales Certification + Deal Permissions</div>
            <p className="mt-1 text-xs leading-5 text-slate-600">Management controls live beside the existing Final Certification architecture. Package grants are never inferred from general certification.</p>
          </div>
          <button type="button" onClick={() => navigate('/admin/sales-certification-permissions')} className="shrink-0 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Open controls</button>
        </div>
      </section>
    );
  }

  if (profile?.role !== 'sales') return null;

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8" data-testid="part16-certification-panel">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-[#000080]"><ShieldCheck className="h-4 w-4" />Sales Certification + Deal Permissions</div>
            <h2 className="mt-1 text-lg font-black text-slate-950">What you are currently certified to sell</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">General Sales Academy completion and package-level deal authority are separate. A package is only certified when an explicit evidence-backed grant exists.</p>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => navigate('/academy/final-certification')} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#000080]/20 bg-blue-50 px-3 text-[11px] font-black text-[#000080] focus:outline-none focus:ring-4 focus:ring-blue-100">Open training / re-certification</button><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
        </div>

        {loading && !data && <div className="mt-4 flex min-h-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[#000080]" />Loading certification truth…</div>}
        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">{error}</div>}

        {data && (
          <>
            {!data.enforcementActive && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="part16-staged-rollout">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div><div className="text-xs font-black text-amber-900">Staged — package enforcement is not active</div><p className="mt-1 text-[11px] leading-5 text-amber-800">Current deal authority is unchanged. No package certification is being fabricated or backfilled while Management criteria remain unapproved.</p></div>
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr]">
              <div className={`rounded-2xl border p-4 ${data.generalCertificationReady ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <div className="flex items-center gap-2">
                  {data.generalCertificationReady ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <LockKeyhole className="h-4 w-4 text-rose-700" />}
                  <div className="text-xs font-black text-slate-900">General Sales Certification</div>
                </div>
                <div className="mt-2 text-[11px] font-bold text-slate-600">{data.generalCertificationReady ? 'Verified passed' : 'Not currently verified'}</div>
                {data.finalCertification?.status && <div className="mt-1 text-[10px] text-slate-500">Final: {String(data.finalCertification.status).replaceAll('_', ' ')}{data.finalCertification.score != null ? ` · ${data.finalCertification.score}%` : ''}</div>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.products.map(product => {
                  const active = product.grantStatus === 'ACTIVE';
                  return <div key={product.productId} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`part16-package-${product.productCode}`}>
                    <div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{product.productCode}</div>
                    <div className="mt-1 text-sm font-black text-slate-900">{product.productName}</div>
                    <div className="mt-2 text-[9px] text-slate-500">Required: {product.requiredCertification || 'Not configured'}</div>
                    <div className="mt-1 text-[9px] text-slate-500">Policy mode: {product.configuredPermissionMode || 'Not configured'}</div>
                    <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black ${tone(product.authorityMode, active)}`}>
                      {active ? `${product.certificationKey || 'CERTIFIED'} · ${product.authorityMode?.replaceAll('_', ' ')}` : String(product.grantStatus || 'NOT_GRANTED').replaceAll('_', ' ')}
                    </span>
                    {active && product.grantedAt && <div className="mt-2 text-[9px] text-slate-400">Granted {new Date(product.grantedAt).toLocaleDateString()}{product.expiresAt ? ` · expires ${new Date(product.expiresAt).toLocaleDateString()}` : ''}</div>}
                  </div>;
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
