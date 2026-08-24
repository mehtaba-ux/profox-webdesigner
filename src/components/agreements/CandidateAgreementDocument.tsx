import React from 'react';
import SalesPartnerAgreementDocument from './SalesPartnerAgreementDocument';

type Agreement = {
  agreementType?: string;
  agreementNumber?: string;
  templateVersion?: number;
  status?: string;
  partner?: any;
  company?: any;
  commercial?: any;
  training?: any;
  hiring?: any;
  template?: any;
  documentHash?: string;
  partnerSignedAt?: string;
  companySignerName?: string;
  companySignerTitle?: string;
  companySignedAt?: string;
  verifiedAt?: string;
};

const isUiuxAgreement = (agreement: Agreement) =>
  agreement.agreementType === 'uiux_designer' ||
  agreement.hiring?.systemRole === 'uiux_designer' ||
  agreement.training?.track === 'uiux_design' ||
  String(agreement.template?.title || '').toLowerCase().includes('ui/ux designer');

export default function CandidateAgreementDocument({ agreement }: { agreement: Agreement }) {
  if (!isUiuxAgreement(agreement)) return <SalesPartnerAgreementDocument agreement={agreement} />;

  const template = agreement.template || {};
  const candidate = agreement.partner || {};
  const company = agreement.company || {};
  const commercial = agreement.commercial || {};
  const training = agreement.training || {};
  const hiring = agreement.hiring || {};
  const sections = Array.isArray(template.sections) ? template.sections : [];

  return (
    <article className="mx-auto max-w-4xl bg-white text-slate-800">
      <header className="border-b border-slate-200 pb-8">
        <div className="text-xs font-black uppercase tracking-[.18em] text-[#FF0E0E]">PROFOX · CANDIDATE AGREEMENT</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-[#000080] sm:text-4xl">{template.title || 'ProFox UI/UX Designer Services Agreement'}</h1>
        {template.subtitle && <p className="mt-2 text-sm font-semibold text-slate-500">{template.subtitle}</p>}
        {template.introduction && <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">{template.introduction}</p>}
      </header>

      <section className="grid gap-3 border-b border-slate-200 py-7 sm:grid-cols-2">
        <Fact label="Agreement ID" value={agreement.agreementNumber || 'Preview'} />
        <Fact label="Agreement version" value={agreement.templateVersion ? `Version ${agreement.templateVersion}.0` : 'Current version'} />
        <Fact label="Company" value={`${company.legalEntity || 'ProFox Digital Solution'} · ${company.businessName || 'ProFox Web Designer'}`} />
        <Fact label="Candidate" value={`${candidate.fullName || 'UI/UX Designer'} · ${candidate.email || ''}`} />
        <Fact label="Role" value={hiring.jobTitle || 'UI/UX Designer'} />
        <Fact label="Department" value={hiring.department || 'UI/UX Design'} />
        <Fact label="Engagement" value={commercial.engagementType || 'Contract'} />
        <Fact label="Document status" value={agreement.status || 'Preview'} />
      </section>

      {sections.map((section: any, index: number) => {
        const heading = section.heading || section.title || `Section ${index + 1}`;
        const body = section.body || section.text || '';
        return (
          <section key={section.key || heading || index} className="border-b border-slate-100 py-7">
            <h2 className="text-lg font-black text-[#000080]">{heading}</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              {String(body).split(/\n\s*\n/).filter(Boolean).map((paragraph: string, paragraphIndex: number) => <p key={paragraphIndex}>{paragraph}</p>)}
            </div>
          </section>
        );
      })}

      <section className="border-b border-slate-200 py-8">
        <div className="text-xs font-black uppercase tracking-[.18em] text-[#FF0E0E]">CONTROLLED ONBOARDING</div>
        <h2 className="mt-2 text-xl font-black text-[#000080]">Design Academy & production access</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          Training track: <strong>{training.track === 'uiux_design' ? 'ProFox Design Academy' : (training.track || 'UI/UX Design')}</strong>. {training.productionAccess || 'Production access remains locked until the required onboarding, Final Approval and activation gates are complete.'}
        </p>
        {hiring.applicationReference && <p className="mt-2 text-xs text-slate-500">Application reference: <strong>{hiring.applicationReference}</strong></p>}
      </section>

      {(agreement.partnerSignedAt || agreement.companySignedAt) && (
        <section className="py-8">
          <h2 className="text-xl font-black text-[#000080]">Signature record</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {agreement.partnerSignedAt && <Policy title="Candidate" text={`Signed ${new Date(agreement.partnerSignedAt).toLocaleString()}`} />}
            {agreement.companySignedAt && <Policy title="For ProFox" text={`${agreement.companySignerName || ''}${agreement.companySignerTitle ? ` · ${agreement.companySignerTitle}` : ''} · Signed ${new Date(agreement.companySignedAt).toLocaleString()}`} />}
          </div>
        </section>
      )}

      <footer className="mt-4 border-t border-slate-200 py-6 text-[11px] leading-5 text-slate-400">
        Agreement hash: {agreement.documentHash || 'Generated when issued'} · From site to system.
      </footer>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-bold text-slate-800">{value}</div></div>;
}

function Policy({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><div className="text-xs font-black text-[#000080]">{title}</div><p className="mt-2 text-xs leading-5 text-slate-600">{text}</p></div>;
}
