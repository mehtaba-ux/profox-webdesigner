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
  ShieldCheck,
  Palette,
  WalletCards,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
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

const pageNav = [
  ['Overview', 'overview'],
  ['Earnings', 'earnings'],
  ['Workflow', 'workflow'],
  ['Responsibilities', 'responsibilities'],
  ['Quality', 'quality'],
  ['Growth', 'growth'],
  ['Selection', 'selection'],
  ['FAQ', 'faq'],
  ['Apply', 'apply'],
];

export default function UIUXDesignerJobView({ job }: { job: CareerJob }) {
  return (
    <div className="min-h-screen bg-white text-[#202126]">
      <Hero job={job} />

      <nav aria-label="UI UX Designer page sections" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl overflow-x-auto px-5 sm:px-6">
          <div className="flex min-w-max items-center gap-7 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">UI/UX Designer</span>
            {pageNav.map(([label, id]) => (
              <a key={id} href={`#${id}`} className="text-[11px] font-medium text-slate-500 transition hover:text-emerald-600">
                {label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <section id="overview" className="scroll-mt-24 bg-white py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div>
              <Eyebrow>Quick role overview</Eyebrow>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-[#202126] sm:text-5xl">
                Know exactly what you&apos;re applying for.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
                A remote, project-based design opportunity for people who want paid client work now and a clear path to earn more responsibility over time.
              </p>
            </div>
            <MediaCard src={IMAGES.remote} alt="Male professional working remotely on a laptop">
              <div className="absolute bottom-4 left-4 rounded-lg bg-white px-4 py-3 shadow-xl">
                <div className="text-2xl font-semibold tracking-tight text-[#202126]">$1,500+–$3,000+</div>
                <div className="mt-1 text-[10px] font-medium text-slate-500">Monthly earning potential*</div>
              </div>
            </MediaCard>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Snapshot icon={BriefcaseBusiness} label="Work model" value="Project-Based Contract" />
            <Snapshot icon={WalletCards} label="Payment" value="Paid Per Project" />
            <Snapshot icon={BadgeDollarSign} label="Earning potential" value="$1,500+–$3,000+ / month" />
            <Snapshot icon={Globe2} label="Location" value="Remote" />
            <Snapshot icon={Clock3} label="Experience" value="2+ years preferred" />
            <Snapshot icon={GraduationCap} label="Future path" value="Salary discussion after 6 months*" />
          </div>
          <p className="mt-4 text-[10px] leading-5 text-slate-400">*Earnings, project volume and future salary consideration are potential only and are not guaranteed.</p>
        </div>
      </section>

      <section className="bg-[#202126] py-20 text-white sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Eyebrow light>The opportunity</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">More than another freelance gig.</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
                At ProFox, you work on real client projects through a structured system—not random tasks with unclear expectations.
              </p>
            </div>
            <a href="#apply" className="inline-flex w-fit items-center gap-2 rounded-md bg-white px-4 py-2.5 text-xs font-semibold text-[#202126] transition hover:-translate-y-0.5 hover:bg-slate-100">
              Apply now <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <OfferCard title="Real client work" icon={BriefcaseBusiness}>
              You receive approved requirements, content and business goals, then turn them into clear, conversion-aware, accessible experiences that are ready for development.
            </OfferCard>
            <OfferCard title="Structured delivery" icon={Workflow}>
              Clear project scope, controlled design reviews, professional developer handoff and long-term growth based on performance.
            </OfferCard>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <MediaCard src={IMAGES.focused} alt="Male designer focused on laptop work" compact />
            <MediaCard src={IMAGES.collaboration} alt="Male professional collaborating on digital work" compact />
          </div>
        </div>
      </section>

      <section id="earnings" className="scroll-mt-24 bg-[#f4f6fb] py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <Eyebrow>Clear from the start</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">How you earn with ProFox.</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-600">
                You should know how the commercial relationship works before you apply. No hidden salary promise. No unclear project terms.
              </p>
              <MediaCard src={IMAGES.meeting} alt="Male professional reviewing project information in a meeting" className="mt-8" compact />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard title="Paid per project">You are paid for approved project assignments you accept and successfully complete.</InfoCard>
              <InfoCard title="$1,500+–$3,000+ potential">Monthly earning potential depends on available work, scope, capacity and performance.</InfoCard>
              <InfoCard title="Know before you accept">Project scope, deliverables, timeline and applicable payment terms should be clear before work begins.</InfoCard>
              <InfoCard title="No fixed salary initially">This starts as project-based contract work—not a guaranteed monthly salary or guaranteed paid hours.</InfoCard>
              <div className="sm:col-span-2 rounded-lg bg-[#202126] p-6 text-white">
                <div className="flex items-start gap-3">
                  <Palette className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <h3 className="text-base font-semibold">Future salary opportunity</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-300">
                      After at least 6 months of consistent, high-quality performance, you may be considered for a salary-based role. Salary and terms would be discussed at that time.
                    </p>
                  </div>
                </div>
              </div>
              <p className="sm:col-span-2 text-[10px] leading-5 text-slate-400">Earning potential, project volume and future salary opportunities are not guaranteed.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="workflow" className="scroll-mt-24 bg-white py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
            <div>
              <MediaCard src={IMAGES.collaboration} alt="Male professional collaborating remotely from a laptop" />
            </div>
            <div>
              <Eyebrow>Simple. Structured. Transparent.</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">From project opportunity to delivery.</h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-600">
                You should know what is expected before work begins. Our process keeps project acceptance, quality and delivery clear.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {workflow.map(([number, title, text]) => (
                  <div key={number} className="rounded-lg border border-slate-200 bg-[#f8f9fc] p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:bg-white hover:shadow-lg">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-[10px] font-semibold text-emerald-700">{number}</div>
                    <h3 className="mt-4 text-sm font-semibold text-[#202126]">{title}</h3>
                    <p className="mt-2 text-xs leading-6 text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="responsibilities" className="scroll-mt-24 relative overflow-hidden bg-[#202126] py-20 text-white sm:py-24 lg:py-28">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_center,rgba(74,82,99,0.55),transparent_68%)]" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <Eyebrow light>Design with purpose</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">What you&apos;ll design—and own.</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
                Your job is not simply to make screens look attractive. You should understand why the design exists, what the user needs, and how the experience supports the client&apos;s business goal.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {['User flows', 'Wireframes', 'Landing pages', 'Business websites', 'Web apps', 'Responsive UI', 'Design systems', 'Prototypes', 'Developer handoff'].map(item => (
                  <span key={item} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-slate-200">{item}</span>
                ))}
              </div>
            </div>
            <MediaCard src={IMAGES.hero} alt="Male designer working at a desk with a laptop" dark />
          </div>

          <div className="mt-10 grid gap-x-8 gap-y-1 border-t border-white/10 pt-8 md:grid-cols-2">
            {responsibilities.map(item => (
              <div key={item} className="flex gap-3 border-b border-white/10 py-4 text-sm leading-6 text-slate-300">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
            <div>
              <Eyebrow>Skill matters. Thinking matters more.</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">What we&apos;re looking for.</h2>
              <div className="mt-8 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {requirements.map(item => (
                  <div key={item} className="flex gap-3 border-b border-slate-200 py-4 text-sm leading-6 text-slate-600">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-7 border-l-2 border-emerald-500 pl-5">
                <h3 className="text-sm font-semibold text-[#202126]">This role may not be for you if...</h3>
                <p className="mt-2 max-w-2xl text-xs leading-6 text-slate-600">
                  You only want to make attractive screens, dislike structured feedback, repeatedly miss deadlines without communicating, or treat developer handoff as someone else&apos;s problem.
                </p>
              </div>
            </div>
            <MediaCard src={IMAGES.interview} alt="Male professional discussing design work across a desk" />
          </div>
        </div>
      </section>

      <section id="quality" className="scroll-mt-24 bg-[#f4f6fb] py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <Eyebrow>PF-SOP-08 design workflow</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">Your work goes through real quality gates.</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600">
                Feedback is part of the process. The goal is not bureaucracy—it is to prevent weak design decisions from becoming expensive development mistakes.
              </p>
              <MediaCard src={IMAGES.focused} alt="Male professional reviewing a project on a laptop" className="mt-8" compact />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {qualityGates.map((gate, index) => (
                <div key={gate} className="rounded-lg border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="text-[10px] font-semibold text-emerald-600">{String(index + 1).padStart(2, '0')}</div>
                  <div className="mt-2 text-sm font-semibold text-[#202126]">{gate}</div>
                </div>
              ))}
              <div className="rounded-lg bg-[#202126] p-5 text-white sm:col-span-2">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <p className="text-xs leading-6 text-slate-300">
                    Every quality gate protects the client, the designer and the development team by making approval and handoff explicit.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="growth" className="scroll-mt-24 bg-[#202126] py-20 text-white sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div>
              <Eyebrow light>Prove your quality. Build your position.</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">Your first 6 months can open a bigger door.</h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
                Your first stage with ProFox is project-based. During that time, we look at the quality and consistency of how you work—not just whether one screen looks good.
              </p>
              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                {performanceSignals.map(item => (
                  <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs font-medium text-slate-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-7 border-l-2 border-emerald-400 pl-5">
                <h3 className="text-sm font-semibold">Possible growth path</h3>
                <p className="mt-2 text-xs leading-6 text-slate-300">
                  Project-Based UI/UX Designer → Trusted Designer → Higher-Complexity Projects → Senior/Review Responsibility → Potential Salary-Based Role
                </p>
              </div>
              <p className="mt-5 text-[10px] leading-5 text-slate-500">
                A salary role is not automatically guaranteed after six months. It depends on performance, consistency, an available role and ProFox business requirements.
              </p>
            </div>
            <MediaCard src={IMAGES.meeting} alt="Male professional discussing growth and performance in a meeting" dark />
          </div>
        </div>
      </section>

      <section id="selection" className="scroll-mt-24 bg-white py-20 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
            <div>
              <MediaCard src={IMAGES.interview} alt="Male candidate in a professional interview setting" compact />
              <Eyebrow className="mt-8">No guessing</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl">What happens after you apply.</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600">We look for real skill, clean thinking and reliable delivery—not fancy language.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {selection.map(([title, text], index) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-[#f8f9fc] p-5 transition hover:-translate-y-1 hover:bg-white hover:shadow-lg">
                  <div className="text-[10px] font-semibold text-emerald-600">{String(index + 1).padStart(2, '0')}</div>
                  <h3 className="mt-3 text-sm font-semibold text-[#202126]">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-y border-slate-200 bg-[#f4f6fb] py-20 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-6 lg:grid-cols-[.78fr_1.22fr] lg:items-start">
          <div>
            <MediaCard src={IMAGES.remote} alt="Male professional reading project information on a laptop" compact />
            <Eyebrow className="mt-8">Important before you apply</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-[#202126] sm:text-4xl">Make sure this opportunity matches what you want.</h2>
            <div className="mt-6 space-y-3">
              {[
                'This role begins as paid, project-based work.',
                'It is not a salaried role initially.',
                'Monthly work volume and fixed paid hours are not guaranteed.',
                '$1,500+–$3,000+ is earning potential, not guaranteed income.',
                'Project opportunities depend on demand, scope, skills, availability, fit and performance.',
                'Weekly availability represents your capacity—not guaranteed paid hours.',
                'Quality standards and review are mandatory.',
                'After at least 6 months, strong performers may be considered for a salary discussion.',
              ].map(item => (
                <div key={item} className="flex gap-3 text-xs leading-6 text-slate-600">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Eyebrow>Frequently asked questions</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-[#202126] sm:text-4xl">Clear answers before you apply.</h2>
            <div className="mt-7 space-y-2">
              {faqs.map(([question, answer]) => (
                <details key={question} className="group rounded-md border border-slate-200 bg-white px-5 py-4 open:border-emerald-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[#202126] marker:hidden">
                    {question}
                    <span className="text-lg font-light text-emerald-600 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative isolate min-h-[560px] overflow-hidden bg-[#202126] text-white">
        <img src={IMAGES.hero} alt="Male UI UX professional working in a modern office" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#202126]/96 via-[#202126]/82 to-[#202126]/38" />
        <div className="mx-auto flex min-h-[560px] max-w-6xl items-center px-5 py-16 sm:px-6">
          <div className="max-w-3xl">
            <Eyebrow light>Your quality creates your next opportunity</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
              Ready to turn your UI/UX skill into paid project opportunities?
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200">
              Start with real project work. Build trust through consistent quality. Strong performers can grow toward larger projects and possible salary consideration after six months.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="rounded-md border border-white/15 bg-black/20 px-3 py-2">$1,500+–$3,000+ potential</span>
              <span className="rounded-md border border-white/15 bg-black/20 px-3 py-2">Remote</span>
              <span className="rounded-md border border-white/15 bg-black/20 px-3 py-2">Paid per project</span>
            </div>
            <a href="#apply" className="mt-7 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#202126] transition hover:-translate-y-0.5 hover:bg-slate-100">
              Apply for UI/UX Designer <ArrowRight className="h-4 w-4" />
            </a>
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
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#000080] text-white lg:h-[100svh]">
      <img
        src={IMAGES.hero}
        alt="Male UI UX designer working on a laptop in a modern office"
        fetchPriority="high"
        className="absolute inset-0 -z-30 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 -z-20 bg-gradient-to-r from-[#020233]/98 via-[#000080]/88 to-[#020233]/42" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_74%_28%,rgba(255,14,14,0.13),transparent_30%)]" />

      <div className="mx-auto grid min-h-[100svh] w-full max-w-6xl items-center gap-8 px-5 pb-8 pt-28 sm:px-6 lg:h-full lg:min-h-0 lg:grid-cols-[1.08fr_.92fr] lg:pt-28">
        <div className="max-w-[720px]">
          <Link to="/careers" className="inline-flex items-center gap-2 text-[11px] font-medium text-blue-100 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Careers
          </Link>
          <div className="mt-4 text-[10px] font-black uppercase tracking-[0.19em] text-[#FF4A4A]">Remote · Project-Based · Paid Per Project</div>
          <h1 className="mt-4 max-w-[720px] text-[clamp(2.15rem,3.8vw,3.8rem)] font-black leading-[0.98] tracking-[-0.052em] text-white">
            <span className="block">Design Real Client Experiences.</span>
            <span className="mt-1 block">Get Paid Per Project.</span>
            <span className="mt-1 block">Monthly Earning Potential: <span className="text-[#FF4A4A]">$1,500+–$3,000+</span>.</span>
          </h1>
          <p className="mt-5 max-w-[640px] text-sm leading-6 text-blue-50 sm:text-[15px] sm:leading-7">
            Join ProFox remotely as a UI/UX Designer. Review scope, deadlines and payment before accepting each project. Consistent high-quality performance can lead to salary consideration after 6 months.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <HeroPill icon={BadgeDollarSign}>$1,500+–$3,000+ potential</HeroPill>
            <HeroPill icon={WalletCards}>Paid per project</HeroPill>
            <HeroPill icon={CalendarCheck2}>Salary consideration after 6 months*</HeroPill>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a href="#apply" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF0E0E] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:brightness-95">
              {job.applicationCta || 'Apply for UI/UX Designer'} <ArrowRight className="h-4 w-4" />
            </a>
            <span className="text-[11px] leading-5 text-blue-100">Portfolio required · Structured review · Real client work</span>
          </div>
          <p className="mt-3 max-w-xl text-[10px] leading-4 text-blue-200/75">*Earnings, project volume and future salary opportunities are potential only and are not guaranteed.</p>
        </div>

        <div className="hidden lg:flex lg:justify-end">
          <div className="w-full max-w-[320px] rounded-2xl border border-white/15 bg-[#00004D]/78 p-5 shadow-2xl backdrop-blur-md">
            <div className="text-[10px] font-black uppercase tracking-[0.17em] text-[#FF4A4A]">Project-Based Earning Potential</div>
            <div className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">$1,500+–$3,000+</div>
            <p className="mt-2 text-xs leading-5 text-blue-100">Monthly potential based on available projects, scope, capacity and performance.</p>
            <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
              <HeroStat label="Engagement" value="Paid per project" />
              <HeroStat label="Workplace" value="Remote" />
              <HeroStat label="Growth path" value="Salary consideration after 6 months*" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroPill({ icon: Icon, children }: { icon: any; children: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#00004D]/55 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur">
      <Icon className="h-3.5 w-3.5 text-[#FF4A4A]" />
      {children}
    </span>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-200/60">{label}</div>
      <div className="mt-1 text-xs font-semibold text-white">{value}</div>
    </div>
  );
}

function Snapshot({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-[#f8f9fc] p-5 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-lg">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50">
        <Icon className="h-4 w-4 text-emerald-700" />
      </div>
      <div className="mt-4 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[#202126]">{value}</div>
    </div>
  );
}

function OfferCard({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-6 text-[#202126] transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50">
        <Icon className="h-4 w-4 text-emerald-700" />
      </div>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-3 text-xs leading-6 text-slate-600">{children}</p>
    </div>
  );
}

function MediaCard({
  src,
  alt,
  children,
  compact = false,
  dark = false,
  className = '',
}: {
  src: string;
  alt: string;
  children?: ReactNode;
  compact?: boolean;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg border ${dark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-100'} ${compact ? 'aspect-[16/9]' : 'aspect-[4/3]'} ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 hover:scale-[1.025]" />
      <div className={`absolute inset-0 ${dark ? 'bg-gradient-to-t from-[#202126]/30 to-transparent' : 'bg-gradient-to-t from-slate-950/10 to-transparent'}`} />
      {children}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[#202126]">{title}</h3>
      <p className="mt-2 text-xs leading-6 text-slate-600">{children}</p>
    </div>
  );
}

function Eyebrow({ children, light = false, className = '' }: { children: ReactNode; light?: boolean; className?: string }) {
  return <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${light ? 'text-emerald-400' : 'text-emerald-600'} ${className}`}>{children}</div>;
}