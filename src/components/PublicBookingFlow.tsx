import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  Languages,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import {
  BookingExpert,
  BookingQualificationQuestion,
  BookingSlot,
  PublicBookingResult,
  PublicBookingSettings,
  bookingService,
} from '../lib/bookingService';
import { downloadIcs } from '../lib/calendarUtils';

const GENERAL_SERVICE = 'General Consultation';
type BookingStep = 1 | 2 | 3 | 4;

function localIsoDate(date = new Date()) {
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

function formatSlotDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}

function formatSlotTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

function dateGroupKey(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const values: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function availabilitySummary(expert: BookingExpert) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = expert.workingDays.map(day => dayNames[day]).filter(Boolean);
  return `${days.join(', ')} · ${expert.workStart}–${expert.workEnd}`;
}

function getBookingSessionKey() {
  if (typeof window === 'undefined') return crypto.randomUUID();
  try {
    const key = 'profox-booking-session-key';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function QuestionField({ question, value, onChange, inputClass }: {
  question: BookingQualificationQuestion;
  value: string;
  onChange: (value: string) => void;
  inputClass: string;
}) {
  if (question.type === 'textarea') {
    return <textarea rows={3} required={question.required} value={value} onChange={event => onChange(event.target.value)} className={`${inputClass} resize-y lg:resize-none`} placeholder={question.placeholder || ''} />;
  }
  if (question.type === 'select') {
    return <select required={question.required} value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
      <option value="">Choose an option</option>
      {(question.options || []).map(option => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  return <input required={question.required} value={value} onChange={event => onChange(event.target.value)} className={inputClass} placeholder={question.placeholder || ''} />;
}

export default function PublicBookingFlow({ embedded = false, topContent, onRequestQuote }: {
  embedded?: boolean;
  topContent?: React.ReactNode;
  onRequestQuote?: () => void;
}) {
  const { content } = useCMS();
  const buttonRadius = content.theme?.buttonRadius || 'rounded-lg';
  const inputClass = `w-full border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:bg-white focus:ring-4 focus:ring-[var(--brand-primary)]/5 ${buttonRadius}`;
  const [settings, setSettings] = useState<PublicBookingSettings | null>(null);
  const [experts, setExperts] = useState<BookingExpert[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [selectedExpert, setSelectedExpert] = useState<BookingExpert | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [slotStartDate, setSlotStartDate] = useState(localIsoDate());
  const [step, setStep] = useState<BookingStep>(1);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [firstAvailableLoading, setFirstAvailableLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const visitorTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const sessionKey = useMemo(getBookingSessionKey, []);
  const [form, setForm] = useState({ contactName: '', email: '', phone: '', companyName: '', website: '', country: '', industry: '', honeypot: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        const [bookingSettings, bookingExperts] = await Promise.all([bookingService.getPublicSettings(), bookingService.listPublicExperts()]);
        if (!active) return;
        setSettings(bookingSettings);
        setExperts(bookingExperts);
        void bookingService.trackEvent(sessionKey, 'Page Viewed', '', '', { visitorTimezone, surface: embedded ? 'contact_tab' : 'booking_page' });
      } catch (err: any) {
        if (active) setError(err?.message || 'Booking is temporarily unavailable.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [embedded, sessionKey, visitorTimezone]);

  const services = useMemo(() => Array.from(new Set(experts.flatMap(expert => expert.serviceExpertise).map(value => value.trim()).filter(Boolean))).sort(), [experts]);
  const serviceExperts = useMemo(() => selectedService ? experts.filter(expert => expert.serviceExpertise.length === 0 || expert.serviceExpertise.some(value => value.toLowerCase() === selectedService.toLowerCase())) : experts, [experts, selectedService]);
  const countries = useMemo(() => Array.from(new Set(serviceExperts.map(expert => expert.country).filter(Boolean))).sort(), [serviceExperts]);
  const niches = useMemo(() => Array.from(new Set(serviceExperts.flatMap(expert => expert.niches))).sort(), [serviceExperts]);
  const filteredExperts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return serviceExperts.filter(expert => {
      const searchable = `${expert.displayName} ${expert.headline} ${expert.country} ${expert.niches.join(' ')} ${expert.serviceExpertise.join(' ')} ${expert.languages.join(' ')}`.toLowerCase();
      return (!query || searchable.includes(query)) && (!countryFilter || expert.country === countryFilter) && (!nicheFilter || expert.niches.includes(nicheFilter));
    });
  }, [serviceExperts, search, countryFilter, nicheFilter]);

  const groupedSlots = useMemo(() => {
    const map = new Map<string, BookingSlot[]>();
    for (const slot of slots) {
      const key = dateGroupKey(slot.startAt, visitorTimezone);
      const rows = map.get(key) || [];
      rows.push(slot);
      map.set(key, rows);
    }
    return Array.from(map.entries());
  }, [slots, visitorTimezone]);
  const visibleSlots = selectedDateKey ? groupedSlots.find(([key]) => key === selectedDateKey)?.[1] || [] : [];

  const loadSlots = async (expert: BookingExpert, fromDate = localIsoDate()) => {
    setSlotLoading(true);
    setError('');
    try {
      const rows = await bookingService.getPublicSlots(expert.salespersonId, fromDate, 14);
      setSlots(rows);
      setSlotStartDate(fromDate);
      const firstKey = rows[0] ? dateGroupKey(rows[0].startAt, visitorTimezone) : '';
      setSelectedDateKey(firstKey);
    } catch (err: any) {
      setError(err?.message || 'Unable to load availability.');
      setSlots([]);
      setSelectedDateKey('');
    } finally {
      setSlotLoading(false);
    }
  };

  const chooseExpert = async (expert: BookingExpert) => {
    setSelectedExpert(expert);
    setSelectedSlot(null);
    setStep(2);
    setError('');
    void bookingService.trackEvent(sessionKey, 'Expert Selected', expert.salespersonId, selectedService, { surface: embedded ? 'contact_tab' : 'booking_page' });
    await loadSlots(expert);
  };

  const chooseFirstAvailable = async () => {
    setFirstAvailableLoading(true);
    setError('');
    try {
      const match = await bookingService.findFirstAvailable(serviceExperts, selectedService, localIsoDate(), 14);
      if (!match) throw new Error('No specialist currently has an available time in the next 14 days.');
      setSelectedExpert(match.expert);
      setSelectedSlot(match.slot);
      setStep(2);
      await loadSlots(match.expert);
      setSelectedDateKey(dateGroupKey(match.slot.startAt, visitorTimezone));
      void bookingService.trackEvent(sessionKey, 'First Available Selected', match.expert.salespersonId, selectedService);
    } catch (err: any) {
      setError(err?.message || 'We could not find an available specialist right now.');
    } finally {
      setFirstAvailableLoading(false);
    }
  };

  const chooseSlot = (slot: BookingSlot) => {
    setSelectedSlot(slot);
    setStep(3);
    setError('');
    void bookingService.trackEvent(sessionKey, 'Slot Selected', selectedExpert?.salespersonId || '', selectedService, { startAt: slot.startAt });
    void bookingService.trackEvent(sessionKey, 'Qualification Started', selectedExpert?.salespersonId || '', selectedService);
  };

  const submitBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedExpert || !selectedSlot || !settings) return;
    if (!privacyAccepted) {
      setError('Please accept the Privacy Policy and Terms before confirming your meeting.');
      return;
    }
    for (const question of settings.qualificationQuestions) {
      if (question.required && !String(answers[question.id] || '').trim()) {
        setError(`Please answer: ${question.label}`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const booking = await bookingService.bookPublicMeeting({
        requestKey: crypto.randomUUID(),
        salespersonId: selectedExpert.salespersonId,
        startAt: selectedSlot.startAt,
        visitorTimezone,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        companyName: form.companyName,
        website: form.website,
        country: form.country,
        industry: form.industry || 'Other',
        serviceInterest: selectedService || GENERAL_SERVICE,
        qualificationAnswers: answers,
        honeypot: form.honeypot,
      });
      setResult(booking);
      setStep(4);
      void bookingService.trackEvent(sessionKey, 'Booking Completed', selectedExpert.salespersonId, selectedService || GENERAL_SERVICE, { bookingReference: booking.bookingReference });
    } catch (err: any) {
      const message = err?.message || 'Your meeting could not be booked.';
      setError(message);
      if (/no longer available|time conflicts/i.test(message)) {
        setStep(2);
        setSelectedSlot(null);
        await loadSlots(selectedExpert, slotStartDate);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setError('');
    if (step === 3) { setSelectedSlot(null); setStep(2); return; }
    if (step === 2) { setSelectedExpert(null); setSlots([]); setSelectedSlot(null); setStep(1); }
  };

  const progress = step * 25;
  const shellClass = embedded
    ? 'relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-7 lg:p-8'
    : 'relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-5 shadow-[0_20px_65px_rgba(15,23,42,0.08)] sm:p-8 lg:p-10';

  if (loading) return <div className={`${shellClass} flex min-h-72 items-center justify-center`}><Loader2 className="h-7 w-7 animate-spin text-[var(--brand-primary)]" /></div>;
  if (!settings?.active) return <div className={`${shellClass} text-center`}><CalendarDays className="mx-auto h-9 w-9 text-slate-300" /><h2 className="pf-card-title mt-4 text-slate-950">Booking is currently unavailable</h2><p className="mt-2 text-sm text-slate-500">Send us an enquiry and our team will help you with the next step.</p>{onRequestQuote ? <button type="button" onClick={onRequestQuote} className={`mt-5 bg-[var(--brand-primary)] px-5 py-2.5 text-xs font-bold text-white ${buttonRadius}`}>Get a quote instead</button> : <Link to="/contact-us?intent=quote#project-enquiry-form" className={`mt-5 inline-flex bg-[var(--brand-primary)] px-5 py-2.5 text-xs font-bold text-white ${buttonRadius}`}>Get a quote instead</Link>}</div>;

  return <div className={shellClass}>
    <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-[var(--brand-primary)]/[0.05] blur-2xl" />
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="pf-eyebrow inline-flex items-center gap-2 text-[var(--brand-primary)]"><CalendarDays className="h-4 w-4" />Book a meeting</div>
        <div className="text-xs font-semibold text-slate-400">Live specialist availability</div>
      </div>
      <h2 className="mt-2.5 text-2xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-3xl">{embedded ? 'Speak with the right ProFox specialist' : settings.pageTitle}</h2>
      <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">{embedded ? 'Choose by expertise, niche or location, then book an available time directly.' : settings.pageSubtitle}</p>

      {topContent}

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs font-bold tracking-[.06em] text-slate-400"><span>{step === 1 ? 'Choose specialist' : step === 2 ? 'Choose time' : step === 3 ? 'Your details' : 'Confirmed'}</span><span>{progress}%</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
      </div>

      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold leading-5 text-rose-700">{error}</div>}
      {step > 1 && step < 4 && <button type="button" onClick={back} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition-colors hover:text-[var(--brand-primary)]"><ArrowLeft className="h-4 w-4" />Back</button>}

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
          {step === 1 && <section className="mt-4">
            <div className="rounded-2xl border border-slate-100 bg-[var(--brand-surface)]/70 px-4 py-3">
              <div className="pf-card-title text-slate-950">Choose who you want to speak with</div>
              <div className="mt-0.5 text-xs leading-4 text-slate-500">Filter the team by service, location or niche—or choose the first available specialist.</div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search specialist" /></label>
              <select value={selectedService} onChange={event => { setSelectedService(event.target.value); setCountryFilter(''); setNicheFilter(''); }} className={inputClass}><option value="">All services / not sure</option>{services.map(value => <option key={value} value={value}>{value}</option>)}</select>
              <select value={countryFilter} onChange={event => setCountryFilter(event.target.value)} className={inputClass}><option value="">All locations</option>{countries.map(value => <option key={value} value={value}>{value}</option>)}</select>
              <select value={nicheFilter} onChange={event => setNicheFilter(event.target.value)} className={inputClass}><option value="">All niches</option>{niches.map(value => <option key={value} value={value}>{value}</option>)}</select>
            </div>

            <div className="mt-3 flex justify-end"><button type="button" disabled={firstAvailableLoading || serviceExperts.length === 0} onClick={() => void chooseFirstAvailable()} className={`inline-flex min-h-10 items-center justify-center gap-2 border border-[var(--brand-primary)]/15 bg-[var(--brand-primary)]/[0.05] px-4 text-xs font-bold text-[var(--brand-primary)] transition-all hover:-translate-y-0.5 hover:bg-[var(--brand-primary)]/[0.08] disabled:opacity-50 ${buttonRadius}`}>{firstAvailableLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}First available</button></div>

            {experts.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-7 text-center"><UsersRound className="mx-auto h-9 w-9 text-slate-300" /><h3 className="pf-card-title mt-3 text-slate-950">Our specialist calendar is being prepared</h3><p className="mt-2 text-xs leading-5 text-slate-500">You can still send your project details and our team will respond with the right next step.</p>{onRequestQuote ? <button type="button" onClick={onRequestQuote} className={`mt-4 bg-[var(--brand-primary)] px-4 py-2.5 text-xs font-bold text-white ${buttonRadius}`}>Get a quote</button> : <Link to="/contact-us?intent=quote#project-enquiry-form" className={`mt-4 inline-flex bg-[var(--brand-primary)] px-4 py-2.5 text-xs font-bold text-white ${buttonRadius}`}>Get a quote</Link>}</div> : filteredExperts.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">No specialist matches these filters. Clear a filter or choose another service.</div> : <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{filteredExperts.map(expert => <button type="button" key={expert.salespersonId} onClick={() => void chooseExpert(expert)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--brand-primary)]/20 hover:shadow-[0_12px_32px_rgba(15,23,42,0.07)]">
              <div className="flex items-start gap-3">{expert.avatarUrl ? <img src={expert.avatarUrl} alt="" className="h-12 w-12 rounded-xl object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100"><UserRound className="h-5 w-5 text-slate-400" /></div>}<div className="min-w-0"><h3 className="text-sm font-bold text-slate-950">{expert.displayName}</h3><p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-4 text-[var(--brand-primary)]">{expert.headline || 'ProFox Sales Specialist'}</p>{expert.country && <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-slate-500"><MapPin className="h-3 w-3" />{expert.country}</div>}</div></div>
              {expert.niches.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{expert.niches.slice(0, 3).map(value => <span key={value} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{value}</span>)}</div>}
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-500"><div className="flex items-start gap-2"><Languages className="mt-0.5 h-3 w-3 shrink-0" /><span>{expert.languages.join(', ') || 'English'}</span></div><div className="flex items-start gap-2"><Clock3 className="mt-0.5 h-3 w-3 shrink-0" /><span>{expert.meetingDurationMinutes} min · {availabilitySummary(expert)} · {expert.timezone}</span></div></div>
              <div className="mt-3 inline-flex items-center gap-2 text-[10px] font-bold text-[var(--brand-primary)]">See availability <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></div>
            </button>)}</div>}
          </section>}

          {step === 2 && selectedExpert && <section className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
              <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center gap-3">{selectedExpert.avatarUrl ? <img src={selectedExpert.avatarUrl} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><UserRound className="h-5 w-5 text-slate-400" /></div>}<div><h3 className="text-sm font-bold text-slate-950">{selectedExpert.displayName}</h3><p className="mt-0.5 text-[10px] font-semibold leading-4 text-[var(--brand-primary)]">{selectedExpert.headline || selectedExpert.meetingType}</p></div></div><div className="mt-4 space-y-2 text-[10px] leading-4 text-slate-500"><div className="flex gap-2"><Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{selectedExpert.country || 'Global'} · {selectedExpert.timezone}</span></div><div className="flex gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{selectedExpert.meetingDurationMinutes} minutes</span></div>{selectedService && <div className="flex gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{selectedService}</span></div>}</div></aside>
              <div><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="pf-card-title text-slate-950">Choose a date and time</div><p className="mt-1 text-xs leading-5 text-slate-500">Shown in your timezone: <strong>{visitorTimezone}</strong>.</p></div><button type="button" onClick={() => void loadSlots(selectedExpert, addDays(slotStartDate, 14))} disabled={slotLoading} className={`border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 ${buttonRadius}`}>Next 14 days</button></div>{slotLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--brand-primary)]" /></div> : groupedSlots.length === 0 ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 text-sm font-bold text-slate-950">No times in this window</h3><p className="mt-1 text-xs text-slate-500">Check the next 14 days or choose another specialist.</p></div> : <><div className="mt-4 flex gap-2 overflow-x-auto pb-2">{groupedSlots.map(([key, rows]) => <button key={key} type="button" onClick={() => setSelectedDateKey(key)} className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${selectedDateKey === key ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/[0.05] text-[var(--brand-primary)]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><div className="text-[10px] font-bold">{formatSlotDate(rows[0].startAt, visitorTimezone)}</div><div className="mt-0.5 text-[9px] font-semibold opacity-70">{rows.length} times</div></button>)}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{visibleSlots.map(slot => <button type="button" key={slot.startAt} onClick={() => chooseSlot(slot)} className={`border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/[0.04] hover:text-[var(--brand-primary)] ${buttonRadius}`}>{formatSlotTime(slot.startAt, visitorTimezone)}</button>)}</div></>}</div>
            </div>
          </section>}

          {step === 3 && selectedExpert && selectedSlot && <section className="mt-4">
            <div className="rounded-2xl border border-[var(--brand-primary)]/10 bg-[var(--brand-primary)]/[0.04] px-4 py-3 text-xs text-slate-700"><div className="font-bold text-slate-950">{selectedExpert.displayName} · {formatSlotDate(selectedSlot.startAt, visitorTimezone)} at {formatSlotTime(selectedSlot.startAt, visitorTimezone)}</div><div className="mt-1 text-[10px] text-slate-500">{selectedExpert.meetingDurationMinutes} minutes · {visitorTimezone}</div></div>
            <form onSubmit={submitBooking} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Your name <span className="text-rose-500">*</span><input required value={form.contactName} onChange={event => setForm({ ...form, contactName: event.target.value })} className={`${inputClass} mt-1`} autoComplete="name" /></label><label className="text-xs font-semibold text-slate-700">Business email <span className="text-rose-500">*</span><input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className={`${inputClass} mt-1`} autoComplete="email" /></label><label className="text-xs font-semibold text-slate-700">Company / business <span className="text-rose-500">*</span><input required value={form.companyName} onChange={event => setForm({ ...form, companyName: event.target.value })} className={`${inputClass} mt-1`} autoComplete="organization" /></label><label className="text-xs font-semibold text-slate-700">Country <span className="text-rose-500">*</span><input required value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} className={`${inputClass} mt-1`} autoComplete="country-name" /></label><label className="text-xs font-semibold text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className={`${inputClass} mt-1`} autoComplete="tel" /></label><label className="text-xs font-semibold text-slate-700">Website <span className="font-normal text-slate-400">(optional)</span><input type="url" value={form.website} onChange={event => setForm({ ...form, website: event.target.value })} className={`${inputClass} mt-1`} placeholder="https://" /></label></div>
              {settings.qualificationQuestions.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{settings.qualificationQuestions.map(question => <label key={question.id} className={`text-xs font-semibold text-slate-700 ${question.type === 'textarea' ? 'sm:col-span-2' : ''}`}>{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}<div className="mt-1"><QuestionField question={question} value={answers[question.id] || ''} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} inputClass={inputClass} /></div></label>)}</div>}
              <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Company fax<input tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={event => setForm({ ...form, honeypot: event.target.value })} /></label></div>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[11px] font-medium leading-5 text-slate-600"><input type="checkbox" checked={privacyAccepted} onChange={event => { setPrivacyAccepted(event.target.checked); setError(''); }} className="mt-1 h-4 w-4 shrink-0 accent-[#000080]" /><span>{settings.privacyConsentText || 'I agree that ProFox may process this meeting request under the'} <a href="/privacy-policy" target="_blank" rel="noreferrer" className="font-bold text-[#000080] underline">Privacy Policy</a> and <a href="/terms-and-conditions" target="_blank" rel="noreferrer" className="font-bold text-[#000080] underline">Terms</a>.</span></label>
              <button type="submit" disabled={submitting || !privacyAccepted} className={`mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 bg-[var(--brand-primary)] px-5 text-xs font-bold text-white shadow-[0_12px_30px_rgba(0,0,128,0.16)] transition-all hover:-translate-y-0.5 hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${buttonRadius}`}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}{submitting ? 'Confirming securely…' : 'Confirm meeting'}</button>
              <div className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-slate-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Your selected specialist receives the meeting in the ProFox CRM and calendar workflow.</span></div>
            </form>
          </section>}

          {step === 4 && result && <section className="mt-5 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></div><div className="pf-eyebrow mt-4 text-emerald-700">Meeting confirmed</div><h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">You're booked with {result.expertName}</h3><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">{result.confirmationMessage}</p><div className="mx-auto mt-5 max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-xs"><div className="font-bold text-slate-950">{formatSlotDate(result.startAt, visitorTimezone)} at {formatSlotTime(result.startAt, visitorTimezone)}</div><div className="mt-1 text-slate-500">Reference: {result.bookingReference}</div></div><div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row"><button type="button" onClick={() => downloadIcs({ title: `ProFox meeting with ${result.expertName}`, description: result.confirmationMessage, startAt: result.startAt, endAt: result.endAt, uid: `${result.meetingId}@profoxwebdesigner.com` })} className={`inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 ${buttonRadius}`}><CalendarDays className="h-4 w-4" />Add to calendar</button>{result.managementToken && <a href={`/manage-booking/${encodeURIComponent(result.managementToken)}`} className={`inline-flex items-center justify-center gap-2 bg-[var(--brand-primary)] px-4 py-2.5 text-xs font-bold text-white ${buttonRadius}`}>Manage booking <ArrowRight className="h-4 w-4" /></a>}</div></section>}
        </motion.div>
      </AnimatePresence>
    </div>
  </div>;
}
