import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  Clock,
  Cookie,
  Copy,
  CreditCard,
  FileText,
  HelpCircle,
  Lock,
  Mail,
  Printer,
  Scale,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';
import { resolveSiteSettings } from '../lib/siteSettings';

const FALLBACK_PAYMENT_BODY = `<p>This Payment Policy explains how ProFox handles project pricing, payment milestones, third-party costs, scope changes, quotation acceptance, payment authorization, refunds, cancellations, and payment adjustments.</p>
<p>This policy works together with your approved quotation, Statement of Work (“SOW”), service agreement, and the ProFox Terms &amp; Conditions.</p>
<p>Your approved quotation or written agreement remains the primary source of truth for the specific project scope, investment, payment schedule, milestones, deliverables, exclusions, and any project-specific commercial terms.</p>
<p>Our goal is simple: you should understand <strong>what you are paying, when payment is due, what the payment covers, and what happens if the project changes or is cancelled.</strong></p>

<h3 id="approved-price-scope">1. Approved Price &amp; Scope</h3>
<p>Professional-service fees are confirmed in your approved quotation, Statement of Work, or service agreement.</p>
<p>The final project investment is based on the agreed:</p>
<ul>
  <li>Scope of work;</li><li>Deliverables;</li><li>Requirements;</li><li>Exclusions;</li><li>Functionality;</li><li>Integrations;</li><li>Timeline;</li><li>Project responsibilities; and</li><li>Other commercial terms.</li>
</ul>
<p>The approved quotation or agreement takes priority over general package prices, estimates, or starting prices displayed elsewhere on the ProFox website.</p>

<h3 id="payment-schedule">2. Payment Schedule &amp; Milestones</h3>
<p>Payments are due according to the schedule stated in the approved quotation, Statement of Work, or service agreement.</p>
<p>Depending on the project, payments may be divided across agreed stages or delivery milestones.</p>
<p>Where an initial payment is required, the project normally enters the applicable onboarding and delivery process after that payment has been successfully received and confirmed.</p>
<p>Each quotation should clearly identify, where applicable:</p>
<ul>
  <li>Total project investment;</li><li>Currency;</li><li>Initial payment;</li><li>Remaining balance;</li><li>Payment milestones;</li><li>Amount due at each milestone; and</li><li>Applicable payment timing.</li>
</ul>

<h3 id="third-party-costs">3. Third-Party Costs</h3>
<p>Third-party products and services are separate from ProFox professional-service fees unless the approved quotation specifically states that they are included.</p>
<p>Third-party costs may include:</p>
<ul>
  <li>Domain registration;</li><li>Hosting;</li><li>Premium plugins;</li><li>Themes;</li><li>Third-party applications;</li><li>SaaS subscriptions;</li><li>Stock photography;</li><li>Video or audio assets;</li><li>Fonts;</li><li>API usage;</li><li>Software licences;</li><li>Application-store charges;</li><li>Payment-provider charges;</li><li>Advertising-platform costs; and</li><li>Other external services required for the project.</li>
</ul>
<p>Where reasonably possible, required third-party costs will be identified before approval.</p>
<p>Third-party providers operate under their own billing, renewal, cancellation, and refund policies.</p>

<h3 id="changes-charges">4. Changes &amp; Additional Charges</h3>
<p>Requests outside the approved scope are discussed before additional work or charges are authorized.</p>
<p>ProFox does not intentionally add an out-of-scope charge to an approved project without first communicating the change and obtaining the required approval.</p>
<p>Where a requested change affects project price, timeline, deliverables, functionality, integrations, content, design requirements, technical requirements, third-party costs, or project responsibilities, ProFox may issue an updated quotation, change request, additional scope document, or other written amendment before the additional work begins.</p>

<h3 id="quotation-acceptance">5. Quotation Acceptance</h3>
<p>Accepting a ProFox quotation confirms that the customer has had the opportunity to review the quotation and its applicable commercial terms, including:</p>
<ul>
  <li>Project scope;</li><li>Deliverables;</li><li>Exclusions;</li><li>Total investment;</li><li>Payment schedule;</li><li>Applicable milestones;</li><li>Terms &amp; Conditions; and</li><li>This Payment Policy.</li>
</ul>
<p>For quotations accepted through the ProFox digital quotation system, ProFox may maintain an audit record of the acceptance. This may include the quotation number, quotation revision, customer name, customer email, acceptance date and time, applicable Terms &amp; Conditions version, and applicable Payment Policy version.</p>

<h3 id="payment-authorization">6. Payment Authorization</h3>
<p>Accepting a quotation or agreeing to this Payment Policy does <strong>not</strong> by itself authorize ProFox to debit a card, bank account, or other payment method.</p>
<p>Actual payment authorization occurs separately through the applicable secure checkout, payment provider, payment link, bank transfer, invoice payment method, or other approved payment process.</p>
<p>Payment credentials submitted directly to a third-party payment provider are handled according to that provider's own security, privacy, and payment terms.</p>

<h2 id="refund-policy">Refund, Cancellation &amp; Payment Adjustment Policy</h2>
<p>Because ProFox provides custom professional services involving strategy, research, planning, content creation, design, development, technical configuration, integrations, project management, and dedicated team resources, refund eligibility depends significantly on <strong>whether work has started and what work has already been performed or committed.</strong></p>

<h3 id="refund-before-work">7. Full Refund Before Work Begins</h3>
<p>If a customer makes a payment and then decides to cancel the project <strong>before ProFox has started substantive project work</strong>, the applicable ProFox professional-service payment will be eligible for a full refund.</p>
<p>For example, if the customer makes the initial payment and contacts ProFox shortly afterward, before the team has started onboarding review, research, content creation, design, development, technical setup, or other substantive project work, the applicable ProFox service payment may be refunded in full.</p>
<p>Simply making a payment does not by itself mean that project work has started.</p>

<h3 id="project-started">8. When Is a Project Considered Started?</h3>
<p>For refund purposes, a project is considered started once ProFox begins substantive work connected with the approved project.</p>
<p>This may include one or more of the following:</p>
<ul>
  <li>Reviewing or processing a completed onboarding form;</li><li>Reviewing the customer project brief;</li><li>Conducting a kickoff or discovery session;</li><li>Conducting strategy or project-planning work;</li><li>Reviewing customer-supplied content, files, brand assets, requirements, systems, or technical information;</li><li>Performing market research;</li><li>Performing competitor research;</li><li>Performing keyword or audience research;</li><li>Performing technical research;</li><li>Creating a sitemap or information architecture;</li><li>Creating user flows;</li><li>Preparing project specifications;</li><li>Creating content strategy;</li><li>Writing or editing website or application content;</li><li>Copywriting;</li><li>Preparing wireframes;</li><li>Creating mood boards or design concepts;</li><li>UI/UX design;</li><li>Prototype creation;</li><li>Graphic or visual-asset creation;</li><li>Beginning website development;</li><li>Beginning web or mobile application development;</li><li>Database development;</li><li>API development or integration;</li><li>Automation development;</li><li>Setting up project-specific development environments;</li><li>Creating staging environments;</li><li>Setting up repositories;</li><li>Configuring project-specific databases;</li><li>Technical configuration;</li><li>Migration work;</li><li>Testing;</li><li>Integration work; or</li><li>Any other substantive deliverable specifically required by the approved project.</li>
</ul>

<h3 id="initial-payment">9. Initial Payment After Work Has Started</h3>
<p>Once substantive project work has started, the <strong>initial project payment becomes non-refundable for a customer-initiated cancellation or change of mind</strong>, except where a refund is required by applicable law or another applicable written agreement expressly provides otherwise.</p>
<p>The initial payment supports the first stage of the engagement and may cover work such as onboarding, requirement analysis, discovery, strategy, research, project planning, content strategy, content creation, copywriting, UI/UX planning, design, technical architecture, development preparation, development, technical configuration, project management, internal reviews, and team resources allocated specifically to the project.</p>
<p>Once this work begins, the initial payment is therefore not treated merely as an unused deposit. It represents payment toward professional services that ProFox has begun providing for the customer.</p>

<h3 id="change-of-mind">10. Customer Change of Mind After Work Begins</h3>
<p>A refund is not normally available from the initial payment simply because the customer changes their mind after work has started.</p>
<p>Examples include situations where the customer:</p>
<ul>
  <li>No longer wishes to continue the project;</li><li>Decides to use another provider;</li><li>Changes business priorities;</li><li>Decides to close, pause, or change the business;</li><li>Changes internal management;</li><li>Changes decision-makers;</li><li>Experiences a change in available budget;</li><li>Delays providing required information;</li><li>Delays approvals;</li><li>No longer requires part of the originally approved service; or</li><li>Decides not to proceed for another customer-controlled reason.</li>
</ul>
<p>This applies to amounts covering work that has already been started, performed, committed, or otherwise earned.</p>
<p>Nothing in this section removes any non-waivable rights or remedies that may apply under applicable law.</p>

<h3 id="cancellation-after-start">11. Cancellation After Work Has Started</h3>
<p>A customer may request cancellation after the project has started. However, cancellation does not automatically mean that every amount previously paid will be refunded.</p>
<h4>Initial Payment</h4>
<p>Once substantive project work has started, the initial payment remains non-refundable for customer-initiated cancellation or change of mind, subject to applicable law.</p>
<h4>Completed Milestones</h4>
<p>Payments relating to completed work or completed milestones are non-refundable.</p>
<h4>Milestones Currently in Progress</h4>
<p>Where a payment covers a milestone that has already begun, ProFox will review work completed, professional time used, deliverables produced, resources allocated, third-party commitments, project-specific costs, and other reasonable commitments already made. Any possible refund or adjustment will be determined after that review.</p>
<h4>Future Milestones Not Started</h4>
<p>Where the customer has already paid specifically for a future milestone that ProFox has <strong>not started</strong>, that payment may be eligible for a full or partial refund.</p>
<p>Any approved adjustment may take into account authorised non-recoverable costs already incurred specifically for the project.</p>
<p>The objective is that customers pay for professional services that have actually been performed, started, committed, or earned, while ProFox does not unnecessarily retain payment for future professional work that has not started.</p>

<h3 id="payment-adjustments">12. Payment Adjustments</h3>
<p>Some payment issues may require correction rather than cancellation of the project.</p>
<p>ProFox will review reasonable requests involving duplicate payments, accidental overpayments, incorrect payment amounts, payments applied to the wrong invoice or quotation, approved credits, approved scope reductions, or other confirmed payment-processing errors.</p>
<p>Where an adjustment is verified, ProFox may issue a refund, account credit, payment correction, revised balance, or adjustment against a future or outstanding project payment.</p>

<h3 id="third-party-refunds">13. Third-Party Refunds</h3>
<p>Third-party products and services are governed by the cancellation and refund terms of the relevant third-party provider.</p>
<p>Examples include domains, hosting, plugins, themes, SaaS subscriptions, software licences, stock media, fonts, APIs, payment-provider fees, application-store charges, advertising platforms, and other third-party products or services purchased for the project.</p>
<p>If a third-party purchase is refundable and ProFox successfully receives the refund from that provider, the recovered amount can be passed through or appropriately accounted for for the customer.</p>
<p>If the third-party provider does not permit a refund, ProFox cannot guarantee or independently fund that refund on the provider's behalf.</p>

<h3 id="profox-cannot-continue">14. If ProFox Cannot Continue the Project</h3>
<p>Customer-initiated cancellation is different from a situation where ProFox cannot provide the agreed service.</p>
<p>If ProFox cancels a project for reasons attributable to ProFox and cannot provide professional services for which the customer has already paid, ProFox will review the unperformed portion of the paid service.</p>
<p>Any amount properly attributable to professional services that have not been performed may be refunded, credited, or otherwise resolved with the customer, subject to the applicable agreement and applicable law.</p>
<p>Completed work, accepted work, authorised third-party purchases, and reasonable non-recoverable project costs may be taken into account when determining the appropriate adjustment.</p>

<h3 id="service-problems">15. Problems With the Service</h3>
<p>The non-refundable provisions in this policy primarily address <strong>customer-initiated cancellation or change of mind after work has begun</strong>.</p>
<p>They are not intended to prevent a customer from raising a legitimate concern where ProFox failed to provide an agreed service, the service materially fails to meet applicable contractual requirements, there is a confirmed billing or payment error, or applicable law gives the customer a remedy.</p>
<p>Customers should contact ProFox and provide reasonable details of the issue.</p>
<p>Depending on the circumstances, ProFox may investigate the concern, correct the work, complete outstanding agreed work, provide an agreed replacement, provide a payment adjustment, issue a credit, provide a partial or full refund where appropriate, or apply another remedy required under the agreement or applicable law.</p>

<h3 id="request-refund">16. How to Request a Cancellation, Refund or Payment Adjustment</h3>
<p>Cancellation, refund, or payment-adjustment requests should be submitted in writing through an official ProFox communication channel or to an authorised ProFox representative.</p>
<p>The request should include enough information to identify the relevant transaction, such as:</p>
<ul>
  <li>Customer name;</li><li>Company name, if applicable;</li><li>Quotation number;</li><li>Project number;</li><li>Invoice number;</li><li>Payment reference;</li><li>Payment date;</li><li>Amount paid; and</li><li>Reason for the request.</li>
</ul>
<p>ProFox will review relevant information including project status, onboarding status, work completed, active milestone, deliverables produced, team work already performed, third-party commitments, payment records, quotation terms, and the applicable agreement.</p>
<p>Submitting a refund request does not automatically mean that the payment qualifies for a refund.</p>

<h3 id="approved-refunds">17. Approved Refunds</h3>
<p>When a refund is approved, ProFox will normally return the payment through the original payment method where reasonably possible.</p>
<p>Where this is not practical, another mutually agreed payment method may be used.</p>
<p>The time required for an approved refund to appear in the customer's account may depend on payment-provider processing, banking systems, card networks, currency conversion, international transfers, or other systems outside ProFox's direct control.</p>
<p>ProFox may maintain appropriate records relating to refunds, credits, reversals, or payment adjustments for accounting, reconciliation, compliance, dispute-resolution, and other legitimate business purposes.</p>

<h3 id="failed-payments">18. Failed, Pending or Unconfirmed Payments</h3>
<p>A payment is considered successfully received only after it has been confirmed through the applicable payment provider or payment method.</p>
<p>A payment attempt that is declined, cancelled, failed, reversed, incomplete, pending, or otherwise unconfirmed may not satisfy the applicable payment milestone.</p>
<p>If a customer believes money has been deducted but the payment has not been confirmed by ProFox, the customer should provide the applicable payment or transaction reference so the payment can be investigated.</p>

<h3 id="payment-records">19. Payment Records &amp; Receipts</h3>
<p>ProFox may maintain records reasonably necessary for payment confirmation, invoicing, receipts, reconciliation, accounting, refunds, credits, disputes, fraud prevention, tax obligations, and other legitimate legal or business purposes.</p>
<p>Depending on the applicable payment method, customers may receive a receipt, invoice, payment confirmation, transaction reference, or other financial record from ProFox or the applicable payment provider.</p>

<h3 id="quotation-specific">20. Quotation-Specific Terms</h3>
<p>Some projects may require payment, refund, cancellation, or commercial terms that differ from the general structure described in this Payment Policy.</p>
<p>Where an approved quotation, Statement of Work, or written service agreement contains project-specific payment terms, those project-specific terms apply to that project together with the applicable ProFox Terms &amp; Conditions and this Payment Policy.</p>
<p>Where there is uncertainty, the applicable written project agreement should be reviewed first.</p>

<h3 id="legal-rights">21. Customer Legal Rights</h3>
<p>Nothing in this Payment Policy is intended to exclude, restrict, or override a consumer or customer right that cannot lawfully be excluded.</p>
<p>Where applicable law provides a mandatory cooling-off right, cancellation right, refund right, remedy for deficient services, payment remedy, or other non-waivable protection, that legal requirement will apply regardless of any conflicting provision in this policy.</p>
<p>Where the customer purchases ProFox services primarily for business or commercial purposes, additional contractual terms in the approved quotation, Statement of Work, or service agreement may apply.</p>

<h3 id="questions-before-payment">22. Questions Before Payment</h3>
<p>If any part of the commercial arrangement is unclear, including price, initial payment, payment milestone, scope, third-party cost, refund eligibility, cancellation condition, payment adjustment, or other payment requirement, please contact ProFox <strong>before accepting the quotation or making payment</strong>.</p>
<p>We want every customer to understand the commercial terms before project delivery begins.</p>

<h3 id="refund-summary">Simple Refund Summary</h3>
<ul>
  <li><strong>Payment made + ProFox has not started substantive project work:</strong> the applicable ProFox service payment is eligible for a <strong>full refund</strong>.</li>
  <li><strong>Onboarding reviewed, research started, content created, design started, development started, or other substantive project work has begun:</strong> the <strong>initial payment is non-refundable for customer-initiated cancellation or change of mind</strong>, subject to applicable law.</li>
  <li><strong>Completed milestone:</strong> non-refundable.</li>
  <li><strong>Milestone currently in progress:</strong> reviewed according to work completed, resources used, and costs already committed.</li>
  <li><strong>Future milestone paid but work has not started:</strong> may qualify for a <strong>full or partial refund</strong>, subject to the applicable agreement and authorised non-recoverable costs.</li>
  <li><strong>Third-party purchase:</strong> refund depends on the <strong>third-party provider's own refund policy</strong>.</li>
  <li><strong>Duplicate payment, overpayment, or confirmed payment error:</strong> corrected, credited, or refunded after verification.</li>
  <li><strong>ProFox cannot provide paid-for future services:</strong> unperformed paid services are reviewed for an appropriate refund, credit, or adjustment.</li>
  <li><strong>Legitimate service failure or mandatory statutory refund right:</strong> reviewed separately; this policy does not remove applicable legal rights.</li>
</ul>
<p><strong>ProFox Web Designer / ProFox Digital Solution</strong></p>
<p>This Payment Policy should be read together with the applicable approved quotation, Statement of Work, service agreement, <a href="/terms-and-conditions">ProFox Terms &amp; Conditions</a>, and any project-specific written terms.</p>`;

const TOC_ITEMS = [
  ['approved-price-scope', '1. Approved Price & Scope'],
  ['payment-schedule', '2. Payment Schedule & Milestones'],
  ['third-party-costs', '3. Third-Party Costs'],
  ['changes-charges', '4. Changes & Additional Charges'],
  ['quotation-acceptance', '5. Quotation Acceptance'],
  ['payment-authorization', '6. Payment Authorization'],
  ['refund-before-work', '7. Full Refund Before Work Begins'],
  ['project-started', '8. When Is a Project Considered Started?'],
  ['initial-payment', '9. Initial Payment After Work Has Started'],
  ['change-of-mind', '10. Customer Change of Mind'],
  ['cancellation-after-start', '11. Cancellation After Work Has Started'],
  ['payment-adjustments', '12. Payment Adjustments'],
  ['third-party-refunds', '13. Third-Party Refunds'],
  ['profox-cannot-continue', '14. If ProFox Cannot Continue'],
  ['service-problems', '15. Problems With the Service'],
  ['request-refund', '16. Request a Cancellation or Refund'],
  ['approved-refunds', '17. Approved Refunds'],
  ['failed-payments', '18. Failed or Pending Payments'],
  ['payment-records', '19. Payment Records & Receipts'],
  ['quotation-specific', '20. Quotation-Specific Terms'],
  ['legal-rights', '21. Customer Legal Rights'],
  ['questions-before-payment', '22. Questions Before Payment'],
  ['refund-summary', 'Simple Refund Summary'],
] as const;

function formatEffectiveDate(value?: string) {
  if (!value) return 'September 4, 2026';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function PaymentPolicy() {
  const { content } = useCMS();
  const siteSettings = resolveSiteSettings(content.siteSettings);
  const businessName = siteSettings?.businessName || 'Profox web designer';
  const contactEmail = siteSettings?.contactEmail || 'contact@profox-webdesigner.com';
  const businessAddress = siteSettings?.businessAddress || '';
  const paymentPage = Array.isArray(content.customPages)
    ? content.customPages.find((item: any) => item?.id === 'payment-policy' || item?.slug === 'payment-policy')
    : undefined;

  const bodyHtml = paymentPage?.legalBodyContent || FALLBACK_PAYMENT_BODY;
  const effectiveDate = formatEffectiveDate(paymentPage?.policyVersion || paymentPage?.updatedAt || '2026-09-04');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('approved-price-scope');
  const [copied, setCopied] = useState(false);

  const filteredToc = useMemo(
    () => TOC_ITEMS.filter(([, label]) => label.toLowerCase().includes(searchQuery.toLowerCase())),
    [searchQuery],
  );

  useEffect(() => {
    const title = paymentPage?.seo?.metaTitle || 'Payment Policy | ProFox Web Designer';
    const description = paymentPage?.seo?.metaDescription
      || 'Read the ProFox Payment Policy covering pricing, milestones, refunds, cancellations, third-party costs and payment authorization.';
    document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', paymentPage?.seo?.canonicalUrl || 'https://www.profoxwebdesigner.com/payment-policy');
  }, [paymentPage]);

  useEffect(() => {
    const sections = TOC_ITEMS
      .map(([id]) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
    }, { rootMargin: '-18% 0px -70% 0px', threshold: 0 });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [bodyHtml]);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  };

  const handleCopyText = async () => {
    const holder = document.createElement('div');
    holder.innerHTML = bodyHtml;
    const plainText = `Payment Policy\n\n${holder.innerText}`;
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const navClass = 'flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#000080]/10 selection:text-[#000080]">
      <section className="relative pt-32 pb-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#000080]/5 text-[#000080] text-xs font-bold uppercase tracking-widest border border-[#000080]/10 mb-4">
                <ShieldCheck className="w-4 h-4" /> {paymentPage?.heroSubheading || 'PAYMENT POLICY'}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-tight">
                Payment Policy
              </h1>
              <p className="text-xl font-bold text-[#000080] mt-3">
                {paymentPage?.heroTitle || 'Clear Payment Terms Before Work Begins'}
              </p>
              <p className="text-lg text-slate-600 mt-4 max-w-2xl leading-relaxed">
                {paymentPage?.heroSubtitle || 'How ProFox confirms project pricing, payment milestones, third-party costs, scope changes, refunds, cancellations, and payment authorization.'}
              </p>
              <div className="mt-6 print:hidden"><HeroReviewProof /></div>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0 print:hidden">
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-300"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#000080]/20"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-100 print:hidden">
            <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <Link to="/privacy-policy" className={`${navClass} text-slate-600 hover:text-slate-900 hover:bg-slate-200/50`}>
                <Lock className="w-4 h-4" /><span>Privacy Policy</span>
              </Link>
              <Link to="/terms-and-conditions" className={`${navClass} text-slate-600 hover:text-slate-900 hover:bg-slate-200/50`}>
                <Scale className="w-4 h-4" /><span>Terms &amp; Conditions</span>
              </Link>
              <Link to="/cookie-policy" className={`${navClass} text-slate-600 hover:text-slate-900 hover:bg-slate-200/50`}>
                <Cookie className="w-4 h-4" /><span>Cookie Policy</span>
              </Link>
              <Link to="/payment-policy" aria-current="page" className={`${navClass} bg-white text-[#000080] shadow-sm border border-slate-200`}>
                <CreditCard className="w-4 h-4" /><span>Payment Policy</span>
              </Link>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Effective Date: <strong>{effectiveDate}</strong></span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <aside className="lg:col-span-3 print:hidden">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5 sticky top-28 max-h-[calc(100vh-8rem)] flex flex-col">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Search Document</h3>
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} className="text-[10px] text-slate-400 hover:text-[#000080] font-semibold">Clear</button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Filter topics..."
                      aria-label="Filter payment policy topics"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3.5 flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#000080]" /><span>Document Headings</span>
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{filteredToc.length}</span>
                  </div>
                  <div className="overflow-y-auto max-h-[280px] lg:max-h-[340px] pr-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    {filteredToc.length ? filteredToc.map(([id, label]) => {
                      const isActive = activeSection === id;
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => scrollToSection(id)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between group ${isActive ? 'bg-[#000080] text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'}`}
                        >
                          <span className="truncate pr-2">{label}</span>
                          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'text-white translate-x-0.5' : 'text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5'}`} />
                        </button>
                      );
                    }) : (
                      <div className="py-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">No matching headings found</div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3.5">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Key Highlights</h3>
                  <ul className="space-y-2 text-[11px] font-semibold text-slate-700">
                    {[
                      'Full service refund before substantive work begins',
                      'Initial payment covers work once substantive work starts',
                      'Third-party refunds follow provider rules',
                      'Mandatory legal rights remain protected',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <div className="w-3.5 h-3.5 mt-0.5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                        </div>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-[#000080]/5 p-3.5 rounded-2xl border border-[#000080]/10 space-y-1.5 relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-[#000080]/10 rounded-full blur-xl group-hover:scale-150 transition-all duration-500" />
                  <div className="flex items-center gap-2 text-xs font-bold text-[#000080]">
                    <HelpCircle className="w-4 h-4" /><span>Payment or Legal Questions?</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Contact ProFox before accepting a quotation or making payment at <a href={`mailto:${contactEmail}`} className="text-[#000080] font-bold hover:underline">{contactEmail}</a>
                  </p>
                </div>
              </div>
            </aside>

            <main id="payment-policy-document" className="lg:col-span-9 print:col-span-12 bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-sm print:shadow-none print:border-0 print:p-0">
              <div
                className="space-y-6 text-slate-700 leading-relaxed text-sm font-sans
                  [&>h2]:text-2xl [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:tracking-tight [&>h2]:pt-10 [&>h2]:mt-10 [&>h2]:border-t [&>h2]:border-slate-200 [&>h2]:scroll-mt-32
                  [&>h3]:text-xl [&>h3]:font-bold [&>h3]:text-slate-900 [&>h3]:tracking-tight [&>h3]:pt-8 [&>h3]:border-t [&>h3]:border-slate-100 [&>h3]:first:border-t-0 [&>h3]:first:pt-0 [&>h3]:scroll-mt-32
                  [&>h4]:text-base [&>h4]:font-bold [&>h4]:text-slate-900 [&>h4]:pt-4
                  [&>p]:text-slate-600 [&>p]:leading-relaxed
                  [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:text-slate-600
                  [&_strong]:font-bold [&_strong]:text-slate-800
                  [&_a]:text-[#000080] [&_a]:font-semibold [&_a]:underline hover:[&_a]:text-[#000066]"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />

              <div className="mt-12 pt-8 border-t border-slate-200 bg-slate-50 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 print:hidden">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Payment &amp; Contract Questions</h4>
                  <p className="text-xs text-slate-500 mt-1">{businessName}{businessAddress ? ` • ${businessAddress}` : ''}</p>
                </div>
                <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all shadow-md shrink-0">
                  <Mail className="w-4 h-4" /><span>Contact ProFox</span>
                </a>
              </div>
            </main>
          </div>
        </div>
      </section>
    </div>
  );
}
