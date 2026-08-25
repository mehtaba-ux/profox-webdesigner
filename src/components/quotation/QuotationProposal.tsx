import React from 'react';
import Logo from '../Logo';

export type QuotationPresentation = Record<string, any>;

function money(value: unknown, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

function dateText(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TextSection({ title, value }: { title: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return <section className="break-inside-avoid border-t border-slate-200 pt-7">
    <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#000080]">{title}</h2>
    <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-700">{value}</p>
  </section>;
}

export default function QuotationProposal({ presentation, actions }: { presentation: QuotationPresentation; actions?: React.ReactNode }) {
  const items = Array.isArray(presentation?.items) ? presentation.items : [];
  const committed = items.filter((item: any) => ['product','custom'].includes(item.lineType || 'product') && !item.optionalForClient);
  const optional = items.filter((item: any) => ['product','custom'].includes(item.lineType || 'product') && item.optionalForClient);
  const paymentSchedule = Array.isArray(presentation?.paymentPlan?.schedule) ? presentation.paymentPlan.schedule : [];
  const currency = presentation?.currency || 'USD';
  const branding = presentation?.branding || {};
  const lineGroups: Array<{ section?: string; lines: any[] }> = [];
  let current: { section?: string; lines: any[] } = { lines: [] };
  items.filter((item: any) => !item.optionalForClient).forEach((item: any) => {
    if (item.lineType === 'section') {
      if (current.lines.length || current.section) lineGroups.push(current);
      current = { section: item.productName || item.description || 'Scope', lines: [] };
    } else if (item.lineType === 'note') {
      current.lines.push(item);
    } else {
      current.lines.push(item);
    }
  });
  if (current.lines.length || current.section) lineGroups.push(current);

  return <div className="quotation-print mx-auto max-w-[1040px] bg-white text-slate-900 print:max-w-none">
    <style>{`@media print { body { background:#fff !important; } .quotation-print { box-shadow:none !important; margin:0 !important; } .quotation-print section, .quotation-print table, .quotation-print tr { break-inside:avoid; } .quotation-print .no-print { display:none !important; } @page { size:A4; margin:14mm; } }`}</style>
    <header className="border-b-4 border-[#000080] px-6 py-8 sm:px-10 print:px-0">
      <div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Logo className="h-12 w-auto" />
          <p className="mt-3 text-sm font-semibold text-slate-500">{branding.brandLine || 'From site to system.'}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#FF0E0E]">Quotation / Proposal</p>
          <h1 className="mt-2 max-w-xl text-3xl font-black tracking-tight text-slate-950">{presentation?.proposalTitle || 'Digital Project Proposal'}</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">{presentation?.quotationNumber || 'Draft'} · Revision {presentation?.revisionNumber || 1}</p>
        </div>
      </div>
      {presentation?.isSuperseded && <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">This is a superseded revision. Please use the latest ProFox proposal.</div>}
    </header>

    <main className="space-y-9 px-6 py-9 sm:px-10 print:px-0">
      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-3">
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Quotation Number</p><p className="mt-1 font-bold">{presentation?.quotationNumber || 'Draft'}</p></div>
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared Date</p><p className="mt-1 font-bold">{dateText(presentation?.preparedAt)}</p></div>
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Valid Until</p><p className="mt-1 font-bold">{dateText(presentation?.validUntil)}</p></div>
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared For</p><p className="mt-1 font-bold">{presentation?.customerName || 'Customer'}</p><p className="text-sm text-slate-500">{presentation?.contactName || presentation?.email || ''}</p></div>
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared By</p><p className="mt-1 font-bold">{presentation?.preparedBy?.name || 'ProFox'}</p><p className="text-sm text-slate-500">{presentation?.preparedBy?.email || branding.contactEmail || ''}</p></div>
        <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Status</p><p className="mt-1 font-bold text-[#000080]">{presentation?.status || 'Draft'}</p></div>
      </section>

      {(presentation?.coverMessage || presentation?.executiveSummary) && <section className="break-inside-avoid">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#000080]">Project Summary</h2>
        {presentation?.coverMessage && <p className="mt-3 text-[15px] leading-7 text-slate-700">{presentation.coverMessage}</p>}
        {presentation?.executiveSummary && <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-700">{presentation.executiveSummary}</p>}
      </section>}

      <section>
        <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#FF0E0E]">Scope & Investment</p><h2 className="mt-1 text-2xl font-black">Recommended solution</h2></div></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#000080] text-white"><tr><th className="px-4 py-3">Service</th><th className="px-3 py-3 text-center">Qty</th><th className="px-3 py-3 text-right">Unit</th><th className="px-4 py-3 text-right">Investment</th></tr></thead>
            <tbody>
              {lineGroups.length === 0 && <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-400">Scope will appear here.</td></tr>}
              {lineGroups.map((group, groupIndex) => <React.Fragment key={groupIndex}>
                {group.section && <tr className="bg-slate-100"><td colSpan={4} className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">{group.section}</td></tr>}
                {group.lines.map((item: any, index: number) => item.lineType === 'note'
                  ? <tr key={item.id || `${groupIndex}-${index}`}><td colSpan={4} className="border-t border-slate-100 px-4 py-3 italic text-slate-500">{item.description || item.productName}</td></tr>
                  : <tr key={item.id || `${groupIndex}-${index}`} className="border-t border-slate-100 align-top"><td className="px-4 py-4"><p className="font-bold text-slate-900">{item.productName}</p>{item.description && <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{item.description}</p>}{Number(item.discountAmount || 0) > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">Discount {money(item.discountAmount,currency)}</p>}</td><td className="px-3 py-4 text-center">{item.quantity || 1}</td><td className="px-3 py-4 text-right">{money(item.unitPrice,currency)}</td><td className="px-4 py-4 text-right font-bold">{money(item.lineTotal,currency)}</td></tr>)}
              </React.Fragment>)}
            </tbody>
          </table>
        </div>
        <div className="ml-auto mt-4 w-full max-w-sm space-y-2 rounded-2xl bg-slate-50 p-5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">List subtotal</span><span className="font-semibold">{money(presentation?.subtotal,currency)}</span></div>
          {Number(presentation?.lineDiscountTotal || 0) > 0 && <div className="flex justify-between text-emerald-700"><span>Line discounts</span><span>-{money(presentation.lineDiscountTotal,currency)}</span></div>}
          {Number(presentation?.quoteDiscountTotal || 0) > 0 && <div className="flex justify-between text-emerald-700"><span>Quotation discount</span><span>-{money(presentation.quoteDiscountTotal,currency)}</span></div>}
          {Number(presentation?.taxTotal || 0) > 0 && <div className="flex justify-between"><span>{presentation?.taxLabel || 'Tax'} ({Number(presentation?.taxRate || 0)}%)</span><span>{money(presentation.taxTotal,currency)}</span></div>}
          <div className="flex justify-between border-t border-slate-300 pt-3 text-lg font-black"><span>Total Investment</span><span className="text-[#000080]">{money(presentation?.total,currency)}</span></div>
        </div>
      </section>

      {optional.length > 0 && <section className="break-inside-avoid">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#FF0E0E]">Recommended Enhancements</p>
        <h2 className="mt-1 text-xl font-black">Optional add-ons</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{optional.map((item: any) => <div key={item.id || item.productName} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-4"><p className="font-bold">{item.productName}</p><p className="font-black text-[#000080]">{money(item.lineTotal,currency)}</p></div>{item.description && <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>}</div>)}</div>
        <p className="mt-3 text-xs text-slate-500">Optional enhancements are not included in the committed quotation total unless ProFox confirms them in an updated quotation.</p>
      </section>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="break-inside-avoid rounded-2xl border border-slate-200 p-6"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#000080]">Estimated Project Timeline</p><p className="mt-3 text-xl font-black">{presentation?.durationSnapshotText || 'Timeline confirmation required'}</p></div>
        <div className="break-inside-avoid rounded-2xl border border-slate-200 p-6"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#000080]">Payment Plan</p>{paymentSchedule.length > 0 ? <div className="mt-3 space-y-3">{paymentSchedule.map((milestone: any) => <div key={milestone.milestoneNumber} className="flex justify-between gap-4"><div><p className="font-bold">{milestone.label || milestone.paymentType}</p><p className="text-xs text-slate-500">{milestone.percentage}%</p></div><p className="font-black">{money(milestone.amount,currency)}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">{presentation?.paymentPlan?.error || 'Payment plan will be confirmed before sending.'}</p>}</div>
      </section>

      <TextSection title="Scope Summary" value={presentation?.scopeSummary} />
      <TextSection title="Client Responsibilities" value={presentation?.clientResponsibilities} />
      <TextSection title="Delivery Assumptions" value={presentation?.deliveryAssumptions} />
      <TextSection title="Review & Approval Process" value={presentation?.reviewProcess} />
      <TextSection title="Handover / Support" value={presentation?.handoverSupport} />
      <TextSection title="Exclusions" value={presentation?.exclusions} />
      <TextSection title="Terms & Conditions" value={presentation?.termsAndConditions || presentation?.paymentTerms} />

      {actions && <section className="no-print rounded-2xl border-2 border-[#000080] bg-slate-50 p-6"><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#000080]">Customer Action</p><div className="mt-4">{actions}</div></section>}
    </main>

    <footer className="border-t border-slate-200 px-6 py-7 text-xs text-slate-500 sm:px-10 print:px-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between"><div><p className="font-bold text-slate-800">{branding.businessName || 'ProFox Web Designer'}</p><p>{branding.registeredName || ''}</p></div><div className="sm:text-right"><p>{branding.websiteUrl || 'https://www.profoxwebdesigner.com'}</p><p>{branding.contactEmail || ''}</p><p>{presentation?.quotationNumber || ''} · Revision {presentation?.revisionNumber || 1}</p></div></div>
    </footer>
  </div>;
}
