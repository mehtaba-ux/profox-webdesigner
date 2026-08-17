import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState } from 'react';
import { 
  Layout, 
  Search, 
  Plus, 
  Trash2, 
  ChevronRight, 
  Settings, 
  Eye, 
  Save, 
  AlertCircle,
  Copy,
  Layers,
  ChevronDown,
  Monitor,
  Smartphone,
  Tablet,
  Maximize2,
  X,
  Sparkles,
  Info,
  Check,
  DollarSign,
  Rss,
  RefreshCw,
  Upload,
  Loader2
} from 'lucide-react';
import { useCMS } from '../../lib/CMSProvider';
import ImageUploader from './ImageUploader';
import { cn } from '../../lib/utils';


import AboutUsDetailView from '../../pages/AboutUsDetailView';
import CareersDetailView from '../../pages/CareersDetailView';
import ContactUsDetailView from '../../pages/ContactUsDetailView';
import ServiceDetailView from '../../pages/ServiceDetailView';
import PrivacyPolicy from '../../pages/PrivacyPolicy';
import PricingDetailView from '../../pages/PricingDetailView';
import { defaultPortfolioItems } from '../../data';
import { defaultPricingTemplateData } from '../../data/pricingTemplate';
import { uploadOptimizedFile } from '../../lib/optimizedUpload';

function ImageUploaderButton({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        alert('Please upload an image file.');
        setUploading(false);
        return;
      }

      const result = await uploadOptimizedFile(file);
      onChange(result.url);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Upload failed: ${err.message || err}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <ConfirmButton 
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 h-8 self-end"
        title="Upload Image"
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#000080]" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
      </ConfirmButton>
    </div>
  );
}

const formatContentLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const isImageContentKey = (key: string) => !/^logos?Item$/i.test(key) && /image|photo|logo|background|thumbnail|cover/i.test(key);

function DynamicAboutContentEditor({ value, onChange, fieldKey = 'aboutPage', depth = 0 }: { value: any; onChange: (next: any) => void; fieldKey?: string; depth?: number }) {
  if (Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div key={index} className="relative rounded-2xl border border-slate-200 bg-white p-4">
            <ConfirmButton type="button" onClick={() => onChange(value.filter((_: any, itemIndex: number) => itemIndex !== index))} className="absolute right-3 top-3 z-10 text-slate-300 hover:text-red-500" aria-label={`Remove ${formatContentLabel(fieldKey)} item`}><Trash2 className="h-4 w-4" /></ConfirmButton>
            <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#000080]">{formatContentLabel(fieldKey)} {index + 1}</div>
            <DynamicAboutContentEditor value={item} fieldKey={`${fieldKey}Item`} depth={depth + 1} onChange={(nextItem) => onChange(value.map((current: any, itemIndex: number) => itemIndex === index ? nextItem : current))} />
          </div>
        ))}
        <ConfirmButton type="button" onClick={() => onChange([...value, value.length ? JSON.parse(JSON.stringify(value[value.length - 1])) : ''])} className="inline-flex items-center gap-2 rounded-xl bg-[#000080]/10 px-4 py-2.5 text-xs font-bold text-[#000080] hover:bg-[#000080]/15"><Plus className="h-4 w-4" /> Add {formatContentLabel(fieldKey)}</ConfirmButton>
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className={cn('grid gap-4', depth > 0 && 'sm:grid-cols-2')}>
        {Object.entries(value).map(([key, childValue]) => (
          <div key={key} className={cn((childValue && typeof childValue === 'object') && 'sm:col-span-2', depth === 0 && 'rounded-3xl border border-slate-200 bg-slate-50 p-5')}>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">{formatContentLabel(key)}</label>
            <DynamicAboutContentEditor value={childValue} fieldKey={key} depth={depth + 1} onChange={(nextChild) => onChange({ ...value, [key]: nextChild })} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700">
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#000080]" />
        {value ? 'Enabled' : 'Disabled'}
      </label>
    );
  }

  const stringValue = value == null ? '' : String(value);
  if (isImageContentKey(fieldKey)) {
    return <ImageUploader label="" value={stringValue} onChange={onChange} />;
  }
  const useTextarea = /description|subtitle|body|text|quote|detail|intro|paragraph/i.test(fieldKey) || stringValue.length > 90;
  return useTextarea
    ? <textarea rows={3} value={stringValue} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 focus:border-[#000080] focus:outline-none" />
    : <input type="text" value={stringValue} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:outline-none" />;
}

function hydratePricingTemplateData(source: any) {
  const value = source && typeof source === 'object' ? source : {};
  return {
    ...defaultPricingTemplateData,
    ...value,
    hero: { ...defaultPricingTemplateData.hero, ...(value.hero || {}) },
    assurance: { ...defaultPricingTemplateData.assurance, ...(value.assurance || {}) },
    planLabels: { ...defaultPricingTemplateData.planLabels, ...(value.planLabels || {}) },
    plans: Array.isArray(value.plans) ? value.plans : defaultPricingTemplateData.plans,
    comparison: { ...defaultPricingTemplateData.comparison, ...(value.comparison || {}) },
    pricingProcess: { ...defaultPricingTemplateData.pricingProcess, ...(value.pricingProcess || {}) },
    scopeAndPayment: { ...defaultPricingTemplateData.scopeAndPayment, ...(value.scopeAndPayment || {}) },
    carePlans: { ...defaultPricingTemplateData.carePlans, ...(value.carePlans || {}) },
    recommendation: { ...defaultPricingTemplateData.recommendation, ...(value.recommendation || {}) },
    faq: { ...defaultPricingTemplateData.faq, ...(value.faq || {}) },
    closing: { ...defaultPricingTemplateData.closing, ...(value.closing || {}) }
  };
}

function PricingSectionEditor({ number, title, description, value, fieldKey, onChange, note }: { number: string; title: string; description: string; value: any; fieldKey: string; onChange: (next: any) => void; note?: string }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="rounded-3xl border border-[#000080]/10 bg-gradient-to-br from-[#000080]/[0.06] to-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#000080] text-xs font-black text-white">{number}</span>
          <div>
            <h4 className="text-base font-bold tracking-[-0.02em] text-slate-950">{title}</h4>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-600">{description}</p>
            {note && <div className="mt-3 inline-flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-900"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</div>}
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <DynamicAboutContentEditor value={value} fieldKey={fieldKey} depth={1} onChange={onChange} />
      </div>
    </div>
  );
}

export interface TemplateBlueprint {
  id: string;
  name: string;
  description: string;
  type: 'default' | 'service-detail' | 'legal-policy' | 'about-us' | 'careers' | 'contact-us' | 'pricing';
  defaultData: any;
}

const defaultPrivacyPolicyBody = `<h3 id="who-we-are">1. Who We Are</h3>
<p>Profox provides website design, website development, UI/UX design, e-commerce development, landing-page development, copywriting, website maintenance, and custom web-application design and development services for businesses and organisations across industries.</p>
<p>Profox is incorporated and operates under the laws of India. Profox serves clients in the USA, UK, Australia, India, and worldwide.</p>
<p>For personal data that Profox collects and uses for its own business purposes, Profox acts as the responsible organisation, controller, business, or data fiduciary, as those terms apply under relevant privacy law. When Profox processes personal data solely on a client's documented instructions as part of a development, support, hosting, migration, testing, or maintenance engagement, the parties' contract and applicable law determine their respective roles.</p>

<h3 id="scope">2. Scope of This Policy</h3>
<p>This Privacy Policy applies to personal data handled through Profox's websites, enquiry and contact forms, sales and discovery communications, proposals, contracts, project-management processes, design and development services, support and maintenance services, and other interactions with Profox.</p>
<p>It applies to:</p>
<ul>
  <li>Website visitors and individuals who submit enquiries or request quotations;</li>
  <li>Prospective clients, clients, authorised client representatives, vendors, contractors, and business partners;</li>
  <li>Individuals who communicate with Profox by email, telephone, video meeting, website form, social media, messaging service, or another business channel;</li>
  <li>Individuals whose information a client lawfully provides to Profox for a project; and</li>
  <li>Users of a website or application where Profox is responsible for operating a privacy-relevant feature on its own behalf.</li>
</ul>
<p>This Policy does not govern the independent privacy practices of a client's website, application, or business merely because Profox designed, developed, maintains, or supports it. Each client is responsible for its own privacy notices, lawful data collection, consent mechanisms, and instructions unless a written agreement states otherwise.</p>
<p>Third-party websites and services linked from Profox-controlled pages operate under their own privacy policies. Profox is not responsible for their independent practices.</p>

<h3 id="personal-data">3. Personal Data We Collect</h3>

<h4 id="identity">3.1 Identity and Contact Information</h4>
<ul>
  <li>Name, job title, business name, and professional role;</li>
  <li>Business or personal email address;</li>
  <li>Telephone or messaging number;</li>
  <li>Business address, billing address, country, and service location; and</li>
  <li>Social-media profile or business-page information when you contact Profox through those channels.</li>
</ul>

<h4 id="enquiry">3.2 Enquiry, Sales and Contract Information</h4>
<ul>
  <li>Information submitted through enquiry, quote, consultation, or contact forms;</li>
  <li>Project requirements, preferred services, objectives, budget range, timeline, and meeting notes;</li>
  <li>Proposal, quotation, scope-of-work, contract, approval, and revision records; and</li>
  <li>Communications relating to negotiations, onboarding, project delivery, support, or complaints.</li>
</ul>

<h4 id="technical">3.3 Project and Technical Information</h4>
<ul>
  <li>Content, images, documents, design files, brand assets, product information, and other materials supplied for a project;</li>
  <li>Technical specifications, system requirements, database structures, integrations, API documentation, test data, bug reports, and support records;</li>
  <li>Domain, hosting, content-management, repository, deployment, or third-party service information provided for authorised project work; and</li>
  <li>User accounts, roles, permissions, and contact information required to design, test, deploy, or support a client solution.</li>
</ul>

<h4 id="payment-info">3.4 Payment and Transaction Information</h4>
<ul>
  <li>Selected service, invoice amount, billing details, payment status, transaction reference, and payment date; and</li>
  <li>Records needed for accounting, reconciliation, tax, refunds, disputes, and fraud prevention.</li>
</ul>
<p>Profox does not need to receive or store full payment-card numbers, card security codes, or online-banking passwords. Payment credentials entered into a third-party payment service are handled by that provider under its own terms and privacy policy.</p>

<h4 id="device">3.5 Website and Device Information</h4>
<ul>
  <li>IP address, browser type, operating system, device type, approximate region, referring page, and language settings;</li>
  <li>Pages visited, links clicked, session timing, traffic source, and form-interaction information; and</li>
  <li>Cookie preferences and information collected through cookies or similar technologies described in Section 12.</li>
</ul>

<h4 id="sensitive">3.6 Sensitive Information</h4>
<p>Profox does not intentionally request sensitive or special-category personal data for ordinary website and application projects. Do not provide health information, government identification numbers, biometric information, financial credentials, information about children, or other sensitive data unless it is genuinely required, lawful, and agreed in writing with appropriate safeguards.</p>

<h3 id="how-collect">4. How We Collect Personal Data</h3>
<p>Profox may collect personal data:</p>
<ul>
  <li>Directly from you when you contact us, submit a form, schedule a meeting, request a quotation, sign a contract, make a payment, provide project materials, request support, or communicate with our team;</li>
  <li>From your employer, colleague, authorised representative, referral partner, or another person involved in your project;</li>
  <li>Automatically when you use a Profox-controlled website, subject to applicable cookie and consent requirements;</li>
  <li>From public business sources, such as a company website, business directory, or professional social-media page, when used lawfully for relevant business-to-business outreach; and</li>
  <li>From service providers that support communications, payments, analytics, scheduling, file transfer, project management, hosting, security, or project delivery.</li>
</ul>
<p>Where applicable law requires Profox to provide privacy information because personal data was obtained from another source, Profox will provide that information within the legally required period or at the appropriate first communication.</p>

<h3 id="how-use">5. How and Why We Use Personal Data</h3>
<p>Profox uses personal data only for legitimate, disclosed, and reasonably necessary purposes, including:</p>
<ul>
  <li>Responding to enquiries and arranging consultations, demonstrations, or project meetings;</li>
  <li>Understanding requirements and preparing estimates, proposals, contracts, and project plans;</li>
  <li>Verifying client instructions and managing authorised representatives;</li>
  <li>Designing, developing, testing, deploying, maintaining, securing, and supporting websites and applications;</li>
  <li>Creating designs, content, prototypes, technical documentation, reports, and other agreed deliverables;</li>
  <li>Managing project communication, feedback, approvals, revisions, milestones, deadlines, and handover;</li>
  <li>Processing payments, issuing invoices and receipts, handling refunds or disputes, and maintaining financial records;</li>
  <li>Providing customer service, maintenance, troubleshooting, warranty support, and security assistance;</li>
  <li>Operating, securing, measuring, and improving Profox-controlled websites, forms, and business systems;</li>
  <li>Preventing fraud, misuse, unauthorised access, security incidents, and violations of contractual terms;</li>
  <li>Sending service-related notices and, where permitted, relevant marketing communications;</li>
  <li>Maintaining legal, tax, accounting, compliance, complaint, and dispute records; and</li>
  <li>Establishing, exercising, or defending legal claims and responding to lawful authority requests.</li>
</ul>

<h4 id="legal-bases">5.1 Legal Bases</h4>
<p>Depending on the jurisdiction and context, Profox may rely on one or more of the following legal bases: your consent; steps requested before entering a contract; performance of a contract; compliance with a legal obligation; protection of legitimate interests that are not overridden by individual rights; and other permitted uses recognised by applicable law.</p>
<p>Where processing is based on consent, you may withdraw that consent using the contact information in Section 18. Withdrawal does not affect processing lawfully completed before withdrawal.</p>

<h3 id="client-projects">6. Client Projects and Client-Supplied Data</h3>
<p>Clients may provide personal data contained in content, customer records, employee information, test data, databases, design files, communications, or other project materials. The client is responsible for ensuring that it has the legal authority to provide that information to Profox and for giving all required notices and obtaining all required permissions.</p>
<p>When Profox processes personal data solely to perform contracted services on a client's instructions:</p>
<ul>
  <li>Profox will use the data only for the contracted project and related support;</li>
  <li>Access will be limited to authorised personnel and service providers who need it for the engagement;</li>
  <li>Profox will not sell the data or use it for unrelated advertising;</li>
  <li>Profox will follow documented client instructions, subject to law and the parties' agreement; and</li>
  <li>Deletion, return, export, retention, incident notification, and assistance obligations will follow the contract and applicable law.</li>
</ul>
<p>Clients should use anonymised, pseudonymised, synthetic, or minimum-necessary test data whenever reasonably possible. Production personal data should not be placed into a testing environment unless necessary and appropriately protected.</p>

<h3 id="payments">7. Payments and Financial Information</h3>
<p>Payments may be processed through a third-party payment provider or another method identified in a quotation, invoice, checkout page, or payment request. The payment provider may collect payment credentials, identity information, billing information, device information, and fraud-prevention data under its own privacy policy.</p>
<p>Profox generally receives transaction status, payment reference, amount, date, payer details, and other information necessary to confirm and account for the payment. Profox may retain invoices, receipts, credit notes, refund records, and transaction information for legal, tax, accounting, and dispute-resolution purposes.</p>

<h3 id="sharing">8. Sharing Personal Data and Service Providers</h3>
<p>Profox may share personal data only to the extent reasonably necessary with:</p>
<ul>
  <li>Authorised Profox employees, contractors, designers, developers, project managers, quality-assurance personnel, accountants, and professional advisers;</li>
  <li>Hosting, cloud-storage, domain, repository, deployment, database, security, backup, analytics, communication, scheduling, file-transfer, project-management, customer-support, and payment providers;</li>
  <li>A client's authorised representatives and service providers where needed to complete the project;</li>
  <li>Regulators, courts, law-enforcement bodies, tax authorities, or other public authorities where disclosure is legally required;</li>
  <li>Professional advisers or counterparties in connection with a business reorganisation, financing, acquisition, sale, or transfer, subject to appropriate confidentiality and legal safeguards; and</li>
  <li>Other recipients where you have directed or consented to the disclosure.</li>
</ul>
<p>Service providers are expected to process personal data only for authorised purposes and under appropriate confidentiality, security, and data-protection obligations. Profox does not sell or rent personal data for monetary consideration. If Profox's advertising or analytics practices ever constitute a regulated 'sale' or 'sharing' under applicable law, Profox will provide the required notice and opt-out mechanism.</p>

<h3 id="transfers">9. International Data Transfers</h3>
<p>Profox is incorporated in India and serves clients worldwide. Personal data may therefore be accessed from, transferred to, or stored in India and in countries where Profox's clients or service providers operate.</p>
<p>Where required, Profox will use an applicable legal transfer mechanism or safeguard, such as contractual data-protection clauses, an approved transfer agreement or addendum, adequacy-based transfer, consent where lawful, or another mechanism recognised by the relevant law. No safeguard can eliminate every risk associated with international processing, but Profox will take reasonable steps appropriate to the circumstances.</p>

<h3 id="retention">10. Data Retention</h3>
<p>Profox retains personal data only for as long as reasonably necessary for the purpose for which it was collected, including to deliver services, maintain business and financial records, comply with law, resolve disputes, enforce agreements, and protect legal rights.</p>
<table style="width:100%; border-collapse: collapse; margin: 1.5rem 0;">
  <thead>
    <tr style="border-bottom: 2px solid #e2e8f0;">
      <th style="text-align: left; padding: 0.75rem; font-weight: bold; color: #1e293b;">Data category</th>
      <th style="text-align: left; padding: 0.75rem; font-weight: bold; color: #1e293b;">Typical retention approach</th>
      <th style="text-align: left; padding: 0.75rem; font-weight: bold; color: #1e293b;">Reason</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Enquiries and unsuccessful proposals</td>
      <td style="padding: 0.75rem; color: #475569;">Kept for a reasonable follow-up and record period, then deleted or anonymised unless law or a dispute requires longer retention.</td>
      <td style="padding: 0.75rem; color: #475569;">Sales follow-up, accountability, and dispute management</td>
    </tr>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Active project and client records</td>
      <td style="padding: 0.75rem; color: #475569;">Kept during the engagement and for a reasonable post-completion support and legal period.</td>
      <td style="padding: 0.75rem; color: #475569;">Service delivery, support, warranty, and contractual records</td>
    </tr>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Project files and client-supplied data</td>
      <td style="padding: 0.75rem; color: #475569;">Returned, deleted, archived, or retained according to the contract, client instructions, backup cycles, and legal requirements.</td>
      <td style="padding: 0.75rem; color: #475569;">Project delivery and contractual obligations</td>
    </tr>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Financial and tax records</td>
      <td style="padding: 0.75rem; color: #475569;">Kept for the period required by applicable tax, accounting, and corporate law.</td>
      <td style="padding: 0.75rem; color: #475569;">Legal and accounting obligations</td>
    </tr>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Website analytics and cookie records</td>
      <td style="padding: 0.75rem; color: #475569;">Kept according to configured provider settings and consent requirements, then deleted or aggregated.</td>
      <td style="padding: 0.75rem; color: #475569;">Website operation, measurement, and consent records</td>
    </tr>
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem; color: #475569;">Security, complaint, and legal records</td>
      <td style="padding: 0.75rem; color: #475569;">Kept while needed to investigate, respond, demonstrate compliance, or protect legal rights.</td>
      <td style="padding: 0.75rem; color: #475569;">Security, compliance, and claims</td>
    </tr>
  </tbody>
</table>
<p>When retention is no longer justified, Profox will take reasonable steps to delete, destroy, de-identify, or anonymise the information, subject to backup cycles and legal preservation obligations.</p>

<h3 id="rights">11. Your Privacy Rights and Choices</h3>
<p>Depending on your location and the applicable law, you may have rights to:</p>
<ul>
  <li>Ask whether Profox processes your personal data and request access to it;</li>
  <li>Request correction or completion of inaccurate or incomplete information;</li>
  <li>Request deletion or erasure where legal conditions are met;</li>
  <li>Withdraw consent for future processing based on consent;</li>
  <li>Object to or request restriction of certain processing;</li>
  <li>Request a portable copy of eligible information;</li>
  <li>Opt out of direct marketing, regulated sale or sharing, or targeted advertising where applicable;</li>
  <li>Request information about data sources, purposes, categories, and recipients;</li>
  <li>Request human review where a solely automated decision with significant effects is used;</li>
  <li>Nominate another person to exercise rights where applicable; and</li>
  <li>Make a complaint to Profox or an appropriate privacy regulator.</li>
</ul>
<p>To submit a request, email <a href="mailto:contact@profoxwebdesigner.com">contact@profoxwebdesigner.com</a> and describe the right you wish to exercise. Profox may request information reasonably necessary to verify identity and authority. Profox will respond within the period required by the applicable law. Rights may be subject to lawful exceptions, and Profox will explain any refusal or limitation where required.</p>

<h3 id="cookies-tech">12. Cookies and Similar Technologies</h3>
<p>Profox-controlled websites may use cookies, pixels, local storage, tags, scripts, or similar technologies for the following categories:</p>
<ul>
  <li><strong>Essential:</strong> security, network management, form protection, session continuity, and remembering privacy choices;</li>
  <li><strong>Functional:</strong> remembering preferences and enabling optional website features;</li>
  <li><strong>Analytics:</strong> understanding traffic, page performance, user journeys, and website effectiveness; and</li>
  <li><strong>Advertising:</strong> measuring campaigns or supporting interest-based advertising, only where used and permitted.</li>
</ul>
<p>Where consent is legally required, non-essential technologies will be used only after appropriate consent. You may manage available choices through the cookie banner or preferences control and through your browser settings. Blocking some technologies may affect optional functionality.</p>
<p>A separate Cookie Policy may provide the current names, providers, purposes, and durations of technologies actually used. Because website tools may change, Profox should update that list whenever analytics, advertising, chat, form, scheduling, or embedded-media services are added or removed.</p>

<h3 id="marketing">13. Marketing Communications</h3>
<p>Profox may send marketing communications where you have consented or where another lawful basis permits relevant business-to-business communication. Marketing may concern Profox's website, design, development, application, maintenance, and related services.</p>
<p>You may unsubscribe through the link in an email, reply with an opt-out request, or contact <a href="mailto:contact@profoxwebdesigner.com">contact@profoxwebdesigner.com</a>. Profox may retain a minimal suppression record so that the opt-out is respected. Opting out of marketing does not stop essential project, payment, legal, support, or service communications.</p>

<h3 id="security">14. Data Security and Breach Response</h3>
<p>Profox uses reasonable technical and organisational measures appropriate to the nature of the information, the project, available technology, and the risks involved. Measures may include access controls, confidentiality obligations, secure authentication, encrypted communications, backups, security updates, limited data access, and service-provider review where appropriate.</p>
<p>No internet transmission, development environment, cloud service, or storage method is completely secure. Profox cannot guarantee absolute security. Clients are responsible for protecting credentials, limiting access, maintaining secure configurations, and promptly reporting suspected compromise relating to their project or accounts.</p>
<p>If Profox becomes aware of a personal-data breach for which it has notification responsibility, Profox will investigate, contain, document, and notify affected clients, individuals, or authorities as required by applicable law and contractual obligations. Security concerns may be reported to <a href="mailto:support@profoxwebdesigner.com">support@profoxwebdesigner.com</a>.</p>

<h3 id="children">15. Children's Privacy</h3>
<p>Profox's business services are intended for adults and authorised representatives of legitimate organisations. Profox does not knowingly solicit personal data directly from children under 18 through its own sales and business-service activities.</p>
<p>If you believe a child has provided personal data directly to Profox without appropriate authority, contact <a href="mailto:contact@profoxwebdesigner.com">contact@profoxwebdesigner.com</a>. Profox will review the matter and take appropriate action. A client commissioning a child-accessible website or application remains responsible for obtaining legal advice and implementing age-appropriate notices, consent, safety, and data-protection measures; these requirements must be addressed expressly in the project scope.</p>

<h3 id="jurisdiction">16. Jurisdiction-Specific Information</h3>

<h4 id="india">16.1 India</h4>
<p>Where the Digital Personal Data Protection Act 2023, the Digital Personal Data Protection Rules 2025, or other Indian requirements apply, Profox will provide required notices, rely on a permitted ground for processing, enable applicable data-principal rights, maintain an appropriate grievance channel, and comply with legally applicable security, breach, retention, and transfer obligations.</p>

<h4 id="uk">16.2 United Kingdom</h4>
<p>Where the UK GDPR and Data Protection Act 2018 apply, individuals may have rights including access, rectification, erasure, restriction, objection, portability, withdrawal of consent, and complaint to the Information Commissioner's Office. Profox will respond to eligible rights requests without undue delay and within the legally applicable period. International transfers will use an applicable UK transfer mechanism where required.</p>

<h4 id="us">16.3 United States</h4>
<p>Privacy rights and business obligations vary by state and may depend on statutory thresholds and exemptions. Where the CCPA/CPRA or another applicable state privacy law applies, eligible residents may request access, correction, deletion, and information about collection and disclosure, and may exercise applicable opt-out and non-discrimination rights. Profox does not sell personal data for monetary consideration. Requests may be submitted through the contact method in Section 18.</p>

<h4 id="au">16.4 Australia</h4>
<p>Where the Privacy Act 1988 and Australian Privacy Principles apply, individuals may request access to and correction of personal information and may raise a privacy complaint. Profox will take reasonable steps regarding transparent handling, data quality, security, cross-border disclosure, and deletion or de-identification where legally required.</p>

<h4 id="others">16.5 Other Countries</h4>
<p>Individuals in other jurisdictions may have additional rights under local law, including laws such as Canada's PIPEDA, Singapore's PDPA, South Africa's POPIA, or other national and regional frameworks. Profox will assess a request under the law applicable to the relevant processing activity.</p>

<h3 id="changes">17. Changes to This Privacy Policy</h3>
<p>Profox may update this Policy to reflect changes in services, technology, legal requirements, suppliers, or data-handling practices. The updated version will be posted with a revised 'Last updated' date. Where a change materially affects how personal data is used, Profox will provide additional notice or seek consent where required by law.</p>
<p>You should review this Policy periodically. Previous versions may be requested using the contact information below, subject to reasonable availability and record-retention practices.</p>

<h3 id="contact">18. Contact Us and Privacy Requests</h3>
<p>For questions, privacy requests, complaints, consent withdrawal, or concerns about this Policy, use the following details.</p>
<p><strong>Business:</strong> Profox</p>
<p><strong>Website:</strong> <a href="https://www.profoxwebdesigner.com/">https://www.profoxwebdesigner.com/</a></p>
<p><strong>Data Protection Officer and privacy enquiries:</strong> <a href="mailto:contact@profoxwebdesigner.com">contact@profoxwebdesigner.com</a></p>
<p><strong>Security and support reports:</strong> <a href="mailto:support@profoxwebdesigner.com">support@profoxwebdesigner.com</a></p>
<p><strong>Registered address:</strong><br/>
Profox<br/>
[Address Line 1]<br/>
[City, State, PIN Code]<br/>
India</p>
<p>When making a privacy request, provide enough information for Profox to understand the request and identify the relevant records. Do not send passwords, payment-card details, or unnecessary identity documents by ordinary email. If identity verification is necessary, Profox will request a proportionate method.`;

const defaultTermsBody = `<h3 id="agreement">1. Agreement to Terms</h3>
<p>These Terms and Conditions constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you") and Profox web designer ("we", "us", or "our"), concerning your access to and use of our website, digital transformation services, custom web application development, and client portal platforms.</p>

<h3 id="ip">2. Intellectual Property Rights</h3>
<p>Unless otherwise indicated, the website, source code, functionality, software, website designs, text, graphics, and trademarks (collectively, the "Content") are owned or controlled by us or licensed to us, and are protected by copyright, trademark, and intellectual property laws.</p>
<p><strong>Custom Client Deliverables:</strong> Upon receipt of full and final payment for custom web development, software engineering, or design assets executed under an agreed Statement of Work (SOW), full ownership and intellectual property rights for custom client deliverables are transferred to the client as specified in the SOW.</p>

<h3 id="obligations">3. Client Obligations & Service Conduct</h3>
<p>When engaging our services or using our platform, you agree that you will not submit false information, probe system infrastructure vulnerabilities, reverse engineer proprietary code, or use our services for illegal activities.</p>

<h3 id="payments-terms">4. Payment Terms & Service Agreements</h3>
<p>Fees for professional services, custom application development, maintenance, and consulting are set forth in individual Statements of Work or service agreements. Payments are due according to the schedule specified therein.</p>

<h3 id="liability">5. Limitation of Liability</h3>
<p>To the maximum extent permitted by applicable law, in no event shall Profox web designer, its directors, employees, or agents be liable to you or any third party for any direct, indirect, incidental, consequential, special, or punitive damages arising from your use of our services or website.</p>

<h3 id="governing-law">6. Governing Law & Jurisdiction</h3>
<p>These Terms and Conditions shall be governed by and construed in accordance with the laws of the State of New York, USA, without regard to its conflict of law principles.</p>`;

const defaultCookiesBody = `<h3 id="what-cookies">1. What Are Cookies?</h3>
<p>Cookies are small text files stored on your computer or mobile device when you visit a website. They are widely used to make websites work more efficiently and provide information to site owners.</p>

<h3 id="types-cookies">2. Types of Cookies We Use</h3>
<h4 id="essential-cookies">a. Essential / Strictly Necessary Cookies</h4>
<p>Required for fundamental site operation, administrative authentication sessions, and secure navigation.</p>

<h4 id="performance-cookies">b. Performance & Preference Cookies</h4>
<p>Remember user preferences, custom theme selections, font configurations, and language choices.</p>

<h4 id="analytics-cookies">c. Analytics & Diagnostics Cookies</h4>
<p>Collect aggregated, anonymous metrics regarding page load speed, error rates, and traffic flows to optimize performance.</p>

<h3 id="managing-cookies">3. Managing Cookie Preferences</h3>
<p>Most web browsers allow you to control cookies through their settings preferences. You can configure your browser to reject cookies or alert you when a cookie is sent.</p>`;

const defaultPrivacyPolicyData = {
  hero: {
    title: 'Privacy Policy',
    highlight: '& Legal Governance',
    description: 'Clear, transparent guidelines regarding how Profox web designer handles your personal data, privacy security, and digital service agreements.',
    lastUpdated: 'August 7, 2026'
  },
  companyInfo: {
    name: 'Profox web designer',
    address: '',
    email: 'privacy@profox-webdesigner.com',
    dpoEmail: 'contact@profox-webdesigner.com'
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'Profox web designer and its affiliates ("we", "us", or "our") respects your privacy and is committed to protecting your personal data.',
    lastUpdated: 'August 7, 2026',
    bodyContent: defaultPrivacyPolicyBody
  },
  terms: {
    title: 'Terms & Conditions',
    subtitle: 'These Terms and Conditions constitute a legally binding agreement concerning your access to and use of our digital services.',
    lastUpdated: 'August 7, 2026',
    bodyContent: defaultTermsBody
  },
  cookies: {
    title: 'Cookie Policy',
    subtitle: 'Cookies are small text files stored on your computer or mobile device when you visit a website.',
    lastUpdated: 'August 7, 2026',
    bodyContent: defaultCookiesBody
  }
};

const defaultAboutUsData = {
  hero: {
    title: "Connected Digital Systems.",
    highlight: "Built for Real Growth.",
    subheading: "ABOUT US",
    subtitle: "8+ Years. 40+ Websites and Applications. One Growth-Focused Team.",
    description: "ProFox brings websites, custom applications, and business automation together so your customer experience, operations, and growth strategy move in the same direction.",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1600",
    stats: [
      { number: "8+", label: "Years of Experience", icon: "Award" },
      { number: "40+", label: "Websites & Apps Delivered", icon: "CheckCircle2" },
      { number: "1", label: "Growth-Focused Team", icon: "Users" }
    ]
  },
  subnav: [
    { label: "Our Story", id: "story" },
    { label: "Computer Showcase", id: "computer-showcase" },
    { label: "Core Values", id: "values" },
    { label: "Our Journey", id: "timeline" },
    { label: "Leadership Team", id: "team" },
    { label: "Get Started", id: "cta" }
  ],
  pageSections: {
    navigation: [
      { id: "overview", label: "Overview" }, { id: "story", label: "Our Story" }, { id: "journey", label: "Our Journey" },
      { id: "offices", label: "Our Offices" }, { id: "why-us", label: "Why Us" }, { id: "culture", label: "Culture & Careers" }
    ],
    navigationCta: { text: "Get in Touch", url: "/contact-us" },
    hero: { backLabel: "Back to Home", buttonText: "Start a Conversation", buttonUrl: "/contact-us" },
    overview: {
      headline: "We do more than deliver isolated digital projects. We connect the experiences, technology, and workflows that help a business grow.",
      scrollLabel: "Scroll to follow our approach",
      cards: [
        { title: "Start With the Business", description: "We understand your customers, workflows, and growth goals before recommending what to build." },
        { title: "Design the Right Journey", description: "We shape clear digital experiences that build trust and make the next action easy." },
        { title: "Build What Fits", description: "From websites to custom applications, every solution is designed around the way your business works." },
        { title: "Connect and Improve", description: "We link marketing, data, and automation so performance can be measured and improved over time." }
      ]
    },
    story: { eyebrow: "Our Story", title: "Growth gets easier when your digital systems work together.", image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=82&w=1800", scrollLabel: "Continue scrolling" },
    journey: { eyebrow: "How We Have Grown", title: "From Building Websites to Connecting Complete Digital Growth Systems" },
    presence: {
      eyebrow: "Where We Work", title: "Based in India, Built for Global Collaboration", description: "ProFox operates from Shimla, Himachal Pradesh, and works with businesses across the United States, United Kingdom, Canada, and Australia.", linkText: "Start a conversation",
      cards: [
        { eyebrow: "Primary Office", title: "", detail: "" },
        { eyebrow: "Primary Market", title: "United States", detail: "Remote strategy, design, development, and support" },
        { eyebrow: "Primary Market", title: "United Kingdom", detail: "Clear collaboration built around your working hours" },
        { eyebrow: "Primary Markets", title: "Canada & Australia", detail: "Flexible project delivery with one accountable team" }
      ]
    },
    impact: { title: "Impact", subtitle: "Eight years of practical digital work, more than forty delivered websites and applications, and one team focused on meaningful growth." },
    results: {
      eyebrow: "The ProFox Record", title: "Experience You Can Build On", description: "We have spent more than eight years turning business requirements into useful digital experiences—from conversion-focused websites to custom applications and connected automation workflows.",
      stats: [{ number: "8+", label: "Years of Experience" }, { number: "40+", label: "Websites & Apps Delivered" }, { number: "1", label: "Growth-Focused Team" }],
      registrationLabel: "Registered MSME / Udyam Number", registrationNumber: "UDYAM-HP-09-0022689"
    },
    awards: { title: "Registration & Business Identity", items: ["ProFox Web Designer", "ProFox Digital Solution", "Udyam Registered", "Shimla, Himachal Pradesh"] },
    whyUs: {
      eyebrow: "Why ProFox", title: "One Team for the Digital Work That Drives Growth", description: "You should not have to coordinate separate teams for your website, product, marketing data, and everyday workflows. ProFox connects them around one practical growth plan.", footerLabel: "What working with us feels like",
      cards: [
        { title: "Business Before Features", description: "Every recommendation begins with the problem, the customer, and the result you need." },
        { title: "One Accountable Team", description: "Strategy, design, development, and automation stay connected from planning through support." },
        { title: "Clear Customer Journeys", description: "We remove friction so people can understand your value and take the next step with confidence." },
        { title: "Systems That Work Together", description: "Forms, CRM, payments, analytics, applications, and email workflows are connected with purpose." },
        { title: "Built for Your Team", description: "The final system is practical to manage, documented clearly, and designed around real workflows." },
        { title: "Growth You Can Measure", description: "We focus on enquiries, adoption, time saved, conversion visibility, and operational improvement." }
      ]
    },
    clientStrip: { description: "From India, we collaborate with growth-minded businesses across four primary international markets.", logos: ["United States", "United Kingdom", "Canada", "Australia"] },
    gallery: { images: [
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=82&w=900",
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=82&w=900",
      "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&q=82&w=900",
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=82&w=900",
      "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=82&w=900"
    ] },
    culture: {
      eyebrow: "The Team Behind the Work", title: "Culture & Careers",
      imageOne: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=82&w=900",
      imageTwo: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&q=82&w=900",
      quoteOne: "Good digital work starts with listening carefully and asking better questions.",
      quoteTwo: "We grow by taking ownership, sharing what we know, and improving the work together.",
      paragraphs: [
        "ProFox is one growth-focused team of strategists, designers, developers, and automation specialists. Different skills come together around one shared responsibility: make the solution useful for the business and the people using it.",
        "We value thoughtful questions, honest communication, and practical problem-solving. Team members are encouraged to take ownership, explain their decisions clearly, and improve the work without adding unnecessary complexity.",
        "Our projects cross customer experience, technology, marketing communication, data, and internal workflows. That makes collaboration essential—not an extra step at the end.",
        "We are building a culture where good ideas are respected, learning is continuous, and progress is measured by the difference our work makes."
      ],
      closing: "Build thoughtfully. Communicate clearly. Keep moving the business forward."
    },
    cta: { heading: "Ready to Connect the Next Stage of Your Growth?", subtitle: "Tell us what is slowing your business down or where you want to grow. We’ll help you identify the right website, application, or automation path.", buttonText: "Start a Conversation", buttonUrl: "/contact-us" }
  },
  computerShowcase: {
    tagline: "COMPUTER DESIGN & DIGITAL ARCHITECTURE",
    title: "State-of-the-Art Computer & Web Interface Craftsmanship",
    description: "Every line of code and pixel we craft is mathematically tuned for ultra-responsive performance, seamless scrolling effects, and cross-platform perfection.",
    screenImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1600",
    badgeText: "High-FPS Responsive Web Systems",
    features: [
      { title: "Fluid Parallax & Scroll Physics", desc: "Silky-smooth 60FPS scroll animations and magnetic interactive cards.", icon: "Sparkles" },
      { title: "Responsive Computer Frames", desc: "Adaptive layouts crafted specifically for 4K desktop, laptop, tablet, and mobile viewports.", icon: "Monitor" },
      { title: "Next-Gen Frontend Architecture", desc: "Built with React, Vite, Tailwind CSS, and optimized Framer Motion acceleration.", icon: "Cpu" }
    ]
  },
  story: {
    quote: "Digital growth works better when customer experience, technology, and everyday operations move together.",
    quoteAuthor: "ProFox Digital Solution",
    body: "ProFox Web Designer is the client-facing brand of ProFox Digital Solution, based in Shimla, Himachal Pradesh. Over more than eight years, our team has delivered over forty websites and applications while expanding from focused website projects into custom web and mobile products, email marketing systems, and business automation. Our purpose is simple: help businesses attract customers, simplify operations, reduce manual work, and understand what is driving growth.",
    visionTitle: "What We Are Building",
    visionText: "A practical digital partner for businesses that want customer-facing experiences, applications, marketing communication, customer data, and internal workflows to work as one connected growth system."
  },
  values: [
    { title: "Pixel-Perfect Precision", desc: "We adhere strictly to mathematical spacing, typographic hierarchy, and visual harmony.", icon: "Sparkles", iconColor: "bg-blue-500" },
    { title: "Agile Innovation", desc: "Rapid prototyping, continuous integration, and transparent client collaboration.", icon: "Zap", iconColor: "bg-emerald-500" },
    { title: "Uncompromising Quality", desc: "Rigorous accessibility standards, fast load times, and rock-solid reliability.", icon: "Shield", iconColor: "bg-indigo-500" },
    { title: "Human-Centric UX", desc: "Putting user needs and intuitive flows at the heart of every technological design.", icon: "Users", iconColor: "bg-amber-500" }
  ],
  timeline: {
    title: "How ProFox Has Grown",
    subtitle: "From focused website delivery to connected digital growth systems.",
    milestones: [
      { year: "2018", title: "ProFox Takes Shape", description: "We began with a focused commitment to helping businesses create clearer, more credible, and more useful web experiences.", badge: "Foundation" },
      { year: "2020", title: "Beyond the Website", description: "Client needs led us deeper into conversion journeys, responsive development, CMS platforms, ecommerce, analytics, and connected lead-capture systems.", badge: "Growth" },
      { year: "2022", title: "Custom Products and Workflows", description: "We expanded into custom web and mobile applications, dashboards, portals, APIs, databases, and integrations designed around real operational requirements.", badge: "Development" },
      { year: "2024", title: "Marketing and Business Automation", description: "Email journeys, CRM automation, lead routing, internal notifications, and data synchronization became part of one connected delivery approach.", badge: "Automation" },
      { year: "2026", title: "Forty-Plus Solutions Delivered", description: "With more than eight years of experience and over forty websites and applications delivered, ProFox continues as one growth-focused team serving businesses in India and international markets.", badge: "Today" }
    ]
  },
  team: {
    title: "One Growth-Focused Team",
    subtitle: "Strategy, design, development, and automation expertise working together around your business goals.",
    members: []
  },
  cta: {
    heading: "Let’s Build the Right Next Step for Your Business",
    subtitle: "Whether you need a stronger website, a custom application, or connected business automation, we’ll help you turn the requirement into a clear plan.",
    buttonText: "Start a Conversation",
    buttonUrl: "/contact-us"
  }
};

const defaultCareersData = {
  hero: {
    title: "Open positions",
    subheading: "CAREERS & OFFERS",
    subtitle: "Join our global engineering team",
    subtitleParagraph: "We value experience, curiosity, empathy, and dedication; we look for thoughtful teammates who enjoy learning and helping others succeed. Take a look at the open roles below and share your resume.",
    description: "We value experience, curiosity, empathy, and dedication; we look for thoughtful teammates who enjoy learning and helping others succeed. Take a look at the open roles below and share your resume.",
    badgeText: "CAREERS & OFFERS",
  },
  positions: [
    {
      id: "pos-1",
      title: "Product Experience Designer",
      location: "United States, New York",
      department: "Design & UX",
      type: "Full-time",
      description: "We are seeking a senior Product Experience Designer to craft high-impact digital solutions for enterprise clients.",
      active: true
    },
    {
      id: "pos-2",
      title: "Senior UX Designer",
      location: "United States, Remote",
      department: "Design & UX",
      type: "Full-time",
      description: "Lead user research, wireframing, and design systems for enterprise web applications.",
      active: true
    },
    {
      id: "pos-3",
      title: "Creative Director",
      location: "United States, New York",
      department: "Creative Strategy",
      type: "Full-time",
      description: "Drive brand vision, creative strategy, and digital storytelling across client engagements.",
      active: true
    },
    {
      id: "pos-4",
      title: "Brand and Visual Design Lead",
      location: "Remote",
      department: "Design & UX",
      type: "Full-time",
      description: "Own visual identity systems, typography, and interactive brand design.",
      active: true
    },
    {
      id: "pos-5",
      title: "Solutions Architect",
      location: "Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Architect cloud infrastructure, API integrations, and scalable web software.",
      active: true
    },
    {
      id: "pos-6",
      title: "Ecommerce Solutions Architect",
      location: "Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Build high-conversion headless e-commerce architectures for global brands.",
      active: true
    },
    {
      id: "pos-7",
      title: "Customer Experience Technology Lead",
      location: "Remote",
      department: "Technology",
      type: "Full-time",
      description: "Bridge marketing strategy and frontend software engineering to deliver seamless customer journeys.",
      active: true
    },
    {
      id: "pos-8",
      title: "Data Solutions Architect",
      location: "United States, Remote",
      department: "Data & AI",
      type: "Full-time",
      description: "Design real-time data pipelines, AI models, and enterprise analytics architectures.",
      active: true
    },
    {
      id: "pos-9",
      title: "AI and Automation Consultant",
      location: "United States, New York",
      department: "Data & AI",
      type: "Full-time",
      description: "Deploy autonomous AI agents, workflow automation pipelines, and machine learning solutions.",
      active: true
    },
    {
      id: "pos-10",
      title: "Technical Delivery Lead",
      location: "United States, Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Lead cross-functional engineering teams delivering complex digital transformation projects.",
      active: true
    }
  ],
  culture: {
    title: "Why Work at Profox",
    bgImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1600",
    items: [
      {
        id: "c1",
        title: "Work That Actually Matters",
        description: "You will work on real business challenges, not throwaway tasks, helping teams grow and fix what is broken, allowing you to see the direct impact of your work."
      },
      {
        id: "c2",
        title: "Learn From Experienced People",
        description: "You collaborate with senior creatives, engineers, and strategists who share context, challenge your thinking, and help you grow through real projects."
      },
      {
        id: "c3",
        title: "Trust, Ownership, and Respect",
        description: "We trust people to own their work, manage their time, and speak honestly. We create a culture where accountability and respect come before process."
      },
      {
        id: "c4",
        title: "Room to Grow Over Time",
        description: "Profox is built for long-term growth, giving you space to improve your skills, take on more responsibility, and shape your own career path."
      }
    ]
  }
};

const defaultContactUsData = {
  hero: {
    title: "Get in Touch with Our Expert Team",
    highlight: "Let's Build Together.",
    subheading: "CONTACT US",
    subtitle: "Have a project in mind? We'd love to hear from you.",
    description: "Whether you're looking for a new website, a custom web application, or AI automation solutions, our team is ready to help you scale.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1600"
  },
  contactInfo: {
    title: "Our Offices",
    subtitle: "Visit us at one of our global locations.",
    locations: [
      {
        city: "Global Headquarters",
        address: "",
        email: "contact@profox-webdesigner.com",
        phone: "+1 (555) 000-0000"
      }
    ]
  },
  form: {
    title: "Start a Conversation",
    subtitle: "Fill out the form below and our strategy team will reach out within 24 hours.",
    buttonText: "Send Message"
  },
  trustedBy: {
    showSlider: true,
    title: "Trusted By Industry Leaders",
    subtitle: "Partnering with the world's most innovative companies."
  }
};

export const defaultBlueprintsList: TemplateBlueprint[] = [
  {
    id: 'contact-us',
    name: 'Contact Us Blueprint',
    description: 'A simple yet effective contact us layout with office locations, inquiry form, and trusted brand slider.',
    type: 'default',
    defaultData: defaultContactUsData
  },
  {
    id: 'web-mobile-dev',
    name: 'Web & Mobile Development Service Template',
    description: 'Specialized landing page template for Web Applications, Mobile iOS/Android apps, and cross-platform digital products.',
    type: 'service-detail',
    defaultData: {
      hero: {
        title: "Enterprise-Grade Web & Mobile Application Development",
        highlight: "Architecting Scalable Digital Systems.",
        description: "We don't just build apps; we build revenue-generating systems. From high-performance web platforms to native iOS and Android applications, we engineer secure, scalable digital infrastructure that eliminates operational friction and drives measurable business growth.",
        image: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=1600"
      },
      subnav: [
        { label: "Overview", id: "hero" },
        { label: "Capabilities", id: "help" },
        { label: "Challenges Solved", id: "challenges" },
        { label: "Featured Apps", id: "success" },
        { label: "Tech Stack", id: "stack" },
        { label: "Development Cycle", id: "process" },
        { label: "Resources", id: "resources" },
        { label: "FAQ", id: "faq" }
      ],
      quote: "A digital platform is only as strong as the business impact it delivers. Technology should be an accelerator, not a bottleneck.",
      quoteHeading: "Disconnected systems and legacy mobile apps are costing enterprises up to 30% in operational efficiency.",
      quoteAuthor: "– Digital Infrastructure Insights",
      quoteDescription: "Modernizing your tech stack isn't just about aesthetics—it's about automating information flow, reducing manual entry, and providing real-time visibility across your entire organization.",
      howWeHelpTitle: "Full-Lifecycle Software Engineering Capabilities",
      howWeHelpDesc: "We bridge the gap between complex business challenges and high-performance technology solutions through custom engineering and strategic integration.",
      howWeHelpButtonText: "Start Engineering Project",
      howWeHelp: [
        {
          title: "Native & Cross-Platform Mobile Apps",
          desc: "Build high-speed applications for iOS and Android using Swift, Kotlin, React Native, or Flutter. Focused on sub-second performance and offline-first reliability.",
          features: ["iOS App Store & Google Play mastery", "Push notifications & real-time syncing"],
          iconColor: "bg-blue-500"
        },
        {
          title: "Custom Web Applications & SaaS",
          desc: "Develop intelligent, scalable web platforms and reporting dashboards that turn fragmented data into actionable business intelligence.",
          features: ["Next.js & React-driven frontend", "Sub-second page speeds & SEO-ready"],
          iconColor: "bg-[#000080]"
        },
        {
          title: "Legacy Modernization & Cloud Native",
          desc: "Replace outdated digital infrastructure with secure, cloud-native microservices and modern backend architectures that grow with you.",
          features: ["Serverless & containerized deployments", "Robust cloud database architectures"],
          iconColor: "bg-emerald-500"
        },
        {
          title: "Seamless API & Platform Integration",
          desc: "Connect your mobile and web applications to ERP, CRM, finance, and marketing automation tools to automate manual workflows.",
          features: ["GraphQL & REST API development", "Automated data & workflow syncing"],
          iconColor: "bg-purple-500"
        }
      ],
      challengesTitle: "Development Bottlenecks",
      challengesHighlight: "We Solve for Growth",
      challenges: [
        "Legacy mobile apps that are slow, prone to crashes, and fail to engage modern users or meet app store standards.",
        "Disconnected systems (ERP, CRM, E-commerce) that require constant manual data entry and lead to operational errors.",
        "A growing development backlog that prevents you from launching new features or scaling your platform at market speed.",
        "Siloed tools and fragmented data sources that make real-time business reporting and visibility impossible.",
        "Security vulnerabilities in outdated third-party dependencies that put customer data and business integrity at risk."
      ],
      caseStudies: [
        {
          client: "DDC",
          title: "Modernizing DDC's DNA Testing Services Portal",
          image: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&q=80&w=800",
          slug: "ddc"
        },
        {
          client: "Sound.com",
          title: "Building Enterprise-Scale Platform for Music & Sound Licensing",
          image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=800",
          slug: "sound"
        }
      ],
      techStackTitle: "Our Enterprise Engineering Stack",
      techStackDesc: "We leverage battle-tested technologies and cloud-native infrastructure to ensure your applications are secure, performant, and built to scale effortlessly.",
      techStackImage: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1200",
      techStack: [
        { category: "Mobile Ecosystem", icons: ["React Native", "Flutter", "Swift iOS", "Kotlin Android"] },
        { category: "Modern Frontend", icons: ["React", "Next.js", "TypeScript", "Tailwind CSS"] },
        { category: "Backend & APIs", icons: ["Node.js", "GraphQL", "PostgreSQL", "Supabase"] },
        { category: "Cloud & Security", icons: ["AWS", "Google Cloud", "Vercel", "Docker"] }
      ],
      ourProcess: [
        {
          step: "01",
          title: "Strategy & Architectural Blueprinting",
          desc: "We start by auditing your existing infrastructure and mapping out a technical roadmap that aligns with your specific business goals and user needs.",
          image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200",
          ctaText: "Consult Our Architect",
          ctaUrl: "/contact-us"
        },
        {
          step: "02",
          title: "Agile Engineering & Continuous Delivery",
          desc: "Our developers build in iterative sprints, providing regular demos and test builds so you can see functional progress in real-time on your own devices.",
          image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200",
          ctaText: "View Our Process",
          ctaUrl: "#process"
        },
        {
          step: "03",
          title: "QA, Deployment & App Store Management",
          desc: "Rigorous testing for performance and security is followed by full management of App Store submissions and production cloud deployments.",
          image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200",
          ctaText: "Launch Your App",
          ctaUrl: "#cta"
        }
      ],
      faqs: [
        {
          question: "How do you handle integrations with our existing ERP or CRM?",
          answer: "We specialize in custom API development. We can build secure bridges between your new mobile/web apps and legacy systems like SAP, Salesforce, or Oracle to ensure real-time data synchronization."
        },
        {
          question: "Do you assist with Apple and Google app store submissions?",
          answer: "Yes, we handle the entire publishing lifecycle, including metadata optimization, developer account setup, and navigating strict compliance reviews to ensure a successful launch."
        },
        {
          question: "Can you modernize an existing legacy application without starting over?",
          answer: "Often, yes. We can perform a code audit to determine if a gradual 'strangler pattern' migration is possible, allowing us to replace old components with modern cloud-native modules over time."
        }
      ]
    }
  },
  {
    id: 'digital-experience',
    name: 'Website Design & Development Blueprint',
    description: 'Turn your website into your most profitable asset. Problem-solving designs that build trust, engage visitors, and drive consistent sales.',
    type: 'service-detail',
    defaultData: {
      hero: {
        title: "Turn Your Website Into a Growth Engine",
        highlight: "That Solves Problems & Drives Revenue.",
        description: "Stop losing customers to a confusing or outdated website. We build strategic, user-focused digital experiences that solve your customers' pain points, build instant trust, and guide them effortlessly toward taking action.",
        image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1600"
      },
      subnav: [
        { label: "Overview", id: "hero" },
        { label: "How You Benefit", id: "help" },
        { label: "Problems We Solve", id: "challenges" },
        { label: "Showcase", id: "success" },
        { label: "Your Tech Advantage", id: "stack" },
        { label: "Our Proven Process", id: "process" },
        { label: "FAQ", id: "faq" }
      ],
      quote: "A successful website doesn't just look good—it solves problems and makes your customers' lives easier.",
      quoteHeading: "Over 88% of online consumers are less likely to return to a site after a bad experience.",
      quoteAuthor: "- User Experience Research",
      quoteDescription: "If your website is confusing, slow, or fails to address your customers' needs immediately, they will leave and go to your competitors. Your website must act as your best 24/7 salesperson.",
      howWeHelpTitle: "How Your Business Benefits",
      howWeHelpDesc: "We don't just build websites; we build solutions that eliminate friction, establish your authority, and make it incredibly easy for your customers to do business with you.",
      howWeHelpButtonText: "Solve Your Website Problems",
      howWeHelp: [
        {
          title: "Build Instant Trust & Credibility",
          desc: "A professional, problem-solving design reassures your visitors instantly, proving that you understand their needs and have the right solution.",
          features: ["Establish industry authority", "Reduce customer hesitation"],
          iconColor: "bg-purple-500"
        },
        {
          title: "Turn Visitors Into Paying Customers",
          desc: "We design clear, frictionless pathways that guide users directly to the solution they are looking for, resulting in higher sales and more inquiries.",
          features: ["Clear calls-to-action", "Frictionless checkout/inquiry"],
          iconColor: "bg-emerald-500"
        },
        {
          title: "Save Time & Automate Growth",
          desc: "Stop answering the same questions repeatedly. Your website will educate your prospects, answer objections, and pre-qualify leads automatically.",
          features: ["Pre-qualify your leads", "Educate customers 24/7"],
          iconColor: "bg-blue-500"
        }
      ],
      challengesTitle: "Website Problems",
      challengesHighlight: "That Are Costing You Money",
      challenges: [
        "Visitors leave your site quickly because they can't figure out exactly how you can help them.",
        "You are losing sales to competitors who have a more professional and easier-to-use digital presence.",
        "Your current website is slow, broken on mobile devices, or simply too hard for your customers to navigate."
      ],
      caseStudies: [],
      techStackTitle: "The Tools That Power Your Growth",
      techStackDesc: "We use reliable, fast, and scalable technology so you never have to worry about downtime, slow loading speeds, or security issues.",
      techStackImage: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&q=80&w=1200",
      techStack: [
        { category: "Performance & Security", icons: ["Fast Loading", "SSL Encryption", "Mobile Ready", "Global CDN"] },
        { category: "Growth & Analytics", icons: ["SEO Optimized", "Conversion Tracking", "Lead Capture", "CRM Integration"] }
      ],
      ourProcess: [
        {
          step: "01",
          title: "Discover & Understand Your Customer",
          desc: "We start by deeply understanding your ideal customers, their pain points, and exactly what they need to see to trust your business and make a purchase.",
          image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200"
        }
      ],
      faqs: [
        {
          question: "How will this new website actually help my business?",
          answer: "By directly addressing your customers' pain points, simplifying their buying journey, and establishing trust, the website will act as a 24/7 tool to convert visitors into qualified leads and sales."
        }
      ]
    }
  },
  {
    id: 'technology-solutions',
    name: 'Technology Solutions Service Template',
    description: 'Enterprise architecture blueprint for cloud backends, custom databases, ERP integrations, and secure microservices.',
    type: 'service-detail',
    defaultData: {
      hero: {
        title: "Enterprise Technology Solutions",
        highlight: "Architected for Security.",
        description: "Empower your business operations with secure microservices, custom database architectures, and seamless third-party API integrations.",
        image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1600"
      },
      subnav: [
        { label: "Overview", id: "hero" },
        { label: "Solutions", id: "help" },
        { label: "Challenges", id: "challenges" },
        { label: "Architecture", id: "stack" },
        { label: "Implementation", id: "process" },
        { label: "FAQ", id: "faq" }
      ],
      quote: "Robust tech architecture is the backbone of sustainable business velocity.",
      quoteHeading: "Modern cloud architectures reduce infrastructure operating overhead by up to 45%.",
      quoteAuthor: "- IDC Cloud Tech Index",
      quoteDescription: "Outdated legacy infrastructure creates technical debt that slows down innovation.",
      howWeHelpTitle: "Enterprise Software & Tech Solutions",
      howWeHelpDesc: "Custom enterprise tools, cloud data pipelines, and scalable database architectures.",
      howWeHelpButtonText: "Consult Tech Lead",
      howWeHelp: [
        {
          title: "Custom Cloud Architectures",
          desc: "Scalable serverless and containerized environments built on AWS and Google Cloud Platform.",
          features: ["Zero-downtime CI/CD pipelines", "Database auto-scaling"],
          iconColor: "bg-[#000080]"
        }
      ],
      challengesTitle: "Technical Operational Risks",
      challengesHighlight: "Eliminated By Design",
      challenges: [
        "Fragmented database systems preventing real-time business reporting.",
        "High cloud hosting costs caused by unoptimized server resources."
      ],
      caseStudies: [],
      techStackTitle: "Enterprise Cloud Stack",
      techStackDesc: "Secure, battle-tested server technologies.",
      techStackImage: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200",
      techStack: [
        { category: "Cloud & Databases", icons: ["PostgreSQL", "Supabase", "AWS", "Google Cloud"] }
      ],
      ourProcess: [
        {
          step: "01",
          title: "System Audit & Threat Modeling",
          desc: "Comprehensive evaluation of security risks, data flows, and infrastructure bottlenecks.",
          image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=1200"
        }
      ],
      faqs: [
        {
          question: "How do you handle data security during system migration?",
          answer: "We use encrypted database snapshots and staged migration environments to guarantee zero data loss."
        }
      ]
    }
  },
  {
    id: 'ai-automation',
    name: 'AI Agents & Automation Service Template',
    description: 'Autonomous AI workflow blueprints, LLM conversational agents, document processing pipelines, and predictive analytics.',
    type: 'service-detail',
    defaultData: {
      hero: {
        title: "Autonomous AI Agents & Workflows",
        highlight: "Powered by Gemini.",
        description: "Automate complex business processes, document extraction, and customer support with intelligent multi-modal AI agents trained on your custom data.",
        image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1600"
      },
      subnav: [
        { label: "Overview", id: "hero" },
        { label: "AI Capabilities", id: "help" },
        { label: "Bottlenecks Solved", id: "challenges" },
        { label: "AI Stack", id: "stack" },
        { label: "Deployment Cycle", id: "process" },
        { label: "FAQ", id: "faq" }
      ],
      quote: "AI will not replace managers, but managers who use AI will replace those who don't.",
      quoteHeading: "Businesses deploying autonomous AI agents report a 70% reduction in manual data processing time.",
      quoteAuthor: "- MIT Tech Review",
      quoteDescription: "Unlock exponential productivity with customized AI agents that operate 24/7.",
      howWeHelpTitle: "AI & Machine Learning Services",
      howWeHelpDesc: "From custom LLM prompt engineering to autonomous document parsing and predictive cloud pipelines.",
      howWeHelpButtonText: "Deploy AI Agents",
      howWeHelp: [
        {
          title: "Autonomous Document Extractors",
          desc: "Parse unstructured PDFs, invoices, and legal contracts with sub-second AI precision.",
          features: ["Real-time document OCR", "JSON structured data output"],
          iconColor: "bg-indigo-500"
        }
      ],
      challengesTitle: "Manual Operational Bottlenecks",
      challengesHighlight: "Automated Instantly",
      challenges: [
        "Repetitive human data entry leading to costly operational errors.",
        "Slow customer response times during peak demand hours."
      ],
      caseStudies: [],
      techStackTitle: "AI & LLM Ecosystem",
      techStackDesc: "Next-generation generative AI models and vector databases.",
      techStackImage: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1200",
      techStack: [
        { category: "AI Models", icons: ["Gemini 2.5 Pro", "Gemini Flash", "Vector DB", "LangChain"] }
      ],
      ourProcess: [
        {
          step: "01",
          title: "Dataset Preparation & Prompt Tuning",
          desc: "Curating your company's knowledge base for private, secure LLM fine-tuning.",
          image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200"
        }
      ],
      faqs: [
        {
          question: "Is our proprietary data safe with your AI models?",
          answer: "Yes, we deploy private enterprise API endpoints where your business data is never used to train public models."
        }
      ]
    }
  },
  {
    id: 'service-detail',
    name: 'General Service Detail Template',
    description: 'The specialized landing page for services with deep storytelling, case studies, and FAQ.',
    type: 'service-detail',
    defaultData: {
      hero: {
        title: "Service Excellence",
        highlight: "Redefined.",
        subheading: "ENGINEERING QUALITY",
        subtitle: "Enterprise-grade digital solutions",
        description: "We provide high-impact solutions for modern enterprises.",
        image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&q=80&w=1600"
      },
      subnav: [
        { label: "Overview", id: "hero" },
        { label: "How We Help", id: "help" },
        { label: "Key Challenges", id: "challenges" },
        { label: "Success Stories", id: "success" },
        { label: "Tech Stack", id: "stack" },
        { label: "Our Process", id: "process" },
        { label: "Resources", id: "resources" },
        { label: "FAQ", id: "faq" }
      ],
      quote: "Innovation distinguishes between a leader and a follower.",
      quoteHeading: "Companies with high-performing websites outperform their competitors by nearly 80%.",
      quoteAuthor: "- Watermark Consulting",
      quoteDescription: "Your website is where buyers decide if you are worth trusting, now or ever. Every day it underperforms, you are leaving growth on the table.",
      howWeHelp: [
        { title: 'Strategic Consulting', desc: 'Expert guidance for your digital transformation.', features: ['Workflow Audit', 'Gap Analysis'], iconColor: 'bg-blue-400' }
      ],
      connectedLoop: {
        eyebrow: "WHAT MAKES US DIFFERENT",
        title: "For the First Time, Your Website, Your Customer Experience, and Your Marketing Automation Are One System.",
        desc1: "Most agencies build you a website and call it a day. But a website is only one piece of the puzzle. To drive real growth, your digital presence needs to be connected to how you talk to your customers and how you keep them coming back.",
        desc2: "We don't just build websites. We build connected revenue systems that align your marketing, your technology, and your customer journey.",
        steps: [
          { badge: "Step 1", title: "Website Experience" },
          { badge: "Step 2", title: "Marketing Automation" },
          { badge: "Step 3", title: "Customer Experience" }
        ],
        footer: "The Connected Growth Loop",
        accentText: "Every decision we make is tied directly to growth. If it doesn't improve growth, it doesn't get made."
      },
      challenges: [
        "Legacy System Constraints",
        "Operational Inefficiency"
      ],
      caseStudies: [],
      techStack: [],
      engagement: [],
      faqs: []
    }
  },
  {
    id: 'plans-pricing',
    name: 'Plans & Pricing Blueprint',
    description: 'A premium, conversion-focused pricing page with editable packages, technology logos, sticky comparison matrix, FAQs, and calls to action.',
    type: 'pricing',
    defaultData: defaultPricingTemplateData
  },
  {
    id: 'privacy-policy',
    name: 'Privacy Policy & Terms Blueprint',
    description: 'Compliant legal framework layout for Privacy Policy, Terms & Conditions, and Cookie Guidelines.',
    type: 'legal-policy',
    defaultData: defaultPrivacyPolicyData
  },
  {
    id: 'about-us',
    name: 'About Us Blueprint',
    description: 'High-impact company overview page with computer design showcase, scroll animations, team, timeline, and dynamic story sections.',
    type: 'about-us',
    defaultData: defaultAboutUsData
  },
  {
    id: 'careers',
    name: 'Careers & Offers Blueprint',
    description: 'Dynamic careers page with active job openings, department filtering, send resume workflow, and company culture cards.',
    type: 'careers',
    defaultData: defaultCareersData
  }
];

export default function TemplateManager() {
  const { confirm: confirmAction } = useConfirmContext();
  const { content, updateSection } = useCMS();

  const rawBlueprints = content.template_blueprints || [];
  let blueprints = [...rawBlueprints];
  for (const defBp of defaultBlueprintsList) {
    if (!blueprints.some((b: any) => b.id === defBp.id)) {
      blueprints.push(defBp);
    }
  }

  const [selectedTemplateId, setSelectedTemplateId] = useState(blueprints[0]?.id || 'service-detail');
  const [templateSubTab, setTemplateSubTab] = useState<string>('Hero');
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isFullScreenPreview, setIsFullScreenPreview] = useState(false);

  const selectedTemplate = blueprints.find((b: any) => b.id === selectedTemplateId) || blueprints[0];
  const isLegalTemplate = selectedTemplate?.id === 'privacy-policy' || selectedTemplate?.type === 'legal-policy';
  const isAboutTemplate = selectedTemplate?.id === 'about-us' || selectedTemplate?.type === 'about-us';
  const isCareersTemplate = selectedTemplate?.id === 'careers' || selectedTemplate?.type === 'careers';
  const isContactTemplate = selectedTemplate?.id === 'contact-us' || selectedTemplate?.type === 'contact-us';
  const isPricingTemplate = selectedTemplate?.id === 'plans-pricing' || selectedTemplate?.type === 'pricing';

  const renderTemplatePreview = (template: any, previewData: any, device: 'desktop' | 'tablet' | 'mobile') => {
    const isLegal = template?.id === 'privacy-policy' || template?.type === 'legal-policy';
    const isAbout = template?.id === 'about-us' || template?.type === 'about-us';
    const isCareers = template?.id === 'careers' || template?.type === 'careers';
    const isContact = template?.id === 'contact-us' || template?.type === 'contact-us';
    const isPricing = template?.id === 'plans-pricing' || template?.type === 'pricing';

    const frameWidthClass = 
      device === 'mobile' 
        ? 'max-w-[380px] mx-auto rounded-[36px] border-[10px] border-slate-900 shadow-2xl my-4 overflow-hidden bg-white' 
        : device === 'tablet' 
        ? 'max-w-[768px] mx-auto rounded-[24px] border-[8px] border-slate-900 shadow-2xl my-4 overflow-hidden bg-white' 
        : 'w-full rounded-2xl border border-slate-200 shadow-xl overflow-hidden bg-white';

    return (
      <div className={cn("transition-all duration-300", frameWidthClass)}>
        {/* Device Browser Chrome Header */}
        <div className="bg-slate-950 text-white px-4 py-2.5 flex items-center justify-between text-[11px] font-mono border-b border-slate-800 select-none">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
            <span className="ml-2 font-bold text-slate-300 truncate max-w-[280px]">
              preview://templates/{template?.id || 'blueprint'}
            </span>
          </div>
          <div className="text-slate-400 text-[10px] uppercase tracking-wider font-sans font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {device === 'desktop' ? 'Desktop View' : device === 'tablet' ? 'Tablet View (768px)' : 'Mobile View (375px)'}
          </div>
        </div>
        
        {/* Live Rendered Template Page */}
        <div className="overflow-y-auto max-h-[750px] bg-slate-50">
          {isPricing ? (
            <PricingDetailView page={{ template: template?.id, serviceDetailData: previewData }} />
          ) : isAbout ? (
            <AboutUsDetailView page={{ template: template?.id, serviceDetailData: previewData }} />
          ) : isCareers ? (
            <CareersDetailView page={{ template: template?.id, serviceDetailData: previewData }} />
          ) : isContact ? (
            <ContactUsDetailView page={{ template: template?.id, serviceDetailData: previewData }} />
          ) : isLegal ? (
            <PrivacyPolicy defaultTab="privacy" page={{ template: template?.id, serviceDetailData: previewData }} />
          ) : (
            <ServiceDetailView page={{ id: template?.id, template: template?.id, title: template?.name, serviceDetailData: previewData }} />
          )}
        </div>
      </div>
    );
  };

  // Local draft state to edit template without lag
  const [draftData, setDraftData] = useState<any>(null);

  // Keep local draft in sync with database selection
  React.useEffect(() => {
    if (selectedTemplate) {
      setDraftData(JSON.parse(JSON.stringify(selectedTemplate.defaultData || {})));
      if (selectedTemplate.id === 'privacy-policy' || selectedTemplate.type === 'legal-policy') {
        setTemplateSubTab('Privacy Policy');
      } else if (selectedTemplate.id === 'about-us' || selectedTemplate.type === 'about-us') {
        setTemplateSubTab('Complete Page Content');
      } else if (selectedTemplate.id === 'careers' || selectedTemplate.type === 'careers') {
        setTemplateSubTab('Positions & Offers');
      } else if (selectedTemplate.id === 'contact-us' || selectedTemplate.type === 'contact-us') {
        setTemplateSubTab('Hero');
      } else if (selectedTemplate.id === 'plans-pricing' || selectedTemplate.type === 'pricing') {
        setTemplateSubTab('Hero & Trust');
      } else {
        setTemplateSubTab('Hero');
      }
    } else {
      setDraftData(null);
    }
  }, [selectedTemplateId]); // Only reset on template ID change to allow sub-tab persistence if possible, but actually we want to reset sub-tab when switching between legal/non-legal

  const data = draftData || selectedTemplate?.defaultData || {};
  const pricingData = isPricingTemplate ? hydratePricingTemplateData(data) : null;

  const cmsPortfolioItems = Array.isArray(content.portfolio_items)
    ? content.portfolio_items.filter((i: any) => i.status === 'published' || !i.status)
    : [];

  const allPortfolioList = [...cmsPortfolioItems];
  for (const defItem of defaultPortfolioItems) {
    if (!allPortfolioList.some((p: any) => p.id === defItem.id || p.slug === defItem.slug)) {
      allPortfolioList.push(defItem);
    }
  }

  const handleCreateTemplate = async () => {
    if (!newTemplateName) return;
    const newId = `template-${Date.now()}`;
    const newBlueprint: TemplateBlueprint = {
      id: newId,
      name: newTemplateName,
      description: 'Custom specialized layout blueprint.',
      type: 'service-detail',
      defaultData: JSON.parse(JSON.stringify(blueprints[0].defaultData))
    };
    
    await updateSection('template_blueprints', [...blueprints, newBlueprint]);
    setSelectedTemplateId(newId);
    setIsAddingTemplate(false);
    setNewTemplateName('');
    setSavedMessage('New template blueprint created!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (id === 'service-detail') return; // Protect core template
    if (!(await confirmAction('Delete Template', 'Are you sure you want to delete this template blueprint?'))) return;
    
    const next = blueprints.filter((b: any) => b.id !== id);
    await updateSection('template_blueprints', next);
    setSelectedTemplateId(blueprints[0].id);
    setSavedMessage('Template blueprint removed.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleRenameTemplate = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const nextBlueprints = blueprints.map((b: any) => 
      b.id === id ? { ...b, name: newName } : b
    );
    await updateSection('template_blueprints', nextBlueprints);
    setSavedMessage('Template renamed successfully.');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const handleDuplicateTemplate = async (template: any) => {
    const newId = `template-${Date.now()}`;
    const newBlueprint: TemplateBlueprint = {
      ...JSON.parse(JSON.stringify(template)),
      id: newId,
      name: `${template.name} (Copy)`,
    };
    
    await updateSection('template_blueprints', [...blueprints, newBlueprint]);
    setSelectedTemplateId(newId);
    setSavedMessage(`Duplicated template "${template.name}"!`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const syncPageData = (pageData: any, oldObj: any, newObj: any) => {
    if (!pageData) return JSON.parse(JSON.stringify(newObj));
    if (!oldObj) return pageData;

    const result = JSON.parse(JSON.stringify(pageData));

    function traverse(pObj: any, oObj: any, nObj: any) {
      if (typeof pObj !== 'object' || pObj === null) return;
      
      for (const key in nObj) {
        if (typeof nObj[key] === 'object' && nObj[key] !== null && !Array.isArray(nObj[key])) {
          if (!pObj[key]) pObj[key] = {};
          traverse(pObj[key], oObj ? oObj[key] : {}, nObj[key]);
        } else if (Array.isArray(nObj[key])) {
           if (JSON.stringify(pObj[key]) === JSON.stringify(oObj ? oObj[key] : undefined) || pObj[key] === undefined) {
              pObj[key] = JSON.parse(JSON.stringify(nObj[key]));
           }
        } else {
           if (pObj[key] === (oObj ? oObj[key] : undefined) || pObj[key] === undefined) {
              pObj[key] = nObj[key];
           }
        }
      }
    }

    traverse(result, oldObj, newObj);
    return result;
  };

  const handleSaveBlueprint = async (updatedData: any) => {
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      // Get old blueprint data for syncing
      const oldBlueprint = blueprints.find((b: any) => b.id === selectedTemplateId);
      const oldBlueprintData = oldBlueprint ? oldBlueprint.defaultData : {};

      const nextBlueprints = blueprints.map((b: any) => 
        b.id === selectedTemplateId ? { ...b, defaultData: updatedData } : b
      );
      await updateSection('template_blueprints', nextBlueprints);
      
      // Sync to all custom pages that use this blueprint
      const customPages = content.customPages || [];
      const updatedPages = customPages.map((page: any) => {
        // ONLY sync if the page is explicitly using this specific blueprint ID
        if (page.template === selectedTemplateId) {
          const syncedData = syncPageData(page.serviceDetailData, oldBlueprintData, updatedData);
          
          let newPage = { ...page, serviceDetailData: syncedData };
          
          // Also sync root-level hero properties if they match the old blueprint or are unset
          if (!page.heroTitle || (oldBlueprintData?.hero?.title && page.heroTitle === oldBlueprintData.hero.title)) {
             newPage.heroTitle = updatedData?.hero?.title || page.heroTitle;
          }
          if (!page.heroSubtitle || (oldBlueprintData?.hero?.description && page.heroSubtitle === oldBlueprintData.hero.description)) {
             newPage.heroSubtitle = updatedData?.hero?.description || updatedData?.hero?.subtitle || page.heroSubtitle;
          }
          if (!page.heroSubheading || (oldBlueprintData?.hero?.subheading && page.heroSubheading === oldBlueprintData.hero.subheading)) {
             newPage.heroSubheading = updatedData?.hero?.subheading || page.heroSubheading;
          }
          if (!page.heroHighlight || (oldBlueprintData?.hero?.highlight && page.heroHighlight === oldBlueprintData.hero.highlight)) {
             newPage.heroHighlight = updatedData?.hero?.highlight || page.heroHighlight;
          }
          if (oldBlueprintData?.hero?.image && page.coverImage === oldBlueprintData.hero.image) {
             newPage.coverImage = updatedData?.hero?.image || page.coverImage;
          }
          
          return newPage;
        }
        return page;
      });
      
      // Only update if there are pages to update
      if (JSON.stringify(customPages) !== JSON.stringify(updatedPages)) {
         await updateSection('customPages', updatedPages);
      }

      setSavedMessage('Template blueprint saved and linked pages synchronized!');
      
      setTimeout(() => setSavedMessage(''), 4000);
    } catch (err) {
      console.error('Error saving blueprint:', err);
    } finally {
      setSaving(false);
    }
  };


  const handleForceSync = async (updatedData: any) => {
    if (!window.confirm('WARNING: This will completely overwrite any custom content on ALL pages that use this template. Are you sure you want to force sync?')) return;
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      
      const nextBlueprints = blueprints.map((b: any) => 
        b.id === selectedTemplateId ? { ...b, defaultData: updatedData } : b
      );
      await updateSection('template_blueprints', nextBlueprints);
      
      const customPages = content.customPages || [];
      let updatedCount = 0;
      const updatedPages = customPages.map((page: any) => {
        if (page.template === selectedTemplateId) {
          updatedCount++;
          return { 
            ...page, 
            serviceDetailData: JSON.parse(JSON.stringify(updatedData)),
            heroTitle: updatedData?.hero?.title || page.heroTitle,
            heroSubtitle: updatedData?.hero?.description || page.heroSubtitle,
            coverImage: updatedData?.hero?.image || page.coverImage
          };
        }
        return page;
      });
      
      if (updatedCount > 0) {
         await updateSection('customPages', updatedPages);
      }
      
      setSavedMessage(`Force synced to ${updatedCount} page(s)!`);
      setTimeout(() => setSavedMessage(''), 4000);
    } catch (err) {
      console.error('Error force syncing blueprint:', err);
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-[#000080]" /> Template Library
          </h2>
          <p className="text-sm text-slate-500 font-medium">Manage the global blueprints and default content for all specialized page layouts.</p>
        </div>

        <div className="flex items-center gap-3">
          {isAddingTemplate ? (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
              <input 
                type="text" 
                autoFocus
                placeholder="Template Name..."
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:border-[#000080] outline-none shadow-sm"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTemplate()}
              />
              <ConfirmButton 
                onClick={handleCreateTemplate}
                className="bg-[#000080] text-white p-2 rounded-xl hover:bg-[#000066]"
              >
                <Check className="w-4 h-4" />
              </ConfirmButton>
              <ConfirmButton 
                onClick={() => setIsAddingTemplate(false)}
                className="bg-slate-100 text-slate-500 p-2 rounded-xl hover:bg-slate-200"
              >
                <Trash2 className="w-4 h-4" />
              </ConfirmButton>
            </div>
          ) : (
            <ConfirmButton 
              onClick={() => setIsAddingTemplate(true)}
              className="bg-white border border-slate-200 hover:border-[#000080] text-[#000080] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" /> Create New Template
            </ConfirmButton>
          )}
          
          {savedMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm animate-in zoom-in duration-300">
              <Sparkles className="w-4 h-4" /> {savedMessage}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Templates Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Available Layouts</h3>
            <div className="space-y-2">
              {blueprints.map((template: any) => (
                <ConfirmButton
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border transition-all group relative",
                    selectedTemplateId === template.id
                      ? "bg-[#000080] border-[#000080] text-white shadow-md shadow-blue-900/10"
                      : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-slate-300"
                  )}
                >
                  <div className="font-bold text-xs flex items-center justify-between">
                    <span className="truncate pr-4">{template.name}</span>
                    <div className="flex items-center gap-1">
                      <ConfirmButton 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTemplate(template);
                        }}
                        className={cn(
                          "opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 hover:text-slate-700 transition-all",
                          selectedTemplateId === template.id ? "hover:bg-[#000066] hover:text-white text-white/70" : "text-slate-400"
                        )}
                        title="Duplicate Template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </ConfirmButton>
                      {template.id !== 'service-detail' && (
                        <ConfirmButton 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                          className={cn(
                            "opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 hover:text-red-500 transition-all",
                            selectedTemplateId === template.id ? "hover:bg-[#000066] hover:text-white text-white/70" : "text-slate-400"
                          )}
                          title="Delete Template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </ConfirmButton>
                      )}
                    </div>
                  </div>
                  <p className={cn(
                    "text-[10px] mt-1 line-clamp-2",
                    selectedTemplateId === template.id ? "text-white/80" : "text-slate-400"
                  )}>
                    {template.description}
                  </p>
                </ConfirmButton>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-[#000080]">
              <Info className="w-4 h-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Blueprint Scope</h4>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Changes made here act as the <strong>Default Baseline</strong>. When a team member creates a new page using this template, it will prepopulate with the content defined here.
            </p>
          </div>
        </div>

        {/* Template Editor */}
        <div className="lg:col-span-3">
          {selectedTemplate ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  {isEditingName ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-1 duration-200">
                      <input 
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={() => {
                          if (editingNameValue !== selectedTemplate.name) {
                            handleRenameTemplate(selectedTemplate.id, editingNameValue);
                          }
                          setIsEditingName(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (editingNameValue !== selectedTemplate.name) {
                              handleRenameTemplate(selectedTemplate.id, editingNameValue);
                            }
                            setIsEditingName(false);
                          }
                          if (e.key === 'Escape') {
                            setIsEditingName(false);
                          }
                        }}
                        className="text-lg font-bold text-slate-900 border-b-2 border-[#000080] outline-none bg-transparent min-w-[300px]"
                        autoFocus
                      />
                      <ConfirmButton 
                        onClick={() => {
                          if (editingNameValue !== selectedTemplate.name) {
                            handleRenameTemplate(selectedTemplate.id, editingNameValue);
                          }
                          setIsEditingName(false);
                        }}
                        className="text-[#000080] hover:text-[#000066]"
                      >
                        <Check className="w-5 h-5" />
                      </ConfirmButton>
                    </div>
                  ) : (
                    <h3 
                      className="text-lg font-bold text-slate-900 cursor-pointer hover:text-[#000080] transition-all flex items-center gap-2 group"
                      onClick={() => {
                        setEditingNameValue(selectedTemplate.name);
                        setIsEditingName(true);
                      }}
                      title="Click to rename"
                    >
                      {selectedTemplate.name.replace(/ Blueprint$/, '')} Blueprint
                      <Settings className="w-4 h-4 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
                    </h3>
                  )}
                  <p className="text-xs text-slate-500 mt-1">{selectedTemplate.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmButton 
                    type="button"
                    onClick={() => setTemplateSubTab('Preview')}
                    className={cn(
                      "px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 border transition-all shadow-sm",
                      templateSubTab === 'Preview' 
                        ? "bg-slate-900 text-teal-300 border-slate-900 shadow-md" 
                        : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
                    )}
                  >
                    <Eye className="w-4 h-4 text-teal-500" />
                    <span>Preview Mode</span>
                  </ConfirmButton>

                  <ConfirmButton 
                    type="button"
                    onClick={() => setIsFullScreenPreview(true)}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border border-slate-200"
                    title="Open Full Screen Preview Modal"
                  >
                    <Maximize2 className="w-4 h-4 text-slate-700" />
                  </ConfirmButton>

                  
                  <ConfirmButton
                    onClick={() => handleForceSync(data)}
                    disabled={saving}
                    className="bg-amber-600 hover:bg-amber-700 disabled:bg-slate-400 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all disabled:cursor-not-allowed"
                    title="Force overwrite all pages using this template"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Force Sync Pages</span>
                  </ConfirmButton>

<ConfirmButton 
                    onClick={() => handleSaveBlueprint(data)}
                    disabled={saving}
                    className="bg-[#000080] hover:bg-[#000066] disabled:bg-slate-400 text-white px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg transition-all disabled:cursor-not-allowed min-w-[180px] justify-center"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : savedMessage ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">Saved!</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save Blueprint Updates</span>
                      </>
                    )}
                  </ConfirmButton>
                </div>
              </div>

              {/* Template Section Switcher */}
              <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                {(isLegalTemplate
                  ? ['Privacy Policy', 'Terms & Conditions', 'Cookie Policy', 'Header & Global Info', 'Preview']
                  : isAboutTemplate
                  ? ['Complete Page Content', 'Hero & Stats', 'Company Story & Vision', 'Timeline & Milestones', 'Preview']
                  : isCareersTemplate
                  ? ['Positions & Offers', 'Hero Header', 'Culture & Values', 'Preview']
                  : isContactTemplate
                  ? ['Hero', 'Contact Info', 'Inquiry Form', 'Trusted By', 'Preview']
                  : isPricingTemplate
                  ? ['Hero & Trust', 'Pricing Promise', 'Packages', 'Comparison', 'Process', 'Scope & Payment', 'Care Plans', 'Recommendation', 'FAQ', 'Closing CTA', 'Preview']
                  : ['Hero', 'Value Prop', 'Evidence', 'Technical', 'Our Process', 'Conversion', 'Pricing', 'Dynamic Feeds', 'Preview']
                ).map((tab) => (
                  <ConfirmButton
                    key={tab}
                    onClick={() => setTemplateSubTab(tab)}
                    className={cn(
                      "px-5 py-2.5 text-xs font-bold rounded-xl transition-all",
                      templateSubTab === tab 
                        ? "bg-white text-[#000080] shadow-sm" 
                        : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    {tab}
                  </ConfirmButton>
                ))}
              </div>

              <div className="space-y-8 min-h-[500px]">
                {/* LEGAL TEMPLATE FORMS */}
                {templateSubTab === 'Header & Global Info' && isLegalTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Document Main Header Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                          value={data.hero?.title || ''}
                          onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, title: e.target.value } })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Global Effective Date</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                          value={data.hero?.lastUpdated || ''}
                          onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, lastUpdated: e.target.value } })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Global Document Banner Subtitle</label>
                      <textarea 
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                        value={data.hero?.description || ''}
                        onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, description: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {templateSubTab === 'Privacy Policy' && isLegalTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Policy Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                          value={data.privacy?.title || ''}
                          onChange={(e) => setDraftData({ ...data, privacy: { ...data.privacy, title: e.target.value } })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Last Updated Date</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                          value={data.privacy?.lastUpdated || 'August 7, 2026'}
                          onChange={(e) => setDraftData({ ...data, privacy: { ...data.privacy, lastUpdated: e.target.value } })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Policy Overview / Subtitle</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                        value={data.privacy?.subtitle || ''}
                        onChange={(e) => setDraftData({ ...data, privacy: { ...data.privacy, subtitle: e.target.value } })}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Policy Content (Headings, Subheadings & Terms Content in One Go)</label>
                        <span className="text-[10px] font-medium text-slate-400">Supports HTML / Headings / Paragraphs</span>
                      </div>
                      <textarea 
                        rows={16}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono leading-relaxed text-slate-800"
                        placeholder="Paste or write headings (e.g. <h3>1. Who This Policy Applies To</h3>), subheadings (<h4>a. Information Provided Directly</h4>), and terms content here..."
                        value={data.privacy?.bodyContent || ''}
                        onChange={(e) => setDraftData({ ...data, privacy: { ...data.privacy, bodyContent: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {templateSubTab === 'Terms & Conditions' && isLegalTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Terms Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                          value={data.terms?.title || ''}
                          onChange={(e) => setDraftData({ ...data, terms: { ...data.terms, title: e.target.value } })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Last Updated Date</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                          value={data.terms?.lastUpdated || 'August 7, 2026'}
                          onChange={(e) => setDraftData({ ...data, terms: { ...data.terms, lastUpdated: e.target.value } })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Terms Overview / Subtitle</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                        value={data.terms?.subtitle || ''}
                        onChange={(e) => setDraftData({ ...data, terms: { ...data.terms, subtitle: e.target.value } })}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Terms & Conditions Content (Headings, Subheadings & Terms Content in One Go)</label>
                        <span className="text-[10px] font-medium text-slate-400">Supports HTML / Headings / Paragraphs</span>
                      </div>
                      <textarea 
                        rows={16}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono leading-relaxed text-slate-800"
                        placeholder="Paste or write terms headings and full terms & conditions content in one go..."
                        value={data.terms?.bodyContent || ''}
                        onChange={(e) => setDraftData({ ...data, terms: { ...data.terms, bodyContent: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {templateSubTab === 'Cookie Policy' && isLegalTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Cookie Policy Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                          value={data.cookies?.title || ''}
                          onChange={(e) => setDraftData({ ...data, cookies: { ...data.cookies, title: e.target.value } })}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Last Updated Date</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                          value={data.cookies?.lastUpdated || 'August 7, 2026'}
                          onChange={(e) => setDraftData({ ...data, cookies: { ...data.cookies, lastUpdated: e.target.value } })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Cookie Policy Overview / Subtitle</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                        value={data.cookies?.subtitle || ''}
                        onChange={(e) => setDraftData({ ...data, cookies: { ...data.cookies, subtitle: e.target.value } })}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Full Cookie Policy Content (Headings, Subheadings & Terms Content in One Go)</label>
                        <span className="text-[10px] font-medium text-slate-400">Supports HTML / Headings / Paragraphs</span>
                      </div>
                      <textarea 
                        rows={16}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono leading-relaxed text-slate-800"
                        placeholder="Paste or write cookie policy headings and full content in one go..."
                        value={data.cookies?.bodyContent || ''}
                        onChange={(e) => setDraftData({ ...data, cookies: { ...data.cookies, bodyContent: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {templateSubTab === 'Contact Info' && isContactTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.contactInfo?.title || ''}
                            onChange={(e) => setDraftData({ ...data, contactInfo: { ...data.contactInfo, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.contactInfo?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, contactInfo: { ...data.contactInfo, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h5 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Office Locations</h5>
                        <div className="grid grid-cols-1 gap-4">
                          {(data.contactInfo?.locations || []).map((loc: any, idx: number) => (
                            <div key={idx} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 relative group">
                              <ConfirmButton 
                                onClick={() => {
                                  const next = data.contactInfo.locations.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: next } });
                                }}
                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">City / Office Name</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                                    value={loc.city}
                                    onChange={(e) => {
                                      const next = [...data.contactInfo.locations];
                                      next[idx].city = e.target.value;
                                      setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: next } });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Address</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                    value={loc.address}
                                    onChange={(e) => {
                                      const next = [...data.contactInfo.locations];
                                      next[idx].address = e.target.value;
                                      setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: next } });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Email</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                                    value={loc.email}
                                    onChange={(e) => {
                                      const next = [...data.contactInfo.locations];
                                      next[idx].email = e.target.value;
                                      setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: next } });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Phone</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                    value={loc.phone}
                                    onChange={(e) => {
                                      const next = [...data.contactInfo.locations];
                                      next[idx].phone = e.target.value;
                                      setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: next } });
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <ConfirmButton 
                          onClick={() => {
                            const current = data.contactInfo?.locations || [];
                            setDraftData({ ...data, contactInfo: { ...data.contactInfo, locations: [...current, { city: 'New Office', address: '', email: '', phone: '' }] } });
                          }}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Office Location
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Inquiry Form' && isContactTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Form Heading</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.form?.title || ''}
                            onChange={(e) => setDraftData({ ...data, form: { ...data.form, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Form Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.form?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, form: { ...data.form, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Submit Button Text</label>
                        <input 
                          type="text" 
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                          value={data.form?.buttonText || ''}
                          onChange={(e) => setDraftData({ ...data, form: { ...data.form, buttonText: e.target.value } })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Trusted By' && isContactTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900">Trusted By Brand Slider</h4>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Show Slider</label>
                          <ConfirmButton 
                            onClick={() => setDraftData({ ...data, trustedBy: { ...data.trustedBy, showSlider: !data.trustedBy?.showSlider } })}
                            className={cn(
                              "w-10 h-5 rounded-full transition-colors relative",
                              data.trustedBy?.showSlider ? "bg-teal-500" : "bg-slate-300"
                            )}
                          >
                            <div className={cn(
                              "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                              data.trustedBy?.showSlider ? "right-1" : "left-1"
                            )} />
                          </ConfirmButton>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Slider Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.trustedBy?.title || ''}
                            onChange={(e) => setDraftData({ ...data, trustedBy: { ...data.trustedBy, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Slider Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.trustedBy?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, trustedBy: { ...data.trustedBy, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          <strong>Source of Truth:</strong> The branding logos in this slider are dynamically fetched from the global "Homepage Logos" defined in the main dashboard. To update the actual logos, please visit the <strong>Dashboard Branding</strong> section.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Preview' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#000080]/40 border border-white/10 flex items-center justify-center text-teal-400 shrink-0">
                          <Eye className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            Interactive Live Preview: <span className="text-teal-300">{selectedTemplate?.name}</span>
                          </h3>
                          <p className="text-[11px] text-slate-400">Test how this template blueprint renders live across different screen viewports.</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        {/* Device Viewport Toggle */}
                        <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                          <ConfirmButton 
                            type="button"
                            onClick={() => setPreviewDevice('desktop')}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                              previewDevice === 'desktop' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                            )}
                            title="Desktop View (100%)"
                          >
                            <Monitor className="w-3.5 h-3.5" /> Desktop
                          </ConfirmButton>
                          <ConfirmButton 
                            type="button"
                            onClick={() => setPreviewDevice('tablet')}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                              previewDevice === 'tablet' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                            )}
                            title="Tablet View (768px)"
                          >
                            <Tablet className="w-3.5 h-3.5" /> Tablet
                          </ConfirmButton>
                          <ConfirmButton 
                            type="button"
                            onClick={() => setPreviewDevice('mobile')}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                              previewDevice === 'mobile' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                            )}
                            title="Mobile View (375px)"
                          >
                            <Smartphone className="w-3.5 h-3.5" /> Mobile
                          </ConfirmButton>
                        </div>

                        <ConfirmButton 
                          type="button"
                          onClick={() => setIsFullScreenPreview(true)}
                          className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg hover:scale-105"
                        >
                          <Maximize2 className="w-3.5 h-3.5" /> Full Screen
                        </ConfirmButton>
                      </div>
                    </div>

                    {renderTemplatePreview(selectedTemplate, data, previewDevice)}
                  </div>
                )}

                {/* PRICING TEMPLATE FORMS — arranged in the same order as the public page */}
                {templateSubTab === 'Hero & Trust' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="01"
                    title="Hero & Trust"
                    description="Edit the opening eyebrow, conversion quote, supporting review label, calls to action, and fallback trust heading."
                    note="Review photos and ratings come from Reviews, while trusted brand logos come from Homepage → Hero & Trusted Brands. Both are intentionally reused here as website-wide single sources of truth."
                    value={{
                      eyebrow: pricingData?.hero.eyebrow,
                      quote: pricingData?.hero.quote,
                      reviewLabel: pricingData?.hero.reviewLabel,
                      trustedFallbackTitle: pricingData?.hero.trustedFallbackTitle
                    }}
                    fieldKey="hero"
                    onChange={(hero) => setDraftData({ ...data, hero: { ...pricingData?.hero, ...hero } })}
                  />
                )}

                {templateSubTab === 'Pricing Promise' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="02"
                    title="Simple, Transparent Pricing"
                    description="Manage the promise statement and every supporting clarity card shown immediately after the hero."
                    value={pricingData?.assurance}
                    fieldKey="assurance"
                    onChange={(assurance) => setDraftData({ ...data, assurance })}
                  />
                )}

                {templateSubTab === 'Packages' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="03"
                    title="Website Packages"
                    description="Edit the section introduction, reusable card labels, all package names, prices, inclusions, technology logos, quotes, featured status, and calls to action."
                    value={{
                      plansEyebrow: pricingData?.plansEyebrow,
                      plansHeading: pricingData?.plansHeading,
                      plansDescription: pricingData?.plansDescription,
                      planLabels: pricingData?.planLabels,
                      plans: pricingData?.plans
                    }}
                    fieldKey="packages"
                    onChange={(packages) => setDraftData({ ...data, ...packages })}
                  />
                )}

                {templateSubTab === 'Comparison' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="04"
                    title="Plans & Features Comparison"
                    description="Manage the comparison heading, sticky-table label and note, category headings, feature rows, and all package values."
                    value={pricingData?.comparison}
                    fieldKey="comparison"
                    onChange={(comparison) => setDraftData({ ...data, comparison })}
                  />
                )}

                {templateSubTab === 'Process' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="05"
                    title="How Pricing Works"
                    description="Edit every desktop and mobile interface label plus all automatically revealed journey steps."
                    value={pricingData?.pricingProcess}
                    fieldKey="pricingProcess"
                    onChange={(pricingProcess) => setDraftData({ ...data, pricingProcess })}
                  />
                )}

                {templateSubTab === 'Scope & Payment' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="06"
                    title="Scope & Payment"
                    description="Control cost-factor labels, price considerations, payment-plan tabs, milestone wording, transparency copy, and third-party cost items."
                    value={pricingData?.scopeAndPayment}
                    fieldKey="scopeAndPayment"
                    onChange={(scopeAndPayment) => setDraftData({ ...data, scopeAndPayment })}
                  />
                )}

                {templateSubTab === 'Care Plans' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="07"
                    title="ProFox Care Plans"
                    description="Edit ongoing-care plan names, prices, billing periods, descriptions, inclusions, featured states, notes, and contact calls to action."
                    value={pricingData?.carePlans}
                    fieldKey="carePlans"
                    onChange={(carePlans) => setDraftData({ ...data, carePlans })}
                  />
                )}

                {templateSubTab === 'Recommendation' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="08"
                    title="Package Recommendation"
                    description="Manage the recommendation prompt, visitor guidance checklist, and its contact call to action."
                    value={pricingData?.recommendation}
                    fieldKey="recommendation"
                    onChange={(recommendation) => setDraftData({ ...data, recommendation })}
                  />
                )}

                {templateSubTab === 'FAQ' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="09"
                    title="Pricing Questions & Answers"
                    description="Add, duplicate, remove, reorder through editing, or rewrite every pricing question and answer."
                    value={pricingData?.faq}
                    fieldKey="faq"
                    onChange={(faq) => setDraftData({ ...data, faq })}
                  />
                )}

                {templateSubTab === 'Closing CTA' && isPricingTemplate && (
                  <PricingSectionEditor
                    number="10"
                    title="Closing Call to Action"
                    description="Edit the final conversion message, primary and secondary button text, and both destinations."
                    value={pricingData?.closing}
                    fieldKey="closing"
                    onChange={(closing) => setDraftData({ ...data, closing })}
                  />
                )}

                {/* ABOUT US TEMPLATE FORMS */}
                {templateSubTab === 'Complete Page Content' && isAboutTemplate && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="rounded-2xl border border-[#000080]/10 bg-[#000080]/[0.04] p-5">
                      <h4 className="text-sm font-bold text-slate-950">Complete About Page Content</h4>
                      <p className="mt-2 text-xs leading-5 text-slate-600">Edit every current section, card, image, statistic, label, logo name, and call-to-action below. The official office address remains managed from Site Settings as the single source of truth.</p>
                    </div>
                    <DynamicAboutContentEditor value={data.pageSections || defaultAboutUsData.pageSections} fieldKey="pageSections" onChange={(pageSections) => setDraftData({ ...data, pageSections })} />
                  </div>
                )}

                {templateSubTab === 'Hero & Stats' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subheading (Eyebrow)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                            placeholder="e.g. ABOUT US"
                            value={data.hero?.subheading || data.hero?.badge || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, subheading: e.target.value, badge: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Main Headline Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                            value={data.hero?.title || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subtitle (Secondary Heading)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                            placeholder="e.g. Design and Technology That Move Businesses Forward"
                            value={data.hero?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, subtitle: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Headline Gradient Accent Text</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#000080] font-bold focus:outline-none focus:border-[#000080]"
                            value={data.hero?.highlight || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, highlight: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subtitle / Description</label>
                          <textarea 
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080]"
                            value={data.hero?.description || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, description: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hero Feature Cover Image</label>
                        <ImageUploader 
                          label=""
                          value={data.hero?.image || ''}
                          onChange={(url) => setDraftData({ ...data, hero: { ...data.hero, image: url } })}
                        />
                      </div>
                    </div>

                    {/* Stats List */}
                    <div className="pt-6 border-t border-slate-200 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900">Hero Key Metric Statistics</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {(data.hero?.stats || []).map((st: any, idx: number) => (
                          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 relative">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.hero.stats.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, hero: { ...data.hero, stats: next } });
                              }}
                              className="absolute top-3 right-3 text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </ConfirmButton>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Metric Number</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold"
                                value={st.number}
                                onChange={(e) => {
                                  const next = [...data.hero.stats];
                                  next[idx].number = e.target.value;
                                  setDraftData({ ...data, hero: { ...data.hero, stats: next } });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Metric Label</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium"
                                value={st.label}
                                onChange={(e) => {
                                  const next = [...data.hero.stats];
                                  next[idx].label = e.target.value;
                                  setDraftData({ ...data, hero: { ...data.hero, stats: next } });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <ConfirmButton 
                        onClick={() => {
                          const currentStats = data.hero?.stats || [];
                          setDraftData({ ...data, hero: { ...data.hero, stats: [...currentStats, { number: '100+', label: 'New Metric', icon: 'Sparkles' }] } });
                        }}
                        className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add Stat Metric
                      </ConfirmButton>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Computer Showcase' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <h4 className="text-sm font-bold text-slate-900">Computer Frame Showcase Configuration</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Tagline</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.computerShowcase?.tagline || ''}
                            onChange={(e) => setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, tagline: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Heading Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.computerShowcase?.title || ''}
                            onChange={(e) => setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, title: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Subtitle / Description</label>
                        <textarea 
                          rows={3}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                          value={data.computerShowcase?.description || ''}
                          onChange={(e) => setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, description: e.target.value } })}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                        <ImageUploader 
                          label="Computer Display Screen Image"
                          value={data.computerShowcase?.screenImage || ''}
                          onChange={(url) => setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, screenImage: url } })}
                        />
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Floating Badge Text</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-teal-600"
                            value={data.computerShowcase?.badgeText || ''}
                            onChange={(e) => setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, badgeText: e.target.value } })}
                          />
                        </div>
                      </div>

                      {/* Computer Features */}
                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h5 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Showcase Feature Cards</h5>
                        <div className="space-y-3">
                          {(data.computerShowcase?.features || []).map((feat: any, idx: number) => (
                            <div key={idx} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                                <input 
                                  type="text"
                                  placeholder="Feature Title"
                                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                                  value={feat.title}
                                  onChange={(e) => {
                                    const next = [...data.computerShowcase.features];
                                    next[idx].title = e.target.value;
                                    setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, features: next } });
                                  }}
                                />
                                <input 
                                  type="text"
                                  placeholder="Feature Description"
                                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                  value={feat.desc}
                                  onChange={(e) => {
                                    const next = [...data.computerShowcase.features];
                                    next[idx].desc = e.target.value;
                                    setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, features: next } });
                                  }}
                                />
                              </div>
                              <ConfirmButton 
                                onClick={() => {
                                  const next = data.computerShowcase.features.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, features: next } });
                                }}
                                className="text-slate-300 hover:text-red-500 p-2"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                            </div>
                          ))}
                        </div>
                        <ConfirmButton 
                          onClick={() => {
                            const current = data.computerShowcase?.features || [];
                            setDraftData({ ...data, computerShowcase: { ...data.computerShowcase, features: [...current, { title: 'New Feature', desc: 'Feature description', icon: 'Sparkles' }] } });
                          }}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Feature Highlight
                        </ConfirmButton>
                      </div>

                    </div>
                  </div>
                )}

                {templateSubTab === 'Company Story & Vision' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <h4 className="text-sm font-bold text-slate-900">Impact Quote Banner</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Quote Text</label>
                          <textarea 
                            rows={3}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium italic"
                            value={data.story?.quote || ''}
                            onChange={(e) => setDraftData({ ...data, story: { ...data.story, quote: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Quote Author</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.story?.quoteAuthor || ''}
                            onChange={(e) => setDraftData({ ...data, story: { ...data.story, quoteAuthor: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h4 className="text-sm font-bold text-slate-900">Company Narrative Story</h4>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Story Body Content</label>
                          <textarea 
                            rows={6}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs leading-relaxed"
                            value={data.story?.body || ''}
                            onChange={(e) => setDraftData({ ...data, story: { ...data.story, body: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h4 className="text-sm font-bold text-slate-900">Vision & Mission Box</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Vision Box Title</label>
                            <input 
                              type="text" 
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                              value={data.story?.visionTitle || ''}
                              onChange={(e) => setDraftData({ ...data, story: { ...data.story, visionTitle: e.target.value } })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Vision Box Description</label>
                            <textarea 
                              rows={3}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                              value={data.story?.visionText || ''}
                              onChange={(e) => setDraftData({ ...data, story: { ...data.story, visionText: e.target.value } })}
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {templateSubTab === 'Core Values' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900">Core Values Cards</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(data.values || []).map((val: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 relative">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.values.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, values: next });
                              }}
                              className="absolute top-4 right-4 text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Value Title</label>
                              <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                value={val.title}
                                onChange={(e) => {
                                  const next = [...data.values];
                                  next[idx].title = e.target.value;
                                  setDraftData({ ...data, values: next });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description</label>
                              <textarea 
                                rows={2}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs"
                                value={val.desc}
                                onChange={(e) => {
                                  const next = [...data.values];
                                  next[idx].desc = e.target.value;
                                  setDraftData({ ...data, values: next });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <ConfirmButton 
                        onClick={() => {
                          const current = data.values || [];
                          setDraftData({ ...data, values: [...current, { title: 'New Core Value', desc: 'Description of value', icon: 'Sparkles', iconColor: 'bg-blue-500' }] });
                        }}
                        className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add Core Value Card
                      </ConfirmButton>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Timeline & Milestones' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.timeline?.title || ''}
                            onChange={(e) => setDraftData({ ...data, timeline: { ...data.timeline, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.timeline?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, timeline: { ...data.timeline, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h5 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Milestones Journey</h5>
                        <div className="space-y-4">
                          {(data.timeline?.milestones || []).map((m: any, idx: number) => (
                            <div key={idx} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 relative">
                              <ConfirmButton 
                                onClick={() => {
                                  const next = data.timeline.milestones.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, timeline: { ...data.timeline, milestones: next } });
                                }}
                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Year</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-[#000080]"
                                    value={m.year}
                                    onChange={(e) => {
                                      const next = [...data.timeline.milestones];
                                      next[idx].year = e.target.value;
                                      setDraftData({ ...data, timeline: { ...data.timeline, milestones: next } });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Milestone Title</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                                    value={m.title}
                                    onChange={(e) => {
                                      const next = [...data.timeline.milestones];
                                      next[idx].title = e.target.value;
                                      setDraftData({ ...data, timeline: { ...data.timeline, milestones: next } });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Badge Tag</label>
                                  <input 
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                    value={m.badge || ''}
                                    onChange={(e) => {
                                      const next = [...data.timeline.milestones];
                                      next[idx].badge = e.target.value;
                                      setDraftData({ ...data, timeline: { ...data.timeline, milestones: next } });
                                    }}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Description</label>
                                <textarea 
                                  rows={2}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                  value={m.description}
                                  onChange={(e) => {
                                    const next = [...data.timeline.milestones];
                                    next[idx].description = e.target.value;
                                    setDraftData({ ...data, timeline: { ...data.timeline, milestones: next } });
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <ConfirmButton 
                          onClick={() => {
                            const current = data.timeline?.milestones || [];
                            setDraftData({ ...data, timeline: { ...data.timeline, milestones: [...current, { year: '2027', title: 'New Achievement', description: 'Milestone description', badge: 'Future' }] } });
                          }}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Timeline Milestone
                        </ConfirmButton>
                      </div>

                    </div>
                  </div>
                )}

                {templateSubTab === 'Leadership Team' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.team?.title || ''}
                            onChange={(e) => setDraftData({ ...data, team: { ...data.team, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.team?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, team: { ...data.team, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>

                      <div className="border-t border-slate-200 pt-6 space-y-4">
                        <h5 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Team Members</h5>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {(data.team?.members || []).map((m: any, idx: number) => (
                            <div key={idx} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 relative">
                              <ConfirmButton 
                                onClick={() => {
                                  const next = data.team.members.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, team: { ...data.team, members: next } });
                                }}
                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Full Name</label>
                                <input 
                                  type="text"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold"
                                  value={m.name}
                                  onChange={(e) => {
                                    const next = [...data.team.members];
                                    next[idx].name = e.target.value;
                                    setDraftData({ ...data, team: { ...data.team, members: next } });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Role Title</label>
                                <input 
                                  type="text"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-[#000080]"
                                  value={m.role}
                                  onChange={(e) => {
                                    const next = [...data.team.members];
                                    next[idx].role = e.target.value;
                                    setDraftData({ ...data, team: { ...data.team, members: next } });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Bio / Profile Text</label>
                                <textarea 
                                  rows={2}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
                                  value={m.bio}
                                  onChange={(e) => {
                                    const next = [...data.team.members];
                                    next[idx].bio = e.target.value;
                                    setDraftData({ ...data, team: { ...data.team, members: next } });
                                  }}
                                />
                              </div>
                              <ImageUploader 
                                label="Member Photo"
                                value={m.image || ''}
                                onChange={(url) => {
                                  const next = [...data.team.members];
                                  next[idx].image = url;
                                  setDraftData({ ...data, team: { ...data.team, members: next } });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <ConfirmButton 
                          onClick={() => {
                            const current = data.team?.members || [];
                            setDraftData({ ...data, team: { ...data.team, members: [...current, { name: 'New Executive', role: 'Director', bio: 'Short bio', image: '' }] } });
                          }}
                          className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-[#000080] font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                        >
                          <Plus className="w-4 h-4" /> Add Team Member
                        </ConfirmButton>
                      </div>

                    </div>
                  </div>
                )}

                {templateSubTab === 'Conversion CTA' && isAboutTemplate && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <h4 className="text-sm font-bold text-slate-900">Conversion Banner Section</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Heading Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.cta?.heading || ''}
                            onChange={(e) => setDraftData({ ...data, cta: { ...data.cta, heading: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Subtitle</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                            value={data.cta?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, cta: { ...data.cta, subtitle: e.target.value } })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Button Label Text</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                            value={data.cta?.buttonText || ''}
                            onChange={(e) => setDraftData({ ...data, cta: { ...data.cta, buttonText: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Button URL / Link</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono"
                            value={data.cta?.buttonUrl || ''}
                            onChange={(e) => setDraftData({ ...data, cta: { ...data.cta, buttonUrl: e.target.value } })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}



                {templateSubTab === 'Hero' && !isLegalTemplate && !isAboutTemplate && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subheading (Eyebrow)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080] transition-colors"
                            placeholder="e.g. SYSTEMS ARCHITECTURE"
                            value={data.hero?.subheading || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, subheading: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Title (Main)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080] transition-colors"
                            value={data.hero?.title || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, title: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Highlight (Brand Accent)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#000080] font-bold focus:outline-none focus:border-[#000080] transition-colors"
                            value={data.hero?.highlight || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, highlight: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subtitle (Secondary Heading)</label>
                          <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080] transition-colors"
                            placeholder="e.g. Design and Technology That Move Businesses Forward"
                            value={data.hero?.subtitle || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, subtitle: e.target.value } })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Description</label>
                          <textarea 
                            rows={4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#000080] transition-colors"
                            value={data.hero?.description || ''}
                            onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, description: e.target.value } })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero CTA Button Text</label>
                            <input 
                              type="text" 
                              placeholder="Build Your Growth Website"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors"
                              value={data.hero?.ctaText || ''}
                              onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, ctaText: e.target.value } })}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero CTA Target Link (ID)</label>
                            <input 
                              type="text" 
                              placeholder="cta"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:border-[#000080] transition-colors"
                              value={data.hero?.ctaUrl || ''}
                              onChange={(e) => setDraftData({ ...data, hero: { ...data.hero, ctaUrl: e.target.value } })}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Blueprint Visual Image</label>
                        <ImageUploader 
                          label=""
                          value={data.hero?.image || ''}
                          onChange={(url) => setDraftData({ ...data, hero: { ...data.hero, image: url } })}
                        />
                      </div>
                    </div>
                    
                    <div className="pt-6 border-t border-slate-100">
                      <label className="block text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-widest">Sticky Sub-Navigation Items</label>
                      <div className="space-y-2">
                        {(data.subnav || []).map((nav: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input 
                              type="text" 
                              placeholder="Label"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#000080] transition-colors"
                              value={nav.label}
                              onChange={(e) => {
                                const next = [...data.subnav];
                                next[idx].label = e.target.value;
                                setDraftData({ ...data, subnav: next });
                              }}
                            />
                            <input 
                              type="text" 
                              placeholder="Section Anchor ID"
                              className="w-48 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#000080] transition-colors"
                              value={nav.id}
                              onChange={(e) => {
                                const next = [...data.subnav];
                                next[idx].id = e.target.value;
                                setDraftData({ ...data, subnav: next });
                              }}
                            />
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.subnav.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, subnav: next });
                              }}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, subnav: [...(data.subnav || []), { label: 'New Link', id: 'section' }] })}
                          className="px-4 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:text-[#000080] hover:border-[#000080] transition-all flex items-center gap-2 mt-2"
                        >
                          <Plus className="w-4 h-4" /> Add Navigation Link
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Value Prop' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200/60 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">Impactful Large Quote Section</h4>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Quote Main Heading</label>
                        <textarea 
                          rows={2}
                          placeholder="e.g., Companies with high-performing websites outperform their competitors by nearly 80%."
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-medium"
                          value={data.quoteHeading || ''}
                          onChange={(e) => setDraftData({ ...data, quoteHeading: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Quote Author / Attribution</label>
                          <input 
                            type="text" 
                            placeholder="e.g., - Watermark Consulting"
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-bold"
                            value={data.quoteAuthor || ''}
                            onChange={(e) => setDraftData({ ...data, quoteAuthor: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Quote Description / Subtext</label>
                          <textarea 
                            rows={2}
                            placeholder="e.g., Your website is where buyers decide if you are worth trusting..."
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors"
                            value={data.quoteDescription || ''}
                            onChange={(e) => setDraftData({ ...data, quoteDescription: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Legacy Single Quote Fallback (Optional)</label>
                        <textarea 
                          rows={1}
                          placeholder="Used only as a fallback if custom fields above are empty"
                          className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-1.5 text-xs text-slate-400 font-mono italic"
                          value={data.quote || ''}
                          onChange={(e) => setDraftData({ ...data, quote: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200/60 space-y-4 mb-6">
                      <h4 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">"How We Help" Section Header & Button</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Main Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-[#000080]"
                            placeholder="e.g. How We Help"
                            value={data.howWeHelpTitle || ''}
                            onChange={(e) => setDraftData({ ...data, howWeHelpTitle: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Subheading / Description</label>
                          <textarea 
                            rows={3}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080]"
                            placeholder="Describe what your team delivers in this section..."
                            value={data.howWeHelpDesc || ''}
                            onChange={(e) => setDraftData({ ...data, howWeHelpDesc: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Primary CTA Button Text</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold focus:outline-none focus:border-[#000080]"
                            placeholder="e.g. Get Started"
                            value={data.howWeHelpButtonText || ''}
                            onChange={(e) => setDraftData({ ...data, howWeHelpButtonText: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-900">"How We Help" Cards & Features</h4>
                      <div className="grid grid-cols-1 gap-4">
                        {(data.howWeHelp || []).map((item: any, idx: number) => (
                          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative group">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.howWeHelp.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, howWeHelp: next });
                              }}
                              className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
                            </ConfirmButton>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <input 
                                  type="text" 
                                  placeholder="Title"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold"
                                  value={item.title}
                                  onChange={(e) => {
                                    const next = [...data.howWeHelp];
                                    next[idx].title = e.target.value;
                                    setDraftData({ ...data, howWeHelp: next });
                                  }}
                                />
                                <textarea 
                                  placeholder="Description"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs h-24"
                                  value={item.desc}
                                  onChange={(e) => {
                                    const next = [...data.howWeHelp];
                                    next[idx].desc = e.target.value;
                                    setDraftData({ ...data, howWeHelp: next });
                                  }}
                                />
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Accent Dot Color Class</label>
                                  <input 
                                    type="text"
                                    placeholder="bg-green-400 or bg-blue-500"
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                                    value={item.iconColor || ''}
                                    onChange={(e) => {
                                      const next = [...data.howWeHelp];
                                      next[idx].iconColor = e.target.value;
                                      setDraftData({ ...data, howWeHelp: next });
                                    }}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Card CTA Text</label>
                                    <input 
                                      type="text"
                                      placeholder="Speak with a Solutions Architect"
                                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px]"
                                      value={item.ctaText || ''}
                                      onChange={(e) => {
                                        const next = [...data.howWeHelp];
                                        next[idx].ctaText = e.target.value;
                                        setDraftData({ ...data, howWeHelp: next });
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Card CTA URL</label>
                                    <input 
                                      type="text"
                                      placeholder="#cta"
                                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px]"
                                      value={item.ctaUrl || ''}
                                      onChange={(e) => {
                                        const next = [...data.howWeHelp];
                                        next[idx].ctaUrl = e.target.value;
                                        setDraftData({ ...data, howWeHelp: next });
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sub Features / Points</label>
                                <div className="space-y-2">
                                  {(item.features || []).map((f: string, fidx: number) => (
                                    <div key={fidx} className="flex gap-2">
                                      <input 
                                        type="text"
                                        className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]"
                                        value={f}
                                        onChange={(e) => {
                                          const next = [...data.howWeHelp];
                                          next[idx].features[fidx] = e.target.value;
                                          setDraftData({ ...data, howWeHelp: next });
                                        }}
                                      />
                                      <ConfirmButton onClick={() => {
                                        const next = [...data.howWeHelp];
                                        next[idx].features = next[idx].features.filter((_: any, i: number) => i !== fidx);
                                        setDraftData({ ...data, howWeHelp: next });
                                      }} className="text-red-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></ConfirmButton>
                                    </div>
                                  ))}
                                  <ConfirmButton 
                                    onClick={() => {
                                      const next = [...data.howWeHelp];
                                      next[idx].features = [...(next[idx].features || []), 'New Feature Point'];
                                      setDraftData({ ...data, howWeHelp: next });
                                    }}
                                    className="text-[10px] font-bold text-[#000080] flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Add Feature Point
                                  </ConfirmButton>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, howWeHelp: [...(data.howWeHelp || []), { title: 'New Service Capability', desc: 'Detail about this service.', features: ['Workflow Optimization'], iconColor: 'bg-blue-500' }] })}
                          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                          <Plus className="w-5 h-5" /> Add New "How We Help" Card
                        </ConfirmButton>
                      </div>
                    </div>

                    {/* Connected Growth Loop Section Editor for Blueprint */}
                    <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-200/60 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">"Connected Growth Loop" Section Blueprint</h4>
                      <p className="text-xs text-slate-500">Edit the default template content and steps for the "What Makes Us Different" section.</p>
                      
                      {(() => {
                        const loop = data.connectedLoop || {
                          eyebrow: "WHAT MAKES US DIFFERENT",
                          title: "For the First Time, Your Website, Your Customer Experience, and Your Marketing Automation Are One System.",
                          desc1: "Most agencies build you a website and call it a day. But a website is only one piece of the puzzle. To drive real growth, your digital presence needs to be connected to how you talk to your customers and how you keep them coming back.",
                          desc2: "We don't just build websites. We build connected revenue systems that align your marketing, your technology, and your customer journey.",
                          steps: [
                            { badge: "Step 1", title: "Website Experience" },
                            { badge: "Step 2", title: "Marketing Automation" },
                            { badge: "Step 3", title: "Customer Experience" }
                          ],
                          footer: "The Connected Growth Loop",
                          accentText: "Every decision we make is tied directly to growth. If it doesn't improve growth, it doesn't get made."
                        };

                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Eyebrow</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-semibold text-emerald-600"
                                  value={loop.eyebrow || ''}
                                  onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, eyebrow: e.target.value } })}
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Cursive Footer / Subtext</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors italic"
                                  value={loop.footer || ''}
                                  onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, footer: e.target.value } })}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Main Section Title</label>
                              <textarea 
                                rows={2}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-medium"
                                value={loop.title || ''}
                                onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, title: e.target.value } })}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Description Paragraph 1</label>
                              <textarea 
                                rows={3}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors"
                                value={loop.desc1 || ''}
                                onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, desc1: e.target.value } })}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Description Paragraph 2 (Bold Highlight)</label>
                              <textarea 
                                rows={2}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-bold"
                                value={loop.desc2 || ''}
                                onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, desc2: e.target.value } })}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Connecting Steps</label>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {(loop.steps || []).map((step: any, sIdx: number) => (
                                  <div key={sIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                                    <div>
                                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Badge</label>
                                      <input 
                                        type="text" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-emerald-600"
                                        value={step.badge || ''}
                                        onChange={(e) => {
                                          const newSteps = [...loop.steps];
                                          newSteps[sIdx] = { ...newSteps[sIdx], badge: e.target.value };
                                          setDraftData({ ...data, connectedLoop: { ...loop, steps: newSteps } });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Title</label>
                                      <input 
                                        type="text" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-medium"
                                        value={step.title || ''}
                                        onChange={(e) => {
                                          const newSteps = [...loop.steps];
                                          newSteps[sIdx] = { ...newSteps[sIdx], title: e.target.value };
                                          setDraftData({ ...data, connectedLoop: { ...loop, steps: newSteps } });
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Left Accent Block Text</label>
                              <textarea 
                                rows={2}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-[#000080] transition-colors font-bold"
                                value={loop.accentText || ''}
                                onChange={(e) => setDraftData({ ...data, connectedLoop: { ...loop, accentText: e.target.value } })}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {templateSubTab === 'Evidence' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Challenges Section Headers</h4>
                      <p className="text-xs text-slate-500 mb-4">Edit the Section Title and Subheading / Highlight phrase.</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                            value={data.challengesTitle || 'The Challenges We Make'}
                            onChange={(e) => setDraftData({ ...data, challengesTitle: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Highlight Word/Phrase</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 font-semibold"
                            value={data.challengesHighlight || 'Disappear For You'}
                            onChange={(e) => setDraftData({ ...data, challengesHighlight: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Challenges We Make Disappear For You</h4>
                      <p className="text-xs text-slate-500 mb-4">Add, edit or delete challenge statements displayed in the evidence section.</p>
                      
                      <div className="space-y-2">
                        {(data.challenges || []).map((challenge: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-sm">
                            <span className="text-xs font-bold text-slate-400">Challenge {idx + 1}</span>
                            <input 
                              type="text" 
                              className="flex-1 bg-transparent border-none focus:outline-none text-xs font-medium text-slate-800"
                              value={challenge}
                              onChange={(e) => {
                                const next = [...data.challenges];
                                next[idx] = e.target.value;
                                setDraftData({ ...data, challenges: next });
                              }}
                            />
                            <ConfirmButton onClick={() => setDraftData({ ...data, challenges: data.challenges.filter((_: any, i: number) => i !== idx) })} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, challenges: [...(data.challenges || []), 'New Challenge solved for partners'] })}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                          <Plus className="w-4 h-4" /> Add Challenge Statement
                        </ConfirmButton>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-1">Featured Case Studies</h4>
                      <p className="text-xs text-slate-500 mb-4">Edit the section title, subheading / description, and choose the posts.</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                            value={data.progressTitle || 'What Progress'}
                            onChange={(e) => setDraftData({ ...data, progressTitle: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Highlight Word/Phrase</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 font-semibold text-[#000080]"
                            value={data.progressHighlight || 'Looks Like'}
                            onChange={(e) => setDraftData({ ...data, progressHighlight: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Subheading / Description</label>
                          <textarea 
                            rows={2}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                            value={data.progressDesc || ''}
                            onChange={(e) => setDraftData({ ...data, progressDesc: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Header Link Text</label>
                          <input 
                            type="text" 
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900"
                            value={data.progressLinkText || 'View All Case Studies'}
                            onChange={(e) => setDraftData({ ...data, progressLinkText: e.target.value })}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(data.caseStudies || []).map((cs: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 relative">
                            <ConfirmButton 
                              onClick={() => setDraftData({ ...data, caseStudies: data.caseStudies.filter((_: any, i: number) => i !== idx) })}
                              className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                             <div className="space-y-2 pt-2">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Quick Select Post</label>
                                <select
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-700 focus:ring-1 focus:ring-[#000080] focus:outline-none"
                                  value={cs.slug || ''}
                                  onChange={(e) => {
                                    const selectedSlug = e.target.value;
                                    const matched = allPortfolioList.find((p: any) => p.slug === selectedSlug || p.id === selectedSlug);
                                    if (matched) {
                                      const next = [...data.caseStudies];
                                      next[idx] = {
                                        client: matched.client || matched.logoText || 'CLIENT PARTNER',
                                        title: matched.title,
                                        image: matched.coverImage || matched.image || 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
                                        slug: matched.slug || matched.id
                                      };
                                      setDraftData({ ...data, caseStudies: next });
                                    } else if (selectedSlug === '') {
                                      const next = [...data.caseStudies];
                                      next[idx].slug = '';
                                      setDraftData({ ...data, caseStudies: next });
                                    }
                                  }}
                                >
                                  <option value="">-- Choose testimonial / post --</option>
                                  {allPortfolioList.map((p: any) => (
                                    <option key={p.slug || p.id} value={p.slug || p.id}>
                                      {p.client || p.logoText || 'No Client'}: {p.title}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <input 
                              type="text" 
                              placeholder="Client Partner"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold"
                              value={cs.client}
                              onChange={(e) => {
                                const next = [...data.caseStudies];
                                next[idx].client = e.target.value;
                                setDraftData({ ...data, caseStudies: next });
                              }}
                            />
                            <input 
                              type="text" 
                              placeholder="Case Title"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-900"
                              value={cs.title}
                              onChange={(e) => {
                                const next = [...data.caseStudies];
                                next[idx].title = e.target.value;
                                setDraftData({ ...data, caseStudies: next });
                              }}
                            />
                            <input 
                              type="text" 
                              placeholder="Portfolio Slug (e.g. ddc, sound)"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-mono text-slate-600"
                              value={cs.slug || ''}
                              onChange={(e) => {
                                const next = [...data.caseStudies];
                                next[idx].slug = e.target.value;
                                setDraftData({ ...data, caseStudies: next });
                              }}
                            />
                            <ImageUploader 
                              label="Case Study Cover Image"
                              value={cs.image}
                              onChange={(url) => {
                                const next = [...data.caseStudies];
                                next[idx].image = url;
                                setDraftData({ ...data, caseStudies: next });
                              }}
                            />
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, caseStudies: [...(data.caseStudies || []), { client: 'Client Name', title: 'Case Study Title', image: '' }] })}
                          className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-12 text-slate-400 hover:text-[#000080] transition-all gap-2"
                        >
                          <Plus className="w-8 h-8" />
                          <span className="text-xs font-bold">Add Case Study</span>
                        </ConfirmButton>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 mb-1">Awards & Recognition Section</h4>
                      <p className="text-xs text-slate-500 mb-4">Manage trust badges and awards logos shown below the case studies.</p>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Section Title (use \n for newline)</label>
                        <input 
                          type="text" 
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs"
                          value={data.awardsTitle || 'Awards &\nRecognition'}
                          onChange={(e) => setDraftData({ ...data, awardsTitle: e.target.value })}
                        />
                      </div>

                      <div className="space-y-3">
                        <label className="block text-xs font-bold text-slate-700">Badges List</label>
                        {(data.awards || [
                          { text: 'CLUTCH', icon: 'Sparkles' },
                          { text: 'DESIGNRUSH', icon: 'Monitor' },
                          { text: 'BestDesign', icon: '' }
                        ]).map((award: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm relative">
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                              <div className="flex-1 w-full">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Badge/Award Text</label>
                                <input 
                                  type="text" 
                                  placeholder="Award Name"
                                  className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-medium"
                                  value={award.text}
                                  onChange={(e) => {
                                    const next = [...(data.awards || [
                                      { text: 'CLUTCH', icon: 'Sparkles' },
                                      { text: 'DESIGNRUSH', icon: 'Monitor' },
                                      { text: 'BestDesign', icon: '' }
                                    ])];
                                    next[idx] = { ...next[idx], text: e.target.value };
                                    setDraftData({ ...data, awards: next });
                                  }}
                                />
                              </div>
                              <div className="w-full sm:w-48">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Icon (If no image logo)</label>
                                <select 
                                  className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs"
                                  value={award.icon || ''}
                                  onChange={(e) => {
                                    const next = [...(data.awards || [
                                      { text: 'CLUTCH', icon: 'Sparkles' },
                                      { text: 'DESIGNRUSH', icon: 'Monitor' },
                                      { text: 'BestDesign', icon: '' }
                                    ])];
                                    next[idx] = { ...next[idx], icon: e.target.value };
                                    setDraftData({ ...data, awards: next });
                                  }}
                                >
                                  <option value="">No Icon</option>
                                  <option value="Sparkles">Sparkles</option>
                                  <option value="Monitor">Monitor</option>
                                  <option value="Award">Award</option>
                                  <option value="Trophy">Trophy</option>
                                  <option value="Shield">Shield</option>
                                  <option value="Star">Star</option>
                                  <option value="Database">Database</option>
                                  <option value="Cloud">Cloud</option>
                                  <option value="Code">Code</option>
                                  <option value="Smartphone">Smartphone</option>
                                </select>
                              </div>
                              <ConfirmButton 
                                onClick={() => {
                                  const currentAwards = data.awards || [
                                    { text: 'CLUTCH', icon: 'Sparkles' },
                                    { text: 'DESIGNRUSH', icon: 'Monitor' },
                                    { text: 'BestDesign', icon: '' }
                                  ];
                                  setDraftData({ ...data, awards: currentAwards.filter((_: any, i: number) => i !== idx) });
                                }} 
                                className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg mt-4 sm:mt-0 self-end sm:self-center shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                            </div>
                            <div className="border-t border-slate-100 pt-3">
                              <ImageUploader 
                                label="Badge Custom Image Logo (Optional)"
                                value={award.image || ''}
                                onChange={(url) => {
                                  const next = [...(data.awards || [
                                    { text: 'CLUTCH', icon: 'Sparkles' },
                                    { text: 'DESIGNRUSH', icon: 'Monitor' },
                                    { text: 'BestDesign', icon: '' }
                                  ])];
                                  next[idx] = { ...next[idx], image: url };
                                  setDraftData({ ...data, awards: next });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => {
                            const currentAwards = data.awards || [
                              { text: 'CLUTCH', icon: 'Sparkles' },
                              { text: 'DESIGNRUSH', icon: 'Monitor' },
                              { text: 'BestDesign', icon: '' }
                            ];
                            setDraftData({ ...data, awards: [...currentAwards, { text: 'New Badge', icon: '', image: '' }] });
                          }}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                          <Plus className="w-4 h-4" /> Add Award/Badge
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Technical' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 mb-1">"Engineering Friction" Feature Section</h4>
                      <p className="text-xs text-slate-500 mb-4">Set the default quote title, description, and photo for this section.</p>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium"
                          value={data.frictionTitle || 'Engineering the Friction Out of Complex Systems'}
                          onChange={(e) => setDraftData({ ...data, frictionTitle: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Description Paragraph</label>
                          <textarea 
                            rows={4}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium"
                            value={data.frictionDescription || "True technical value isn't just about adding new tools; it's about the seamless bridge between legacy infrastructure and modern automation. We specialize in that gap, replacing repetitive toil with a unified experience that functions as a single, cohesive engine. It's the difference between managing a mess and orchestrating a system that scales."}
                            onChange={(e) => setDraftData({ ...data, frictionDescription: e.target.value })}
                          />
                        </div>
                        <ImageUploader 
                          label="Section Portrait Image"
                          value={data.frictionImage || ''}
                          onChange={(url) => setDraftData({ ...data, frictionImage: url })}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-2">Technical Standards & Tech Stack</h4>
                      <p className="text-xs text-slate-500 mb-4">Structure standard tech categories and stack labels displayed on page.</p>

                      <div className="space-y-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Section Heading</label>
                            <input 
                              type="text" 
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium"
                              value={data.techStackTitle || ''}
                              onChange={(e) => setDraftData({ ...data, techStackTitle: e.target.value })}
                              placeholder="e.g. Marketing and Technology Under One Roof"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Section Subheading</label>
                            <textarea 
                              rows={2}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium"
                              value={data.techStackDesc || ''}
                              onChange={(e) => setDraftData({ ...data, techStackDesc: e.target.value })}
                              placeholder="e.g. Platforms, design, and strategy all work together..."
                            />
                          </div>
                        </div>
                        <ImageUploader 
                          label="Mockup Screen or Banner Image"
                          value={data.techStackImage || ''}
                          onChange={(url) => setDraftData({ ...data, techStackImage: url })}
                        />
                      </div>

                      <div className="space-y-4">
                        {(data.techStack || []).map((stack: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 relative">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.techStack.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, techStack: next });
                              }}
                              className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                            <div className="max-w-md">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Category Header</label>
                              <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold text-slate-800"
                                value={stack.category}
                                onChange={(e) => {
                                  const next = [...data.techStack];
                                  next[idx].category = e.target.value;
                                  setDraftData({ ...data, techStack: next });
                                }}
                              />
                            </div>
                            <div className="space-y-3 w-full">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Technologies & Logos</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {(stack.icons || []).map((iconItem: any, iidx: number) => {
                                  const isObj = typeof iconItem === 'object' && iconItem !== null;
                                  const nameVal = isObj ? (iconItem.name || '') : iconItem;
                                  const logoVal = isObj ? (iconItem.logo || '') : '';
                                  return (
                                    <div key={iidx} className="flex flex-col bg-slate-50 border border-slate-200 rounded-xl p-3 relative group hover:border-[#000080]/30 hover:bg-slate-50/50 transition-all">
                                      <ConfirmButton 
                                        onClick={() => {
                                          const next = [...data.techStack];
                                          next[idx].icons = next[idx].icons.filter((_: any, i: number) => i !== iidx);
                                          setDraftData({ ...data, techStack: next });
                                        }} 
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 rounded-md hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </ConfirmButton>
                                      
                                      <div className="space-y-2">
                                        <div>
                                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Tech Name</label>
                                          <input 
                                            type="text" 
                                            placeholder="e.g. React & Vite"
                                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#000080]"
                                            value={nameVal}
                                            onChange={(e) => {
                                              const next = [...data.techStack];
                                              next[idx].icons[iidx] = { name: e.target.value, logo: logoVal };
                                              setDraftData({ ...data, techStack: next });
                                            }}
                                          />
                                        </div>
                                        
                                        <div>
                                          <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Logo Image / URL</label>
                                          <div className="flex gap-1.5 items-center">
                                            {logoVal && (
                                              <img 
                                                src={logoVal} 
                                                alt={nameVal} 
                                                className="w-8 h-8 object-contain rounded bg-white p-1 border border-slate-100 shrink-0" 
                                                referrerPolicy="no-referrer"
                                              />
                                            )}
                                            <input 
                                              type="text" 
                                              placeholder="https://... or upload"
                                              className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-600 focus:outline-none focus:border-[#000080] min-w-0"
                                              value={logoVal}
                                              onChange={(e) => {
                                                const next = [...data.techStack];
                                                next[idx].icons[iidx] = { name: nameVal, logo: e.target.value };
                                                setDraftData({ ...data, techStack: next });
                                              }}
                                            />
                                            <ImageUploaderButton
                                              value={logoVal}
                                              onChange={(url) => {
                                                const next = [...data.techStack];
                                                next[idx].icons[iidx] = { name: nameVal, logo: url };
                                                setDraftData({ ...data, techStack: next });
                                              }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                <ConfirmButton 
                                  onClick={() => {
                                    const next = [...data.techStack];
                                    next[idx].icons = [...(next[idx].icons || []), { name: 'New Tech', logo: '' }];
                                    setDraftData({ ...data, techStack: next });
                                  }}
                                  className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-slate-400 hover:text-[#000080] hover:border-[#000080]/30 transition-all flex flex-col items-center justify-center gap-1 min-h-[110px] bg-white hover:bg-slate-50/20 w-full"
                                >
                                  <Plus className="w-5 h-5 text-slate-300" />
                                  <span className="text-[11px] font-bold">Add Tech & Logo</span>
                                </ConfirmButton>
                              </div>
                            </div>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, techStack: [...(data.techStack || []), { category: 'Core Stack', icons: [] }] })}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                          <Plus className="w-4 h-4" /> Add Stack Category Blueprint
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Our Process' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">Our Process Section Configuration</h4>
                          <p className="text-xs text-slate-500">Manage the step-by-step methodology cards shown on your service pages.</p>
                        </div>
                        <ConfirmButton 
                          onClick={() => {
                            const defaultSteps = [
                              {
                                step: "01",
                                title: "Discovery & Strategy",
                                desc: "We analyze your existing workflows, legacy systems, and technical bottlenecks to construct a pragmatic blueprint for modernization.",
                                image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200",
                                ctaText: "Let's Talk",
                                ctaUrl: "/contact-us"
                              },
                              {
                                step: "02",
                                title: "System Architecture & Design",
                                desc: "Our senior engineers design scalable, secure system architectures that seamlessly bridge your current tools and future integrations.",
                                image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200",
                                ctaText: "Let's Talk",
                                ctaUrl: "/contact-us"
                              },
                              {
                                step: "03",
                                title: "Agile Development & Testing",
                                desc: "We write clean, high-performance code with daily standups, robust test coverage, and continuous delivery loops to guarantee momentum.",
                                image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200",
                                ctaText: "Let's Talk",
                                ctaUrl: "/contact-us"
                              },
                              {
                                step: "04",
                                title: "Deployment & Continuous Growth",
                                desc: "We deploy without downtime, provide proactive monitoring, and continuously optimize systems as your user base and operations scale.",
                                image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200",
                                ctaText: "Let's Talk",
                                ctaUrl: "/contact-us"
                              }
                            ];
                            setDraftData({ ...data, processTitle: 'Our Process', processBadge: 'How We Deliver Success', ourProcess: defaultSteps, engagement: defaultSteps });
                          }}
                          className="text-xs font-bold text-[#000080] bg-white border border-[#000080]/30 hover:bg-[#000080] hover:text-white px-3 py-1.5 rounded-lg transition-all"
                        >
                          Reset to Standard 4 Steps
                        </ConfirmButton>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Section Badge / Eyebrow</label>
                          <input 
                            type="text" 
                            placeholder="HOW WE DELIVER SUCCESS"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-[#000080]"
                            value={data.processBadge || 'How We Deliver Success'}
                            onChange={(e) => setDraftData({ ...data, processBadge: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Section Main Heading</label>
                          <input 
                            type="text" 
                            placeholder="Our Process"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900"
                            value={data.processTitle || data.engagementTitle || 'Our Process'}
                            onChange={(e) => setDraftData({ ...data, processTitle: e.target.value, engagementTitle: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Process Steps ({(data.ourProcess || data.engagement || []).length})</label>
                          <ConfirmButton 
                            onClick={() => {
                              const processList = data.ourProcess || data.engagement || [];
                              const nextNum = processList.length + 1;
                              const newStep = {
                                step: nextNum < 10 ? `0${nextNum}` : `${nextNum}`,
                                title: 'New Process Step',
                                desc: 'Enter detailed description of this step in your workflow.',
                                image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
                                ctaText: "Let's Talk",
                                ctaUrl: "/contact-us"
                              };
                              const next = [...processList, newStep];
                              setDraftData({ ...data, ourProcess: next, engagement: next });
                            }}
                            className="text-xs font-bold text-white bg-[#000080] hover:bg-[#000066] px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add Step
                          </ConfirmButton>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {(data.ourProcess || data.engagement || []).map((m: any, idx: number) => (
                            <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative group">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="text" 
                                    placeholder="01"
                                    className="w-14 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-black text-[#000080]"
                                    value={m.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`)}
                                    onChange={(e) => {
                                      const processList = data.ourProcess || data.engagement || [];
                                      const next = [...processList];
                                      next[idx] = { ...next[idx], step: e.target.value };
                                      setDraftData({ ...data, ourProcess: next, engagement: next });
                                    }}
                                  />
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Step Number</span>
                                </div>
                                <ConfirmButton 
                                  onClick={() => {
                                    const processList = data.ourProcess || data.engagement || [];
                                    const next = processList.filter((_: any, i: number) => i !== idx);
                                    setDraftData({ ...data, ourProcess: next, engagement: next });
                                  }} 
                                  className="text-red-400 hover:text-red-600 p-1 transition-colors"
                                  title="Delete step"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </ConfirmButton>
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Step Title</label>
                                <input 
                                  type="text" 
                                  placeholder="e.g. Discovery & Strategy"
                                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900"
                                  value={m.title || ''}
                                  onChange={(e) => {
                                    const processList = data.ourProcess || data.engagement || [];
                                    const next = [...processList];
                                    next[idx] = { ...next[idx], title: e.target.value };
                                    setDraftData({ ...data, ourProcess: next, engagement: next });
                                  }}
                                />
                              </div>

                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Description</label>
                                <textarea 
                                  rows={3}
                                  placeholder="Detailed explanation of this process step..."
                                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                  value={m.desc || m.description || ''}
                                  onChange={(e) => {
                                    const processList = data.ourProcess || data.engagement || [];
                                    const next = [...processList];
                                    next[idx] = { ...next[idx], desc: e.target.value, description: e.target.value };
                                    setDraftData({ ...data, ourProcess: next, engagement: next });
                                  }}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Button Text</label>
                                  <input 
                                    type="text" 
                                    placeholder="e.g. Let's Talk"
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                    value={m.ctaText || ''}
                                    onChange={(e) => {
                                      const processList = data.ourProcess || data.engagement || [];
                                      const next = [...processList];
                                      next[idx] = { ...next[idx], ctaText: e.target.value };
                                      setDraftData({ ...data, ourProcess: next, engagement: next });
                                    }}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Link / Anchor</label>
                                  <input 
                                    type="text" 
                                    placeholder="#cta"
                                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                    value={m.ctaUrl || ''}
                                    onChange={(e) => {
                                      const processList = data.ourProcess || data.engagement || [];
                                      const next = [...processList];
                                      next[idx] = { ...next[idx], ctaUrl: e.target.value };
                                      setDraftData({ ...data, ourProcess: next, engagement: next });
                                    }}
                                  />
                                </div>
                              </div>

                              <ImageUploader 
                                label="Card Background Image"
                                value={m.image || ''}
                                onChange={(url) => {
                                  const processList = data.ourProcess || data.engagement || [];
                                  const next = [...processList];
                                  next[idx] = { ...next[idx], image: url };
                                  setDraftData({ ...data, ourProcess: next, engagement: next });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Conversion' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-4">Engagement Models & "Let's Build for Impact" CTA</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(data.engagement || []).map((model: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 relative">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.engagement.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, engagement: next });
                              }}
                              className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                            <input 
                              type="text" 
                              placeholder="Engagement Title"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold"
                              value={model.title}
                              onChange={(e) => {
                                const next = [...data.engagement];
                                next[idx].title = e.target.value;
                                setDraftData({ ...data, engagement: next });
                              }}
                            />
                            <textarea 
                              placeholder="Description"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs h-24"
                              value={model.desc}
                              onChange={(e) => {
                                const next = [...data.engagement];
                                next[idx].desc = e.target.value;
                                setDraftData({ ...data, engagement: next });
                              }}
                            />
                            <ImageUploader 
                              label="Background Card Image"
                              value={model.image}
                              onChange={(url) => {
                                const next = [...data.engagement];
                                next[idx].image = url;
                                setDraftData({ ...data, engagement: next });
                              }}
                            />
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, engagement: [...(data.engagement || []), { title: 'Project-Based Model', desc: 'Clear scope and deliverables.', image: '' }] })}
                          className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center py-12 text-slate-400 hover:text-[#000080] transition-all gap-2"
                        >
                          <Plus className="w-8 h-8" />
                          <span className="text-xs font-bold">Add Engagement Model</span>
                        </ConfirmButton>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900">"Let's Build for Impact" Bottom CTA Text & Button</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-5 rounded-2xl border border-slate-200">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">CTA Headline</label>
                          <input 
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                            value={data.ctaTitle || "Let's Build for Impact"}
                            onChange={(e) => setDraftData({ ...data, ctaTitle: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">CTA Button Text</label>
                          <input 
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                            value={data.ctaButtonText || "Let's Talk"}
                            onChange={(e) => setDraftData({ ...data, ctaButtonText: e.target.value })}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">CTA Description Paragraph</label>
                          <textarea 
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs"
                            value={data.ctaDescription || "Create technology that scales, performs, and delivers business results that last."}
                            onChange={(e) => setDraftData({ ...data, ctaDescription: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <h4 className="text-sm font-bold text-slate-900 mb-4">FAQ Section (Questions & Answers)</h4>
                      <div className="space-y-3">
                        {(data.faqs || []).map((faq: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                            <div className="flex gap-4">
                              <input 
                                type="text" 
                                placeholder="Question"
                                className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold"
                                value={typeof faq === 'string' ? faq : faq.question}
                                onChange={(e) => {
                                  const next = [...data.faqs];
                                  if (typeof faq === 'string') {
                                    next[idx] = { question: e.target.value, answer: '' };
                                  } else {
                                    next[idx].question = e.target.value;
                                  }
                                  setDraftData({ ...data, faqs: next });
                                }}
                              />
                              <ConfirmButton 
                                onClick={() => {
                                  const next = data.faqs.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, faqs: next });
                                }}
                                className="p-2 text-red-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                            </div>
                            <textarea 
                              placeholder="Answer"
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs h-20"
                              value={typeof faq === 'string' ? '' : faq.answer}
                              onChange={(e) => {
                                const next = [...data.faqs];
                                if (typeof faq === 'string') {
                                  next[idx] = { question: faq, answer: e.target.value };
                                } else {
                                  next[idx].answer = e.target.value;
                                }
                                setDraftData({ ...data, faqs: next });
                              }}
                            />
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, faqs: [...(data.faqs || []), { question: 'New Question', answer: 'Detailed response here.' }] })}
                          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs"
                        >
                          <Plus className="w-4 h-4" /> Add FAQ Entry Blueprint
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Pricing' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-[#000080]" /> Tiered Pricing Models
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">Configure flexible engagement & pricing structures for this service.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-semibold text-slate-700">Show Pricing Section</label>
                          <ConfirmButton
                            onClick={() => setDraftData({ ...data, hidePricing: !data.hidePricing })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${!data.hidePricing ? 'bg-[#000080]' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${!data.hidePricing ? 'translate-x-6' : 'translate-x-1'}`} />
                          </ConfirmButton>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(data.pricing || []).map((plan: any, idx: number) => (
                          <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 relative">
                            <ConfirmButton 
                              onClick={() => {
                                const next = data.pricing.filter((_: any, i: number) => i !== idx);
                                setDraftData({ ...data, pricing: next });
                              }}
                              className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Plan Name</label>
                              <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                                value={plan.name}
                                onChange={(e) => {
                                  const next = [...data.pricing];
                                  next[idx].name = e.target.value;
                                  setDraftData({ ...data, pricing: next });
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Price ($)</label>
                                <input 
                                  type="text"
                                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold"
                                  value={plan.price}
                                  onChange={(e) => {
                                    const next = [...data.pricing];
                                    next[idx].price = e.target.value;
                                    setDraftData({ ...data, pricing: next });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Period</label>
                                <input 
                                  type="text"
                                  placeholder="month / project"
                                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs"
                                  value={plan.period}
                                  onChange={(e) => {
                                    const next = [...data.pricing];
                                    next[idx].period = e.target.value;
                                    setDraftData({ ...data, pricing: next });
                                  }}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Included Features</label>
                              <div className="space-y-1.5">
                                {(plan.features || []).map((feat: string, fidx: number) => (
                                  <div key={fidx} className="flex items-center gap-1">
                                    <input 
                                      type="text"
                                      className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 text-[11px]"
                                      value={feat}
                                      onChange={(e) => {
                                        const next = [...data.pricing];
                                        next[idx].features[fidx] = e.target.value;
                                        setDraftData({ ...data, pricing: next });
                                      }}
                                    />
                                    <ConfirmButton 
                                      onClick={() => {
                                        const next = [...data.pricing];
                                        next[idx].features = next[idx].features.filter((_: any, i: number) => i !== fidx);
                                        setDraftData({ ...data, pricing: next });
                                      }}
                                      className="text-red-300 hover:text-red-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </ConfirmButton>
                                  </div>
                                ))}
                                <ConfirmButton 
                                  onClick={() => {
                                    const next = [...data.pricing];
                                    next[idx].features = [...(next[idx].features || []), 'New Plan Feature'];
                                    setDraftData({ ...data, pricing: next });
                                  }}
                                  className="text-[10px] font-bold text-[#000080] flex items-center gap-1 mt-1"
                                >
                                  <Plus className="w-3 h-3" /> Add Feature Point
                                </ConfirmButton>
                              </div>
                            </div>
                          </div>
                        ))}
                        <ConfirmButton 
                          onClick={() => setDraftData({ ...data, pricing: [...(data.pricing || []), { name: 'Growth', price: '4,999', period: 'project', features: ['Dedicated Team', '24/7 SLA'] }] })}
                          className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-slate-400 hover:text-[#000080] transition-all gap-2 min-h-[250px]"
                        >
                          <Plus className="w-8 h-8" />
                          <span className="text-xs font-bold">Add Pricing Plan</span>
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                )}

                {templateSubTab === 'Dynamic Feeds' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 space-y-6">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1">
                          <Rss className="w-4 h-4 text-[#000080]" /> Dynamic Content Feeds Integration
                        </h4>
                        <p className="text-xs text-slate-500">Automatically connect this template to your Portfolio Case Studies & Blog Articles.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Portfolio Feed Box */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-slate-900">Portfolio Feed (Case Studies)</h5>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox"
                                className="sr-only peer"
                                checked={data.portfolioFeed?.enabled !== false}
                                onChange={(e) => setDraftData({ 
                                  ...data, 
                                  portfolioFeed: { ...(data.portfolioFeed || {}), enabled: e.target.checked } 
                                })}
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#000080]"></div>
                            </label>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Max Case Studies to Display</label>
                            <input 
                              type="number"
                              min={1}
                              max={12}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={data.portfolioFeed?.limit || 3}
                              onChange={(e) => setDraftData({
                                ...data,
                                portfolioFeed: { ...(data.portfolioFeed || {}), limit: parseInt(e.target.value) || 3 }
                              })}
                            />
                          </div>
                        </div>

                        {/* Blog Feed Box */}
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-slate-900">Blog Feed (Resource Insights)</h5>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox"
                                className="sr-only peer"
                                checked={data.blogFeed?.enabled !== false}
                                onChange={(e) => setDraftData({ 
                                  ...data, 
                                  blogFeed: { ...(data.blogFeed || {}), enabled: e.target.checked } 
                                })}
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#000080]"></div>
                            </label>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Max Blog Posts to Display</label>
                            <input 
                              type="number"
                              min={1}
                              max={12}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold"
                              value={data.blogFeed?.limit || 3}
                              onChange={(e) => setDraftData({
                                ...data,
                                blogFeed: { ...(data.blogFeed || {}), limit: parseInt(e.target.value) || 3 }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* CAREERS TEMPLATE FORMS */}
                {templateSubTab === 'Positions & Offers' && isCareersTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Job Positions & Career Offers</h4>
                        <p className="text-xs text-slate-500">Manage the active career openings and job offers displayed on the Careers template.</p>
                      </div>
                      <ConfirmButton
                        onClick={() => {
                          const newPos = {
                            id: `pos-${Date.now()}`,
                            title: "New Role Title",
                            location: "United States, Remote",
                            department: "Design & UX",
                            type: "Full-time",
                            description: "Describe responsibilities, requirements, and key skills...",
                            active: true
                          };
                          setDraftData({
                            ...data,
                            positions: [...(data.positions || []), newPos]
                          });
                        }}
                        className="bg-[#000080] hover:bg-[#000066] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add Position
                      </ConfirmButton>
                    </div>

                    <div className="space-y-4">
                      {(data.positions || []).map((pos: any, idx: number) => (
                        <div key={pos.id || idx} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-[#000080] bg-[#000080]/10 px-2.5 py-1 rounded-md">
                              Role #{idx + 1}
                            </span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                <input 
                                  type="checkbox"
                                  checked={pos.active !== false}
                                  onChange={(e) => {
                                    const next = [...(data.positions || [])];
                                    next[idx].active = e.target.checked;
                                    setDraftData({ ...data, positions: next });
                                  }}
                                  className="accent-[#000080] w-4 h-4"
                                />
                                Active
                              </label>
                              <ConfirmButton
                                onClick={() => {
                                  const next = data.positions.filter((_: any, i: number) => i !== idx);
                                  setDraftData({ ...data, positions: next });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                                title="Remove position"
                              >
                                <Trash2 className="w-4 h-4" />
                              </ConfirmButton>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Job Title</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                value={pos.title || ''}
                                onChange={(e) => {
                                  const next = [...(data.positions || [])];
                                  next[idx].title = e.target.value;
                                  setDraftData({ ...data, positions: next });
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Location</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                                value={pos.location || ''}
                                onChange={(e) => {
                                  const next = [...(data.positions || [])];
                                  next[idx].location = e.target.value;
                                  setDraftData({ ...data, positions: next });
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Department</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                                value={pos.department || ''}
                                onChange={(e) => {
                                  const next = [...(data.positions || [])];
                                  next[idx].department = e.target.value;
                                  setDraftData({ ...data, positions: next });
                                }}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employment Type</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                                value={pos.type || ''}
                                onChange={(e) => {
                                  const next = [...(data.positions || [])];
                                  next[idx].type = e.target.value;
                                  setDraftData({ ...data, positions: next });
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">External Apply URL (Optional)</label>
                              <input 
                                type="text"
                                placeholder="Leave blank for standard resume popup"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                                value={pos.applyUrl || ''}
                                onChange={(e) => {
                                  const next = [...(data.positions || [])];
                                  next[idx].applyUrl = e.target.value;
                                  setDraftData({ ...data, positions: next });
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Role Description</label>
                            <textarea 
                              rows={2}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-normal"
                              value={pos.description || ''}
                              onChange={(e) => {
                                const next = [...(data.positions || [])];
                                next[idx].description = e.target.value;
                                setDraftData({ ...data, positions: next });
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {templateSubTab === 'Hero Header' && isCareersTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subheading (Eyebrow)</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                        placeholder="e.g. CAREERS & OFFERS"
                        value={data.hero?.subheading || data.hero?.badgeText || ''}
                        onChange={(e) => setDraftData({ ...data, hero: { ...(data.hero || {}), subheading: e.target.value, badgeText: e.target.value } })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Heading Title</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                        value={data.hero?.title || ''}
                        onChange={(e) => setDraftData({ ...data, hero: { ...(data.hero || {}), title: e.target.value } })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Subtitle (Secondary Heading)</label>
                      <input 
                        type="text" 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                        placeholder="e.g. Join our global engineering team"
                        value={data.hero?.subtitle || ''}
                        onChange={(e) => setDraftData({ ...data, hero: { ...(data.hero || {}), subtitle: e.target.value } })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Hero Description Paragraph</label>
                      <textarea 
                        rows={4}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-normal"
                        value={data.hero?.description || data.hero?.subtitle || ''}
                        onChange={(e) => setDraftData({ ...data, hero: { ...(data.hero || {}), description: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {templateSubTab === 'Culture & Values' && isCareersTemplate && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Section Main Title</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                          value={data.culture?.title || ''}
                          onChange={(e) => setDraftData({ ...data, culture: { ...(data.culture || {}), title: e.target.value } })}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Background Overlay Image URL</label>
                        <input 
                          type="text" 
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono"
                          value={data.culture?.bgImage || ''}
                          onChange={(e) => setDraftData({ ...data, culture: { ...(data.culture || {}), bgImage: e.target.value } })}
                        />
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-200">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Culture Cards</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {(data.culture?.items || []).map((item: any, idx: number) => (
                          <div key={item.id || idx} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
                            <span className="text-[10px] font-bold text-[#000080]">Card 0{idx + 1}</span>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title</label>
                              <input 
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                                value={item.title || ''}
                                onChange={(e) => {
                                  const nextItems = [...(data.culture?.items || [])];
                                  nextItems[idx].title = e.target.value;
                                  setDraftData({ ...data, culture: { ...(data.culture || {}), items: nextItems } });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
                              <textarea 
                                rows={3}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-normal"
                                value={item.description || ''}
                                onChange={(e) => {
                                  const nextItems = [...(data.culture?.items || [])];
                                  nextItems[idx].description = e.target.value;
                                  setDraftData({ ...data, culture: { ...(data.culture || {}), items: nextItems } });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 shadow-sm text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Settings className="w-10 h-10 text-slate-300 animate-pulse" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Select or Create a Template Blueprint</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Choose a template blueprint from the left column to customize its global default structure and pre-populated content.
              </p>
            </div>
          )}
        </div>
      </div>
      {/* Full Screen Interactive Template Preview Modal */}
      {isFullScreenPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col animate-in fade-in duration-200">
          <div className="bg-slate-900 border-b border-slate-800 text-white px-6 py-3.5 flex items-center justify-between shrink-0 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#000080] text-teal-400 flex items-center justify-center font-bold border border-white/10">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Template Live Preview: <span className="text-teal-300">{selectedTemplate?.name}</span>
                </h3>
                <p className="text-[10px] text-slate-400">Viewing real-time rendered template in preview mode</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Device Mode Switcher */}
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
                <ConfirmButton 
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                    previewDevice === 'desktop' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </ConfirmButton>
                <ConfirmButton 
                  type="button"
                  onClick={() => setPreviewDevice('tablet')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                    previewDevice === 'tablet' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Tablet className="w-3.5 h-3.5" /> Tablet
                </ConfirmButton>
                <ConfirmButton 
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all",
                    previewDevice === 'mobile' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
                  )}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </ConfirmButton>
              </div>

              <ConfirmButton 
                type="button"
                onClick={() => setIsFullScreenPreview(false)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700"
                title="Exit Preview Modal"
              >
                <X className="w-5 h-5" />
              </ConfirmButton>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950">
            {renderTemplatePreview(selectedTemplate, data, previewDevice)}
          </div>
        </div>
      )}

      
    </div>
  );
}
