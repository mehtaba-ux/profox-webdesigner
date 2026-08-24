import React, { useEffect, useMemo, useState } from 'react';
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
  UsersRound
} from 'lucide-react';
import {
  BookingExpert,
  BookingQualificationQuestion,
  BookingSlot,
  PublicBookingResult,
  PublicBookingSettings,
  bookingService
} from '../lib/bookingService';
import { downloadIcs } from '../lib/calendarUtils';

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const GENERAL_SERVICE = 'Not sure — help me choose';

type BookingStep = 1 | 2 | 3 | 4 | 5;

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
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date(iso));
}

function formatSlotTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

function dateGroupKey(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(iso));
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

function QuestionField({ question, value, onChange }: {
  question: BookingQualificationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.type === 'textarea') {
    return <textarea rows={4} required={question.required} value={value} onChange={e => onChange(e.target.value)} className={inputClass} placeholder={question.placeholder || ''} />;
  }
  if (question.type === 'select') {
    return <select required={question.required} value={value} onChange={e => onChange(e.target.value)} className={inputClass}>
      <option value="">Select...</option>
      {(question.options || []).map(option => <option key={option} value={option}>{option}</option>)}
    </select>;
  }
  return <input required={question.required} value={value} onChange={e => onChange(e.target.value)} className={inputClass} placeholder={question.placeholder || ''} />;
}

export default function PublicBookingPage() {
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
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const visitorTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const sessionKey = useMemo(getBookingSessionKey, []);

  const [form, setForm] = useState({
    contactName: '', email: '', phone: '', companyName: '', website: '', country: '', industry: '', honeypot: ''
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [bookingSettings, bookingExperts] = await Promise.all([
          bookingService.getPublicSettings(),
          bookingService.listPublicExperts()
        ]);
        setSettings(bookingSettings);
        setExperts(bookingExperts);
        void bookingService.trackEvent(sessionKey, 'Page Viewed', '', '', { visitorTimezone });
      } catch (err: any) {
        setError(err?.message || 'Booking is temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionKey, visitorTimezone]);

  const services = useMemo(() => {
    const values = Array.from(new Set(experts.flatMap(expert => expert.serviceExpertise).map(value => value.trim()).filter(Boolean))).sort();
    return [...values, GENERAL_SERVICE];
  }, [experts]);

  const serviceExperts = useMemo(() => {
    if (!selectedService || selectedService === GENERAL_SERVICE) return experts;
    return experts.filter(expert => expert.serviceExpertise.some(value => value.toLowerCase() === selectedService.toLowerCase()));
  }, [experts, selectedService]);

  const countries = useMemo(() => Array.from(new Set(serviceExperts.map(expert => expert.country).filter(Boolean))).sort(), [serviceExperts]);
  const niches = useMemo(() => Array.from(new Set(serviceExperts.flatMap(expert => expert.niches))).sort(), [serviceExperts]);
  const filteredExperts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return serviceExperts.filter(expert => {
      const searchable = `${expert.displayName} ${expert.headline} ${expert.country} ${expert.niches.join(' ')} ${expert.serviceExpertise.join(' ')} ${expert.languages.join(' ')}`.toLowerCase();
      return (!query || searchable.includes(query))
        && (!countryFilter || expert.country === countryFilter)
        && (!nicheFilter || expert.niches.includes(nicheFilter));
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

  const chooseService = (service: string) => {
    setSelectedService(service);
    setSelectedExpert(null);
    setSelectedSlot(null);
    setSlots([]);
    setSearch('');
    setCountryFilter('');
    setNicheFilter('');
    setStep(2);
    setError('');
    void bookingService.trackEvent(sessionKey, 'Service Selected', '', service === GENERAL_SERVICE ? '' : service);
  };

  const loadSlots = async (expert: BookingExpert, fromDate = localIsoDate()) => {
    setSlotLoading(true);
    setError('');
    try {
      const rows = await bookingService.getPublicSlots(expert.salespersonId, fromDate, 14);
      setSlots(rows);
      setSlotStartDate(fromDate);
      const groups = new Map<string, BookingSlot[]>();
      for (const slot of rows) {
        const key = dateGroupKey(slot.startAt, visitorTimezone);
        const existing = groups.get(key) || [];
        existing.push(slot);
        groups.set(key, existing);
      }
      setSelectedDateKey(Array.from(groups.keys())[0] || '');
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
    setStep(3);
    void bookingService.trackEvent(sessionKey, 'Expert Selected', expert.salespersonId, selectedService === GENERAL_SERVICE ? '' : selectedService);
    await loadSlots(expert);
  };

  const chooseFirstAvailable = async () => {
    setFirstAvailableLoading(true);
    setError('');
    try {
      const match = await bookingService.findFirstAvailable(serviceExperts, selectedService === GENERAL_SERVICE ? '' : selectedService, localIsoDate(), 14);
      if (!match) throw new Error('No specialist currently has an available time in the next 14 days.');
      setSelectedExpert(match.expert);
      setSelectedSlot(null);
      setStep(3);
      await loadSlots(match.expert);
      void bookingService.trackEvent(sessionKey, 'First Available Selected', match.expert.salespersonId, selectedService === GENERAL_SERVICE ? '' : selectedService);
    } catch (err: any) {
      setError(err?.message || 'We could not find an available specialist right now.');
    } finally {
      setFirstAvailableLoading(false);
    }
  };

  const chooseSlot = (slot: BookingSlot) => {
    setSelectedSlot(slot);
    setStep(4);
    setError('');
    void bookingService.trackEvent(sessionKey, 'Slot Selected', selectedExpert?.salespersonId || '', selectedService === GENERAL_SERVICE ? '' : selectedService, { startAt: slot.startAt });
    void bookingService.trackEvent(sessionKey, 'Qualification Started', selectedExpert?.salespersonId || '', selectedService === GENERAL_SERVICE ? '' : selectedService);
  };

  const submitBooking = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedExpert || !selectedSlot || !settings) return;
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
        serviceInterest: selectedService === GENERAL_SERVICE ? 'General Consultation' : selectedService,
        qualificationAnswers: answers,
        honeypot: form.honeypot
      });
      setResult(booking);
      setStep(5);
      void bookingService.trackEvent(sessionKey, 'Booking Completed', selectedExpert.salespersonId, selectedService === GENERAL_SERVICE ? 'General Consultation' : selectedService, { bookingReference: booking.bookingReference });
    } catch (err: any) {
      const message = err?.message || 'Your meeting could not be booked.';
      setError(message);
      if (/no longer available|time conflicts/i.test(message)) {
        setStep(3);
        setSelectedSlot(null);
        await loadSlots(selectedExpert, slotStartDate);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => {
    setError('');
    if (step === 4) { setSelectedSlot(null); setStep(3); return; }
    if (step === 3) { setSelectedExpert(null); setSlots([]); setStep(2); return; }
    if (step === 2) { setSelectedService(''); setStep(1); }
  };

  if (loading) return <div className="min-h-[70vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  if (!settings?.active) return <div className="mx-auto max-w-2xl px-6 py-24 text-center"><CalendarDays className="mx-auto h-10 w-10 text-slate-300" /><h1 className="mt-5 text-3xl font-black text-slate-900">Booking is currently unavailable</h1><p className="mt-3 text-sm text-slate-500">Please use the contact page and our team will get back to you.</p></div>;

  return <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_35%,#f8fafc_100%)] text-slate-900">
    <section className="border-b border-slate-200 bg-white/90">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#FF0E0E]"><Sparkles className="h-4 w-4" /> ProFox Native Booking</div>
        <h1 className="max-w-4xl text-3xl font-black tracking-tight sm:text-5xl">{settings.pageTitle}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">{settings.pageSubtitle}</p>
        <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
          {['1. Service','2. Specialist','3. Time','4. Qualification','5. Confirmed'].map((label,index) => <span key={label} className={`rounded-full border px-3 py-1.5 ${step===index+1?'border-[#000080] bg-blue-50 text-[#000080]':'border-slate-200 bg-slate-50'}`}>{label}</span>)}
        </div>
      </div>
    </section>

    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {step > 1 && step < 5 && <button type="button" onClick={back} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#000080]"><ArrowLeft className="h-4 w-4"/> Back</button>}

      {step===1 && <section>
        <div className="mb-7"><h2 className="text-2xl font-black">What would you like help with?</h2><p className="mt-2 text-sm text-slate-500">Start with the service. We will only show specialists who are relevant to what you need.</p></div>
        {services.length===1 && experts.length===0 ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><UsersRound className="mx-auto h-10 w-10 text-slate-300"/><h3 className="mt-4 text-lg font-black">Team availability is being prepared</h3><p className="mt-2 text-sm text-slate-500">Please contact ProFox directly while specialist booking profiles are being published.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{services.map(service=><button type="button" key={service} onClick={()=>chooseService(service)} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><Sparkles className="h-5 w-5"/></div><h3 className="mt-5 text-lg font-black">{service}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{service===GENERAL_SERVICE?'Tell us what you are trying to achieve and choose from the full ProFox team.':'See specialists who work with this service and choose the right person for your project.'}</p><div className="mt-5 flex items-center gap-2 text-xs font-black text-[#000080]">Continue <ArrowRight className="h-4 w-4"/></div></button>)}</div>}
      </section>}

      {step===2 && <section>
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-[#FF0E0E]">{selectedService}</div><h2 className="mt-2 text-2xl font-black">Choose who you want to speak with</h2><p className="mt-2 text-sm text-slate-500">Compare expertise, niche, country, languages and working availability—or let ProFox find the earliest suitable specialist.</p></div><button type="button" disabled={firstAvailableLoading||serviceExperts.length===0} onClick={()=>void chooseFirstAvailable()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#000080] px-5 py-3 text-sm font-black text-white disabled:opacity-50">{firstAvailableLoading?<Loader2 className="h-4 w-4 animate-spin"/>:<Clock3 className="h-4 w-4"/>} First available specialist</button></div>
        <div className="mb-6 grid gap-3 md:grid-cols-3"><label className="relative"><Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} className={`${inputClass} pl-10`} placeholder="Search expertise, name or language"/></label><select value={countryFilter} onChange={e=>setCountryFilter(e.target.value)} className={inputClass}><option value="">All countries</option>{countries.map(value=><option key={value}>{value}</option>)}</select><select value={nicheFilter} onChange={e=>setNicheFilter(e.target.value)} className={inputClass}><option value="">All niches</option>{niches.map(value=><option key={value}>{value}</option>)}</select></div>
        {filteredExperts.length===0 ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No published specialist matches these filters. Clear a filter or choose a different service.</div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filteredExperts.map(expert=><button type="button" key={expert.salespersonId} onClick={()=>void chooseExpert(expert)} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"><div className="flex items-start gap-4">{expert.avatarUrl?<img src={expert.avatarUrl} alt="" className="h-14 w-14 rounded-2xl object-cover"/>:<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><UserRound className="h-6 w-6 text-slate-400"/></div>}<div className="min-w-0"><h3 className="text-lg font-black">{expert.displayName}</h3><p className="mt-1 text-sm font-semibold text-[#000080]">{expert.headline||'ProFox Specialist'}</p>{expert.country&&<div className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5"/>{expert.country}</div>}</div></div>{expert.bio&&<p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-500">{expert.bio}</p>}<div className="mt-4 flex flex-wrap gap-2">{expert.niches.slice(0,4).map(value=><span key={value} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{value}</span>)}</div><div className="mt-4 space-y-2 text-xs text-slate-500"><div className="flex items-center gap-2"><Languages className="h-3.5 w-3.5"/>{expert.languages.join(', ')||'English'}</div><div className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5"/>{availabilitySummary(expert)} · {expert.timezone}</div></div><div className="mt-5 flex items-center gap-2 text-xs font-black text-[#000080]">See availability <ArrowRight className="h-4 w-4"/></div></button>)}</div>}
      </section>}

      {step===3 && selectedExpert && <section className="grid gap-7 lg:grid-cols-[340px_1fr]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-4">{selectedExpert.avatarUrl?<img src={selectedExpert.avatarUrl} alt="" className="h-14 w-14 rounded-2xl object-cover"/>:<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><UserRound className="h-6 w-6 text-slate-400"/></div>}<div><h3 className="font-black">{selectedExpert.displayName}</h3><p className="mt-1 text-xs font-semibold text-[#000080]">{selectedExpert.headline||selectedExpert.meetingType}</p></div></div><div className="mt-5 space-y-3 text-sm text-slate-500"><div className="flex gap-2"><Globe2 className="mt-0.5 h-4 w-4 shrink-0"/><span>{selectedExpert.timezone}</span></div><div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0"/><span>{selectedExpert.meetingDurationMinutes} minutes · {availabilitySummary(selectedExpert)}</span></div><div className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0"/><span>{selectedService}</span></div></div></aside>
        <div><div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">Choose a date and time</h2><p className="mt-2 text-sm text-slate-500">Times are shown in your timezone: <strong>{visitorTimezone}</strong>.</p></div><button type="button" onClick={()=>void loadSlots(selectedExpert,addDays(slotStartDate,14))} disabled={slotLoading} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">Next 14 days</button></div>{slotLoading?<div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>:groupedSlots.length===0?<div className="rounded-3xl border border-slate-200 bg-white p-8 text-center"><CalendarDays className="mx-auto h-9 w-9 text-slate-300"/><h3 className="mt-4 font-black">No times in this window</h3><p className="mt-2 text-sm text-slate-500">Check the next 14 days or choose another specialist.</p></div>:<><div className="mb-5 flex gap-2 overflow-x-auto pb-2">{groupedSlots.map(([key,rows])=><button key={key} type="button" onClick={()=>setSelectedDateKey(key)} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${selectedDateKey===key?'border-[#000080] bg-blue-50 text-[#000080]':'border-slate-200 bg-white text-slate-600'}`}><div className="text-xs font-black">{formatSlotDate(rows[0].startAt,visitorTimezone)}</div><div className="mt-1 text-[10px] font-semibold opacity-70">{rows.length} times</div></button>)}</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{visibleSlots.map(slot=><button type="button" key={slot.startAt} onClick={()=>chooseSlot(slot)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-[#000080] hover:bg-blue-50 hover:text-[#000080]">{formatSlotTime(slot.startAt,visitorTimezone)}</button>)}</div></>}</div>
      </section>}

      {step===4 && selectedExpert && selectedSlot && <section className="mx-auto max-w-4xl"><div className="mb-7"><h2 className="text-2xl font-black">Tell {selectedExpert.displayName} what you want to achieve</h2><p className="mt-2 text-sm text-slate-500">Your answers are attached to the meeting so your specialist can prepare before the call.</p></div><div className="mb-6 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900"><div className="font-black">{selectedService} · {formatSlotDate(selectedSlot.startAt,visitorTimezone)} at {formatSlotTime(selectedSlot.startAt,visitorTimezone)}</div><div className="mt-1 text-xs text-blue-700">{selectedExpert.displayName} · {selectedExpert.meetingDurationMinutes} minutes · {visitorTimezone}</div></div><form onSubmit={submitBooking} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Your name<input required value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Work email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Company / business<input required value={form.companyName} onChange={e=>setForm({...form,companyName:e.target.value})} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Country<input required value={form.country} onChange={e=>setForm({...form,country:e.target.value})} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Phone <span className="font-normal text-slate-400">(optional)</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className={`${inputClass} mt-2`}/></label><label className="text-sm font-bold">Website <span className="font-normal text-slate-400">(optional)</span><input value={form.website} onChange={e=>setForm({...form,website:e.target.value})} className={`${inputClass} mt-2`} placeholder="https://"/></label><label className="text-sm font-bold sm:col-span-2">Industry / niche<input value={form.industry} onChange={e=>setForm({...form,industry:e.target.value})} className={`${inputClass} mt-2`} placeholder="e.g. Roofing, SaaS, Legal, E-commerce"/></label></div><input value={form.honeypot} onChange={e=>setForm({...form,honeypot:e.target.value})} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true"/><div className="my-7 border-t border-slate-100"/><div className="space-y-5">{settings.qualificationQuestions.map(question=><label key={question.id} className="block text-sm font-bold">{question.label}{question.required&&<span className="text-red-500"> *</span>}<div className="mt-2"><QuestionField question={question} value={answers[question.id]||''} onChange={value=>setAnswers({...answers,[question.id]:value})}/></div></label>)}</div><div className="mt-7 flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>Your selected time is checked again when you submit. If someone else books it first, no partial CRM record is created and you can immediately choose another slot.</div><button disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#000080] px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">{submitting?<Loader2 className="h-4 w-4 animate-spin"/>:<CalendarDays className="h-4 w-4"/>} Confirm meeting</button></form></section>}

      {step===5 && result && selectedExpert && <section className="mx-auto max-w-3xl text-center"><div className="rounded-[2rem] border border-emerald-200 bg-white p-7 shadow-sm sm:p-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8"/></div><h2 className="mt-6 text-3xl font-black">Meeting confirmed</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">{result.confirmationMessage}</p><div className="mx-auto mt-7 max-w-lg rounded-3xl bg-slate-50 p-5 text-left"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Booking {result.bookingReference}</div><div className="mt-3 text-lg font-black">{selectedExpert.displayName}</div><div className="mt-2 text-sm text-slate-600">{formatSlotDate(result.startAt,visitorTimezone)} at {formatSlotTime(result.startAt,visitorTimezone)} · {visitorTimezone}</div><div className="mt-1 text-sm text-slate-500">{selectedService}</div></div><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={()=>downloadIcs({title:`ProFox — ${selectedService}`,description:`Meeting with ${selectedExpert.displayName}. Booking ${result.bookingReference}`,startAt:result.startAt,endAt:result.endAt,url:result.managementToken?`${window.location.origin}/manage-booking/${result.managementToken}`:'',uid:`${result.bookingReference}@profoxwebdesigner.com`},`${result.bookingReference}.ics`)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4"/> Add to calendar</button>{result.managementToken&&<a href={`/manage-booking/${result.managementToken}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#000080] px-5 py-3 text-sm font-black text-white">Manage booking <ArrowRight className="h-4 w-4"/></a>}</div><p className="mt-6 text-xs leading-5 text-slate-400">Keep your booking reference. You can use the secure management link to reschedule or cancel without creating an account.</p></div></section>}
    </main>
  </div>;
}
