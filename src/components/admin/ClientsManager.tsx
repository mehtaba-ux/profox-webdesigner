import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Receipt,
  Search,
  ShieldCheck,
  TrendingUp,
  User,
  UserCheck,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../lib/AuthContext';
import {
  clientService,
  ClientHistoryRecord,
  ClientRecord
} from '../../lib/clientService';
import { UserProfile } from '../../types';

const EMPTY_HISTORY: ClientHistoryRecord = {
  opportunities: [],
  quotations: [],
  payments: [],
  projects: []
};

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export default function ClientsManager() {
  const { isAdmin, profile } = useAuth();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [history, setHistory] = useState<ClientHistoryRecord>(EMPTY_HISTORY);
  const [portalProfile, setPortalProfile] = useState<UserProfile | null>(null);
  const [portalCandidate, setPortalCandidate] = useState<UserProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState('');
  const canUseMeetings = isAdmin || (profile?.role === 'sales' && profile?.status === 'active');

  const fetchClients = async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await clientService.getClients();
    if (loadError) setError('Failed to load client portfolio.');
    else setClients(data);
    setLoading(false);
  };

  useEffect(() => {
    void fetchClients();
  }, []);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(client =>
      client.companyName.toLowerCase().includes(q) ||
      client.primaryContactName.toLowerCase().includes(q) ||
      client.email.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  const totalValue = clients.reduce((sum, client) => sum + client.totalSalesValue, 0);
  const activeClients = clients.filter(client => client.status === 'Active').length;
  const portalEnabled = clients.filter(client => Boolean(client.linkedUserId)).length;

  const loadClientDetail = async (client: ClientRecord) => {
    setSelectedClient(client);
    setHistory(EMPTY_HISTORY);
    setPortalProfile(null);
    setPortalCandidate(null);
    setPortalError('');
    setDetailLoading(true);

    const [historyResult, linkedResult] = await Promise.all([
      clientService.getHistory(client.id),
      clientService.getLinkedPortalProfile(client)
    ]);

    if (historyResult.error) setPortalError('Some client history could not be loaded.');
    else setHistory(historyResult.data);

    if (linkedResult.error) {
      setPortalError('Client portal account information could not be loaded.');
    } else if (linkedResult.data) {
      setPortalProfile(linkedResult.data);
    } else if (isAdmin && client.email) {
      const candidateResult = await clientService.findPortalCandidateByEmail(client.email);
      if (!candidateResult.error) setPortalCandidate(candidateResult.data);
    }

    setDetailLoading(false);
  };

  const refreshSelectedClient = async () => {
    if (!selectedClient) return;
    const { data, error: clientError } = await clientService.getClient(selectedClient.id);
    if (clientError || !data) return;
    await fetchClients();
    await loadClientDetail(data);
  };

  const linkPortalAccount = async () => {
    if (!selectedClient || !portalCandidate) return;
    setPortalBusy(true);
    setPortalError('');
    const { error: linkError } = await clientService.linkPortalAccount(selectedClient.id, portalCandidate.id);
    if (linkError) setPortalError(errorMessage(linkError, 'Could not link the client portal account.'));
    else await refreshSelectedClient();
    setPortalBusy(false);
  };

  const unlinkPortalAccount = async () => {
    if (!selectedClient || !portalProfile) return;
    if (!window.confirm('Remove this client portal account link? The user will immediately lose access to this client workspace.')) return;
    setPortalBusy(true);
    setPortalError('');
    const { error: unlinkError } = await clientService.unlinkPortalAccount(selectedClient.id);
    if (unlinkError) setPortalError(errorMessage(unlinkError, 'Could not unlink the client portal account.'));
    else await refreshSelectedClient();
    setPortalBusy(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Client Portfolio</h1>
        <p className="mt-1 text-sm text-slate-500">Manage verified clients, project history, payments, and explicit portal access.</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Building2 className="h-5 w-5" />} label="Active Clients" value={activeClients.toString()} />
        <MetricCard icon={<TrendingUp className="h-5 w-5" />} label="Portfolio Value" value={`$${totalValue.toLocaleString()}`} />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Portal Accounts Linked" value={portalEnabled.toString()} />
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="Search by client, contact, or email..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#000080]"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>
      ) : filteredClients.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white py-20 text-center">
          <Building2 className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <h3 className="font-bold text-slate-900">No clients found</h3>
          <p className="mt-1 text-sm text-slate-500">A client is created after the required advance/full payment is fully verified.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map(client => (
            <button
              type="button"
              key={client.id}
              onClick={() => void loadClientDetail(client)}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-200 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#000080]"><Building2 className="h-6 w-6" /></div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${client.linkedUserId ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                  {client.linkedUserId ? 'Portal Linked' : 'Portal Not Linked'}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-black text-slate-900">{client.companyName}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><User className="h-3.5 w-3.5" />{client.primaryContactName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" />{client.email}</p>
              <div className="mt-6 flex items-end justify-between border-t border-slate-100 pt-5">
                <div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lifetime Value</div><div className="text-xl font-black text-[#000080]">${client.totalSalesValue.toLocaleString()}</div></div>
                <div className="text-right"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Since</div><div className="text-xs font-bold text-slate-700">{format(new Date(client.createdAt), 'MMM yyyy')}</div></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-slate-50 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 bg-white px-8 py-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#000080] text-white"><Building2 className="h-7 w-7" /></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{selectedClient.companyName}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{selectedClient.primaryContactName}</span>
                    <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selectedClient.email}</span>
                    {selectedClient.country && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{selectedClient.country}</span>}
                    {selectedClient.website && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />{selectedClient.website}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canUseMeetings && (
                  <a href={`/admin/meetings?clientId=${selectedClient.id}`} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#000066]">
                    <Calendar className="h-4 w-4" /> Schedule Meeting
                  </a>
                )}
                <button type="button" onClick={() => setSelectedClient(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {detailLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>
              ) : (
                <div className="space-y-8">
                  {portalError && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{portalError}</div>}

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#000080]"><KeyRound className="h-4 w-4" />Client Portal Access</div>
                        <p className="mt-1 text-xs text-slate-500">Access is granted only through an explicit account link. Email matching alone never authorizes a client.</p>
                      </div>
                      {portalProfile && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">Active</span>}
                    </div>

                    {portalProfile ? (
                      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700"><UserCheck className="h-5 w-5" /></div><div><div className="text-sm font-bold text-slate-900">{portalProfile.fullName || selectedClient.primaryContactName}</div><div className="text-xs text-slate-600">{portalProfile.email} · customer / active</div></div></div>
                        {isAdmin && <button type="button" onClick={() => void unlinkPortalAccount()} disabled={portalBusy} className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 disabled:opacity-50">Remove Portal Access</button>}
                      </div>
                    ) : portalCandidate ? (
                      <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div><div className="text-sm font-bold text-slate-900">Matching account found</div><div className="text-xs text-slate-600">{portalCandidate.email} · current role {portalCandidate.role}, status {portalCandidate.status}</div></div>
                        {isAdmin && <button type="button" onClick={() => void linkPortalAccount()} disabled={portalBusy || !['pending', 'customer'].includes(portalCandidate.role)} className="flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Link & Activate Portal</button>}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                        No matching portal account exists yet. The client should register using <strong>{selectedClient.email}</strong>. After registration, reopen this client and link the account here.
                      </div>
                    )}
                  </section>

                  <div className="grid gap-4 md:grid-cols-4">
                    <MiniMetric label="Projects" value={history.projects.length.toString()} />
                    <MiniMetric label="Opportunities" value={history.opportunities.length.toString()} />
                    <MiniMetric label="Quotations" value={history.quotations.length.toString()} />
                    <MiniMetric label="Verified / Paid" value={`$${history.payments.reduce((sum, payment) => sum + payment.amountPaid, 0).toLocaleString()}`} />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <HistoryPanel title="Projects" icon={<FileText className="h-4 w-4" />} empty="No projects yet.">
                      {history.projects.map(project => (
                        <HistoryRow key={project.id} title={project.projectName} subtitle={`${project.projectNumber} · ${project.stage}`} badge={project.status} />
                      ))}
                    </HistoryPanel>

                    <HistoryPanel title="Payments" icon={<Receipt className="h-4 w-4" />} empty="No payments yet.">
                      {history.payments.map(payment => (
                        <HistoryRow key={payment.id} title={payment.paymentReference} subtitle={`${payment.currency} ${payment.amountPaid.toLocaleString()} received of ${payment.amountDue.toLocaleString()}`} badge={payment.status} />
                      ))}
                    </HistoryPanel>

                    <HistoryPanel title="Quotations" icon={<FileText className="h-4 w-4" />} empty="No quotations yet.">
                      {history.quotations.map(quotation => (
                        <HistoryRow key={quotation.id} title={quotation.quotationNumber} subtitle={`${quotation.currency} ${quotation.total.toLocaleString()}`} badge={quotation.status} />
                      ))}
                    </HistoryPanel>

                    <HistoryPanel title="Opportunities" icon={<TrendingUp className="h-4 w-4" />} empty="No opportunities yet.">
                      {history.opportunities.map(opportunity => (
                        <HistoryRow key={opportunity.id} title={opportunity.name} subtitle={`${opportunity.stage} · ${opportunity.currency} ${opportunity.expectedValue.toLocaleString()}`} badge={opportunity.status} />
                      ))}
                    </HistoryPanel>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#000080]">{icon}</div><div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div><div className="mt-1 text-3xl font-black text-slate-900">{value}</div></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-xl font-black text-slate-900">{value}</div></div>;
}

function HistoryPanel({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) {
  const count = React.Children.count(children);
  return <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6"><h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#000080]">{icon}{title}</h3>{count > 0 ? <div className="space-y-2">{children}</div> : <p className="text-xs text-slate-400">{empty}</p>}</section>;
}

function HistoryRow({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="min-w-0"><div className="truncate text-xs font-bold text-slate-900">{title}</div><div className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</div></div><span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-600">{badge}</span></div>;
}