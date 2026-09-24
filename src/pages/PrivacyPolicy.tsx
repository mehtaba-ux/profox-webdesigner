import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  FileText, 
  Cookie, 
  Lock, 
  Eye, 
  UserCheck, 
  Database, 
  Scale, 
  CheckCircle, 
  Search, 
  Printer, 
  Copy, 
  Check, 
  Mail, 
  Building2, 
  ChevronRight,
  HelpCircle,
  Clock,
  Globe,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';
import { resolveSiteSettings } from '../lib/siteSettings';

interface PrivacyPolicyProps {
  defaultTab?: 'privacy' | 'terms' | 'cookies';
  page?: any;
}

export default function PrivacyPolicy({ defaultTab, page }: PrivacyPolicyProps) {
  const { isAdminOrEditor } = useAuth();
  const { content } = useCMS();
  const location = useLocation();
  const navigate = useNavigate();

  const siteSettings = resolveSiteSettings(content.siteSettings);
  const businessName = siteSettings?.businessName || 'Profox web designer';
  const contactEmail = siteSettings?.contactEmail || 'contact@profox-webdesigner.com';
  const websiteUrl = siteSettings?.website || 'https://profox-webdesigner.com';
  const supportEmail = siteSettings?.supportEmail || 'support@profox-webdesigner.com';
  const securityContact = siteSettings?.securityContact || 'privacy@profox-webdesigner.com';
  const businessAddress = siteSettings.businessAddress;

  const defaultCookiesBody = `<h3 id="about-cookies">1. About This Policy</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. ${businessName} uses this Policy together with its Privacy Policy. The live Cookie Settings panel should provide the current technology-level details.</p>
<p>This Cookie Policy explains how ${businessName} may use cookies, pixels, tags, scripts, local storage, software-development kits, and similar technologies on websites and online services that ${businessName} controls. These technologies may store information on, or access information from, a visitor's browser or device.</p>
<p>This Policy should be read with the ${businessName} Privacy Policy, which explains the broader collection, use, sharing, retention, security, and rights associated with personal data.</p>

<h3 id="what-are-cookies">2. What Cookies and Similar Technologies Are</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Cookies are small files or identifiers that help websites remember information and operate features.</p>
<ul>
  <li><strong>Cookies:</strong> small text files saved by a website through a browser;</li>
  <li><strong>Pixels and tags:</strong> small pieces of code that can record when a page, message, or feature is viewed or used;</li>
  <li><strong>Local or session storage:</strong> browser storage used to remember settings, content, or session information;</li>
  <li><strong>Scripts and software-development kits:</strong> code used to provide functions, measure performance, or connect third-party services; and</li>
  <li><strong>Similar technologies:</strong> device identifiers, link information, and other storage or access methods that perform related functions.</li>
</ul>
<p>A session cookie normally expires when the browser session ends. A persistent cookie remains until its stated expiry date or until it is deleted. A technology may be set directly by ${businessName} (first party) or by an external service used on the website (third party).</p>

<h3 id="where-applies">3. Where This Policy Applies</h3>
<p>This Policy applies to ${businessName}-controlled websites, landing pages, enquiry forms, scheduling pages, client portals, and other online pages that link to it. It does not govern a Client's website or application merely because ${businessName} designed, developed, hosts, maintains, or supports it. Each Client remains responsible for the cookies and tracking technologies used for its own purposes unless a written agreement states otherwise.</p>
<p>Third-party websites reached through a link from a ${businessName} page operate under their own terms and privacy notices.</p>

<h3 id="categories">4. Cookie Categories</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Non-essential technologies should remain off until the visitor makes the required choice, unless applicable law expressly permits a particular use without consent.</p>
<table class="w-full border-collapse my-6">
  <thead>
    <tr class="border-b-2 border-slate-200">
      <th class="text-left p-3 font-bold text-slate-900">Category</th>
      <th class="text-left p-3 font-bold text-slate-900">Typical purpose</th>
      <th class="text-left p-3 font-bold text-slate-900">Examples</th>
      <th class="text-left p-3 font-bold text-slate-900">Default choice</th>
    </tr>
  </thead>
  <tbody>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Strictly necessary</td>
      <td class="p-3 text-slate-600">Operate requested services, security, network management, form protection, session continuity, consent records, and load balancing.</td>
      <td class="p-3 text-slate-600">Security token, session identifier, load-balancing or consent-preference record.</td>
      <td class="p-3 text-slate-600">Active where legally exempt or necessary.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Functional</td>
      <td class="p-3 text-slate-600">Remember optional settings and enable enhanced features.</td>
      <td class="p-3 text-slate-600">Language, display preference, chat, scheduling, or embedded-media preference.</td>
      <td class="p-3 text-slate-600">Consent or another lawful exception where applicable.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Analytics and performance</td>
      <td class="p-3 text-slate-600">Understand traffic, errors, page performance, popular content, and user journeys so the service can be improved.</td>
      <td class="p-3 text-slate-600">Aggregated visitor measurement, performance monitoring, and error reporting.</td>
      <td class="p-3 text-slate-600">Consent by default; a limited legal exception may apply in some locations and configurations.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Advertising and social media</td>
      <td class="p-3 text-slate-600">Measure campaigns, limit repetition, build audiences, personalise advertising, or connect social-media features.</td>
      <td class="p-3 text-slate-600">Advertising pixels, conversion tags, social plugins, and campaign attribution.</td>
      <td class="p-3 text-slate-600">Used only after required consent or other legally valid permission.</td>
    </tr>
  </tbody>
</table>
<p>A category description does not mean every listed technology is active. The exact tools used depend on the features currently enabled on the relevant ${businessName}-controlled site.</p>

<h3 id="first-third-party">5. First-Party and Third-Party Technologies</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Some website features are delivered by external providers, which may receive device or usage information when enabled.</p>
<p>First-party technologies are set through the ${businessName}-controlled domain. Third-party technologies may be set by providers of analytics, advertising, video, maps, chat, scheduling, forms, security, content delivery, payment, or other embedded services.</p>
<p>Where a third-party feature requires a non-essential cookie or similar technology, ${businessName}'s intended default is to delay it until the visitor provides the required consent. External providers process information under their own terms and privacy notices, and their retention periods and international processing locations may differ.</p>

<h3 id="consent">6. Consent and Legal Basis</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Visitors should receive clear choices before non-essential technologies are activated where consent is required.</p>
<p>Depending on the visitor's location and the technology involved, ${businessName} may rely on consent, a strictly necessary or communications exception, a limited statistical or appearance exception, or another ground permitted by applicable law. Where consent is required:</p>
<ul>
  <li>Non-essential technologies should not be activated before the visitor chooses;</li>
  <li>Consent should be freely given, specific, informed, and indicated by a clear positive action;</li>
  <li>Rejecting non-essential technologies should be as easy as accepting them;</li>
  <li>Visitors should be able to choose by category where practical; and</li>
  <li>Consent may be withdrawn through Cookie Settings without affecting processing completed before withdrawal.</li>
</ul>
<p>Strictly necessary technologies may operate without consent where applicable law permits, because the requested website or security function cannot reasonably work without them. ${businessName} should still describe those technologies clearly.</p>

<h3 id="manage">7. How to Manage Cookie Choices</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Use Cookie Settings in the website footer or cookie banner to review or change available choices.</p>
<ol>
  <li>Open Cookie Settings from the website footer or cookie banner.</li>
  <li>Review the available categories and any listed providers, purposes, and durations.</li>
  <li>Accept, reject, or customise non-essential categories, then save the selection.</li>
  <li>Return to Cookie Settings at any time to change or withdraw the selection.</li>
</ol>
<p>If Cookie Settings are not available on a particular ${businessName}-controlled page, contact ${businessName} using Section 14. Blocking optional technologies may reduce functionality, such as embedded video, chat, scheduling, remembered preferences, or personalised content. Essential website functions should remain available where reasonably possible.</p>

<h3 id="browser">8. Browser Controls</h3>
<p>Most browsers allow visitors to view, delete, block, or limit cookies and site storage. Browser settings vary, so visitors should consult their browser's help documentation. Deleting cookies may remove saved preferences, sign out active sessions, or cause a consent request to appear again. Browser controls may not block every similar technology, such as server-side measurement or device-level features.</p>

<h3 id="dnt">9. Do Not Track and Global Privacy Control</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Browser privacy signals have different legal effects depending on location and ${businessName}'s actual data practices.</p>
<p>Some browsers provide a Do Not Track signal, but there is no single universally adopted response standard. Where applicable law requires recognition of an opt-out preference signal, such as Global Privacy Control, and the relevant ${businessName} practice falls within that law, ${businessName} will treat a valid signal as the applicable opt-out request.</p>
<p>${businessName} does not sell personal data for monetary consideration. If advertising or analytics practices ever constitute regulated 'sale', 'sharing', or targeted advertising under applicable law, ${businessName} will provide the required notice and choice mechanism.</p>

<h3 id="duration">10. Cookie Duration and Retention</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Cookies should last only as long as reasonably necessary for their stated purpose.</p>
<p>Cookie duration may be session-based or persistent. Exact expiry periods depend on the configured technology. ${businessName} should periodically review durations, remove unused technologies, and shorten retention where a longer period is not justified.</p>
<p>Information produced by cookies may be retained separately from the cookie itself. Retention of personal data follows the ${businessName} Privacy Policy, applicable provider settings, contractual requirements, security needs, consent-record requirements, and applicable law.</p>

<h3 id="international-cookies">11. International Visitors</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Profox is incorporated in India and serves visitors and Clients in the USA, UK, Australia, India, and worldwide. Cookie and tracking rules differ by jurisdiction.</p>
<p>${businessName} will apply location-appropriate notice, consent, opt-out, and mandatory-rights requirements where they apply. Information collected through enabled technologies may be processed in India or in countries where ${businessName} or its service providers operate, subject to applicable safeguards described in the Privacy Policy.</p>

<h3 id="children-cookies">12. Children's Privacy</h3>
<p>${businessName}'s business services are intended for adults and authorised representatives of organisations. ${businessName} does not knowingly use advertising technologies to profile children through its own business-service websites. If a ${businessName}-controlled service is intentionally directed to children, ${businessName} will implement age-appropriate information and consent measures required by applicable law.</p>

<h3 id="changes-cookies">13. Changes to This Policy</h3>
<p>${businessName} may update this Cookie Policy when website features, providers, legal requirements, or cookie practices change. The revised version will show a new 'Last updated' date. A material change to non-essential tracking practices may require renewed notice or consent.</p>

<h3 id="contact-cookies">14. Contact Us</h3>
<p>Questions, privacy requests, or concerns about cookies and similar technologies may be sent using the details below.</p>
<table class="w-full border-collapse my-6">
  <tbody>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Business</td>
      <td class="p-3 text-slate-600">${businessName}</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Website</td>
      <td class="p-3 text-slate-600"><a href="${websiteUrl}">${websiteUrl}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Privacy enquiries</td>
      <td class="p-3 text-slate-600"><a href="mailto:${contactEmail}">${contactEmail}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Security and support</td>
      <td class="p-3 text-slate-600"><a href="mailto:${supportEmail}">${supportEmail}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Principal place of business</td>
      <td class="p-3 text-slate-600">India</td>
    </tr>
  </tbody>
</table>

<h3 id="checklist">15. Website Publication Checklist</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Action required. This section is an internal publication check and should be completed before the Policy goes live.</p>
<ul>
  <li>Run a cookie and tracker scan on every ${businessName}-controlled website, landing page, portal, and embedded form;</li>
  <li>Confirm each technology's exact name, provider, purpose, category, first- or third-party status, and expiry period;</li>
  <li>Remove unused tags and classify every remaining technology correctly;</li>
  <li>Configure the banner so non-essential technologies remain blocked until the required choice is made;</li>
  <li>Provide equally clear Accept, Reject Non-Essential, and Customise options where required;</li>
  <li>Add a persistent Cookie Settings link in the footer and test withdrawal of consent;</li>
  <li>Ensure the live cookie register or preference centre displays the current technology-level details;</li>
  <li>Verify that third-party embeds remain blocked until consent where required; and</li>
  <li>Repeat the audit whenever analytics, advertising, chat, scheduling, forms, video, maps, payment, or other embedded services change.</li>
</ul>
<p class="text-sm text-slate-500 italic mt-8 border-t pt-4">Publication warning. Do not publish this Policy as the only cookie disclosure unless the live Cookie Settings panel or an attached cookie register accurately identifies the technologies currently used.</p>`;

  const dynamicPrivacyPolicyBody = `<h3 id="who-we-are">1. Who We Are</h3>
<p>${businessName} provides website design, website development, UI/UX design, e-commerce development, landing-page development, copywriting, website maintenance, and custom web-application design and development services for businesses and organisations across industries.</p>
<p>${businessName} is incorporated and operates under the laws of India. ${businessName} serves clients in the USA, UK, Australia, India, and worldwide.</p>
<p>For personal data that ${businessName} collects and uses for its own business purposes, ${businessName} acts as the responsible organisation, controller, business, or data fiduciary, as those terms apply under relevant privacy law. When ${businessName} processes personal data solely on a client's documented instructions as part of a development, support, hosting, migration, testing, or maintenance engagement, the parties' contract and applicable law determine their respective roles.</p>

<h3 id="scope">2. Scope of This Policy</h3>
<p>This Privacy Policy applies to personal data handled through ${businessName}'s websites, enquiry and contact forms, sales and discovery communications, proposals, contracts, project-management processes, design and development services, support and maintenance services, and other interactions with ${businessName}.</p>
<p>It applies to:</p>
<ul>
  <li>Website visitors and individuals who submit enquiries or request quotations;</li>
  <li>Prospective clients, clients, authorised client representatives, vendors, contractors, and business partners;</li>
  <li>Individuals who communicate with ${businessName} by email, telephone, video meeting, website form, social media, messaging service, or another business channel;</li>
  <li>Individuals whose information a client lawfully provides to ${businessName} for a project; and</li>
  <li>Users of a website or application where ${businessName} is responsible for operating a privacy-relevant feature on its own behalf.</li>
</ul>
<p>This Policy does not govern the independent privacy practices of a client's website, application, or business merely because ${businessName} designed, developed, maintains, or supports it. Each client is responsible for its own privacy notices, lawful data collection, consent mechanisms, and instructions unless a written agreement states otherwise.</p>
<p>Third-party websites and services linked from ${businessName}-controlled pages operate under their own privacy policies. ${businessName} is not responsible for their independent practices.</p>

<h3 id="personal-data">3. Personal Data We Collect</h3>

<h4 id="identity">3.1 Identity and Contact Information</h4>
<ul>
  <li>Name, job title, business name, and professional role;</li>
  <li>Business or personal email address;</li>
  <li>Telephone or messaging number;</li>
  <li>Business address, billing address, country, and service location; and</li>
  <li>Social-media profile or business-page information when you contact ${businessName} through those channels.</li>
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
<p>${businessName} does not need to receive or store full payment-card numbers, card security codes, or online-banking passwords. Payment credentials entered into a third-party payment service are handled by that provider under its own terms and privacy policy.</p>

<h4 id="device">3.5 Website and Device Information</h4>
<ul>
  <li>IP address, browser type, operating system, device type, approximate region, referring page, and language settings;</li>
  <li>Pages visited, links clicked, session timing, traffic source, and form-interaction information; and</li>
  <li>Cookie preferences and information collected through cookies or similar technologies described in Section 12.</li>
</ul>

<h4 id="sensitive">3.6 Sensitive Information</h4>
<p>${businessName} does not intentionally request sensitive or special-category personal data for ordinary website and application projects. Do not provide health information, government identification numbers, biometric information, financial credentials, information about children, or other sensitive data unless it is genuinely required, lawful, and agreed in writing with appropriate safeguards.</p>

<h3 id="how-collect">4. How We Collect Personal Data</h3>
<p>${businessName} may collect personal data:</p>
<ul>
  <li>Directly from you when you contact us, submit a form, schedule a meeting, request a quotation, sign a contract, make a payment, provide project materials, request support, or communicate with our team;</li>
  <li>From your employer, colleague, authorised representative, referral partner, or another person involved in your project;</li>
  <li>Automatically when you use a ${businessName}-controlled website, subject to applicable cookie and consent requirements;</li>
  <li>From public business sources, such as a company website, business directory, or professional social-media page, when used lawfully for relevant business-to-business outreach; and</li>
  <li>From service providers that support communications, payments, analytics, scheduling, file transfer, project management, hosting, security, or project delivery.</li>
</ul>
<p>Where applicable law requires ${businessName} to provide privacy information because personal data was obtained from another source, ${businessName} will provide that information within the legally required period or at the appropriate first communication.</p>

<h3 id="how-use">5. How and Why We Use Personal Data</h3>
<p>${businessName} uses personal data only for legitimate, disclosed, and reasonably necessary purposes, including:</p>
<ul>
  <li>Responding to enquiries and arranging consultations, demonstrations, or project meetings;</li>
  <li>Understanding requirements and preparing estimates, proposals, contracts, and project plans;</li>
  <li>Verifying client instructions and managing authorised representatives;</li>
  <li>Designing, developing, testing, deploying, maintaining, securing, and supporting websites and applications;</li>
  <li>Creating designs, content, prototypes, technical documentation, reports, and other agreed deliverables;</li>
  <li>Managing project communication, feedback, approvals, revisions, milestones, deadlines, and handover;</li>
  <li>Processing payments, issuing invoices and receipts, handling refunds or disputes, and maintaining financial records;</li>
  <li>Providing customer service, maintenance, troubleshooting, warranty support, and security assistance;</li>
  <li>Operating, securing, measuring, and improving ${businessName}-controlled websites, forms, and business systems;</li>
  <li>Preventing fraud, misuse, unauthorised access, security incidents, and violations of contractual terms;</li>
  <li>Sending service-related notices and, where permitted, relevant marketing communications;</li>
  <li>Maintaining legal, tax, accounting, compliance, complaint, and dispute records; and</li>
  <li>Establishing, exercising, or defending legal claims and responding to lawful authority requests.</li>
</ul>

<h4 id="legal-bases">5.1 Legal Bases</h4>
<p>Depending on the jurisdiction and context, ${businessName} may rely on one or more of the following legal bases: your consent; steps requested before entering a contract; performance of a contract; compliance with a legal obligation; protection of legitimate interests that are not overridden by individual rights; and other permitted uses recognised by applicable law.</p>
<p>Where processing is based on consent, you may withdraw that consent using the contact information in Section 18. Withdrawal does not affect processing lawfully completed before withdrawal.</p>

<h3 id="client-projects">6. Client Projects and Client-Supplied Data</h3>
<p>Clients may provide personal data contained in content, customer records, employee information, test data, databases, design files, communications, or other project materials. The client is responsible for ensuring that it has the legal authority to provide that information to ${businessName} and for giving all required notices and obtaining all required permissions.</p>

<h3 id="payments">7. Payments and Financial Information</h3>
<p>Payments may be processed through a third-party payment provider or another method identified in a quotation, invoice, checkout page, or payment request. The payment provider may collect payment credentials, identity information, billing information, device information, and fraud-prevention data under its own privacy policy.</p>
<p>${businessName} generally receives transaction status, payment reference, amount, date, payer details, and other information necessary to confirm and account for the payment. ${businessName} may retain invoices, receipts, credit notes, refund records, and transaction information for legal, tax, accounting, and dispute-resolution purposes.</p>

<h3 id="sharing">8. Sharing Personal Data and Service Providers</h3>
<p>${businessName} may share personal data only to the extent reasonably necessary with:</p>
<ul>
  <li>Authorised ${businessName} employees, contractors, designers, developers, project managers, quality-assurance personnel, accountants, and professional advisers;</li>
  <li>Hosting, cloud-storage, domain, repository, deployment, database, security, backup, analytics, communication, scheduling, file-transfer, project-management, customer-support, and payment providers;</li>
  <li>A client's authorised representatives and service providers where needed to complete the project;</li>
  <li>Regulators, courts, law-enforcement bodies, tax authorities, or other public authorities where disclosure is legally required;</li>
  <li>Professional advisers or counterparties in connection with a business reorganisation, financing, acquisition, sale, or transfer, subject to appropriate confidentiality and legal safeguards; and</li>
  <li>Other recipients where you have directed or consented to the disclosure.</li>
</ul>
<p>Service providers are expected to process personal data only for authorised purposes and under appropriate confidentiality, security, and data-protection obligations. ${businessName} does not sell or rent personal data for monetary consideration. If ${businessName}'s advertising or analytics practices ever constitute a regulated 'sale' or 'sharing' under applicable law, ${businessName} will provide the required notice and opt-out mechanism.</p>

<h3 id="transfers">9. International Data Transfers</h3>
<p>${businessName} is incorporated in India and serves clients worldwide. Personal data may therefore be accessed from, transferred to, or stored in India and in countries where ${businessName}'s clients or service providers operate.</p>
<p>Where required, ${businessName} will use an applicable legal transfer mechanism or safeguard, such as contractual data-protection clauses, an approved transfer agreement or addendum, adequacy-based transfer, consent where lawful, or another mechanism recognised by the relevant law. No safeguard can eliminate every risk associated with international processing, but ${businessName} will take reasonable steps appropriate to the circumstances.</p>

<h3 id="retention">10. Data Retention</h3>
<p>${businessName} retains personal data only for as long as reasonably necessary for the purpose for which it was collected, including to deliver services, maintain business and financial records, comply with law, resolve disputes, enforce agreements, and protect legal rights.</p>
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
<p>When retention is no longer justified, ${businessName} will take reasonable steps to delete, destroy, de-identify, or anonymise the information, subject to backup cycles and legal preservation obligations.</p>

<h3 id="rights">11. Your Privacy Rights and Choices</h3>
<p>Depending on your location and the applicable law, you may have rights to:</p>
<ul>
  <li>Ask whether ${businessName} processes your personal data and request access to it;</li>
  <li>Request correction or completion of inaccurate or incomplete information;</li>
  <li>Request deletion or erasure where legal conditions are met;</li>
  <li>Withdraw consent for future processing based on consent;</li>
  <li>Object to or request restriction of certain processing;</li>
  <li>Request a portable copy of eligible information;</li>
  <li>Opt out of direct marketing, regulated sale or sharing, or targeted advertising where applicable;</li>
  <li>Request information about data sources, purposes, categories, and recipients;</li>
  <li>Request human review where a solely automated decision with significant effects is used;</li>
  <li>Nominate another person to exercise rights where applicable; and</li>
  <li>Make a complaint to ${businessName} or an appropriate privacy regulator.</li>
</ul>
<p>To submit a request, email <a href="mailto:${contactEmail}">${contactEmail}</a> and describe the right you wish to exercise. ${businessName} may request information reasonably necessary to verify identity and authority. ${businessName} will respond within the period required by the applicable law. Rights may be subject to lawful exceptions, and ${businessName} will explain any refusal or limitation where required.</p>

<h3 id="cookies-tech">12. Cookies and Similar Technologies</h3>
<p>${businessName}-controlled websites may use cookies, pixels, local storage, tags, scripts, or similar technologies for the following categories:</p>
<ul>
  <li><strong>Essential:</strong> security, network management, form protection, session continuity, and remembering privacy choices;</li>
  <li><strong>Functional:</strong> remembering preferences and enabling optional website features;</li>
  <li><strong>Analytics:</strong> understanding traffic, page performance, user journeys, and website effectiveness; and</li>
  <li><strong>Advertising:</strong> measuring campaigns or supporting interest-based advertising, only where used and permitted.</li>
</ul>
<p>Where consent is legally required, non-essential technologies will be used only after appropriate consent. You may manage available choices through the cookie banner or preferences control and through your browser settings. Blocking some technologies may affect optional functionality.</p>
<p>A separate Cookie Policy may provide the current names, providers, purposes, and durations of technologies actually used. Because website tools may change, ${businessName} should update that list whenever analytics, advertising, chat, form, scheduling, or embedded-media services are added or removed.</p>

<h3 id="marketing">13. Marketing Communications</h3>
<p>${businessName} may send marketing communications where you have consented or where another lawful basis permits relevant business-to-business communication. Marketing may concern ${businessName}'s website, design, development, application, maintenance, and related services.</p>
<p>You may unsubscribe through the link in an email, reply with an opt-out request, or contact <a href="mailto:${contactEmail}">${contactEmail}</a>. ${businessName} may retain a minimal suppression record so that the opt-out is respected. Opting out of marketing does not stop essential project, payment, legal, support, or service communications.</p>

<h3 id="security">14. Data Security and Breach Response</h3>
<p>${businessName} uses reasonable technical and organisational measures appropriate to the nature of the information, the project, available technology, and the risks involved. Measures may include access controls, confidentiality obligations, secure authentication, encrypted communications, backups, security updates, limited data access, and service-provider review where appropriate.</p>
<p>No internet transmission, development environment, cloud service, or storage method is completely secure. ${businessName} cannot guarantee absolute security. Clients are responsible for protecting credentials, limiting access, maintaining secure configurations, and promptly reporting suspected compromise relating to their project or accounts.</p>
<p>If ${businessName} becomes aware of a personal-data breach for which it has notification responsibility, ${businessName} will investigate, contain, document, and notify affected clients, individuals, or authorities as required by applicable law and contractual obligations. Security concerns may be reported to <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>

<h3 id="children">15. Children's Privacy</h3>
<p>${businessName}'s business services are intended for adults and authorised representatives of legitimate organisations. ${businessName} does not knowingly solicit personal data directly from children under 18 through its own sales and business-service activities.</p>
<p>If you believe a child has provided personal data directly to ${businessName} without appropriate authority, contact <a href="mailto:${contactEmail}">${contactEmail}</a>. ${businessName} will review the matter and take appropriate action. A client commissioning a child-accessible website or application remains responsible for obtaining legal advice and implementing age-appropriate notices, consent, safety, and data-protection measures; these requirements must be addressed expressly in the project scope.</p>

<h3 id="jurisdiction">16. Jurisdiction-Specific Information</h3>

<h4 id="india">16.1 India</h4>
<p>Where the Digital Personal Data Protection Act 2023, the Digital Personal Data Protection Rules 2025, or other Indian requirements apply, ${businessName} will provide required notices, rely on a permitted ground for processing, enable applicable data-principal rights, maintain an appropriate grievance channel, and comply with legally applicable security, breach, retention, and transfer obligations.</p>

<h4 id="uk">16.2 United Kingdom</h4>
<p>Where the UK GDPR and Data Protection Act 2018 apply, individuals may have rights including access, rectification, erasure, restriction, objection, portability, withdrawal of consent, and complaint to the Information Commissioner's Office. ${businessName} will respond to eligible rights requests without undue delay and within the legally applicable period. International transfers will use an applicable UK transfer mechanism where required.</p>

<h4 id="us">16.3 United States</h4>
<p>Privacy rights and business obligations vary by state and may depend on statutory thresholds and exemptions. Where the CCPA/CPRA or another applicable state privacy law applies, eligible residents may request access, correction, deletion, and information about collection and disclosure, and may exercise applicable opt-out and non-discrimination rights. ${businessName} does not sell personal data for monetary consideration. Requests may be submitted through the contact method in Section 18.</p>

<h4 id="au">16.4 Australia</h4>
<p>Where the Privacy Act 1988 and Australian Privacy Principles apply, individuals may request access to and correction of personal information and may raise a privacy complaint. ${businessName} will take reasonable steps regarding transparent handling, data quality, security, cross-border disclosure, and deletion or de-identification where legally required.</p>

<h4 id="others">16.5 Other Countries</h4>
<p>Individuals in other jurisdictions may have additional rights under local law, including laws such as Canada's PIPEDA, Singapore's PDPA, South Africa's POPIA, or other national and regional frameworks. ${businessName} will assess a request under the law applicable to the relevant processing activity.</p>

<h3 id="changes">17. Changes to This Privacy Policy</h3>
<p>${businessName} may update this Policy to reflect changes in services, technology, legal requirements, suppliers, or data-handling practices. The updated version will be posted with a revised 'Last updated' date. Where a change materially affects how personal data is used, ${businessName} will provide additional notice or seek consent where required by law.</p>
<p>You should review this Policy periodically. Previous versions may be requested using the contact information below, subject to reasonable availability and record-retention practices.</p>

<h3 id="contact">18. Contact Us and Privacy Requests</h3>
<p>For questions, privacy requests, complaints, consent withdrawal, or concerns about this Policy, use the following details.</p>
<p><strong>Business:</strong> ${businessName}</p>
<p><strong>Website:</strong> <a href="${websiteUrl}">${websiteUrl}</a></p>
<p><strong>Data Protection Officer and privacy enquiries:</strong> <a href="mailto:${contactEmail}">${contactEmail}</a></p>
<p><strong>Security and support reports:</strong> <a href="mailto:${supportEmail}">${supportEmail}</a></p>
<p><strong>Registered address:</strong><br/>
${businessAddress}</p>
<p>When making a privacy request, provide enough information for ${businessName} to understand the request and identify the relevant records. Do not send passwords, payment-card details, or unnecessary identity documents by ordinary email. If identity verification is necessary, ${businessName} will request a proportionate method.`;

  const dynamicTermsBody = `<h3 id="about">1. About These Terms</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. By approving a quotation, paying an invoice or deposit, signing an order document, or instructing ${businessName} to begin work, you accept these Terms.</p>
<p>These Terms and Conditions govern the purchase and use of website design, website development, UI/UX design, e-commerce development, landing-page development, content or copywriting, website maintenance, and custom web-application design and development services supplied by ${businessName}.</p>
<p>If you accept these Terms for a company or another organisation, you confirm that you have authority to bind it. If you do not accept these Terms, do not approve a proposal, make payment, submit project materials, or instruct ${businessName} to start work.</p>
<p>These Terms are written for business services. Any mandatory rights that apply to an eligible consumer remain unaffected.</p>

<h3 id="definitions">2. Definitions</h3>
<table class="w-full border-collapse my-6">
  <thead>
    <tr class="border-b-2 border-slate-200">
      <th class="text-left p-3 font-bold text-slate-900">Term</th>
      <th class="text-left p-3 font-bold text-slate-900">Meaning</th>
    </tr>
  </thead>
  <tbody>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">${businessName} / we / us / our</td>
      <td class="p-3 text-slate-600">${businessName}, incorporated and operating under the laws of India.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Client / you / your</td>
      <td class="p-3 text-slate-600">the individual, business, or organisation purchasing or receiving Services.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Services</td>
      <td class="p-3 text-slate-600">the design, development, content, maintenance, support, consulting, or related work described in an Order Document.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Order Document</td>
      <td class="p-3 text-slate-600">an accepted quotation, proposal, order form, statement of work, invoice, email confirmation, or other written project description.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Deliverables</td>
      <td class="p-3 text-slate-600">the files, designs, code, content, documentation, configurations, or other outputs identified for delivery.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Client Materials</td>
      <td class="p-3 text-slate-600">content, data, logos, trademarks, images, credentials, instructions, and other materials provided by or for the Client.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Change Request</td>
      <td class="p-3 text-slate-600">a request that adds to, removes from, or materially changes the agreed scope, assumptions, timetable, or Deliverables.</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Third-Party Service</td>
      <td class="p-3 text-slate-600">any external platform, licence, plugin, theme, API, hosting provider, domain registrar, payment provider, stock-asset provider, or software component.</td>
    </tr>
  </tbody>
</table>

<h3 id="services">3. Services</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Only the Services and Deliverables listed in the accepted Order Document are included.</p>
<ul>
  <li>Website strategy, information architecture, wireframes, UI/UX design, responsive page design, and design systems;</li>
  <li>Front-end and back-end website development, content-management systems, e-commerce, landing pages, integrations, migrations, and deployment;</li>
  <li>Custom web-application discovery, prototyping, interface design, development, databases, APIs, testing, deployment, and related documentation;</li>
  <li>Content entry, copywriting, performance work, accessibility support, search-engine foundations, maintenance, and technical support when specifically included; and</li>
  <li>Other professional services expressly described in the applicable Order Document.</li>
</ul>
<p>${businessName} does not promise a particular level of revenue, enquiries, conversions, traffic, search ranking, funding, regulatory approval, or other business result. Results depend on the Client's offer, market, content, operations, advertising, competition, and other factors outside ${businessName}'s control.</p>

<h3 id="proposals">4. Proposals and Agreement Priority</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The project-specific Order Document controls commercial details; these Terms supply the general legal rules.</p>
<p>An estimate is indicative unless it is identified as a fixed-price quotation. A proposal or quotation remains open only for the validity period stated in it and may be withdrawn before acceptance.</p>
<p>The agreement consists of: (a) the accepted Order Document; (b) any signed data-processing agreement or service-level agreement; (c) these Terms; and (d) the Privacy Policy. If documents conflict, the earlier item in this list prevails for the conflicting subject, unless a document expressly states otherwise. A purchase order does not override these Terms unless ${businessName} agrees in writing.</p>

<h3 id="responsibilities">5. Client Responsibilities</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The Client must provide lawful materials, timely decisions, access, and one authorised point of contact.</p>
<ul>
  <li>Provide accurate requirements, content, brand assets, credentials, data, approvals, and feedback by the requested dates;</li>
  <li>Appoint an authorised contact who may give instructions and approve work on the Client's behalf;</li>
  <li>Confirm that Client Materials are accurate, lawful, licensed, and do not infringe another person's rights;</li>
  <li>Maintain secure copies of important content, data, and credentials and protect accounts under the Client's control;</li>
  <li>Review Deliverables for accuracy, legal compliance, security needs, accessibility needs, and suitability for the intended audience;</li>
  <li>Obtain legal, tax, regulatory, medical, financial, industry-specific, or accessibility advice where the Client's activities require it; and</li>
  <li>Pay fees and approved third-party costs when due.</li>
</ul>
<p>${businessName} may rely on instructions from the authorised contact. ${businessName} is not responsible for errors, delays, or claims caused by incomplete, inaccurate, late, unlawful, or unlicensed Client Materials or instructions.</p>

<h3 id="schedule">6. Project Schedule and Delays</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Delivery dates depend on timely Client content, access, feedback, approvals, and payment.</p>
<p>Any delivery date is an estimate unless the Order Document expressly makes it a binding deadline. The schedule starts after ${businessName} receives the required initial payment, materials, access, and project confirmation.</p>
<p>If the Client delays feedback, content, access, approval, testing, or payment, ${businessName} may move the delivery date, reassign resources, pause work, and revise the quotation where rescheduling creates additional cost. A project that remains inactive because of the Client for an extended period may be treated as paused or cancelled after reasonable written notice.</p>

<h3 id="payment">7. Fees, Taxes and Payment</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The Order Document states the price and payment schedule. Work may pause when an amount is overdue.</p>
<ul>
  <li>Fees may be fixed-price, milestone-based, time-and-materials, recurring, usage-based, or a combination, as stated in the Order Document;</li>
  <li>Invoices are payable in the currency and by the due date shown on the invoice;</li>
  <li>Prices exclude taxes, duties, bank fees, currency-conversion costs, and third-party charges unless expressly stated otherwise;</li>
  <li>The Client must raise a good-faith invoice dispute promptly and pay every undisputed amount on time; and</li>
  <li>${businessName} may pause Services, withhold Deliverables, disable ${businessName}-managed access, or postpone launch while an amount remains overdue.</li>
</ul>
<p>Payments may be processed by an approved third-party payment provider. That provider's terms and privacy practices apply to payment credentials. ${businessName} may receive transaction confirmation and billing information but does not need the Client to send full card details or online-banking passwords.</p>

<h3 id="scope">8. Scope Changes and Revisions</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Included revisions are limited to the agreed scope. New requirements need written approval and may cost more.</p>
<p>The Order Document should identify included pages, features, integrations, content quantities, revision rounds, and assumptions. A revision adjusts an included Deliverable; it does not add a new page, feature, workflow, integration, platform, content set, or business requirement.</p>
<p>${businessName} will identify material out-of-scope requests and, where practical, provide a revised fee, timetable, or Change Request. ${businessName} is not required to begin changed work until the Client approves it in writing and pays any required amount.</p>

<h3 id="testing">9. Review, Testing and Acceptance</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Review each milestone promptly and report reproducible defects against the agreed requirements.</p>
<ul>
  <li>The Client must test and review Deliverables within the review period stated in the Order Document, or otherwise within a reasonable period;</li>
  <li>Feedback should be consolidated, specific, and supplied by the authorised contact;</li>
  <li>${businessName} will correct reproducible defects that cause a Deliverable not to materially match the agreed requirements;</li>
  <li>Preferences, new ideas, third-party changes, unsupported environments, and requirements not documented in scope are not defects; and</li>
  <li>A Deliverable is accepted when the Client approves it, uses it in production, launches it, or does not report a material defect within the agreed review period.</li>
</ul>
<p>Browser, device, operating-system, and accessibility support is limited to what the Order Document states. Minor visual differences across environments do not by themselves constitute non-conformity.</p>

<h3 id="cancellation">10. Cancellation, Suspension and Refunds</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The Client pays for work performed, committed project capacity, approved expenses, and completed milestones up to cancellation.</p>
<p>The Client may request cancellation in writing. Unless the Order Document states otherwise, an initial deposit or booking payment becomes non-refundable once ${businessName} schedules resources or begins work. Fees for completed or accepted milestones and approved third-party purchases are non-refundable, except where mandatory law requires otherwise.</p>
<p>If the Client cancels, ${businessName} will calculate work completed and non-cancellable commitments. The Client must pay any remaining balance for those amounts. If advance payments exceed the properly chargeable amount, ${businessName} will refund the unused balance after deducting applicable fees, completed work, and committed costs.</p>
<p>${businessName} may suspend work for overdue payment, unlawful instructions, security risk, abuse, missing cooperation, or material breach. Suspension does not remove payment obligations or automatically extend third-party licences. Where practicable, ${businessName} will give notice and a reasonable opportunity to remedy the issue.</p>

<h3 id="ip">11. Intellectual Property</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. After full payment, the Client receives the agreed rights in custom final Deliverables. ${businessName} keeps its pre-existing tools and reusable know-how.</p>
<h4>11.1 Client Materials</h4>
<p>The Client retains ownership of Client Materials. The Client grants ${businessName} a limited, non-exclusive licence to use, copy, adapt, host, and share them only as reasonably necessary to provide the Services, comply with law, and enforce the agreement.</p>
<h4>11.2 Custom Final Deliverables</h4>
<p>After ${businessName} receives full payment, the Client owns the custom final Deliverables expressly identified for transfer in the Order Document, excluding ${businessName} Background Materials and Third-Party Materials. Drafts, rejected concepts, internal working files, development utilities, and unused alternatives are not transferred unless expressly included.</p>
<h4>11.3 ${businessName} Background Materials</h4>
<p>${businessName} retains ownership of its pre-existing or independently developed templates, frameworks, libraries, processes, methods, design systems, generic code, utilities, know-how, and improvements (Background Materials). To the extent Background Materials are embedded in a paid Deliverable, ${businessName} grants the Client a perpetual, non-exclusive licence to use them as part of that Deliverable, unless the Order Document states a different licence.</p>
<h4>11.4 Third-Party Materials</h4>
<p>Open-source software, fonts, plugins, themes, stock assets, APIs, and other Third-Party Materials remain subject to their own licences and usage limits. The Client must maintain licences or subscriptions assigned to the Client after handover.</p>
<h4>11.5 Portfolio Use</h4>
<p>${businessName} will not disclose the Client's confidential or unreleased work for promotional use without permission. Once work is publicly launched, ${businessName} may identify itself as the service provider and display non-confidential screenshots or links only where permitted by the Order Document or the Client's consent.</p>

<h3 id="third-party">12. Domains, Hosting and Third-Party Services</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. External providers control their own availability, prices, policies, and accounts.</p>
<p>The project may depend on domain registrars, hosting, cloud services, repositories, content-management systems, payment gateways, analytics, email, messaging, maps, plugins, APIs, app stores, or other Third-Party Services. Their terms, licences, privacy practices, technical limits, and charges apply separately.</p>
<p>Unless expressly included, the Client is responsible for selecting, purchasing, renewing, and maintaining Third-Party Services. ${businessName} is not liable for provider outages, account suspension, pricing or policy changes, API changes, discontinued features, or data loss outside ${businessName}'s reasonable control. Work needed because a third party changes its service is additional work unless covered by an active maintenance agreement.</p>

<h3 id="maintenance">13. Maintenance and Support</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Project delivery does not include unlimited future updates or support.</p>
<p>Maintenance, monitoring, content changes, backups, security updates, dependency upgrades, hosting administration, incident response, and ongoing support are included only when stated in the Order Document or a separate maintenance plan.</p>
<p>Any defect-support or warranty period is the period expressly stated in the Order Document. It covers reproducible defects in ${businessName}'s delivered work, not new requirements, Client changes, third-party failures, expired licences, compromised credentials, unsupported environments, or changes made by someone other than ${businessName}.</p>

<h3 id="confidentiality">14. Confidentiality</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Each party must protect the other's non-public business and technical information.</p>
<p>Each party will use the other party's Confidential Information only to perform or receive the Services and will protect it with reasonable care. Access may be given to personnel, contractors, and professional advisers who need it and are bound by suitable confidentiality duties.</p>
<p>Confidential Information does not include information that is public without breach, already lawfully known, independently developed, or lawfully obtained from another source. A party may disclose information when legally required, and where permitted will give prompt notice and disclose only what is required.</p>

<h3 id="privacy-data">15. Privacy and Client-Supplied Data</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. ${businessName} follows its Privacy Policy. For project data supplied by a Client, each party's role depends on the circumstances and applicable law.</p>
<p>${businessName}'s Privacy Policy explains how ${businessName} handles personal data for its own business purposes. Where ${businessName} processes personal data solely on documented Client instructions to provide development, migration, testing, hosting, maintenance, or support, the Client is responsible for ensuring a lawful basis, required notices, permissions, and instructions.</p>
<ul>
  <li>The Client should provide anonymised, pseudonymised, synthetic, or minimum-necessary test data whenever reasonably possible;</li>
  <li>The Client must not provide sensitive data, children's data, production credentials, or regulated information unless it is necessary, lawful, disclosed in advance, and protected by agreed safeguards;</li>
  <li>${businessName} may use personnel and service providers reasonably required for secure project delivery; and</li>
  <li>Where required, the parties will enter into an appropriate data-processing agreement before regulated processing begins.</li>
</ul>

<h3 id="use">16. Acceptable Use</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Services and Deliverables must be used lawfully and must not harm people, systems, or third-party rights.</p>
<p>The Client must not use, request, or permit the Services or Deliverables to:</p>
<ul>
  <li>Violate law, regulation, court order, sanctions, privacy rights, consumer rights, or intellectual-property rights;</li>
  <li>Distribute malware, facilitate unauthorised access, interfere with systems, scrape unlawfully, or evade security controls;</li>
  <li>Publish unlawful, fraudulent, deceptive, defamatory, hateful, exploitative, or abusive material;</li>
  <li>Send unlawful spam or marketing communications, conduct prohibited surveillance, or collect personal data without required notice or consent;</li>
  <li>Impersonate another person or misrepresent affiliation, approval, qualifications, products, or results; or</li>
  <li>Reverse-engineer, resell, sublicense, or commercially exploit ${businessName} Background Materials except as expressly permitted.</li>
</ul>
<p>${businessName} may refuse unlawful or unsafe instructions and may remove its own access or suspend work where reasonably necessary to protect people, systems, or legal compliance.</p>

<h3 id="warranties">17. Warranties and Disclaimers</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. ${businessName} will provide the Services with reasonable care and skill, but cannot guarantee uninterrupted technology or a particular business outcome.</p>
<p>${businessName} warrants that it will perform the Services with reasonable care and skill and materially in accordance with the accepted Order Document. The Client's exclusive contractual remedy for a valid, timely reported defect is, at ${businessName}'s option, reasonable correction, re-performance, or another remedy required by law.</p>
<p>To the fullest extent permitted by law, Deliverables and Third-Party Services are otherwise supplied on an 'as available' basis. ${businessName} does not guarantee uninterrupted or error-free operation, universal compatibility, immunity from cyber risk, acceptance by an app store or regulator, search ranking, accessibility certification, or any specific commercial outcome. Nothing excludes a warranty or statutory guarantee that law does not allow the parties to exclude.</p>

<h3 id="liability">18. Limitation of Liability</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Liability is limited, but the limitation does not apply where law prohibits it.</p>
<p>To the fullest extent permitted by applicable law, neither party is liable to the other for indirect, incidental, special, punitive, or consequential loss, or for lost profit, revenue, opportunity, goodwill, anticipated savings, or data, arising from the Services or agreement, whether in contract, tort, or otherwise.</p>
<p>To the fullest extent permitted by law, ${businessName}'s total aggregate liability arising from an Order Document will not exceed the fees actually paid to ${businessName} under that Order Document during the six months immediately preceding the event giving rise to the claim, or, for a shorter project, the total fees paid under that Order Document.</p>
<p>These limits do not exclude or restrict liability for fraud or fraudulent misrepresentation, death or personal injury caused by negligence where applicable, wilful misconduct, breach of confidentiality to the extent it cannot lawfully be limited, or any liability or mandatory consumer remedy that applicable law does not permit to be excluded or limited.</p>

<h3 id="indemnity">19. Indemnity</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The Client is responsible for third-party claims caused by unlawful Client Materials, instructions, or use.</p>
<p>To the extent permitted by law, the Client will defend, indemnify, and hold harmless ${businessName} and its personnel from third-party claims, damages, penalties, and reasonable costs arising from: (a) Client Materials; (b) the Client's unlawful instructions or use of Deliverables; (c) the Client's breach of privacy, marketing, consumer, or intellectual-property law; or (d) the Client's material breach of these Terms. ${businessName} will give reasonable notice and cooperation, and the Client may not settle a claim in a way that admits fault or imposes obligations on ${businessName} without written consent.</p>

<h3 id="termination">20. Term and Termination</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. The agreement continues through the project and any active support period unless ended earlier.</p>
<p>Either party may terminate an Order Document for material breach if the breach is not remedied within a reasonable period after written notice, where it is capable of remedy. ${businessName} may terminate or suspend immediately for unlawful activity, serious security risk, fraud, abuse, insolvency, or a breach that cannot reasonably be remedied.</p>
<p>On termination, the Client must pay all properly due amounts for completed work, work in progress, committed resources, and non-cancellable costs. ${businessName} will provide paid Deliverables then available in their existing state, subject to security, law, third-party restrictions, and the Order Document. Clauses concerning payment, intellectual property, confidentiality, privacy, liability, indemnity, disputes, and any provision intended by nature to survive will continue.</p>

<h3 id="force-majeure">21. Force Majeure</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Neither party is responsible for delay caused by events reasonably outside its control.</p>
<p>A party is not liable for delay or failure caused by events beyond its reasonable control, including natural disasters, war, terrorism, civil unrest, epidemic, government action, widespread power or internet failure, cyberattack not caused by its failure to use reasonable care, labour disruption, or failure of critical third-party infrastructure. The affected party will notify the other when reasonably practicable and resume performance when possible. Payment for Services already delivered remains due.</p>

<h3 id="governing-law">22. Governing Law and Disputes</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Indian law governs, while mandatory rights in the Client's location remain protected.</p>
<p>These Terms and each Order Document are governed by the laws of India, without regard to conflict-of-law principles. This choice does not remove mandatory consumer, privacy, or other rights that cannot lawfully be waived in the Client's jurisdiction.</p>
<p>A party raising a dispute must send written details of the issue and requested remedy. The parties will first attempt good-faith resolution for 30 days.</p>
<p>If unresolved, a business-to-business dispute may be referred to arbitration under the Arbitration and Conciliation Act 1996 of India, before one mutually appointed arbitrator, in English, at a seat and venue agreed in writing or otherwise determined under applicable law.</p>
<p>Nothing prevents either party from seeking urgent injunctive relief, recovering an undisputed debt, or using a consumer tribunal, small-claims process, regulator, or court where mandatory law gives that right.</p>

<h3 id="mandatory-rights">23. International and Mandatory Rights</h3>
<p class="quick-summary text-[#000080] font-semibold mb-4">Quick summary. Local mandatory law prevails where these Terms cannot lawfully change it.</p>
<p>${businessName} serves Clients in India, the USA, the UK, Australia, and worldwide. Laws may differ by location, Client type, service, and intended use. Where applicable, statutory rights under Indian consumer law, UK consumer law, Australian Consumer Law, US state or federal law, or another mandatory regime remain unaffected.</p>
<p>The Client is responsible for identifying industry-specific and local requirements for its website or application, including privacy notices, cookie consent, accessibility, advertising, e-commerce disclosures, tax information, age restrictions, professional claims, and regulated content. ${businessName} provides technical implementation only to the extent included in scope and does not act as the Client's lawyer or compliance certifier.</p>

<h3 id="general">24. General Contract Terms</h3>
<ul>
  <li>Entire agreement: the agreement documents replace prior discussions and representations about the same Services;</li>
  <li>Severability: an invalid provision will be limited or removed only to the extent necessary, and the remaining provisions continue;</li>
  <li>No waiver: delay in enforcing a right does not waive it;</li>
  <li>Assignment: the Client may not transfer the agreement without ${businessName}'s written consent; ${businessName} may transfer it as part of a genuine restructuring, merger, financing, or sale of business, subject to applicable law;</li>
  <li>Independent contractors: the parties are independent contractors; the agreement does not create employment, partnership, agency, fiduciary duty, or joint venture;</li>
  <li>Subcontractors: ${businessName} may use suitably qualified contractors and service providers while remaining responsible for its contractual obligations;</li>
  <li>Notices: operational notices may be sent to the project contact by email or project-management channel; formal legal notices must be sent to the contact details in Section 26; and</li>
  <li>Electronic agreement: approvals, signatures, and notices may be made electronically to the extent permitted by law.</li>
</ul>

<h3 id="changes-terms">25. Changes to These Terms</h3>
<p>${businessName} may update these Terms for future Services or renewals by publishing a revised version and date. Material changes affecting an active project will not change that project's agreed scope, price, or ownership terms unless the parties agree in writing, except where a change is required by law or is reasonably necessary to address security or abuse. Continued ordering of new Services after the effective date of revised Terms constitutes acceptance of the revised Terms.</p>

<h3 id="contact-terms">26. Contact Us</h3>
<p>Questions, notices, complaints, and requests concerning these Terms may be sent using the details below.</p>
<table class="w-full border-collapse my-6">
  <tbody>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Business</td>
      <td class="p-3 text-slate-600">${businessName}</td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Website</td>
      <td class="p-3 text-slate-600"><a href="${websiteUrl}">${websiteUrl}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">General enquiries</td>
      <td class="p-3 text-slate-600"><a href="mailto:${contactEmail}">${contactEmail}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Legal, compliance and support</td>
      <td class="p-3 text-slate-600"><a href="mailto:${supportEmail}">${supportEmail}</a></td>
    </tr>
    <tr class="border-b border-slate-100">
      <td class="p-3 font-semibold text-slate-800">Principal place of business</td>
      <td class="p-3 text-slate-600">India</td>
    </tr>
  </tbody>
</table>`;

  const getInitialTab = () => {
    if (defaultTab) return defaultTab;
    if (location.pathname.includes('terms')) return 'terms';
    if (location.pathname.includes('cookie')) return 'cookies';
    return 'privacy';
  };

  const legalBlueprint = page?.serviceDetailData || content.legal || {
    hero: {
      title: 'Privacy Policy',
      highlight: '& Legal Governance',
      description: `Clear, transparent guidelines regarding how ${businessName} handles your personal data, privacy security, and digital service agreements.`,
      lastUpdated: 'August 7, 2026'
    }
  };

  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'cookies'>(getInitialTab());
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const tocItems = (() => {
    if (activeTab === 'privacy') {
      return [
        { id: 'who-we-are', label: '1. Who We Are' },
        { id: 'scope', label: '2. Scope of This Policy' },
        { id: 'personal-data', label: '3. Personal Data We Collect' },
        { id: 'how-collect', label: '4. How We Collect Personal Data' },
        { id: 'how-use', label: '5. How and Why We Use Personal Data' },
        { id: 'client-projects', label: '6. Client Projects' },
        { id: 'payments', label: '7. Payments' },
        { id: 'sharing', label: '8. Sharing Personal Data' },
        { id: 'transfers', label: '9. International Data Transfers' },
        { id: 'retention', label: '10. Data Retention' },
        { id: 'rights', label: '11. Your Privacy Rights' },
        { id: 'cookies-tech', label: '12. Cookies and Similar Tech' },
        { id: 'marketing', label: '13. Marketing Communications' },
        { id: 'security', label: '14. Data Security' },
        { id: 'children', label: '15. Children\'s Privacy' },
        { id: 'jurisdiction', label: '16. Jurisdiction Information' },
        { id: 'changes', label: '17. Changes to This Policy' },
        { id: 'contact', label: '18. Contact Us' },
      ];
    }
    if (activeTab === 'terms') {
      return [
        { id: 'about', label: '1. About These Terms' },
        { id: 'definitions', label: '2. Definitions' },
        { id: 'services', label: '3. Services' },
        { id: 'proposals', label: '4. Proposals and Agreement Priority' },
        { id: 'responsibilities', label: '5. Client Responsibilities' },
        { id: 'schedule', label: '6. Project Schedule and Delays' },
        { id: 'payment', label: '7. Fees, Taxes and Payment' },
        { id: 'scope', label: '8. Scope Changes and Revisions' },
        { id: 'testing', label: '9. Review, Testing and Acceptance' },
        { id: 'cancellation', label: '10. Cancellation, Suspension and Refunds' },
        { id: 'ip', label: '11. Intellectual Property' },
        { id: 'third-party', label: '12. Domains, Hosting and Third-Party Services' },
        { id: 'maintenance', label: '13. Maintenance and Support' },
        { id: 'confidentiality', label: '14. Confidentiality' },
        { id: 'privacy-data', label: '15. Privacy and Client-Supplied Data' },
        { id: 'use', label: '16. Acceptable Use' },
        { id: 'warranties', label: '17. Warranties and Disclaimers' },
        { id: 'liability', label: '18. Limitation of Liability' },
        { id: 'indemnity', label: '19. Indemnity' },
        { id: 'termination', label: '20. Term and Termination' },
        { id: 'force-majeure', label: '21. Force Majeure' },
        { id: 'governing-law', label: '22. Governing Law and Disputes' },
        { id: 'mandatory-rights', label: '23. International and Mandatory Rights' },
        { id: 'general', label: '24. General Contract Terms' },
        { id: 'changes-terms', label: '25. Changes to These Terms' },
        { id: 'contact-terms', label: '26. Contact Us' },
      ];
    }
    return [
      { id: 'about-cookies', label: '1. About This Policy' },
      { id: 'what-are-cookies', label: '2. What Cookies Are' },
      { id: 'where-applies', label: '3. Where This Policy Applies' },
      { id: 'categories', label: '4. Cookie Categories' },
      { id: 'first-third-party', label: '5. First/Third Party Tech' },
      { id: 'consent', label: '6. Consent and Legal Basis' },
      { id: 'manage', label: '7. How to Manage Cookies' },
      { id: 'browser', label: '8. Browser Controls' },
      { id: 'dnt', label: '9. Do Not Track & GPC' },
      { id: 'duration', label: '10. Duration & Retention' },
      { id: 'international-cookies', label: '11. International Visitors' },
      { id: 'children-cookies', label: '12. Children\'s Privacy' },
      { id: 'changes-cookies', label: '13. Changes to This Policy' },
      { id: 'contact-cookies', label: '14. Contact Us' },
      { id: 'checklist', label: '15. Publication Checklist' },
    ];
  })();

  const heroData = {
    ...(legalBlueprint?.hero || {}),
    title: legalBlueprint?.hero?.title || 'Privacy Policy',
    highlight: legalBlueprint?.hero?.highlight || '& Legal Governance',
    description: legalBlueprint?.hero?.description || `Clear, transparent guidelines regarding how ${businessName} handles your personal data, privacy security, and digital service agreements.`,
    subheading: legalBlueprint?.hero?.subheading || '',
    subtitle: legalBlueprint?.hero?.subtitle || '',
    lastUpdated: legalBlueprint?.hero?.lastUpdated || 'August 7, 2026'
  };

  const companyInfo = {
    name: siteSettings.businessName,
    address: siteSettings.businessAddress,
    email: siteSettings.contactEmail,
    dpoEmail: siteSettings.securityContact
  };

  const privacyData = legalBlueprint?.privacy || {
    title: 'Privacy Policy',
    subtitle: `${businessName} respects your privacy and is committed to protecting your personal data.`,
    lastUpdated: 'August 7, 2026',
    bodyContent: dynamicPrivacyPolicyBody
  };

  const termsData = legalBlueprint?.terms || {
    title: 'Terms & Conditions',
    subtitle: `These Terms and Conditions constitute a legally binding agreement concerning your access to and use of our digital services.`,
    lastUpdated: 'August 7, 2026',
    bodyContent: dynamicTermsBody
  };

  const cookiesData = legalBlueprint?.cookies || {
    title: 'Cookie Policy',
    subtitle: 'Cookies are small text files stored on your computer or mobile device when you visit a website.',
    lastUpdated: 'August 7, 2026',
    bodyContent: defaultCookiesBody
  };

  useEffect(() => {
    // Priority 1: Use the explicit prop if provided (from App.tsx routes)
    if (defaultTab) {
      setActiveTab(defaultTab);
    } 
    // Priority 2: Fallback to path sniffing if prop is missing
    else if (location.pathname.includes('terms')) {
      setActiveTab('terms');
    } else if (location.pathname.includes('cookie')) {
      setActiveTab('cookies');
    } else {
      setActiveTab('privacy');
    }
    
    // Immediate scroll to top when navigation occurs
    window.scrollTo(0, 0);
  }, [location.pathname, defaultTab]);

  useEffect(() => {
    const bizName = content.siteSettings?.businessName || 'Profox web designer';
    document.title = activeTab === 'terms' 
      ? `Terms & Conditions | ${bizName}` 
      : activeTab === 'cookies' 
      ? `Cookie Policy | ${bizName}` 
      : `Privacy Policy | ${bizName}`;
  }, [activeTab, content.siteSettings?.businessName]);

  const handleCopyText = () => {
    const content = document.getElementById('legal-document-content')?.innerText || '';
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTabChange = (tab: 'privacy' | 'terms' | 'cookies') => {
    setActiveTab(tab);
    setSearchQuery(''); // Clear search when switching tabs
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Update URL without full refresh to stay in sync
    const paths = { privacy: '/privacy-policy', terms: '/terms', cookies: '/cookie-policy' };
    navigate(paths[tab]);
  };

  const handlePrint = () => {
    window.print();
  };

  const [activeSection, setActiveSection] = useState<string>('');
  const [dynamicToc, setDynamicToc] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const container = document.getElementById('legal-document-content');
      if (container) {
        const headings = container.querySelectorAll('h3[id]');
        if (headings.length > 0) {
          const list: { id: string; label: string }[] = [];
          headings.forEach((h) => {
            if (h.id && h.textContent) {
              list.push({ id: h.id, label: h.textContent.trim() });
            }
          });
          setDynamicToc(list);
          return;
        }
      }
      setDynamicToc([]);
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, content, privacyData, termsData, cookiesData]);

  const activeTocItems = dynamicToc.length > 0 ? dynamicToc : tocItems;

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 120;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      setActiveSection(id);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-120px 0px -70% 0px',
        threshold: 0
      }
    );

    const sections = activeTocItems.map(item => document.getElementById(item.id)).filter(Boolean);
    sections.forEach(section => observer.observe(section!));

    return () => {
      sections.forEach(section => observer.unobserve(section!));
    };
  }, [activeTocItems, activeTab]);

  const filteredToc = activeTocItems.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper function to render bodyContent HTML with clean typography matching the screenshot design
  const renderLegalBodyContent = (bodyHtml?: string) => {
    if (!bodyHtml) return null;
    return (
      <div 
        className="space-y-6 text-slate-700 leading-relaxed text-sm font-sans
          [&>h3]:text-xl [&>h3]:font-bold [&>h3]:text-slate-900 [&>h3]:tracking-tight [&>h3]:pt-8 [&>h3]:border-t [&>h3]:border-slate-100 [&>h3]:first:border-t-0 [&>h3]:first:pt-0 [&>h3]:font-display [&>h3]:scroll-mt-32
          [&>h4]:text-base [&>h4]:font-bold [&>h4]:text-slate-900 [&>h4]:pt-4 [&>h4]:font-display [&>h4]:scroll-mt-32
          [&>p]:text-slate-600 [&>p]:leading-relaxed
          [&>.quick-summary]:text-[#000080] [&>.quick-summary]:font-semibold [&>.quick-summary]:mb-4 [&>.quick-summary]:block
          [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:text-slate-600
          [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2 [&>ol]:text-slate-600
          [&>a]:text-[#000080] [&>a]:font-semibold [&>a]:underline hover:[&>a]:text-[#000066]"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-[#000080]/10 selection:text-[#000080]">
      
      {/* Top Banner & Header Header */}
      <section className="relative pt-32 pb-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#000080]/5 text-[#000080] text-xs font-bold uppercase tracking-widest border border-[#000080]/10 mb-4">
                <ShieldCheck className="w-4 h-4" /> {heroData.subheading || 'Legal & Governance Framework'}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight leading-tight">
                {activeTab === 'privacy' && (privacyData.title || 'Privacy Policy')}
                {activeTab === 'terms' && (termsData.title || 'Terms & Conditions')}
                {activeTab === 'cookies' && (cookiesData.title || 'Cookie Policy')}
              </h1>
              {heroData.subtitle && (
                <p className="text-xl font-bold text-[#000080] mt-3">
                  {heroData.subtitle}
                </p>
              )}
              <p className="text-lg text-slate-600 mt-4 max-w-2xl leading-relaxed">
                {heroData.description}
              </p>
              <div className="mt-6"><HeroReviewProof /></div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isAdminOrEditor && (
                <Link
                  to="/admin?tab=templates"
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold transition-all border border-amber-300 shadow-sm"
                  title="Edit this template in Admin Template Manager"
                >
                  <Edit3 className="w-4 h-4 text-amber-600" />
                  <span>Edit in Template Manager</span>
                </Link>
              )}
              <button
                onClick={handleCopyText}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all border border-slate-300"
                title="Copy text content to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#000080]/20"
                title="Print or Save as PDF"
              >
                <Printer className="w-4 h-4" />
                <span>Print Document</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/80">
              <button
                onClick={() => handleTabChange('privacy')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'privacy'
                    ? 'bg-white text-[#000080] shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>Privacy Policy</span>
              </button>

              <button
                onClick={() => handleTabChange('terms')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'terms'
                    ? 'bg-white text-[#000080] shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Scale className="w-4 h-4" />
                <span>Terms & Conditions</span>
              </button>

              <button
                onClick={() => handleTabChange('cookies')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'cookies'
                    ? 'bg-white text-[#000080] shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Cookie className="w-4 h-4" />
                <span>Cookie Policy</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Effective Date: <strong>{heroData.lastUpdated || 'August 7, 2026'}</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Legal Content Container */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Quick Filter Sidebar */}
            <aside className="lg:col-span-3">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5 sticky top-28 max-h-[calc(100vh-8rem)] flex flex-col">
                
                {/* 1. Search Document */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Search Document
                    </h3>
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="text-[10px] text-slate-400 hover:text-[#000080] font-semibold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter topics..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all"
                    />
                  </div>
                </div>

                {/* 2. Side Sub-Menu (Document Headings / Table of Contents) */}
                <div className="border-t border-slate-100 pt-3.5 flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#000080]" />
                      <span>Document Headings</span>
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      {filteredToc.length}
                    </span>
                  </div>

                  <div className="overflow-y-auto max-h-[280px] lg:max-h-[340px] pr-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    {filteredToc.length > 0 ? (
                      filteredToc.map((item) => {
                        const isActive = activeSection === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => scrollToSection(item.id)}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all flex items-center justify-between group ${
                              isActive
                                ? 'bg-[#000080] text-white shadow-sm font-bold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                            }`}
                          >
                            <span className="truncate pr-2">{item.label}</span>
                            <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                              isActive ? 'text-white translate-x-0.5' : 'text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5'
                            }`} />
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-4 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No matching headings found
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Key Highlights */}
                <div className="border-t border-slate-100 pt-3.5">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                    Key Highlights
                  </h3>
                  <ul className="space-y-2 text-[11px] font-semibold text-slate-700">
                    <li className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                      </div>
                      <span>GDPR & CCPA Compliant</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                      </div>
                      <span>No Data Sales Guarantee</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                      </div>
                      <span>Encrypted SSL Data Pipelines</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 border border-emerald-200">
                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                      </div>
                      <span>User Data Control & Removal</span>
                    </li>
                  </ul>
                </div>

                {/* 4. Have Legal Questions */}
                <div className="bg-[#000080]/5 p-3.5 rounded-2xl border border-[#000080]/10 space-y-1.5 relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-[#000080]/10 rounded-full blur-xl group-hover:scale-150 transition-all duration-500" />
                  <div className="flex items-center gap-2 text-xs font-bold text-[#000080]">
                    <HelpCircle className="w-4 h-4" />
                    <span>Have Legal Questions?</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Contact our Data Officer directly at <a href={`mailto:${securityContact}`} className="text-[#000080] font-bold hover:underline">{securityContact}</a>
                  </p>
                </div>
              </div>
            </aside>

            {/* Document Details Body */}
            <main id="legal-document-content" className="lg:col-span-9 space-y-12 bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-sm">
              
              <AnimatePresence mode="wait">
                {activeTab === 'privacy' && (
                  <motion.div
                    key="privacy"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="prose prose-slate max-w-none space-y-10"
                  >
                    {privacyData.bodyContent ? (
                      renderLegalBodyContent(privacyData.bodyContent)
                    ) : (
                      <>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                            <Lock className="w-6 h-6 text-[#000080]" />
                            1. Introduction & Overview
                          </h2>
                          <p className="text-slate-600 leading-relaxed text-base">
                            {privacyData.subtitle || `${businessName} ("Company", "we", "us", or "our") respects your privacy and is committed to protecting your personal data.`}
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-8">
                          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                            <Database className="w-6 h-6 text-[#000080]" />
                            2. Information We Collect
                          </h2>
                          <div className="grid md:grid-cols-2 gap-6 my-6">
                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                              <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-[#000080]" /> Directly Provided Data
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                                {(privacyData.collectedDirect || []).map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80">
                              <h4 className="font-bold text-slate-900 text-sm mb-2 flex items-center gap-2">
                                <Globe className="w-4 h-4 text-[#000080]" /> Automatically Collected Data
                              </h4>
                              <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                                {(privacyData.collectedAuto || []).map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {activeTab === 'terms' && (
                  <motion.div
                    key="terms"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="prose prose-slate max-w-none space-y-10"
                  >
                    {termsData.bodyContent ? (
                      renderLegalBodyContent(termsData.bodyContent)
                    ) : (
                      <>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                            <Scale className="w-6 h-6 text-[#000080]" />
                            1. Agreement to Terms
                          </h2>
                          <p className="text-slate-600 leading-relaxed text-base">
                            {termsData.subtitle}
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-8">
                          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                            <Building2 className="w-6 h-6 text-[#000080]" />
                            2. Intellectual Property Rights
                          </h2>
                          <p className="text-slate-600 leading-relaxed text-base">
                            {termsData.ipRights}
                          </p>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {activeTab === 'cookies' && (
                  <motion.div
                    key="cookies"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="prose prose-slate max-w-none space-y-10"
                  >
                    {cookiesData.bodyContent ? (
                      renderLegalBodyContent(cookiesData.bodyContent)
                    ) : (
                      <>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-3">
                            <Cookie className="w-6 h-6 text-[#000080]" />
                            1. What Are Cookies?
                          </h2>
                          <p className="text-slate-600 leading-relaxed text-base">
                            {cookiesData.subtitle}
                          </p>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Contact Notice Footer Box */}
              <div className="mt-12 pt-8 border-t border-slate-200 bg-slate-50 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Legal Contact & Data Protection Officer</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {businessName} • {businessAddress}
                  </p>
                </div>
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all shadow-md shrink-0"
                >
                  <Mail className="w-4 h-4" />
                  <span>Contact Legal Team</span>
                </a>
              </div>

            </main>
          </div>
        </div>
      </section>

    </div>
  );
}
