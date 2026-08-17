import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  RefreshCw, 
  Layers, 
  Image as ImageIcon, 
  Sparkles, 
  Link as LinkIcon, 
  ArrowUpRight, 
  Info,
  Database,
  Eye,
  X,
  FileText
} from 'lucide-react';
import { supabase, dbProcedure } from '../../lib/supabase';
import { ProcessStep } from '../../types';
import ImageUploader from './ImageUploader';


import { useCMS } from '../../lib/CMSProvider';

const defaultSteps: ProcessStep[] = [
  {
    id: 'step-01',
    step: '01',
    title: 'Discovery & Strategy',
    desc: 'We analyze your existing workflows, legacy systems, and technical bottlenecks to construct a pragmatic blueprint for modernization.',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    ctaText: "Let's Talk",
    ctaUrl: '/contact-us',
    order_index: 1
  },
  {
    id: 'step-02',
    step: '02',
    title: 'System Architecture & Design',
    desc: 'Our senior engineers design scalable, secure system architectures that seamlessly bridge your current tools and future integrations.',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200',
    ctaText: "Let's Talk",
    ctaUrl: '/contact-us',
    order_index: 2
  },
  {
    id: 'step-03',
    step: '03',
    title: 'Agile Development & Testing',
    desc: 'We write clean, high-performance code with daily standups, robust test coverage, and continuous delivery loops to guarantee momentum.',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200',
    ctaText: "Let's Talk",
    ctaUrl: '/contact-us',
    order_index: 3
  },
  {
    id: 'step-04',
    step: '04',
    title: 'Deployment & Continuous Growth',
    desc: 'We deploy without downtime, provide proactive monitoring, and continuously optimize systems as your user base and operations scale.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    ctaText: "Let's Talk",
    ctaUrl: '/contact-us',
    order_index: 4
  }
];

export default function ProcessManager() {
  const { confirm: confirmAction } = useConfirmContext();
  const { content, updateSection } = useCMS();
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  // Section Header controls
  const processHeader = content.process_header || {
    badge: 'How We Deliver Success',
    title: 'Our Process'
  };
  const [headerBadge, setHeaderBadge] = useState(processHeader.badge);
  const [headerTitle, setHeaderTitle] = useState(processHeader.title);

  // Modal / Editor state for single step
  const [editingStep, setEditingStep] = useState<ProcessStep | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchSteps();
  }, []);

  const fetchSteps = async () => {
    setLoading(true);
    try {
      // 1. Try fetching from process_steps table via stored procedure
      const { data, error } = await dbProcedure.getProcessSteps();

      if (!error && data && data.length> 0) {
        setDbConnected(true);
        const mappedData: ProcessStep[] = data.map((item: any, idx: number) => ({
          id: item.id,
          step: item.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`),
          title: item.title,
          desc: item.desc || item.description || '',
          description: item.desc || item.description || '',
          image: item.image || '',
          ctaText: item.cta_text || item.ctaText || "Let's Talk",
          cta_text: item.cta_text || item.ctaText || "Let's Talk",
          ctaUrl: item.cta_url || item.ctaUrl || "/contact-us",
          cta_url: item.cta_url || item.ctaUrl || "/contact-us",
          order_index: item.order_index ?? idx + 1,
          service_id: item.service_id || 'global'
        }));
        setSteps(mappedData);
      } else {
        // Fall back to CMS content or default steps
        const cmsSteps = content.process_steps?.items || content.ourProcess || defaultSteps;
        setSteps(cmsSteps);
        if (error) {
          console.warn('process_steps table fetch notice:', error.message);
          setDbConnected(false);
        } else {
          setDbConnected(true);
        }
      }
    } catch (err: any) {
      console.error('Error loading process steps:', err);
      setDbConnected(false);
      setSteps(content.process_steps?.items || defaultSteps);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHeader = async () => {
    setSaving(true);
    try {
      await updateSection('process_header', {
        badge: headerBadge,
        title: headerTitle
      });
      setSavedMsg('Header settings updated successfully!');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err: any) {
      console.error('Error saving process header:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddModal = () => {
    const nextOrder = steps.length + 1;
    const nextStepNum = nextOrder < 10 ? `0${nextOrder}` : `${nextOrder}`;
    setEditingStep({
      id: undefined,
      step: nextStepNum,
      title: '',
      desc: '',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
      ctaText: "Let's Talk",
      ctaUrl: '/contact-us',
      order_index: nextOrder,
      service_id: 'global'
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (stepItem: ProcessStep) => {
    setEditingStep({ ...stepItem });
    setIsModalOpen(true);
  };

  const handleSaveStepModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStep || !editingStep.title.trim()) return;

    setSaving(true);
    try {
      const payloadToDb = {
        step: editingStep.step || '01',
        title: editingStep.title,
        desc: editingStep.desc || editingStep.description || '',
        description: editingStep.desc || editingStep.description || '',
        image: editingStep.image || '',
        cta_text: editingStep.ctaText || editingStep.cta_text || "Let's Talk",
        cta_url: editingStep.ctaUrl || editingStep.cta_url || "/contact-us",
        order_index: editingStep.order_index || 1,
        service_id: editingStep.service_id || 'global',
        updated_at: new Date().toISOString()
      };

      let savedId = editingStep.id;

      // Try upsert in Supabase `process_steps` table
      if (editingStep.id) {
        const { error } = await supabase
          .from('process_steps')
          .update(payloadToDb)
          .eq('id', editingStep.id);
        if (error) console.warn('Supabase update warning:', error.message);
      } else {
        const { data, error } = await supabase
          .from('process_steps')
          .insert([{ ...payloadToDb, created_at: new Date().toISOString() }])
          .select();
        
        if (!error && data && data[0]) {
          savedId = data[0].id;
        } else if (error) {
          console.warn('Supabase insert warning:', error.message);
          savedId = `step-${Date.now()}`;
        }
      }

      const updatedStep: ProcessStep = {
        ...editingStep,
        id: savedId || `step-${Date.now()}`
      };

      let newStepsList: ProcessStep[] = [];
      if (editingStep.id) {
        newStepsList = steps.map(s => s.id === editingStep.id ? updatedStep : s);
      } else {
        newStepsList = [...steps, updatedStep];
      }

      // Re-sort
      newStepsList.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      setSteps(newStepsList);

      // Also sync to CMS Provider section 'process_steps'
      await updateSection('process_steps', { items: newStepsList });
      await updateSection('ourProcess', newStepsList);

      setIsModalOpen(false);
      setEditingStep(null);
      setSavedMsg('Process step saved successfully!');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err: any) {
      console.error('Error saving process step:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (id: string) => {
    if (!(await confirmAction('Delete Step', 'Are you sure you want to delete this process step?'))) return;

    setSaving(true);
    try {
      if (id && !id.startsWith('step-')) {
        const { error } = await supabase
          .from('process_steps')
          .delete()
          .eq('id', id);
        if (error) console.warn('Supabase delete warning:', error.message);
      }

      const remainingSteps = steps.filter(s => s.id !== id);
      setSteps(remainingSteps);

      await updateSection('process_steps', { items: remainingSteps });
      await updateSection('ourProcess', remainingSteps);

      setSavedMsg('Step deleted successfully');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err: any) {
      console.error('Error deleting step:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...steps];
    
    // Swap items
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Update order_index and step numbers
    reordered.forEach((s, idx) => {
      s.order_index = idx + 1;
      s.step = idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`;
    });

    setSteps(reordered);

    // Sync DB and CMS
    try {
      await updateSection('process_steps', { items: reordered });
      await updateSection('ourProcess', reordered);

      // Batch update DB
      for (const s of reordered) {
        if (s.id && !s.id.startsWith('step-')) {
          await supabase
            .from('process_steps')
            .update({ order_index: s.order_index, step: s.step })
            .eq('id', s.id);
        }
      }
    } catch (err) {
      console.error('Error updating order:', err);
    }
  };

  const handleSeedDefaultsToSupabase = async () => {
    setSaving(true);
    try {
      for (const item of defaultSteps) {
        const payload = {
          step: item.step,
          title: item.title,
          desc: item.desc,
          description: item.desc,
          image: item.image,
          cta_text: item.ctaText,
          cta_url: item.ctaUrl,
          order_index: item.order_index,
          service_id: 'global',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await supabase.from('process_steps').insert([payload]);
      }
      await fetchSteps();
      setSavedMsg('Default steps seeded to process_steps table!');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      console.error('Error seeding steps:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-[#000080]/10 text-[#000080] rounded-xl font-bold">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Our Process Management</h1>
              <p className="text-xs text-slate-500">
                Manage methodology steps rendered dynamically across all service detail pages and global workflows.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedMsg && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600" /> {savedMsg}
            </div>
          )}

          <button 
            onClick={fetchSteps}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-300 flex items-center gap-1.5 cursor-pointer"
            title="Reload from database"
>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button 
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
>
            <Plus className="w-4 h-4" /> Add Process Step
          </button>
        </div>
      </div>

      {/* Database Connection Status Notice */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <div className="flex items-center gap-2 font-bold">
              <span>Supabase Table:</span>
              <span className="font-mono bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                process_steps
              </span>
              {dbConnected === true && (
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold uppercase flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span> Live & Synced
                </span>
              )}
            </div>
            <p className="text-slate-400 mt-0.5">
              All changes are synced live to the Supabase database and rendered on the website's Service Detail View.
            </p>
          </div>
        </div>

        {steps.length === 0 && (
          <button 
            onClick={handleSeedDefaultsToSupabase}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow-sm transition-all whitespace-nowrap cursor-pointer"
          >
            Seed Standard 4 Steps to DB
          </button>
        )}
      </div>

      {/* Section Global Title Controls */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#000080]" /> Section Header Customization
          </h3>
          <button 
            onClick={handleSaveHeader}
            disabled={saving}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer">
            <Save className="w-3.5 h-3.5" /> Save Section Titles
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Badge / Eyebrow Text</label>
            <input
              type="text"
              value={headerBadge}
              onChange={(e) => setHeaderBadge(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-[#000080]"
              placeholder="e.g. How We Deliver Success"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Main Heading</label>
            <input
              type="text"
              value={headerTitle}
              onChange={(e) => setHeaderTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900"
              placeholder="e.g. Our Process"
            />
          </div>
        </div>
      </div>

      {/* Process Steps Cards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            Process Steps <span className="bg-[#000080]/10 text-[#000080] text-xs px-2.5 py-0.5 rounded-full font-black">{steps.length}</span>
          </h2>
          <span className="text-xs text-slate-500">Drag or use arrow buttons to adjust workflow order</span>
        </div>

        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-[#000080] animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-600">Loading process steps from database...</p>
          </div>
        ) : steps.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
              <Layers className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">No Process Steps Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Add your first step or seed default steps to populate the methodology section on service detail pages.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button 
                onClick={handleSeedDefaultsToSupabase}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all border border-slate-300"
              >
                Seed Default Steps
              </button>
              <button 
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                + Add Custom Step
              </button>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {steps.map((stepItem, idx) => {
              const stepNum = stepItem.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`);
              return (
                <div 
                  key={stepItem.id || idx}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group">
                  <div className="relative h-48 bg-slate-900 overflow-hidden">
                    {stepItem.image ? (
                      <img 
                        src={stepItem.image} 
                        alt={stepItem.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-900 to-[#000080]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                    <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                      <span className="w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-xl flex items-center justify-center font-black border border-white/30 text-sm shadow-sm">
                        {stepNum}
                      </span>

                      <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md rounded-xl p-1 border border-white/20">
                        <button onClick={() => handleMoveOrder(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors"
                          title="Move up" >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleMoveOrder(idx, 'down')}
                          disabled={idx === steps.length - 1}
                          className="p-1.5 text-white/80 hover:text-white disabled:opacity-30 transition-colors"
                          title="Move down" >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 z-10">
                      <h3 className="text-xl font-bold text-white leading-tight">{stepItem.title}</h3>
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {stepItem.desc || stepItem.description}
                    </p>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-[#000080] bg-[#000080]/10 px-3 py-1 rounded-lg">
                        <span>CTA:</span>
                        <span>{stepItem.ctaText || stepItem.cta_text || "Let's Talk"}</span>
                        <ArrowUpRight className="w-3 h-3 ml-0.5" />
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleOpenEditModal(stepItem)}
                          className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <ConfirmButton 
                          onConfirm={() => handleDeleteStep(stepItem.id)}
                          confirmTitle="Delete Process Step"
                          confirmMessage={`Are you sure you want to delete step ${stepItem.step}: ${stepItem.title}? This cannot be undone.`}
                          className="p-1.5 bg-red-50/50 hover:bg-red-50 text-red-500 rounded-lg border border-red-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </ConfirmButton>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Add Step Modal */}
      {isModalOpen && editingStep && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center font-black text-blue-400 border border-white/20">
                  {editingStep.step || '01'}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {editingStep.id ? 'Edit Process Step' : 'Create New Process Step'}
                  </h3>
                  <p className="text-xs text-slate-400">Configure step title, detailed description, background image, and CTA button.</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStepModal} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Step Number</label>
                  <input
                    type="text"
                    required
                    placeholder="01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-[#000080]"
                    value={editingStep.step || ''}
                    onChange={(e) => setEditingStep({ ...editingStep, step: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Step Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Discovery & Strategy"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900"
                    value={editingStep.title || ''}
                    onChange={(e) => setEditingStep({ ...editingStep, title: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Detailed Description</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain what occurs during this step in your methodology..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-[#000080]"
                  value={editingStep.desc || editingStep.description || ''}
                  onChange={(e) => setEditingStep({ ...editingStep, desc: e.target.value, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Button Text</label>
                  <input
                    type="text"
                    placeholder="Let's Talk"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold"
                    value={editingStep.ctaText || editingStep.cta_text || ''}
                    onChange={(e) => setEditingStep({ ...editingStep, ctaText: e.target.value, cta_text: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Button Link / Anchor</label>
                  <input
                    type="text"
                    placeholder="#cta"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-mono text-slate-700"
                    value={editingStep.ctaUrl || editingStep.cta_url || ''}
                    onChange={(e) => setEditingStep({ ...editingStep, ctaUrl: e.target.value, cta_url: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <ImageUploader
                  label="Card Background Image"
                  value={editingStep.image || ''}
                  onChange={(url) => setEditingStep({ ...editingStep, image: url })}
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save Process Step
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
}
