import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Globe2,
  GraduationCap,
  Layers3,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
  WalletCards,
  Workflow,
} from 'lucide-react';
import type { CareerJob } from '../lib/careerService';
import UIUXDesignerApplicationForm from '../components/careers/UIUXDesignerApplicationForm';

const IMAGES = {
  hero: 'https://images.unsplash.com/photo-1758876202983-c36dd5019142?auto=format&fit=crop&w=2200&q=84',
  focused: 'https://images.unsplash.com/photo-1758876020198-bf12be71473f?auto=format&fit=crop&w=1800&q=82',
  collaboration: 'https://images.unsplash.com/photo-1758873272808-5580ed7deb44?auto=format&fit=crop&w=1800&q=82',
  interview: 'https://images.unsplash.com/photo-1739298061758-f950267d6d75?auto=format&fit=crop&w=1800&q=82',
  meeting: 'https://images.unsplash.com/photo-1770048532658-14834b7acef8?auto=format&fit=crop&w=1800&q=82',
  remote: 'https://images.unsplash.com/photo-1769071167081-0b0ddce3754d?auto=format&fit=crop&w=1800&q=82',
};

const responsibilities = [
  'Turn approved project briefs, content and business goals into clear UX and responsive UI.',
  'Create information architecture, user flows, wireframes and conversion-focused interface structures.',
  'Build polished Figma designs using reusable components, Auto Layout, variants, variables and design-system standards.',
  'Cover responsive layouts, forms, errors, empty states and important interaction states before development.',
  'Consider accessibility throughout the experience, not as an afterthought.',
  'Complete self-QA, respond professionally to review feedback and prepare a clean developer handoff.',
  'Communicate early when scope, requirements or deadlines are unclear or at risk.',
  'Protect confidential client and company information throughout every project.',
];

const requirements = [
  'A strong UI/UX or web-design portfolio showing real problem solving and your individual contribution.',
  'Professional Figma skills, including Auto Layout, components, variants and reusable systems.',
  'Strong responsive design, visual hierarchy, typography, spacing and interaction-state skills.',
  'Ability to explain design decisions using user, business, conversion and accessibility reasoning.',
  'Working understanding of accessibility and developer-ready handoff.',
  'Reliable communication, remote-work discipline and the ability to meet agreed project deadlines.',
];

const workflow = [
  ['01', 'Qualify', 'Complete recruitment, onboarding, Design Academy and final approval.'],
  ['02', 'Receive opportunities', 'Suitable projects may be offered based on your skills, capacity and project needs.'],
  ['03', 'Review first', 'Understand the scope, deliverables, timeline and payment terms before starting.'],
  ['04', 'Accept the project', 'Take on assignments that fit your skills and current availability.'],
  ['05', 'Design & deliver', 'Work through the ProFox design workflow, reviews and quality gates.'],
  ['06', 'Complete & grow', 'Deliver approved work, build trust and qualify for larger opportunities over time.'],
];

const qualityGates = [
  'Designer Self-QA',
  'Independent Design QA',
  'Accessibility Review',
  'Technical Feasibility',
  'Client Design Approval',
  'Developer Handoff',
  'Implementation Review',
];

const performanceSignals = [
  'Quality of work',
  'UX and business thinking',
  'Reliability',
  'Communication',
  'Deadline discipline',
  'Response to feedback',
  'Developer handoff quality',
  'Consistency over time',
];

const selection = [
  ['Application', 'Submit your CV, portfolio, experience and design application.'],
  ['Portfolio review', 'We review UX thinking, visual quality, responsive design, systems thinking and your real contribution.'],
  ['Design assessment', 'Shortlisted applicants complete a structured design/Figma evaluation. It is an evaluation exercise, not unpaid client production work.'],
  ['Design interview', 'We evaluate judgment, communication, collaboration and delivery readiness.'],
  ['Agreement & onboarding', 'Selected applicants complete the approved contractor agreement and receive controlled onboarding access.'],
  ['Design Academy', 'Learn the exact standards and workflow required for ProFox projects.'],
  ['Final certification', 'Demonstrate development-ready design skill and pass the required quality standard.'],
  ['Final approval', 'Once approved, you become eligible for project opportunities.'],
];

const faqs = [
  ['Is this a salaried job?', 'Not initially. This UI/UX Designer opportunity starts as paid, project-based contract work.'],
  ['What is the earning potential?', 'Depending on available projects, project scope, your availability, the work you accept and your performance, there is potential to earn approximately $1,500+–$3,000+ per month. This is not guaranteed monthly income.'],
  ['Will ProFox guarantee projects every month?', 'No. Project volume depends on client demand, business needs, your skills, availability, project fit and performance.'],
  ['How is project payment decided?', 'Payment depends on project scope, complexity, deliverables and applicable project terms. The relevant payment information should be clear before work begins.'],
  ['Can I receive a salary later?', 'Potentially. After at least 6 months of consistent, high-quality performance, you may be considered for a salary-based opportunity. Salary and terms would be discussed at that time.'],
  ['Is salary guaranteed after six months?', 'No. Six months makes strong performers eligible for consideration. Any salary offer depends on performance, consistency, an available role and ProFox business requirements.'],
  ['Do I need a portfolio?', 'Yes. Your portfolio and your ability to explain what you personally contributed are important parts of the selection process.'],
  ['Will the practical assessment be real unpaid client work?', 'No. Recruitment practical assessments are intended to evaluate skill and are not presented as unpaid production work for a paying client.'],
];

export default function UIUXDesignerJobView({ job }: { job: CareerJob }) {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Hero job={job} />

      <section className="border-b border-slate-200 bg-white py-14 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <Eyebrow>Quick role overview</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126] sm:text-4xl">Know exactly what you&apos;re applying for.</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">A remote, project-based design opportunity for people who want paid client work now and a clear path to earn more responsibility over time.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Snapshot icon={BriefcaseBusiness} label="Work model" value="Project-Based Contract" />
              <Snapshot icon={WalletCards} label="Payment" value="Paid Per Project" />
              <Snapshot icon={BadgeDollarSign} label="Earning potential" value="$1,500+–$3,000+ / month" />
              <Snapshot icon={Globe2} label="Location" value="Remote" />
              <Snapshot icon={Clock3} label="Experience" value="2+ years preferred" />
              <Snapshot icon={GraduationCap} label="Future path" value="Salary discussion after 6 months*" />
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-400">*Future salary consideration is performance-based and is not guaranteed.</p>
          </div>
          <ImagePanel src={IMAGES.remote} alt="Male professional working remotely on a laptop" />
        </div>
      </section>

      <ContentSection image={IMAGES.focused} imageAlt="Male designer focused on laptop work" reverse eyebrow="The opportunity" title="More than another freelance gig.">
        <p>At ProFox, you work on real client projects through a structured system—not random tasks with unclear expectations.</p>
        <p>You receive approved requirements, content and business goals, then turn them into clear, conversion-aware, accessible experiences that are ready for development.</p>
        <CheckList items={['Real client projects', 'Clear project scope', 'Structured design reviews', 'Professional developer handoff', 'Long-term growth based on performance']} />
      </ContentSection>

      <ContentSection image={IMAGES.meeting} imageAlt="Male professional reviewing work in a meeting room" eyebrow="Clear from the start" title="How you earn with ProFox.">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard title="Paid per project">You are paid for approved project assignments you accept and successfully complete.</InfoCard>
          <InfoCard title="$1,500+–$3,000+ potential">Monthly earning potential depends on available work, scope, capacity and performance.</InfoCard>
          <InfoCard title="Know before you accept">Project scope, deliverables, timeline and applicable payment terms should be clear before work begins.</InfoCard>
          <InfoCard title="No fixed salary initially">This starts as project-based contract work—not a guaranteed monthly salary or guaranteed paid hours.</InfoCard>
        </div>
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><p className="text-sm leading-6 text-emerald-950"><strong>Future salary opportunity:</strong> after at least 6 months of consistent, high-quality performance, you may be considered for a salary-based role. Salary and terms would be discussed at that time.</p></div>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-slate-400">Earning potential, project volume and future salary opportunities are not guaranteed.</p>
      </ContentSection>

      <section className="bg-[#07101f] py-16 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <ImagePanel src={IMAGES.collaboration} alt="Male professional collaborating remotely from a laptop" dark />
            <div>
              <Eyebrow light>Simple. Structured. Transparent.</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">From project opportunity to delivery.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">You should know what is expected before work begins. Our process keeps project acceptance, quality and delivery clear.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {workflow.map(([number, title, text]) => (
                  <div key={number} className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.075]">
                    <div className="text-xs font-black text-emerald-300">{number}</div>
                    <h3 className="mt-2 text-sm font-black">{title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContentSection image={IMAGES.hero} imageAlt="Male designer working at a desk with a laptop" reverse eyebrow="Design with purpose" title="What you&apos;ll design—and own.">
        <p>Your job is not simply to make screens look attractive. You should understand why the design exists, what the user needs, and how the experience supports the client&apos;s business goal.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['User flows', 'Wireframes', 'Landing pages', 'Business websites', 'Web apps', 'Responsive UI', 'Design systems', 'Prototypes', 'Developer handoff'].map(item => <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">{item}</span>)}
        </div>
        <CheckList items={responsibilities} />
      </ContentSection>

      <ContentSection image={IMAGES.interview} imageAlt="Male professional discussing work across a desk" eyebrow="Skill matters. Thinking matters more." title="What we&apos;re looking for.">
        <CheckList items={requirements} />
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-sm font-black text-amber-950">This role may not be for you if...</h3>
          <p className="mt-2 text-xs leading-6 text-amber-900">You only want to make attractive screens, dislike structured feedback, repeatedly miss deadlines without communicating, or treat developer handoff as someone else&apos;s problem.</p>
        </div>
      </ContentSection>

      <ContentSection image={IMAGES.focused} imageAlt="Male professional reviewing a project on a laptop" reverse eyebrow="PF-SOP-08 design workflow" title="Your work goes through real quality gates.">
        <p>Feedback is part of the process. The goal is not bureaucracy—it is to prevent weak design decisions from becoming expensive development mistakes.</p>
        <div className="mt-6 space-y-2">
          {qualityGates.map((gate, index) => (
            <div key={gate} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-[#000080]/30 hover:shadow-sm">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#000080]/8 text-[10px] font-black text-[#000080]">{index + 1}</div>
              <span className="text-sm font-bold text-slate-700">{gate}</span>
            </div>
          ))}
        </div>
      </ContentSection>

      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <Eyebrow>Prove your quality. Build your position.</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126] sm:text-4xl">Your first 6 months can open a bigger door.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Your first stage with ProFox is project-based. During that time, we look at the quality and consistency of how you work—not just whether one screen looks good.</p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {performanceSignals.map(item => <div key={item} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-xs font-bold text-slate-700"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />{item}</div>)}
            </div>
            <div className="mt-6 rounded-2xl bg-[#000080] p-5 text-white">
              <h3 className="text-base font-black">Possible growth path</h3>
              <p className="mt-2 text-xs leading-6 text-blue-100">Project-Based UI/UX Designer → Trusted Designer → Higher-Complexity Projects → Senior/Review Responsibility → Potential Salary-Based Role</p>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-slate-400">A salary role is not automatically guaranteed after six months. It depends on performance, consistency, an available role and ProFox business requirements.</p>
          </div>
          <ImagePanel src={IMAGES.meeting} alt="Male professional in a modern office discussing career growth" />
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <ImagePanel src={IMAGES.interview} alt="Male candidate in a professional interview setting" />
              <Eyebrow className="mt-7">No guessing</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126] sm:text-4xl">What happens after you apply.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">We look for real skill, clean thinking and reliable delivery—not fancy language.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {selection.map(([title, text], index) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-[#000080]/20 hover:bg-white hover:shadow-md">
                  <div className="text-xs font-black text-[#FF0E0E]">{String(index + 1).padStart(2, '0')}</div>
                  <h3 className="mt-3 text-sm font-black text-[#071126]">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-[#fbfcff] py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <ImagePanel src={IMAGES.remote} alt="Male professional reading project information on a laptop" />
            <Eyebrow className="mt-7">Important before you apply</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126]">Make sure this opportunity matches what you want.</h2>
            <CheckList items={[
              'This role begins as paid, project-based work.',
              'It is not a salaried role initially.',
              'Monthly work volume and fixed paid hours are not guaranteed.',
              '$1,500+–$3,000+ is earning potential, not guaranteed income.',
              'Project opportunities depend on demand, scope, skills, availability, fit and performance.',
              'Weekly availability represents your capacity—not guaranteed paid hours.',
              'Quality standards and review are mandatory.',
              'After at least 6 months, strong performers may be considered for a salary discussion.',
            ]} />
          </div>
          <div>
            <Eyebrow>Frequently asked questions</Eyebrow>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126]">Clear answers before you apply.</h2>
            <div className="mt-6 space-y-3">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group rounded-2xl border border-slate-200 bg-white p-5 open:border-[#000080]/25 open:shadow-sm">
                  <summary className="cursor-pointer list-none pr-6 text-sm font-black text-slate-900 marker:hidden">{question}</summary>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative isolate min-h-[520px] overflow-hidden bg-[#07101f] text-white">
        <img src={IMAGES.hero} alt="Male UI UX professional working in a modern office" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#050b1d]/95 via-[#050b1d]/82 to-[#050b1d]/50" />
        <div className="mx-auto flex min-h-[520px] max-w-6xl items-center px-5 py-16 sm:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300"><Sparkles className="h-3.5 w-3.5" /> Your quality creates your next opportunity</div>
            <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl">Ready to turn your UI/UX skill into paid project opportunities?</h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200">Start with real project work. Build trust through consistent quality. Strong performers can grow toward larger projects and possible salary consideration after six months.</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-black"><span className="rounded-full bg-white/10 px-3 py-2">$1,500+–$3,000+ potential</span><span className="rounded-full bg-white/10 px-3 py-2">Remote</span><span className="rounded-full bg-white/10 px-3 py-2">Paid per project</span></div>
            <a href="#apply" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-[#000080] transition hover:-translate-y-0.5 hover:bg-slate-100">Apply for UI/UX Designer <ArrowRight className="h-4 w-4" /></a>
            <p className="mt-4 text-[10px] leading-5 text-slate-400">Project availability, monthly earnings and future salary opportunities are not guaranteed.</p>
          </div>
        </div>
      </section>

      <UIUXDesignerApplicationForm job={job} />
    </div>
  );
}

function Hero({ job }: { job: CareerJob }) {
  return (
    <section className="relative isolate flex min-h-[100svh] max-h-[100svh] overflow-hidden bg-[#07101f] text-white">
      <img src={IMAGES.hero} alt="Male UI UX designer working on a laptop in a modern office" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#030816]/95 via-[#030816]/82 to-[#030816]/45" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,rgba(0,0,128,0.42),transparent_38%)]" />
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 pb-8 pt-24 sm:px-6 sm:pb-10 sm:pt-28">
        <div className="max-w-3xl">
          <Link to="/careers" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3.5 py-1.5 text-[11px] font-bold text-slate-200 backdrop-blur transition hover:bg-white/10"><ArrowLeft className="h-3.5 w-3.5" /> Back to Careers</Link>
          <div className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-300">Remote · Project-Based · Paid Per Project</div>
          <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.8rem)] font-black leading-[0.98] tracking-[-0.055em]">Design real client experiences. <span className="text-emerald-300">Earn $1,500+–$3,000+</span> in monthly project potential.</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">Join ProFox as a UI/UX Designer and turn approved business requirements into clean, conversion-aware and accessible digital experiences. Start with paid project work and build toward bigger opportunities through consistent quality.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <HeroBadge icon={BadgeDollarSign}>$1,500+–$3,000+ potential</HeroBadge>
            <HeroBadge icon={WalletCards}>Paid per project</HeroBadge>
            <HeroBadge icon={CalendarCheck2}>Salary consideration after 6 months*</HeroBadge>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="#apply" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-[#000080] transition hover:-translate-y-0.5 hover:bg-slate-100">{job.applicationCta || 'Apply for UI/UX Designer'} <ArrowRight className="h-4 w-4" /></a>
            <span className="text-[11px] leading-5 text-slate-300">Portfolio required · Structured review · Real client work</span>
          </div>
          <p className="mt-4 max-w-xl text-[10px] leading-4 text-slate-400">*Earnings, project volume and future salary opportunities are potential only and are not guaranteed.</p>
        </div>
      </div>
    </section>
  );
}

function HeroBadge({ icon: Icon, children }: { icon: any; children: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 text-[11px] font-black text-white backdrop-blur"><Icon className="h-3.5 w-3.5 text-emerald-300" />{children}</span>;
}

function Snapshot({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
      <Icon className="h-4 w-4 text-[#000080]" />
      <div className="mt-2 text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function ContentSection({ image, imageAlt, reverse = false, eyebrow, title, children }: { image: string; imageAlt: string; reverse?: boolean; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className={`mx-auto grid max-w-6xl gap-8 px-5 sm:px-6 lg:grid-cols-2 lg:items-center ${reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <ImagePanel src={image} alt={imageAlt} />
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[#071126] sm:text-4xl">{title}</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">{children}</div>
        </div>
      </div>
    </section>
  );
}

function ImagePanel({ src, alt, dark = false }: { src: string; alt: string; dark?: boolean }) {
  return (
    <div className={`relative min-h-[320px] overflow-hidden rounded-3xl border ${dark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-100'} shadow-sm sm:min-h-[400px]`}>
      <img src={src} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-[1.025]" />
      <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-t from-[#07101f]/45 to-transparent' : 'bg-gradient-to-t from-slate-950/12 to-transparent'}`} />
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"><h3 className="text-sm font-black text-[#071126]">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-600">{children}</p></div>;
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className="mt-5 space-y-2.5">
      {items.map(item => <div key={item} className="flex gap-2.5 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>{item}</span></div>)}
    </div>
  );
}

function Eyebrow({ children, light = false, className = '' }: { children: React.ReactNode; light?: boolean; className?: string }) {
  return <div className={`text-[10px] font-black uppercase tracking-[0.17em] ${light ? 'text-emerald-300' : 'text-[#FF0E0E]'} ${className}`}>{children}</div>;
}
