import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  MoreHorizontal, 
  Briefcase, 
  MapPin, 
  Clock, 
  Star, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Loader2,
  Calendar,
  LayoutGrid,
  List as ListIcon,
  Video,
  DollarSign,
  Building2,
  User,
  AlertTriangle,
  Trophy,
  Tag,
  Receipt
} from 'lucide-react';
import { crmService } from '../../lib/crmService';
import { CRMOpportunity, OpportunityStage, OPPORTUNITY_STAGES, LOST_REASONS } from '../../types';
import { useAuth } from '../../lib/AuthContext';

export default function CRMPipeline({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpportunity, setSelectedOpportunity] = useState<CRMOpportunity | null>(null);
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const data = await crmService.getOpportunities();
      setOpportunities(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOpportunities = opportunities.filter(opp => {
    return isAdmin || opp.salespersonId === user?.id;
  });

  if (loading && opportunities.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#000080]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Pipeline</h1>
          <p className="text-sm text-slate-500">Track your opportunities from qualification to close.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-2">
            Total Value: <span className="text-[#000080]">USD {filteredOpportunities.filter(o => o.status === 'Open').reduce((acc, curr) => acc + curr.expectedValue, 0).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-6 -mx-8 px-8 scrollbar-hide">
        {OPPORTUNITY_STAGES.map(stage => {
          const stageOpps = filteredOpportunities.filter(o => o.stage === stage && o.status === 'Open');
          const stageTotal = stageOpps.reduce((acc, curr) => acc + curr.expectedValue, 0);
          
          return (
            <div key={stage} className="min-w-[300px] w-[300px] flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <div className="space-y-0.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {stage}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{stageOpps.length}</span>
                    <span className="text-[10px] text-slate-400 font-medium">USD {stageTotal.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 min-h-[500px] bg-slate-50/50 rounded-2xl p-2 border border-slate-100">
                {stageOpps.map(opp => (
                  <div 
                    key={opp.id}
                    onClick={() => setSelectedOpportunity(opp)}
                    className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#000080]/30 transition-all cursor-pointer group"
                  >
                    <h4 className="font-bold text-slate-900 mb-1 group-hover:text-[#000080] line-clamp-1">{opp.name}</h4>
                    <p className="text-[10px] text-slate-500 mb-3 flex items-center gap-1 font-medium">
                      <Building2 className="w-3 h-3" /> {opp.companyName}
                    </p>
                    
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] font-black text-emerald-600">
                        {opp.currency} {opp.expectedValue.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <Tag className="w-3 h-3" /> {opp.serviceInterest || 'N/A'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-medium">
                        <Clock className="w-3 h-3" /> {new Date(opp.createdAt).toLocaleDateString()}
                      </div>
                      {opp.meetingAt && (
                        <div className="p-1 rounded-full bg-blue-50 text-[#000080] border border-blue-100" title="Meeting Scheduled">
                          <Calendar className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {stageOpps.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-30">
                    <p className="text-[10px] font-bold text-slate-400">Empty Stage</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedOpportunity && (
        <OpportunityDetailModal 
          opportunity={selectedOpportunity} 
          onClose={() => setSelectedOpportunity(null)}
          onUpdate={fetchOpportunities}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function OpportunityDetailModal({ opportunity, onClose, onUpdate, onNavigate }: { opportunity: CRMOpportunity, onClose: () => void, onUpdate: () => void, onNavigate?: (tab: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]);
  const { isAdmin } = useAuth();

  const handleStageChange = async (newStage: OpportunityStage) => {
    setLoading(true);
    try {
      await crmService.updateOpportunity(opportunity.id, { stage: newStage });
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWon = async () => {
    setLoading(true);
    try {
      await crmService.markWon(opportunity.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLost = async () => {
    setLoading(true);
    try {
      await crmService.markLost(opportunity.id, lostReason);
      onUpdate();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
        <div className="sticky top-0 bg-white z-10 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{opportunity.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#000080] border border-blue-100">
                  {opportunity.stage}
                </span>
                <span className="text-[10px] font-bold text-slate-400">• {opportunity.companyName}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Deal Information</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Expected Value</label>
                  <p className="text-base font-black text-emerald-600">{opportunity.currency} {opportunity.expectedValue.toLocaleString()}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Service Interest</label>
                  <p className="text-sm font-bold text-slate-700">{opportunity.serviceInterest || 'Not specified'}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Source</label>
                  <p className="text-sm font-bold text-slate-700">{opportunity.source} {opportunity.selfGenerated ? '(Self-Gen)' : ''}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Next Follow-Up</label>
                  <p className="text-sm font-bold text-slate-700">{opportunity.nextFollowUpAt ? new Date(opportunity.nextFollowUpAt).toLocaleDateString() : 'Not scheduled'}</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Meeting Details</h3>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {opportunity.meetingAt ? new Date(opportunity.meetingAt).toLocaleString() : 'No meeting scheduled'}
                    </p>
                    <p className="text-[10px] text-slate-500">CRM-linked Sales Meeting</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {opportunity.meetingUrl && (
                    <a href={opportunity.meetingUrl} target="_blank" rel="noreferrer" className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-[#000080] hover:border-[#000080] transition-all">
                      Join Meeting
                    </a>
                  )}
                  {opportunity.status === 'Open' && (
                    <a href={`/admin/meetings?opportunityId=${opportunity.id}`} className="px-4 py-1.5 bg-[#000080] text-white border border-[#000080] rounded-lg text-[10px] font-bold hover:bg-[#000066] transition-all">
                      {opportunity.meetingAt ? 'Manage Meetings' : 'Schedule Meeting'}
                    </a>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-2">Requirements Summary</h3>
              <p className="text-sm text-slate-600 bg-slate-50 p-4 rounded-xl leading-relaxed whitespace-pre-wrap">
                {opportunity.requirementsSummary || 'No requirements captured yet.'}
              </p>
            </section>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Pipeline Controls</label>
                <div className="space-y-2.5">
                  <select 
                    value={opportunity.stage}
                    onChange={(e) => handleStageChange(e.target.value as OpportunityStage)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-[#000080]"
                  >
                    {OPPORTUNITY_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    {opportunity.status === 'Open' ? (
                      <>
                        <button 
                          onClick={handleWon}
                          disabled={loading}
                          className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
                        >
                          <Trophy className="w-4 h-4" /> Won
                        </button>
                        <button 
                          onClick={() => setIsMarkingLost(true)}
                          disabled={loading}
                          className="py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-200 transition-all flex items-center justify-center gap-2"
                        >
                          <AlertTriangle className="w-4 h-4" /> Lost
                        </button>
                      </>
                    ) : opportunity.status === 'Won' ? (
                      <button 
                        onClick={() => onNavigate?.('projects')}
                        className="col-span-2 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
                      >
                        <Briefcase className="w-4 h-4" /> Start Delivery
                      </button>
                    ) : (
                      <div className="col-span-2 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold text-center border border-slate-200">
                        {opportunity.status}
                      </div>
                    )}
                  </div>

                  {opportunity.status === 'Open' && onNavigate && (
                    <button 
                      onClick={() => onNavigate('quotations')}
                      className="w-full py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all"
                    >
                      <Receipt className="w-4 h-4" /> Create Quote
                    </button>
                  )}
                </div>
              </div>

              {isMarkingLost && (
                <div className="pt-4 border-t border-slate-200 space-y-3 animate-in slide-in-from-top-2">
                  <p className="text-[10px] font-bold text-red-600 uppercase">Reason for Loss</p>
                  <select 
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-red-500"
                  >
                    {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleLost} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-bold">Confirm</button>
                    <button onClick={() => setIsMarkingLost(false)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Admin Meta</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Salesperson</span>
                  <span className="font-bold text-slate-700 truncate max-w-[120px]">{opportunity.salespersonId}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Created At</span>
                  <span className="font-bold text-slate-700">{new Date(opportunity.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
