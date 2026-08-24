import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { BookingSlot } from '../lib/bookingService';
import { bookingManagementService, BookingManagement } from '../lib/bookingManagementService';
import { downloadIcs } from '../lib/calendarUtils';

function localIsoDate(date=new Date()){const adjusted=new Date(date.getTime()-date.getTimezoneOffset()*60000);return adjusted.toISOString().slice(0,10)}
function addDays(iso:string,days:number){const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+days);return localIsoDate(d)}
function dateKey(iso:string,tz:string){const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));const v:Record<string,string>={};p.forEach(x=>{if(x.type!=='literal')v[x.type]=x.value});return `${v.year}-${v.month}-${v.day}`}
function prettyDate(iso:string,tz:string){return new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',month:'short',day:'numeric'}).format(new Date(iso))}
function prettyTime(iso:string,tz:string){return new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',minute:'2-digit'}).format(new Date(iso))}
function prettyFull(iso:string,tz:string){return new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(iso))}

export default function BookingManagementPage(){
  const {token=''}=useParams<{token:string}>();
  const visitorTimezone=useMemo(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',[]);
  const [booking,setBooking]=useState<BookingManagement|null>(null);
  const [slots,setSlots]=useState<BookingSlot[]>([]);
  const [fromDate,setFromDate]=useState(localIsoDate());
  const [selectedDate,setSelectedDate]=useState('');
  const [loading,setLoading]=useState(true);
  const [slotsLoading,setSlotsLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [showReschedule,setShowReschedule]=useState(false);
  const [showCancel,setShowCancel]=useState(false);
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const grouped=useMemo(()=>{const map=new Map<string,BookingSlot[]>();for(const slot of slots){const key=dateKey(slot.startAt,visitorTimezone);map.set(key,[...(map.get(key)||[]),slot])}return Array.from(map.entries())},[slots,visitorTimezone]);
  const visible=selectedDate?grouped.find(([key])=>key===selectedDate)?.[1]||[]:[];

  const load=async()=>{setLoading(true);setError('');try{setBooking(await bookingManagementService.get(token))}catch(err:any){setError(err?.message||'This booking link is unavailable.')}finally{setLoading(false)}};
  const loadSlots=async(start=localIsoDate())=>{setSlotsLoading(true);setError('');try{const rows=await bookingManagementService.slots(token,start,14);setSlots(rows);setFromDate(start);const first=rows[0]?dateKey(rows[0].startAt,visitorTimezone):'';setSelectedDate(first)}catch(err:any){setError(err?.message||'Availability could not be loaded.');setSlots([])}finally{setSlotsLoading(false)}};
  useEffect(()=>{if(token)void load()},[token]);

  const reschedule=async(slot:BookingSlot)=>{setSaving(true);setError('');setSuccess('');try{const updated=await bookingManagementService.reschedule(token,slot.startAt,visitorTimezone);setBooking(updated);setSuccess('Your meeting has been rescheduled. The ProFox specialist has been notified.');setShowReschedule(false);setSlots([])}catch(err:any){setError(err?.message||'The meeting could not be rescheduled.');await loadSlots(fromDate)}finally{setSaving(false)}};
  const cancel=async()=>{setSaving(true);setError('');setSuccess('');try{const updated=await bookingManagementService.cancel(token,reason);setBooking(updated);setSuccess('Your meeting has been cancelled and the specialist has been notified.');setShowCancel(false)}catch(err:any){setError(err?.message||'The meeting could not be cancelled.')}finally{setSaving(false)}};

  if(loading)return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
  if(!booking)return <div className="mx-auto max-w-xl px-6 py-24 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-300"/><h1 className="mt-5 text-2xl font-black">Booking link unavailable</h1><p className="mt-3 text-sm text-slate-500">{error||'This management link may be invalid or expired.'}</p><Link to="/book-a-meeting" className="mt-6 inline-flex rounded-2xl bg-[#000080] px-5 py-3 text-sm font-black text-white">Book a new meeting</Link></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-5 py-8 sm:px-8"><Link to="/book-a-meeting" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#000080]"><ArrowLeft className="h-4 w-4"/> Booking page</Link><div className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#FF0E0E]">Secure booking management</div><h1 className="mt-2 text-3xl font-black">{booking.companyName}</h1><p className="mt-2 text-sm text-slate-500">Reference {booking.bookingReference}</p></div></header><main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
    {error&&<div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}{success&&<div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{success}</div>}
    <section className="grid gap-5 lg:grid-cols-[1fr_320px]"><div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-black uppercase tracking-wider text-slate-400">{booking.meetingType}</div><h2 className="mt-2 text-2xl font-black">{prettyFull(booking.startAt,visitorTimezone)}</h2><p className="mt-2 text-sm text-slate-500">Shown in your timezone: {visitorTimezone}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${booking.status==='Confirmed'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{booking.status}</span></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Info label="Specialist" value={booking.expertName}/><Info label="Service" value={booking.serviceInterest||'ProFox consultation'}/><Info label="Duration" value={`${Math.max(1,Math.round((new Date(booking.endAt).getTime()-new Date(booking.startAt).getTime())/60000))} minutes`}/><Info label="Specialist timezone" value={booking.sellerTimezone}/></div><div className="mt-7 flex flex-wrap gap-3"><button type="button" onClick={()=>downloadIcs({title:`ProFox — ${booking.serviceInterest||booking.meetingType}`,description:`Meeting with ${booking.expertName}. Booking ${booking.bookingReference}`,startAt:booking.startAt,endAt:booking.endAt,url:window.location.href,uid:`${booking.bookingReference}@profoxwebdesigner.com`},`${booking.bookingReference}.ics`)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4"/> Add to calendar</button>{booking.canReschedule&&<button type="button" onClick={()=>{setShowReschedule(true);setShowCancel(false);void loadSlots()}} className="inline-flex items-center gap-2 rounded-2xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><RefreshCw className="h-4 w-4"/> Reschedule</button>}{booking.canCancel&&<button type="button" onClick={()=>{setShowCancel(true);setShowReschedule(false)}} className="inline-flex items-center gap-2 rounded-2xl border border-red-200 px-4 py-2.5 text-xs font-black text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/> Cancel</button>}</div></div><aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3">{booking.expertAvatarUrl?<img src={booking.expertAvatarUrl} alt="" className="h-12 w-12 rounded-2xl object-cover"/>:<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><UserRound className="h-5 w-5 text-slate-400"/></div>}<div><div className="font-black">{booking.expertName}</div><div className="mt-1 text-xs text-[#000080]">{booking.expertHeadline||'ProFox Specialist'}</div></div></div><p className="mt-5 text-xs leading-6 text-slate-500">{booking.expertCountry?`${booking.expertCountry} · `:''}Your booking remains connected to the same CRM history when you reschedule. No duplicate meeting is created.</p></aside></section>

    {showReschedule&&<section className="mt-6 rounded-[2rem] border border-blue-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Choose a new time</h2><p className="mt-2 text-sm text-slate-500">Only valid ProFox availability is shown. Your current meeting is excluded from conflict checks.</p></div><button onClick={()=>setShowReschedule(false)} className="text-xs font-black text-slate-500">Close</button></div>{slotsLoading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]"/></div>:grouped.length===0?<div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-7 text-center text-sm text-slate-500">No times in this 14-day window.<button onClick={()=>void loadSlots(addDays(fromDate,14))} className="ml-2 font-black text-[#000080]">Check next 14 days</button></div>:<><div className="mt-6 flex gap-2 overflow-x-auto pb-2">{grouped.map(([key,rows])=><button key={key} onClick={()=>setSelectedDate(key)} className={`shrink-0 rounded-2xl border px-4 py-3 text-xs font-black ${selectedDate===key?'border-[#000080] bg-blue-50 text-[#000080]':'border-slate-200 text-slate-600'}`}>{prettyDate(rows[0].startAt,visitorTimezone)}</button>)}</div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{visible.map(slot=><button disabled={saving} key={slot.startAt} onClick={()=>void reschedule(slot)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:border-[#000080] hover:bg-blue-50 hover:text-[#000080] disabled:opacity-50">{prettyTime(slot.startAt,visitorTimezone)}</button>)}</div><button onClick={()=>void loadSlots(addDays(fromDate,14))} className="mt-5 text-xs font-black text-[#000080]">Next 14 days →</button></>}</section>}

    {showCancel&&<section className="mt-6 rounded-[2rem] border border-red-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-xl font-black">Cancel this meeting?</h2><p className="mt-2 text-sm text-slate-500">The meeting history stays in ProFox, but the time becomes available to other visitors.</p><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} className="mt-5 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-red-300" placeholder="Reason (optional)"/><div className="mt-4 flex gap-3"><button onClick={()=>setShowCancel(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Keep meeting</button><button disabled={saving} onClick={()=>void cancel()} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>} Confirm cancellation</button></div></section>}

    {booking.status==='Cancelled'&&<section className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm"><CheckCircle2 className="mx-auto h-8 w-8 text-slate-300"/><h2 className="mt-4 text-xl font-black">This meeting is cancelled</h2><p className="mt-2 text-sm text-slate-500">If you'd still like to speak with us, choose a fresh time with any available specialist.</p><Link to="/book-a-meeting" className="mt-5 inline-flex rounded-2xl bg-[#000080] px-5 py-3 text-sm font-black text-white">Book another meeting</Link></section>}
  </main></div>
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>}
