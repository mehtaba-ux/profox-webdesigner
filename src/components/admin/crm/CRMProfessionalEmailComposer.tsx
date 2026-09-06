import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, LockKeyhole, RefreshCw, Send } from 'lucide-react';
import { professionalMailService, type ProfessionalMailSendStatus } from '../../../lib/professionalMailService';

interface CRMProfessionalEmailComposerProps {
  leadId: string;
  leadTitle: string;
  recipientEmail?: string;
  onChanged: (message: string) => Promise<void>;
}

export default function CRMProfessionalEmailComposer({
  leadId,
  leadTitle,
  recipientEmail,
  onChanged,
}: CRMProfessionalEmailComposerProps) {
  const [status, setStatus] = useState<ProfessionalMailSendStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [subject, setSubject] = useState(`Re: ${leadTitle}`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const next = await professionalMailService.getMyStatus();
      setStatus(next);
    } catch (err: any) {
      setError(err?.message || 'Professional email status could not be loaded.');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setSubject(`Re: ${leadTitle}`);
    setBody('');
    setError('');
    setSuccess('');
  }, [leadId, leadTitle]);

  const send = async () => {
    if (!recipientEmail || !status?.sendConnected) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await professionalMailService.sendLeadEmail({
        leadId,
        subject,
        body,
        idempotencyKey: crypto.randomUUID(),
      });
      setBody('');
      setSuccess(`Zoho accepted the email from ${result.sender}. It has been logged in the CRM timeline.`);
      await onChanged(`Email sent from ${result.sender} through Zoho Mail and logged in the lead timeline.`);
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Professional email could not be sent.');
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  if (loadingStatus && !status) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>;
  }

  const activeMailbox = Boolean(status?.eligible && status?.mailboxStatus === 'active' && status?.mailProvider === 'zoho' && status?.workEmail);
  const connected = Boolean(activeMailbox && status?.sendConnected);

  return (
    <div className="space-y-4 p-5 sm:p-6">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{error}</div>}
      {success && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      {!activeMailbox ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
          <div className="font-black">Professional email is not ready for this account.</div>
          <p className="mt-1">An active professional mailbox must be provisioned by ProFox Admin before customer email can be sent.</p>
        </div>
      ) : connected ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 text-xs leading-5">
            <div className="font-black">Sending through the Admin-managed Zoho Mail service</div>
            <div className="break-all">From: {status?.workEmail}</div>
            <div className="mt-1 text-[10px] text-emerald-700">ProFox logs the email only after Zoho accepts the send request. Staff do not authorize Zoho or handle mailbox passwords.</div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          <div className="font-black">Company Mail service needs Admin attention</div>
          <p className="mt-1">Mailbox: <span className="font-bold">{status?.workEmail}</span></p>
          <p className="mt-1">ProFox Admin manages the Zoho organization authorization centrally. You do not need to connect or approve Zoho yourself.</p>
          {status?.sendConnectionStatus === 'reconnect_required' && <p className="mt-2 font-bold text-rose-700">The company Zoho Mail authorization must be reauthorized by a ProFox Administrator.</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-black text-slate-600">From<input disabled value={status?.workEmail || ''} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500" /></label>
        <label className="block text-xs font-black text-slate-600">To<input disabled value={recipientEmail || ''} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500" /></label>
      </div>
      <label className="block text-xs font-black text-slate-600">Subject<input value={subject} maxLength={180} onChange={event => setSubject(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#000080]" /></label>
      <label className="block text-xs font-black text-slate-600">Message<textarea rows={9} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-[#000080]" placeholder="Write the customer email…" /></label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" disabled={loadingStatus} onClick={() => void loadStatus()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-500 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />Refresh mailbox status</button>
        <button type="button" disabled={busy || !connected || !recipientEmail || subject.trim().length < 2 || body.trim().length < 2} onClick={() => void send()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-xs font-black text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {busy ? 'Sending through Zoho…' : 'Send with professional email'}
        </button>
      </div>
    </div>
  );
}
