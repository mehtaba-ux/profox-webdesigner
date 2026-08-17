import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Mail, 
  MessageCircle, 
  X, 
  ChevronRight,
  Filter,
  Search,
  CheckSquare,
  FileText,
  Link,
  Copy,
  Trash2,
  Star,
  Plus,
  Image as ImageIcon,
  Pencil,
  User,
  Save,
  ExternalLink
} from 'lucide-react';
import { useCMS } from '../../lib/CMSProvider';
import { FeedbackEntry, FeedbackResolution } from '../../types';
import ImageUploader from './ImageUploader';

interface GroupedFeedback {
  id: string; // email
  customerName: string;
  customerEmail: string;
  averageRating: number;
  totalFeedbacks: number;
  queriesRaised: number;
  status: 'pending' | 'resolved';
  latestCreatedAt: string;
  feedbacks: FeedbackEntry[];
}

const FeedbackManager: React.FC = () => {
  const { content, updateSection } = useCMS();
  const [selectedGroup, setSelectedGroup] = useState<GroupedFeedback | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [solutionConfirmed, setSolutionConfirmed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [copied, setCopied] = useState(false);
  const [isAddingFeedback, setIsAddingFeedback] = useState(false);
  const [newFeedback, setNewFeedback] = useState<Partial<FeedbackEntry>>({
    rating: 5,
    status: 'resolved',
    showOnWebsite: true,
  });
  const [editingFeedback, setEditingFeedback] = useState<FeedbackEntry | null>(null);

  const handleSaveEditedFeedback = async () => {
    if (!editingFeedback || !editingFeedback.id) return;

    try {
      const updatedFeedbacks = feedbacks.map(f => 
        f.id === editingFeedback.id ? editingFeedback : f
      );
      await updateSection('feedback_submissions', updatedFeedbacks);

      if (selectedGroup) {
        const updatedGroupFeedbacks = selectedGroup.feedbacks.map(f =>
          f.id === editingFeedback.id ? editingFeedback : f
        );
        setSelectedGroup({
          ...selectedGroup,
          customerName: editingFeedback.customerName || selectedGroup.customerName,
          customerEmail: editingFeedback.customerEmail || selectedGroup.customerEmail,
          feedbacks: updatedGroupFeedbacks
        });
      }

      setEditingFeedback(null);
    } catch (err) {
      console.error('Error updating feedback entry:', err);
    }
  };
  
  const siteSettings = content.siteSettings || {};
  const [googleUrl, setGoogleUrl] = useState(siteSettings.googleReviewUrl || '');
  const [isSavingUrl, setIsSavingUrl] = useState(false);

  const feedbacks: FeedbackEntry[] = content.feedback_submissions || [];

  const handleAddFeedback = async () => {
    if (!newFeedback.customerName || !newFeedback.comment) return;
    
    try {
      const fb: FeedbackEntry = {
        id: `fb-${Date.now()}`,
        customerName: newFeedback.customerName || '',
        customerEmail: newFeedback.customerEmail || '',
        rating: newFeedback.rating || 5,
        comment: newFeedback.comment || '',
        status: newFeedback.status as 'pending' | 'resolved' || 'resolved',
        createdAt: new Date().toISOString(),
        image: newFeedback.image,
        position: newFeedback.position,
        link: newFeedback.link,
        showOnWebsite: newFeedback.showOnWebsite,
      };
      
      const updatedFeedbacks = [fb, ...feedbacks];
      await updateSection('feedback_submissions', updatedFeedbacks);
      setIsAddingFeedback(false);
      setNewFeedback({ rating: 5, status: 'resolved', showOnWebsite: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveGoogleUrl = async () => {
    setIsSavingUrl(true);
    try {
      const updatedSettings = {
        ...siteSettings,
        googleReviewUrl: googleUrl
      };
      await updateSection('siteSettings', updatedSettings);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingUrl(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/leave-feedback`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteFeedback = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this feedback submission?")) {
      const updated = feedbacks.filter((f) => f.id !== id);
      await updateSection('feedback_submissions', updated);
      
      if (selectedGroup) {
        const remainingInGroup = selectedGroup.feedbacks.filter(f => f.id !== id);
        if (remainingInGroup.length === 0) {
          setSelectedGroup(null);
          setIsResolving(false);
        } else {
          setSelectedGroup({
            ...selectedGroup,
            feedbacks: remainingInGroup
          });
        }
      }
    }
  };

  const handleDeleteGroup = async (group: GroupedFeedback) => {
    if (window.confirm(`Are you sure you want to delete all feedback from ${group.customerName || 'this customer'}?`)) {
      const idsToDelete = new Set(group.feedbacks.map(f => f.id));
      const updated = feedbacks.filter((f) => !idsToDelete.has(f.id));
      await updateSection('feedback_submissions', updated);
      
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
        setIsResolving(false);
      }
    }
  };

  const validFeedbacks = Array.isArray(feedbacks) ? feedbacks.filter(fb => fb && typeof fb === 'object' && fb.id) : [];

  // Group by email
  const groupedFeedbackMap = new Map<string, GroupedFeedback>();
  
  validFeedbacks.forEach(fb => {
    const email = (fb.customerEmail || 'unknown@example.com').toLowerCase();
    if (!groupedFeedbackMap.has(email)) {
      groupedFeedbackMap.set(email, {
        id: email,
        customerName: fb.customerName || 'Anonymous',
        customerEmail: email,
        averageRating: fb.rating,
        totalFeedbacks: 1,
        queriesRaised: fb.comment && fb.comment.trim() ? 1 : 0,
        status: fb.status,
        latestCreatedAt: fb.createdAt,
        feedbacks: [fb]
      });
    } else {
      const group = groupedFeedbackMap.get(email)!;
      group.totalFeedbacks += 1;
      group.averageRating = ((group.averageRating * (group.totalFeedbacks - 1)) + fb.rating) / group.totalFeedbacks;
      if (fb.comment && fb.comment.trim()) {
        group.queriesRaised += 1;
      }
      if (fb.status === 'pending') {
        group.status = 'pending';
      }
      if (new Date(fb.createdAt) > new Date(group.latestCreatedAt)) {
        group.latestCreatedAt = fb.createdAt;
        group.customerName = fb.customerName || group.customerName;
      }
      group.feedbacks.push(fb);
    }
  });

  const groupedFeedbacks = Array.from(groupedFeedbackMap.values()).sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime());

  const filteredFeedbacks = groupedFeedbacks.filter(group => {
    const matchesSearch = group.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          group.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          group.feedbacks.some(fb => fb.comment?.toLowerCase().includes(searchQuery.toLowerCase()));
        
    const matchesFilter = filter === 'all' || group.status === filter;
        
    return matchesSearch && matchesFilter;
  });

  const handleResolve = async () => {
    if (!selectedGroup || !resolutionNotes || !solutionConfirmed) return;

    const resolution: FeedbackResolution = {
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'Admin User',
      notes: resolutionNotes,
      solutionConfirmed: true
    };

    const updatedFeedbacks = feedbacks.map(fb => {
      const email = (fb.customerEmail || 'unknown@example.com').toLowerCase();
      if (email === selectedGroup.id && fb.status === 'pending') {
        return { ...fb, status: 'resolved' as const, resolution };
      }
      return fb;
    });

    try {
      await updateSection('feedback_submissions', updatedFeedbacks);
      setIsResolving(false);
      setSelectedGroup(null);
      setResolutionNotes('');
      setSolutionConfirmed(false);
    } catch (err) {
      console.error('Error resolving feedback:', err);
    }
  };

  const openResolutionModal = (group: GroupedFeedback) => {
    setSelectedGroup(group);
    setIsResolving(true);
  };

  const sendEmailTemplate = (group: GroupedFeedback) => {
    const subject = encodeURIComponent(`Regarding your feedback for ${siteSettings.businessName || 'our business'}`);
    const body = encodeURIComponent(`Hi ${group.customerName},

Regarding your recent feedback, I apologize for the inconvenience and I'd like to offer a solution to make things right...

Best regards,
Management Team`);
    window.location.href = `mailto:${group.customerEmail}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Feedback & Resolution</h2>
          <p className="text-slate-500 text-sm">Monitor and resolve negative customer experiences.</p>
        </div>
        
        <div className="flex items-center gap-2">
           <input 
             type="url" 
             placeholder="Google Review URL"
             value={googleUrl}
             onChange={(e) => setGoogleUrl(e.target.value)}
             className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080] outline-none transition-all w-64"
           />
           <ConfirmButton
             onClick={handleSaveGoogleUrl}
             disabled={isSavingUrl}
             className="px-4 py-2 bg-[#000080] text-white text-sm font-bold rounded-xl hover:bg-[#000066] transition-all disabled:opacity-50"
           >
             {isSavingUrl ? 'Saving...' : 'Save Link'}
           </ConfirmButton>
        </div>

        <div className="flex items-center gap-3">
          <ConfirmButton
            onClick={() => setIsAddingFeedback(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#000080] text-white text-sm font-bold rounded-xl hover:bg-[#000066] transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Feedback
          </ConfirmButton>
          
          <ConfirmButton
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Link className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Form Link'}
          </ConfirmButton>
          
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search feedback..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080] outline-none transition-all w-full md:w-64"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            {(['all', 'pending', 'resolved'] as const).map((f) => (
              <ConfirmButton
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  filter === f 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f}
              </ConfirmButton>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Customer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Avg Rating</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">History</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Homepage</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFeedbacks.length > 0 ? (
                filteredFeedbacks.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          {group.feedbacks.find(f => f.image)?.image ? (
                            <img 
                              src={group.feedbacks.find(f => f.image)?.image} 
                              alt={group.customerName} 
                              className="w-11 h-11 rounded-full object-cover border-2 border-indigo-100 shadow-sm" 
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#000080] to-teal-700 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                              {group.customerName ? group.customerName.charAt(0).toUpperCase() : 'C'}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {group.customerName}
                            {group.feedbacks[0]?.position && (
                              <span className="text-[11px] font-normal text-slate-500">
                                ({group.feedbacks[0].position})
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{group.customerEmail}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(group.latestCreatedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star key={s} className={`w-3 h-3 ${Math.round(group.averageRating) >= s ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-slate-500">{group.averageRating.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-700">{group.totalFeedbacks} Feedbacks</span>
                        <span className="text-[10px] text-slate-500">{group.queriesRaised} Queries Raised</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {group.status === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-wider">
                          <AlertCircle className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {group.feedbacks.some(f => f.showOnWebsite === true) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-[#000080] text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3 text-[#000080]" />
                          Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                          Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {group.status === 'pending' ? (
                          <ConfirmButton
                            onClick={() => openResolutionModal(group)}
                            className="px-4 py-2 bg-[#000080] text-white text-xs font-bold rounded-xl hover:bg-[#000066] transition-all shadow-sm shadow-[#000080]/10 flex items-center gap-2"
                          >
                            Resolve Issue
                            <ChevronRight className="w-3 h-3" />
                          </ConfirmButton>
                        ) : (
                          <ConfirmButton
                            onClick={() => {
                              setSelectedGroup(group);
                              setIsResolving(true);
                            }}
                            className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2"
                          >
                            View Details
                          </ConfirmButton>
                        )}
                        <ConfirmButton
                          onClick={() => setEditingFeedback(group.feedbacks[0])}
                          title="Edit feedback & reviewer image"
                          className="p-2 text-slate-500 hover:text-[#000080] hover:bg-indigo-50 rounded-xl transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </ConfirmButton>
                        <ConfirmButton
                          onClick={() => handleDeleteGroup(group)}
                          title="Delete all feedback from this client"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-6 h-6 text-slate-300" />
                    </div>
                    <div className="text-slate-500 font-bold">No feedback found</div>
                    <div className="text-sm text-slate-400 mt-1">Wait for customers to submit feedback.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isResolving && selectedGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsResolving(false);
                setSelectedGroup(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-8 border-b border-slate-50 shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {selectedGroup.status === 'resolved' ? 'Feedback Details' : 'Resolve Customer Issue'}
                  </h3>
                  <p className="text-slate-500 text-sm">Feedback from {selectedGroup.customerName}</p>
                </div>
                <ConfirmButton 
                  onClick={() => {
                    setSelectedGroup(null);
                    setIsResolving(false);
                  }}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </ConfirmButton>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="space-y-4">
                    
                    <div className="space-y-4">
                      {selectedGroup.feedbacks.map((fb) => (
                        <div key={fb.id} className="p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                {fb.image ? (
                                  <img src={fb.image} alt={fb.customerName || 'Reviewer'} className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-[#000080] font-bold text-xs flex items-center justify-center">
                                    {fb.customerName ? fb.customerName.charAt(0).toUpperCase() : 'C'}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">{fb.customerName || 'Anonymous'}</div>
                                {fb.position && <div className="text-xs text-slate-500">{fb.position}</div>}
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                  {new Date(fb.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star key={s} className={`w-3 h-3 ${fb.rating >= s ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} />
                                ))}
                              </div>
                              <ConfirmButton
                                onClick={() => setEditingFeedback(fb)}
                                title="Edit review & image"
                                className="p-1.5 text-slate-500 hover:text-[#000080] hover:bg-indigo-100/50 rounded-lg transition-colors ml-1"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </ConfirmButton>
                            </div>
                          </div>
                          <p className="text-sm text-slate-700 italic bg-white p-3 rounded-xl border border-slate-100">"{fb.comment || 'No comment'}"</p>
                          
                          {fb.link && (
                            <div className="flex items-center gap-2 text-xs text-[#000080] bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100/80">
                              <Link className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-semibold truncate flex-1">{fb.link}</span>
                              <a
                                href={fb.link}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 hover:bg-indigo-100 rounded text-[#000080] font-bold text-[11px] flex items-center gap-1 shrink-0"
                              >
                                Open <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={fb.showOnWebsite === true}
                                onChange={async (e) => {
                                  const isApproved = e.target.checked;
                                  const updated = feedbacks.map(f => f.id === fb.id ? { ...f, showOnWebsite: isApproved } : f);
                                  await updateSection('feedback_submissions', updated);
                                  
                                  const updatedGroup = {
                                    ...selectedGroup,
                                    feedbacks: selectedGroup.feedbacks.map(f => f.id === fb.id ? { ...f, showOnWebsite: isApproved } : f)
                                  };
                                  setSelectedGroup(updatedGroup);
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                              />
                              <span className={`text-xs font-bold ${fb.showOnWebsite ? 'text-emerald-700' : 'text-slate-600'}`}>
                                {fb.showOnWebsite ? '✓ Approved for Homepage' : 'Approve for Homepage'}
                              </span>
                            </label>

                            <ConfirmButton
                              onClick={() => handleDeleteFeedback(fb.id)}
                              title="Delete this feedback submission"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                          </div>

                          {fb.status === 'resolved' && fb.resolution && (
                            <div className="mt-3 p-3 bg-emerald-50 rounded-xl text-xs text-emerald-800">
                              <div className="font-bold flex items-center gap-1 mb-1 text-emerald-600 uppercase tracking-widest text-[9px]">
                                <CheckCircle2 className="w-3 h-3" /> Resolved on {new Date(fb.resolution.resolvedAt).toLocaleDateString()}
                              </div>
                              <p className="italic">"{fb.resolution.notes}"</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Contact Actions</div>
                      <div className="flex flex-col gap-2">
                        <ConfirmButton 
                          onClick={() => sendEmailTemplate(selectedGroup)}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-[#000080] hover:bg-[#000080]/5 text-sm font-bold text-slate-700 transition-all text-left"
                        >
                          <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center text-[#000080]">
                            <Mail className="w-4 h-4" />
                          </div>
                          Send Apology Email
                        </ConfirmButton>
                        <ConfirmButton className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-[#000080] hover:bg-[#000080]/5 text-sm font-bold text-slate-700 transition-all text-left">
                          <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                            <MessageCircle className="w-4 h-4" />
                          </div>
                          Send SMS Message
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {selectedGroup.status === 'pending' ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                            Resolution Notes
                            <span className="text-rose-500">*</span>
                          </label>
                          <textarea 
                            rows={5}
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            placeholder="Type out exactly what you did to fix the issue..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none transition-all resize-none"
                          />
                        </div>

                        <label className="flex items-start gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-100 cursor-pointer group">
                          <div className="pt-0.5">
                            <input 
                              type="checkbox"
                              checked={solutionConfirmed}
                              onChange={(e) => setSolutionConfirmed(e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                            />
                          </div>
                          <div className="text-xs font-bold text-amber-900 leading-snug">
                            I confirm that a solution has been provided to the customer.
                            <div className="text-[10px] text-amber-600 font-normal mt-1">This is required to mark the ticket as resolved.</div>
                          </div>
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer mb-6">
                        <input 
                          type="checkbox"
                          checked={selectedGroup.feedbacks[0]?.showOnWebsite !== false}
                          onChange={async (e) => {
                            const updated = feedbacks.map(f => f.id === selectedGroup.feedbacks[0].id ? { ...f, showOnWebsite: e.target.checked } : f);
                            await updateSection('feedback_submissions', updated);
                            const updatedGroup = { ...selectedGroup };
                            updatedGroup.feedbacks[0].showOnWebsite = e.target.checked;
                            setSelectedGroup(updatedGroup);
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                        />
                        <div className="text-sm font-bold text-slate-700">
                          Show this feedback on the public website (Testimonials)
                        </div>
                      </label>
                      <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-5 h-5" />
                          All Issues Resolved
                        </div>
                        <div className="space-y-3">
                          <p className="text-sm text-emerald-900">
                            All pending feedbacks from this user have been marked as resolved. You can see the resolution notes attached to each feedback in the history.
                          </p>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-white/50 w-fit px-3 py-1.5 rounded-full">
                            <CheckSquare className="w-3 h-3" />
                            Solution Confirmed
                          </div>
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {selectedGroup.status === 'pending' && (
                <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4 shrink-0">
                  <ConfirmButton 
                    onClick={() => {
                      setSelectedGroup(null);
                      setIsResolving(false);
                    }}
                    className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </ConfirmButton>
                  <ConfirmButton 
                    disabled={!resolutionNotes || !solutionConfirmed}
                    onClick={handleResolve}
                    className="px-8 py-3 bg-[#000080] text-white font-bold rounded-xl hover:bg-[#000066] transition-all shadow-lg shadow-[#000080]/20 disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
                  >
                    Mark as Resolved
                    <CheckCircle2 className="w-4 h-4" />
                  </ConfirmButton>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingFeedback && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingFeedback(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-8 border-b border-slate-50 shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Add Feedback</h3>
                  <p className="text-slate-500 text-sm">Manually add feedback for display on website.</p>
                </div>
                <ConfirmButton 
                  onClick={() => setIsAddingFeedback(false)}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </ConfirmButton>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Name *</label>
                    <input 
                      type="text"
                      value={newFeedback.customerName || ''}
                      onChange={e => setNewFeedback({...newFeedback, customerName: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Position / Role</label>
                    <input 
                      type="text"
                      value={newFeedback.position || ''}
                      onChange={e => setNewFeedback({...newFeedback, position: e.target.value})}
                      placeholder="e.g. CEO, Acme Corp"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Email</label>
                    <input 
                      type="email"
                      value={newFeedback.customerEmail || ''}
                      onChange={e => setNewFeedback({...newFeedback, customerEmail: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Rating</label>
                    <div className="flex items-center gap-2 h-[46px]">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <ConfirmButton
                          key={s}
                          onClick={() => setNewFeedback({...newFeedback, rating: s})}
                          className={`p-1 transition-all ${(newFeedback.rating || 5) >= s ? 'text-yellow-400' : 'text-slate-200'}`}
                        >
                          <Star className="w-6 h-6 fill-current" />
                        </ConfirmButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Reviewer Photo / Avatar
                  </label>
                  <ImageUploader 
                    value={newFeedback.image || ''}
                    onChange={(url) => setNewFeedback({ ...newFeedback, image: url })}
                    label=""
                    placeholder="Upload reviewer photo or paste image URL..."
                    helpText="Upload a photo from computer, choose from Media Library, or paste URL"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Website / Project / Proof Link
                  </label>
                  <div className="relative">
                    <Link className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input 
                      type="url"
                      value={newFeedback.link || ''}
                      onChange={e => setNewFeedback({...newFeedback, link: e.target.value})}
                      placeholder="https://example.com or link to project / proof..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Comment / Testimonial *</label>
                  <textarea 
                    rows={4}
                    value={newFeedback.comment || ''}
                    onChange={e => setNewFeedback({...newFeedback, comment: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none resize-none"
                  />
                </div>

                <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={newFeedback.showOnWebsite !== false}
                    onChange={(e) => setNewFeedback({...newFeedback, showOnWebsite: e.target.checked})}
                    className="w-4 h-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                  />
                  <div className="text-sm font-bold text-slate-700">
                    Show this feedback on the public website (Testimonials)
                  </div>
                </label>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4 shrink-0">
                <ConfirmButton 
                  onClick={() => setIsAddingFeedback(false)}
                  className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </ConfirmButton>
                <ConfirmButton 
                  disabled={!newFeedback.customerName || !newFeedback.comment}
                  onClick={handleAddFeedback}
                  className="px-8 py-3 bg-[#000080] text-white font-bold rounded-xl hover:bg-[#000066] transition-all shadow-lg shadow-[#000080]/20 disabled:opacity-50 flex items-center gap-2"
                >
                  Save Feedback
                  <CheckCircle2 className="w-4 h-4" />
                </ConfirmButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Feedback Modal */}
      <AnimatePresence>
        {editingFeedback && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingFeedback(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-8 border-b border-slate-50 shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Edit Feedback & Reviewer Details</h3>
                  <p className="text-slate-500 text-sm">Update reviewer information, image, rating, or testimonial text.</p>
                </div>
                <ConfirmButton 
                  onClick={() => setEditingFeedback(null)}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-6 h-6" />
                </ConfirmButton>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                {/* Reviewer Image Uploader */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Reviewer Photo / Avatar
                  </label>
                  <ImageUploader 
                    value={editingFeedback.image || ''}
                    onChange={(url) => setEditingFeedback({ ...editingFeedback, image: url })}
                    label=""
                    placeholder="Upload reviewer photo or paste image URL..."
                    helpText="Upload a clear headshot photo, pick from Media Library, or paste image URL"
                  />
                </div>

                {/* Website / Project Link */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Website / Project / Proof Link
                  </label>
                  <div className="relative">
                    <Link className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                    <input 
                      type="url"
                      value={editingFeedback.link || ''}
                      onChange={e => setEditingFeedback({...editingFeedback, link: e.target.value})}
                      placeholder="https://example.com or link to project / proof..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Name *</label>
                    <input 
                      type="text"
                      value={editingFeedback.customerName || ''}
                      onChange={e => setEditingFeedback({...editingFeedback, customerName: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Position / Role</label>
                    <input 
                      type="text"
                      value={editingFeedback.position || ''}
                      onChange={e => setEditingFeedback({...editingFeedback, position: e.target.value})}
                      placeholder="e.g. CEO, Acme Corp"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Customer Email</label>
                    <input 
                      type="email"
                      value={editingFeedback.customerEmail || ''}
                      onChange={e => setEditingFeedback({...editingFeedback, customerEmail: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Rating</label>
                    <div className="flex items-center gap-2 h-[46px]">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <ConfirmButton
                          key={s}
                          type="button"
                          onClick={() => setEditingFeedback({...editingFeedback, rating: s})}
                          className={`p-1 transition-all ${editingFeedback.rating >= s ? 'text-yellow-400' : 'text-slate-200'}`}
                        >
                          <Star className="w-6 h-6 fill-current" />
                        </ConfirmButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Comment / Testimonial *</label>
                  <textarea 
                    rows={4}
                    value={editingFeedback.comment || ''}
                    onChange={e => setEditingFeedback({...editingFeedback, comment: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={editingFeedback.showOnWebsite === true}
                      onChange={(e) => setEditingFeedback({...editingFeedback, showOnWebsite: e.target.checked})}
                      className="w-4 h-4 rounded border-slate-300 text-[#000080] focus:ring-[#000080]"
                    />
                    <div className="text-xs font-bold text-slate-700">
                      Show on Website (Approved)
                    </div>
                  </label>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Status</span>
                    <select
                      value={editingFeedback.status}
                      onChange={(e) => setEditingFeedback({...editingFeedback, status: e.target.value as 'pending' | 'resolved'})}
                      className="bg-white border border-slate-200 rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] outline-none"
                    >
                      <option value="resolved">Resolved</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4 shrink-0">
                <ConfirmButton 
                  onClick={() => setEditingFeedback(null)}
                  className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </ConfirmButton>
                <ConfirmButton 
                  disabled={!editingFeedback.customerName || !editingFeedback.comment}
                  onClick={handleSaveEditedFeedback}
                  className="px-8 py-3 bg-[#000080] text-white font-bold rounded-xl hover:bg-[#000066] transition-all shadow-lg shadow-[#000080]/20 disabled:opacity-50 flex items-center gap-2"
                >
                  Save Changes
                  <Save className="w-4 h-4" />
                </ConfirmButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default FeedbackManager;

