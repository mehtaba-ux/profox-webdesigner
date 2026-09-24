import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Mail, 
  Clock, 
  Trash2, 
  CheckCircle, 
  UserPlus, 
  X, 
  MoreVertical,
  Calendar,
  MessageSquare,
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  Tag
} from 'lucide-react';
import { ContactLead } from '../../types';
import { leadService } from '../../lib/leadService';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function LeadsManager() {
  const [leads, setLeads] = useState<ContactLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactLead['status'] | 'all'>('all');
  const [selectedLead, setSelectedLead] = useState<ContactLead | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const data = await leadService.getAllLeads();
    setLeads(data);
    setLoading(false);
  };

  const handleUpdateStatus = async (leadId: string, status: ContactLead['status']) => {
    const res = await leadService.updateLeadStatus(leadId, status);
    if (res.success) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
      if (selectedLead?.id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, status } : null);
      }
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return;
    
    const res = await leadService.deleteLead(leadId);
    if (res.success) {
      setLeads(prev => prev.filter(l => l.id !== leadId));
      if (selectedLead?.id === leadId) setSelectedLead(null);
    }
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.subject.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: ContactLead['status']) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'contacted': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'qualified': return 'bg-green-100 text-green-700 border-green-200';
      case 'lost': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#000080]" />
            Leads Management
          </h2>
          <p className="text-sm text-slate-500">Track and manage your contact form submissions and business inquiries.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchLeads}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-slate-600 disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: leads.length, icon: Users, color: 'bg-blue-500' },
          { label: 'New Leads', value: leads.filter(l => l.status === 'new').length, icon: AlertCircle, color: 'bg-amber-500' },
          { label: 'Qualified', value: leads.filter(l => l.status === 'qualified').length, icon: CheckCircle, color: 'bg-green-500' },
          { label: 'Lost', value: leads.filter(l => l.status === 'lost').length, icon: X, color: 'bg-slate-500' },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-xl text-white", stat.color)}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input 
              type="text"
              placeholder="Search leads by name, email, or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#000080]/5 focus:border-[#000080] transition-all"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none appearance-none"
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
              <Loader2 className="w-10 h-10 text-[#000080] animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Fetching leads from database...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <p className="font-bold text-slate-900">No leads found</p>
                <p className="text-sm text-slate-500">No leads match your current filters or search criteria.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Contact Info</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Subject</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr 
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className="group hover:bg-slate-50 transition-all cursor-pointer border-b border-slate-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">{lead.fullName}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Mail className="w-3 h-3" /> {lead.email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                        {lead.subject}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
                        getStatusColor(lead.status)
                      )}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-600 flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" /> 
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className="p-2 text-[#000080] bg-blue-50 rounded-lg">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Lead Details Drawer */}
      <AnimatePresence>
        {selectedLead && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-[70] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Lead Details</h3>
                  <p className="text-xs text-slate-500">ID: {selectedLead.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedLead(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-8 space-y-8">
                {/* Header Info */}
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-[#000080]/5 border border-[#000080]/10 flex items-center justify-center text-[#000080]">
                    <Users className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-2xl font-bold text-slate-900">{selectedLead.fullName}</h4>
                    <div className="flex items-center gap-3">
                      <a href={`mailto:${selectedLead.email}`} className="text-sm font-medium text-[#000080] hover:underline flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> {selectedLead.email}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Status Switcher */}
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Current Status</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['new', 'contacted', 'qualified', 'lost'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleUpdateStatus(selectedLead.id, s)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all",
                          selectedLead.status === s 
                            ? getStatusColor(s) + " shadow-sm scale-105"
                            : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Submission Date</label>
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-medium text-slate-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {new Date(selectedLead.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Inquiry Source</label>
                    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-medium text-slate-600 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-slate-400" />
                      {selectedLead.source.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Inquiry Subject</label>
                  <div className="p-4 bg-[#000080]/5 border border-[#000080]/10 rounded-2xl text-sm font-bold text-[#000080]">
                    {selectedLead.subject}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Message</label>
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {selectedLead.message}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <button 
                  onClick={() => window.open(`mailto:${selectedLead.email}?subject=Re: ${selectedLead.subject}`)}
                  className="flex-1 bg-[#000080] hover:bg-[#000066] text-white font-bold py-3.5 rounded-2xl shadow-xl shadow-blue-900/10 transition-all flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Reply via Email
                </button>
                <button 
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="p-3.5 text-red-500 hover:bg-red-50 border border-red-100 rounded-2xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
