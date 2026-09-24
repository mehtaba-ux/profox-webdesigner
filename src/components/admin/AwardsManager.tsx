import React, { useState } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Save,
  Trophy,
  Monitor,
  Layout,
  CheckCircle,
  HelpCircle,
  Loader2,
  Undo,
} from 'lucide-react';
import ImageUploader from './ImageUploader';

export default function AwardsManager() {
  const { content, updateSection } = useCMS();
  
  // Load global awards or growth section awards as fallback, or default list
  const initialAwards = content.globalAwards || content.growth?.awards || [
    { name: 'CLUTCH 2024', subtext: 'TOP DEVELOPER', type: 'CLUTCH', show: true },
    { name: 'DESIGNRUSH', subtext: '', type: 'TEXT', show: true },
    { name: 'BestDesign', subtext: '', type: 'BORDERED', show: true }
  ];

  const [awards, setAwards] = useState<any[]>(initialAwards);
  const [enabled, setEnabled] = useState(content.globalAwardsEnabled !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Sync state with CMS if content changes externally
  React.useEffect(() => {
    if (content.globalAwards) {
      setAwards(content.globalAwards);
    } else if (content.growth?.awards) {
      setAwards(content.growth.awards);
    }
    if (content.globalAwardsEnabled !== undefined) {
      setEnabled(content.globalAwardsEnabled);
    }
  }, [content.globalAwards, content.growth?.awards, content.globalAwardsEnabled]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save globally
      await updateSection('globalAwards', awards);
      await updateSection('globalAwardsEnabled', enabled);
      
      // Also update growth section for backward compatibility
      const currentGrowth = content.growth || {};
      await updateSection('growth', {
        ...currentGrowth,
        awards: awards,
        awardsEnabled: enabled
      });

      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving global awards:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateAward = (index: number, field: string, value: any) => {
    const next = [...awards];
    next[index] = { ...next[index], [field]: value };
    setAwards(next);
  };

  const addAward = () => {
    setAwards([
      ...awards,
      { name: 'New Award', subtext: 'Recognized Partner', type: 'BORDERED', show: true }
    ]);
  };

  const removeAward = (index: number) => {
    const next = awards.filter((_, i) => i !== index);
    setAwards(next);
  };

  const toggleShow = (index: number) => {
    updateAward(index, 'show', awards[index].show === false ? true : false);
  };

  const resetToDefault = () => {
    if (window.confirm('Are you sure you want to reset awards to default? Your current changes will be overwritten.')) {
      setAwards([
        { name: 'CLUTCH 2024', subtext: 'TOP DEVELOPER', type: 'CLUTCH', show: true },
        { name: 'DESIGNRUSH', subtext: '', type: 'TEXT', show: true },
        { name: 'BestDesign', subtext: '', type: 'BORDERED', show: true }
      ]);
    }
  };

  // Preview helper
  const renderAwardPreview = (award: any, idx: number) => {
    if (award.image) {
      return (
        <div key={idx} className="flex flex-col items-center gap-1">
          <img src={award.image} alt={award.name} className="h-8 max-w-[120px] object-contain opacity-90" referrerPolicy="no-referrer" />
          {award.subtext && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{award.subtext}</span>}
        </div>
      );
    }

    if (award.type === 'CLUTCH') {
      return (
        <div key={idx} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 border border-slate-500 rounded-full flex items-center justify-center text-[8px] font-black text-center p-1.5 leading-none">
            {award.name}
          </div>
          {award.subtext && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{award.subtext}</span>}
        </div>
      );
    }

    if (award.type === 'TEXT') {
      return (
        <div key={idx} className="flex flex-col items-center">
          <div className="text-lg font-black italic tracking-tighter uppercase">
            {award.name}
          </div>
          {award.subtext && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{award.subtext}</span>}
        </div>
      );
    }

    return (
      <div key={idx} className="flex flex-col items-center">
        <div className="text-sm font-bold tracking-widest border-y border-slate-700 py-1 px-2 uppercase">
          {award.name}
        </div>
        {award.subtext && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">{award.subtext}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#000080]/10 text-[#000080] rounded-xl">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Global Awards & Recognition</h1>
            <p className="text-sm font-medium text-slate-500">Sole source of truth for awards displayed across the entire website</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          <button
            type="button"
            onClick={resetToDefault}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
            title="Reset to original template awards"
          >
            <Undo className="w-4 h-4" /> Reset
          </button>

          <button
            type="button"
            onClick={addAward}
            className="px-4 py-2 text-xs font-bold text-white bg-[#000080] rounded-xl hover:bg-[#000066] transition-all flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Award
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer ${
              showSaved 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </>
            ) : showSaved ? (
              <>
                <CheckCircle className="w-4 h-4" /> Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Toggle Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-800">Toggle Awards Section Visibility</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Choose whether to show or hide the Awards & Recognition section across the entire live website (Homepage, About Us page, and Service details pages).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs font-bold ${enabled ? 'text-[#000080]' : 'text-slate-400'}`}>
            {enabled ? 'Visible on Website' : 'Hidden from Website'}
          </span>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
              enabled ? 'bg-[#000080]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Real-time Website Preview Strip */}
      <div className={`rounded-2xl p-8 border shadow-lg relative overflow-hidden transition-all ${
        enabled 
          ? 'bg-slate-900 text-white border-slate-800' 
          : 'bg-slate-950 text-slate-400 border-slate-900 opacity-60'
      }`}>
        <div className="absolute top-2 right-3 flex items-center gap-1.5 text-[10px] font-extrabold text-slate-500 tracking-widest uppercase select-none">
          <Layout className="w-3.5 h-3.5 text-slate-500" /> Website Live Preview
          {!enabled && <span className="ml-2 text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded text-[8px] font-black">DISABLED</span>}
        </div>
        
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 pt-2">
          <div className="text-center md:text-left">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.25em] mb-1">Awards & Recognition</p>
            <h3 className={`text-lg font-bold tracking-tight ${enabled ? 'text-white' : 'text-slate-500 line-through'}`}>
              Trusted Industry Presence
            </h3>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-10 md:gap-14">
            {!enabled ? (
              <span className="text-xs font-bold text-rose-400/80 italic">Entire Awards Section is currently HIDDEN from the live website</span>
            ) : awards.filter(a => a.show !== false).length > 0 ? (
              awards.filter(a => a.show !== false).map((award, idx) => renderAwardPreview(award, idx))
            ) : (
              <span className="text-xs font-medium text-slate-500 italic">No visible awards enabled. Toggle show/hide to preview.</span>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Awards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {awards.map((award, idx) => {
          const isShown = award.show !== false;

          return (
            <div 
              key={idx} 
              className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 relative transition-all duration-200 ${
                isShown 
                  ? 'border-slate-200 hover:border-slate-300' 
                  : 'border-amber-100 bg-amber-50/10 opacity-75'
              }`}
            >
              {/* Top controls: visibility toggle and delete button */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => toggleShow(idx)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isShown 
                      ? 'bg-green-50 text-green-700 hover:bg-green-100' 
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                  title={isShown ? "Click to hide award from website" : "Click to show award on website"}
                >
                  {isShown ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-green-600" /> Shown
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-700" /> Hidden
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => removeAward(idx)}
                  className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  title="Delete award completely"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Edit Form */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Award / Brand Name</label>
                  <input
                    type="text"
                    value={award.name || ''}
                    onChange={(e) => updateAward(idx, 'name', e.target.value)}
                    placeholder="e.g. Clutch, DesignRush"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:border-[#000080] rounded-xl p-2.5 text-xs font-bold text-slate-800 transition-colors focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Subtext / Category (Optional)</label>
                  <input
                    type="text"
                    value={award.subtext || ''}
                    onChange={(e) => updateAward(idx, 'subtext', e.target.value)}
                    placeholder="e.g. Top Developer, Leader 2024"
                    className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 focus:border-[#000080] rounded-xl p-2.5 text-xs font-medium text-slate-700 transition-colors focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Render Style Style</label>
                  <select
                    value={award.type || 'BORDERED'}
                    onChange={(e) => updateAward(idx, 'type', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#000080] rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="BORDERED">Bordered Tag (Elegant)</option>
                    <option value="CLUTCH">Clutch Badge (Circular)</option>
                    <option value="TEXT">Large Italic Text (Bold)</option>
                  </select>
                </div>

                {/* Optional logo image uploader */}
                <div className="pt-2 border-t border-slate-100">
                  <ImageUploader
                    value={award.image || ''}
                    onChange={(url) => updateAward(idx, 'image', url)}
                    label="Award Badge Image / Logo (Optional)"
                    helpText="Provide a transparent PNG to render as a logo instead of styled text."
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state or Add New card */}
        <button
          type="button"
          onClick={addAward}
          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-[#000080] rounded-2xl p-8 text-slate-400 hover:text-[#000080] transition-colors bg-white hover:bg-slate-50 cursor-pointer min-h-[280px]"
        >
          <Trophy className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm font-bold">Add New Award Card</span>
          <span className="text-xs text-slate-400 mt-1">Configure style, logo, and visibility</span>
        </button>
      </div>
    </div>
  );
}
