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
    <h2 className="break-words text-sm font-extrabold uppercase tracking-[0.16em] text-[#000080]">{title}</h2>
    <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-slate-700">{value}</p>
  </section>;
}

function CustomerTimeline({ item }: { item: any }) {
  const timeline = String(item?.timelineText || '').trim();
  if (!timeline || timeline === 'Timeline required') return null;
  return <div className="mt-2 min-w-0 text-xs leading-5 text-slate-600">
    <p className="break-words font-semibold text-[#000080]">{timeline}</p>
    {item?.durationNote && <p className="mt-0.5 break-words text-[11px] text-slate-500">{item.durationNote}</p>}
  </div>;
}

export default function QuotationProposal({ presentation, actions }: { presentation: QuotationPresentation; actions?: React.ReactNode }) {
  const items = Array.isArray(presentation?.items) ? presentation.items : [];
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
    } else {
      current.lines.push(item);
    }
  });
  if (current.lines.length || current.section) lineGroups.push(current);

  return <div className="quotation-print mx-auto w-full min-w-0 max-w-[1040px] overflow-x-hidden bg-white text-slate-900 print:max-w-none print:overflow-visible">
    <style>{`@media print { body { background:#fff !important; } .quotation-print { box-shadow:none !important; margin:0 !important; } .quotation-print section, .quotation-print table, .quotation-print tr { break-inside:avoid; } .quotation-print .no-print { display:none !important; } @page { size:A4; margin:14mm; } }`}</style>
    <header className="border-b-4 border-[#000080] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 print:px-0">
      <div className="flex min-w-0 flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-7">
        <div className="min-w-0">
          <Logo className="h-10 w-auto max-w-full sm:h-12" />
          <p className="mt-3 break-words text-sm font-semibold text-slate-500">{branding.brandLine || 'From site to system.'}</p>
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="break-words text-xs font-extrabold uppercase tracking-[0.2em] text-[#FF0E0E]">Quotation / Proposal</p>
          <h1 className="mt-2 max-w-xl break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{presentation?.proposalTitle || 'Digital Project Proposal'}</h1>
          <p className="mt-2 break-words text-sm font-semibold text-slate-500">{presentation?.quotationNumber || 'Draft'} · Revision {presentation?.revisionNumber || 1}</p>
        </div>
      </div>
      {presentation?.isSuperseded && <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">This is a superseded revision. Please use the latest ProFox proposal.</div>}
    </header>

    <main className="space-y-7 px-4 py-7 sm:space-y-9 sm:px-6 sm:py-9 lg:px-10 print:px-0">
      <section className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 sm:gap-5 sm:p-6 lg:grid-cols-3">
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Quotation Number</p><p className="mt-1 break-words font-bold">{presentation?.quotationNumber || 'Draft'}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared Date</p><p className="mt-1 break-words font-bold">{dateText(presentation?.preparedAt)}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Valid Until</p><p className="mt-1 break-words font-bold">{dateText(presentation?.validUntil)}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared For</p><p className="mt-1 break-words font-bold">{presentation?.customerName || 'Customer'}</p><p className="break-words text-sm text-slate-500">{presentation?.contactName || presentation?.email || ''}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Prepared By</p><p className="mt-1 break-words font-bold">{presentation?.preparedBy?.name || 'ProFox'}</p></div>
        <div className="min-w-0"><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Status</p><p className="mt-1 break-words font-bold text-[#000080]">{presentation?.status || 'Draft'}</p></div>
      </section>

      {(presentation?.coverMessage || presentation?.executiveSummary) && <section className="min-w-0 break-inside-avoid">
        <h2 className="break-words text-sm font-extrabold uppercase tracking-[0.16em] text-[#000080]">Project Summary</h2>
        {presentation?.coverMessage && <p className="mt-3 break-words text-[15px] leading-7 text-slate-700">{presentation.coverMessage}</p>}
        {presentation?.executiveSummary && <p className="mt-3 whitespace-pre-line break-words text-[15px] leading-7 text-slate-700">{presentation.executiveSummary}</p>}
      </section>}

      <section className="min-w-0">
        <div className="mb-4 min-w-0"><p className="break-words text-xs font-extrabold uppercase tracking-[0.16em] text-[#FF0E0E]">Scope & Investment</p><h2 className="mt-1 break-words text-2xl font-black">Recommended solution</h2></div>

        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block print:block">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#000080] text-white"><tr><th className="px-4 py-3">Service</th><th className="px-3 py-3 text-center">Qty</th><th className="px-3 py-3 text-right">Unit</th><th className="px-4 py-3 text-right">Investment</th></tr></thead>
            <tbody>
              {lineGroups.length === 0 && <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-400">Scope will appear here.</td></tr>}
              {lineGroups.map((group, groupIndex) => <React.Fragment key={groupIndex}>
                {group.section && <tr className="bg-slate-100"><td colSpan={4} className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">{group.section}</td></tr>}
                {group.lines.map((item: any, index: number) => item.lineType === 'note'
                  ? <tr key={item.id || `${groupIndex}-${index}`}><td colSpan={4} className="border-t border-slate-100 px-4 py-3 italic text-slate-500">{item.description || item.productName}</td></tr>
                  : <tr key={item.id || `${groupIndex}-${index}`} className="border-t border-slate-100 align-top"><td className="min-w-0 px-4 py-4"><p className="break-words font-bold text-slate-900">{item.productName}</p>{item.description && <p className="mt-1 max-w-xl break-words text-xs leading-5 text-slate-500">{item.description}</p>}<CustomerTimeline item={item} />{Number(item.discountAmount || 0) > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">Discount {money(item.discountAmount,currency)}</p>}</td><td className="px-3 py-4 text-center">{item.quantity || 1}</td><td className="whitespace-nowrap px-3 py-4 text-right">{money(item.unitPrice,currency)}</td><td className="whitespace-nowrap px-4 py-4 text-right font-bold">{money(item.lineTotal,currency)}</td></tr>)}
              </React.Fragment>)}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden print:hidden">
          {lineGroups.length === 0 && <div className="rounded-2xl border border-slate-200 px-4 py-7 text-center text-sm text-slate-400">Scope will appear here.</div>}
          {lineGroups.map((group, groupIndex) => <div key={groupIndex} className="space-y-3">
            {group.section && <div className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">{group.section}</div>}
            {group.lines.map((item: any, index: number) => item.lineType === 'note'
              ? <div key={item.id || `${groupIndex}-${index}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm italic leading-6 text-slate-500">{item.description || item.productName}</div>
              : <div key={item.id || `${groupIndex}-${index}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="break-words font-bold text-slate-900">{item.productName}</p>
                  {item.description && <p className="mt-1 break-words text-xs leading-5 text-slate-500">{item.description}</p>}
                  <CustomerTimeline item={item} />
                  {Number(item.discountAmount || 0) > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">Discount {money(item.discountAmount,currency)}</p>}
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                    <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Qty</p><p className="mt-1 font-semibold text-slate-800">{item.quantity || 1}</p></div>
                    <div className="min-w-0 text-right"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Unit</p><p className="mt-1 break-words font-semibold text-slate-800">{money(item.unitPrice,currency)}</p></div>
                    <div className="col-span-2 min-w-0 rounded-xl bg-slate-50 px-3 py-2.5"><div className="flex min-w-0 items-center justify-between gap-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Investment</p><p className="break-words text-right font-black text-[#000080]">{money(item.lineTotal,currency)}</p></div></div>
                  </div>
                </div>)}
          </div>)}
        </div>

        <div className="ml-auto mt-4 w-full max-w-sm space-y-2 rounded-2xl bg-slate-50 p-4 text-sm sm:p-5">
          <div className="flex min-w-0 justify-between gap-4"><span className="text-slate-500">List subtotal</span><span className="shrink-0 font-semibold">{money(presentation?.subtotal,currency)}</span></div>
          {Number(presentation?.lineDiscountTotal || 0) > 0 && <div className="flex min-w-0 justify-between gap-4 text-emerald-700"><span>Line discounts</span><span className="shrink-0">-{money(presentation.lineDiscountTotal,currency)}</span></div>}
          {Number(presentation?.quoteDiscountTotal || 0) > 0 && <div className="flex min-w-0 justify-between gap-4 text-emerald-700"><span>Quotation discount</span><span className="shrink-0">-{money(presentation.quoteDiscountTotal,currency)}</span></div>}
          {Number(presentation?.taxTotal || 0) > 0 && <div className="flex min-w-0 justify-between gap-4"><span className="break-words">{presentation?.taxLabel || 'Tax'} ({Number(presentation?.taxRate || 0)}%)</span><span className="shrink-0">{money(presentation.taxTotal,currency)}</span></div>}
          <div className="flex min-w-0 items-start justify-between gap-4 border-t border-slate-300 pt-3 text-base font-black sm:text-lg"><span className="break-words">Total Investment</span><span className="shrink-0 text-right text-[#000080]">{money(presentation?.total,currency)}</span></div>
        </div>
      </section>

      {optional.length > 0 && <section className="min-w-0 break-inside-avoid">
        <p className="break-words text-xs font-extrabold uppercase tracking-[0.16em] text-[#FF0E0E]">Recommended Enhancements</p>
        <h2 className="mt-1 break-words text-xl font-black">Optional add-ons</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{optional.map((item: any) => <div key={item.id || item.productName} className="min-w-0 rounded-xl border border-slate-200 p-4"><div className="flex min-w-0 items-start justify-between gap-4"><p className="min-w-0 break-words font-bold">{item.productName}</p><p className="shrink-0 text-right font-black text-[#000080]">{money(item.lineTotal,currency)}</p></div>{item.description && <p className="mt-2 break-words text-xs leading-5 text-slate-500">{item.description}</p>}<CustomerTimeline item={item} /></div>)}</div>
        <p className="mt-3 break-words text-xs text-slate-500">Optional enhancements are not included in the committed quotation total unless ProFox confirms them in an updated quotation.</p>
      </section>}

      <section className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 break-inside-avoid rounded-2xl border border-slate-200 p-4 sm:p-6"><p className="break-words text-xs font-extrabold uppercase tracking-[0.14em] text-[#000080]">Estimated Project Timeline</p><p className="mt-3 break-words text-xl font-black">{presentation?.durationSnapshotText || 'Timeline confirmation required'}</p></div>
        <div className="min-w-0 break-inside-avoid rounded-2xl border border-slate-200 p-4 sm:p-6"><p className="break-words text-xs font-extrabold uppercase tracking-[0.14em] text-[#000080]">Payment Plan</p>{paymentSchedule.length > 0 ? <div className="mt-3 space-y-3">{paymentSchedule.map((milestone: any) => <div key={milestone.milestoneNumber} className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-bold">{milestone.label || milestone.paymentType}</p><p className="text-xs text-slate-500">{milestone.percentage}%</p></div><p className="shrink-0 text-right font-black">{money(milestone.amount,currency)}</p></div>)}</div> : <p className="mt-3 break-words text-sm text-slate-500">{presentation?.paymentPlan?.error || 'Payment plan will be confirmed before sending.'}</p>}</div>
      </section>

      <TextSection title="Scope Summary" value={presentation?.scopeSummary} />
      <TextSection title="Client Responsibilities" value={presentation?.clientResponsibilities} />
      <TextSection title="Delivery Assumptions" value={presentation?.deliveryAssumptions} />
      <TextSection title="Review & Approval Process" value={presentation?.reviewProcess} />
      <TextSection title="Handover / Support" value={presentation?.handoverSupport} />
      <TextSection title="Exclusions" value={presentation?.exclusions} />
      <TextSection title="Terms & Conditions" value={presentation?.termsAndConditions || presentation?.paymentTerms} />

      {actions && <section className="no-print min-w-0 rounded-2xl border-2 border-[#000080] bg-slate-50 p-4 sm:p-6"><p className="break-words text-xs font-extrabold uppercase tracking-[0.16em] text-[#000080]">Customer Action</p><div className="mt-4 min-w-0">{actions}</div></section>}
    </main>

    <footer className="border-t border-slate-200 px-4 py-7 text-xs text-slate-500 sm:px-6 lg:px-10 print:px-0">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-between sm:gap-6"><div className="min-w-0"><p className="break-words font-bold text-slate-800">{branding.businessName || 'ProFox Web Designer'}</p><p className="break-words">{branding.registeredName || ''}</p></div><div className="min-w-0 sm:text-right"><p className="break-all">{branding.websiteUrl || 'https://www.profoxwebdesigner.com'}</p><p className="break-all">{branding.contactEmail || ''}</p><p className="break-words">{presentation?.quotationNumber || ''} · Revision {presentation?.revisionNumber || 1}</p></div></div>
    </footer>
  </div>;
}
