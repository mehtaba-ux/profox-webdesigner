import { ArrowUpRight, Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Twitter, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';
import { resolveSiteSettings } from '../lib/siteSettings';
import { useAuth } from '../lib/AuthContext';
import Logo from './Logo';
import VisualEditable from './admin/VisualEditable';

type FooterLink = { label: string; href: string; target?: string };

const defaultServices: FooterLink[] = [
  { label: 'Website Design & Development', href: '/services/website-design-and-development' },
  { label: 'Web & Mobile Application Development', href: '/services/web-and-mobile-application-development' },
  { label: 'Email Marketing & Business Automation', href: '/services/email-marketing-and-business-automation' },
];
const defaultCompany: FooterLink[] = [
  { label: 'About ProFox', href: '/about-us' },
  { label: 'Our Work', href: '/portfolio' },
  { label: 'Insights', href: '/blog' },
  { label: 'Careers', href: '/careers' },
  { label: 'Contact Us', href: '/contact-us' },
];
const defaultLegal: FooterLink[] = [
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Terms & Conditions', href: '/terms-and-conditions' },
  { label: 'Cookie Policy', href: '/cookie-policy' },
];

const normalizeLinks = (links: any, fallback: FooterLink[]) => {
  if (!Array.isArray(links) || links.length === 0 || links.some(item => typeof item === 'string')) return fallback;
  return links.filter(item => item?.label?.trim() && item?.href?.trim() && item.href.trim() !== '#');
};

function NavigationLink({ item }: { item: FooterLink }) {
  const href = item.href.trim();
  const className = 'group inline-flex items-start gap-2 text-sm leading-6 text-white/60 transition-colors hover:text-white';
  if (href.startsWith('/')) return <Link to={href} onClick={() => window.scrollTo(0, 0)} className={className}>{item.label}<ArrowUpRight className="mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></Link>;
  return <a href={href} target={item.target || '_blank'} rel="noopener noreferrer" className={className}>{item.label}<ArrowUpRight className="mt-1 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" /></a>;
}

export default function Footer() {
  const { content, isLiveEditing } = useCMS();
  const { isAdminOrEditor } = useAuth();
  const footerData = content.footer || {};
  const siteSettings = resolveSiteSettings(content.siteSettings);
  const description = footerData.description || 'ProFox designs websites, develops custom applications, and builds business automation systems that help companies attract customers, simplify operations, and measure growth.';
  const email = siteSettings.contactEmail;
  const phone = siteSettings.contactPhone;
  const businessName = siteSettings.businessName;
  const copyright = footerData.copyright || `© ${new Date().getFullYear()} ${businessName}. All rights reserved.`;
  const servicesLinks = normalizeLinks(footerData.servicesLinks, defaultServices);
  const companyLinks = normalizeLinks(footerData.companyLinks, defaultCompany);
  const legalLinks = normalizeLinks(footerData.legalLinks, defaultLegal);
  const logoSize = Math.min(96, Math.max(40, Number(footerData.logoSize) || 58));
  const socialConfig = footerData.socialLinks || {};
  const socials = [
    { label: 'LinkedIn', url: socialConfig.linkedin, icon: Linkedin },
    { label: 'Facebook', url: socialConfig.facebook, icon: Facebook },
    { label: 'Instagram', url: socialConfig.instagram, icon: Instagram },
    { label: 'X / Twitter', url: socialConfig.twitter, icon: Twitter },
    { label: 'YouTube', url: socialConfig.youtube, icon: Youtube },
  ].filter(item => /^https?:\/\//i.test(item.url || ''));

  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-[#0b0d18] text-white">
      <div aria-hidden className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#000080]/35 blur-[120px]" />
      <div aria-hidden className="absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-[#5c5cff]/15 blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-8 pt-16 md:pt-20">
        <div className="grid gap-14 border-b border-white/10 pb-16 lg:grid-cols-[1.35fr_0.8fr_0.7fr_0.7fr] lg:gap-12">
          <div className="max-w-md">
            <VisualEditable section="theme" field="logoUrl" value={content.theme?.logoUrl || ''} label="Header & Footer Logo" type="image" isLiveEditing={isAdminOrEditor && isLiveEditing}>
              <div style={{ height: logoSize }} className="w-fit max-w-full">
                <Logo light className="h-full max-w-full w-auto" />
              </div>
            </VisualEditable>
            <VisualEditable section="footer" field="description" value={description} label="Footer Description" type="textarea" isLiveEditing={isAdminOrEditor && isLiveEditing}>
              <p className="mt-7 max-w-sm text-sm leading-7 text-white/60">{description}</p>
            </VisualEditable>
            {socials.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-3" aria-label="Social media links">
                {socials.map(({ label, url, icon: Icon }) => <a key={label} href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-white/65 transition-all hover:-translate-y-1 hover:border-[#7373ff] hover:bg-[#000080] hover:text-white"><Icon className="h-4 w-4" /></a>)}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-[#aaaaff]">{footerData.servicesHeading || 'Core Services'}</h2>
            <ul className="space-y-4">{servicesLinks.map((item, index) => <li key={`${item.href}-${index}`}><NavigationLink item={item} /></li>)}</ul>
          </div>
          <div>
            <h2 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-[#aaaaff]">{footerData.companyHeading || 'Company'}</h2>
            <ul className="space-y-3">{companyLinks.map((item, index) => <li key={`${item.href}-${index}`}><NavigationLink item={item} /></li>)}</ul>
          </div>
          <div>
            <h2 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-[#aaaaff]">{footerData.legalHeading || 'Legal'}</h2>
            <ul className="space-y-3">{legalLinks.map((item, index) => <li key={`${item.href}-${index}`}><NavigationLink item={item} /></li>)}</ul>
          </div>
        </div>

        <div className="grid gap-8 border-b border-white/10 py-10 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-[#aaaaff]">{footerData.contactHeading || 'Registered Business Contact'}</div>
            <div className="mt-5 flex flex-col gap-4 text-sm text-white/65 sm:flex-row sm:flex-wrap sm:gap-x-8">
              <span className="inline-flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#7373ff]" /><span>{siteSettings.businessAddress}</span></span>
              <a href={`mailto:${email}`} className="inline-flex items-center gap-3 transition-colors hover:text-white"><Mail className="h-4 w-4 text-[#7373ff]" />{email}</a>
              {phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-3 transition-colors hover:text-white"><Phone className="h-4 w-4 text-[#7373ff]" />{phone}</a>}
            </div>
          </div>
          <Link to="/contact-us" className="inline-flex w-fit items-center gap-3 rounded-xl bg-white px-6 py-3.5 text-sm font-extrabold text-[#000080] shadow-xl transition-all hover:-translate-y-1 hover:bg-[#f0f1ff]">{footerData.ctaText || 'Start a Conversation'}<ArrowUpRight className="h-4 w-4" /></Link>
        </div>

        <div className="flex flex-col gap-4 pt-8 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>{copyright}</p>
          <p>{footerData.registrationText || 'ProFox Digital Solution · Udyam: UDYAM-HP-09-0022689'}</p>
          {isAdminOrEditor && <Link to="/admin" className="font-semibold text-white/60 hover:text-white">CMS Admin</Link>}
        </div>
      </div>
    </footer>
  );
}
