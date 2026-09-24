import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Eye, EyeOff, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

interface PricingProductRow {
  id: string;
  code: string;
  name: string;
  product_type: string;
  price_mode: string;
  base_price: number;
  currency: string;
  billing_period?: string | null;
  standard_payment_terms?: string | null;
  payment_schedule?: Array<{ label?: string; percentage?: number }> | null;
  scope?: string[] | null;
  active: boolean;
  public_visible: boolean;
  sort_order: number;
  public_details?: {
    badge?: string;
    summary?: string;
    bestFor?: string;
    ctaText?: string;
    technologies?: Array<{ name?: string; logoUrl?: string }>;
    comparison?: Record<string, string>;
  } | null;
}

function formatPrice(row: PricingProductRow) {
  if (row.price_mode === 'custom') return 'Custom Quote';
  try {
    const value = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: row.currency || 'USD',
      maximumFractionDigits: Number(row.base_price || 0) % 1 === 0 ? 0 : 2
    }).format(Number(row.base_price || 0));
    return row.price_mode === 'starting_at' ? `${value}+` : value;
  } catch {
    return `$${Number(row.base_price || 0).toLocaleString()}`;
  }
}

function healthIssues(row: PricingProductRow) {
  const issues: string[] = [];
  const details = row.public_details || {};
  if (!row.active && row.public_visible) issues.push('Public product is inactive');
  if (row.public_visible && (!Array.isArray(row.scope) || row.scope.length === 0)) issues.push('No canonical inclusions');
  if (row.public_visible && !details.badge) issues.push('Missing public badge');
  if (row.public_visible && !details.summary) issues.push('Missing public summary');
  if (row.public_visible && !details.ctaText) issues.push('Missing CTA text');
  if (row.product_type === 'package' && row.public_visible && !details.bestFor) issues.push('Missing Best For');
  if (row.product_type === 'package' && row.public_visible && Object.keys(details.comparison || {}).length === 0) issues.push('Missing comparison facts');
  return issues;
}

export default function PublicPricingAdmin() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<PricingProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('sales_products')
      .select('id,code,name,product_type,price_mode,base_price,currency,billing_period,standard_payment_terms,payment_schedule,scope,active,public_visible,sort_order,public_details')
      .in('product_type', ['package', 'care_plan'])
      .order('sort_order');
    if (queryError) setError(queryError.message || 'Pricing source health could not be loaded.');
    else setProducts((data || []) as PricingProductRow[]);
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);

  const publicProducts = useMemo(() => products.filter(product => product.public_visible), [products]);
  const issueCount = useMemo(() => products.reduce((total, product) => total + healthIssues(product).length, 0), [products]);
  const publicPackageCount = publicProducts.filter(product => product.product_type === 'package' && product.active).length;
  const healthy = publicPackageCount > 0 && issueCount === 0;

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <button onClick={() => navigate('/admin/workspace')} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-600"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Website · Catalog Health</div>
            <h1 className="text-xl font-black">Public Pricing Source Health</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Read-only verification of what the public Pricing page receives. All package, pricing, inclusion and public presentation edits are made only in Sales Catalog.</p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <div className={`rounded-2xl border p-4 ${healthy ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        <div className="flex items-start gap-3">{healthy ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />}<div><strong>{healthy ? 'Public pricing is catalog-driven and healthy.' : 'Public pricing needs catalog attention.'}</strong><p className="mt-1 text-xs leading-5">{publicPackageCount} active public package{publicPackageCount === 1 ? '' : 's'} · {publicProducts.filter(product => product.product_type === 'care_plan' && product.active).length} active public care plan{publicProducts.filter(product => product.product_type === 'care_plan' && product.active).length === 1 ? '' : 's'} · {issueCount} metadata issue{issueCount === 1 ? '' : 's'}.</p></div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => navigate('/admin/app/sales?tab=sales_catalog')} className="rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Edit in Sales Catalog</button>
        <a href="/pricing" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700">View public Pricing <ExternalLink className="h-3.5 w-3.5" /></a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><strong>Single-source rule:</strong> this screen never writes package data. Sales Catalog is the only Admin editing surface for current price, inclusions, payment rules, public visibility and package-specific Pricing presentation data.</div>

      {loading ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div> : <div className="grid gap-4 lg:grid-cols-2">
        {products.map(row => {
          const issues = healthIssues(row);
          const details = row.public_details || {};
          return <article key={row.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${issues.length ? 'border-amber-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">{row.name}</h2><span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">{row.code}</span></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span className="font-black text-slate-800">{formatPrice(row)}{row.billing_period ? `/${row.billing_period}` : ''}</span><span>{Array.isArray(row.scope) ? row.scope.length : 0} inclusions</span><span>{Array.isArray(row.payment_schedule) ? row.payment_schedule.length : 0} milestones</span></div></div><span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black ${row.public_visible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{row.public_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{row.public_visible ? 'Public' : 'Hidden'}</span></div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><Meta label="Badge" value={details.badge} /><Meta label="Summary" value={details.summary ? 'Configured' : ''} /><Meta label="Best For" value={details.bestFor ? 'Configured' : row.product_type === 'care_plan' ? 'Not required' : ''} /><Meta label="Comparison facts" value={row.product_type === 'package' ? `${Object.keys(details.comparison || {}).length} configured` : 'Not required'} /></div>
            {issues.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-[10px] font-black uppercase text-amber-700">Needs attention</div><ul className="mt-2 space-y-1 text-xs text-amber-800">{issues.map(issue => <li key={issue}>• {issue}</li>)}</ul></div>}
          </article>;
        })}
      </div>}
    </main>
  </div>;
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className={`mt-1 font-bold ${value ? 'text-slate-700' : 'text-amber-700'}`}>{value || 'Missing'}</div></div>;
}
