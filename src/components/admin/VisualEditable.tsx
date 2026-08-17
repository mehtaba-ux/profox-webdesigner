import React, { useState } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { Edit3, Check, X, Image as ImageIcon, Sparkles } from 'lucide-react';
import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import ImageUploader from './ImageUploader';

interface VisualEditableProps {
  section: string;
  field: string;
  value: string;
  label?: string;
  type?: 'text' | 'textarea' | 'image' | 'url';
  children: React.ReactNode;
  isLiveEditing?: boolean;
}

export default function VisualEditable({
  section,
  field,
  value,
  label,
  type = 'text',
  children,
  isLiveEditing = false,
}: VisualEditableProps) {
  const { content, updateSection } = useCMS();
  const [isOpen, setIsOpen] = useState(false);
  const [currentVal, setCurrentVal] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  if (!isLiveEditing) {
    return <>{children}</>;
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const existingSection = content[section] || {};
      await updateSection(section, {
        ...existingSection,
        [field]: currentVal,
      });
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to save field', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative group/editable inline-block w-full cursor-pointer">
      {/* Visual Hover Ring */}
      <div 
        onClick={() => {
          setCurrentVal(value);
          setIsOpen(true);
        }}
        className="relative border-2 border-dashed border-[#000080]/0 group-hover/editable:border-[#000080]/80 rounded-lg transition-all duration-200 group-hover/editable:bg-[#000080]/5 group-hover/editable:shadow-lg p-1">
        {children}

        {/* Floating 1-Click Pencil Trigger Badge */}
        <div className="absolute -top-3 -right-3 z-30 opacity-0 group-hover/editable:opacity-100 transition-opacity bg-[#000080] text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-xl flex items-center gap-1 pointer-events-none scale-90 group-hover/editable:scale-100 transition-transform">
          <Edit3 className="w-3 h-3" />
          <span>Edit {label || field}</span>
        </div>
      </div>

      {/* Quick 1-Click Inline Modal */}
      {isOpen && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="fixed inset-0 z-[100] bg-slate-50/70 backdrop-blur-md flex items-center justify-center p-4 text-slate-900">
          <div className="bg-white border border-slate-300 text-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#000080]/20 text-[#000080] flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-lg text-slate-900">
                  Edit {label || field}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                {label || `${section}.${field}`}
              </label>

              {type === 'textarea' ? (
                <textarea
                  rows={4}
                  value={currentVal}
                  onChange={(e) => setCurrentVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] transition-colors"
                  placeholder="Enter text..."
                />
              ) : type === 'image' ? (
                <div className="space-y-3">
                  <ImageUploader
                    value={currentVal}
                    onChange={(url) => setCurrentVal(url)}
                    label={label || field}
                    placeholder="Upload or enter image URL..."
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={currentVal}
                  onChange={(e) => setCurrentVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                  placeholder="Enter value..."
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-[#000080] hover:bg-[#000066] text-white font-bold px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-lg">
                {isSaving ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Save 1-Click
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
