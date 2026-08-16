import React, { useRef, useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Link as LinkIcon, X, Database, File as FileIcon } from 'lucide-react';
import MediaManager from './MediaManager';
import { uploadOptimizedFile } from '../../lib/optimizedUpload';

interface ImageUploaderProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  helpText?: string;
}

const PRESET_IMAGES = [
  { name: 'Corporate Office', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200' },
  { name: 'Digital Strategy', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200' },
  { name: 'Team Collaboration', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200' },
  { name: 'Modern Tech Stack', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200' },
  { name: 'Abstract Emerald Wave', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=1200' },
  { name: 'Data Visualization', url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200' },
];

export default function ImageUploader({
  value = '',
  onChange,
  label = 'Image',
  placeholder = 'https://images.unsplash.com/... or upload a local file',
  helpText
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<'upload' | 'url' | 'presets' | 'database'>('upload');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    let localPreviewUrl = '';

    try {
      const isImage = file.type.startsWith('image/');
      
      // 1. Show local preview if it's an image
      if (isImage) {
        localPreviewUrl = URL.createObjectURL(file);
        onChange(localPreviewUrl);
      }

      const result = await uploadOptimizedFile(file);
      onChange(result.url);
      
    } catch (err: any) {
      console.error('Detailed upload error:', err);
      const errorMessage = err.message || 'Unknown error occurred during upload';
      alert(`Upload failed: ${errorMessage}`);
      
      // Reset if failed
      if (localPreviewUrl) {
        onChange('');
      }
    } finally {
      setUploading(false);
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700">{label}</label>
          <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-200 text-[10px]">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === 'upload' ? 'bg-[#000080] text-white font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setMode('database')}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === 'database' ? 'bg-[#000080] text-white font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === 'url' ? 'bg-[#000080] text-white font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              URL
            </button>
            <button
              type="button"
              onClick={() => { setMode('presets'); setShowPresets(!showPresets); }}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                mode === 'presets' ? 'bg-[#000080] text-white font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Stock
            </button>
          </div>
        </div>
      )}

      {/* Upload File Mode */}
      {mode === 'upload' && (
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex-1 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 hover:border-[#000080] text-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 group"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-[#000066] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-[#000080] group-hover:scale-110 transition-transform" />
            )}
            <span>{uploading ? 'Processing File...' : value ? 'Change File' : 'Click to Upload File'}</span>
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors"
              title="Remove Image"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Database Mode */}
      {mode === 'database' && (
        <button
          type="button"
          onClick={() => setShowMediaLibrary(true)}
          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 hover:border-[#000080] text-slate-700 rounded-xl py-2.5 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 group"
        >
          <Database className="w-4 h-4 text-[#000080]" />
          <span>Open Media Library</span>
        </button>
      )}

      {/* URL Input Mode */}
      {mode === 'url' && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#000080] font-mono"
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Presets Grid */}
      {(mode === 'presets' || showPresets) && (
        <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 mt-2">
          {PRESET_IMAGES.map((preset, pIdx) => (
            <button
              key={pIdx}
              type="button"
              onClick={() => {
                onChange(preset.url);
                setShowPresets(false);
              }}
              className="relative group rounded-lg overflow-hidden h-16 border border-slate-200 hover:border-[#000066] transition-all text-left"
            >
              <img src={preset.url} alt={preset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent flex items-end p-1">
                <span className="text-[9px] font-bold text-slate-900 truncate">{preset.name}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Preview Thumbnail */}
      {value && (
        <div className="relative group rounded-xl overflow-hidden border border-slate-200 h-28 bg-slate-50 mt-2">
          {value.match(/\.(jpg|jpeg|png|gif|webp|svg|blob)/i) || value.startsWith('blob:') || value.startsWith('data:image') ? (
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white gap-2">
              <FileIcon className="w-8 h-8 text-[#000080]" />
              <span className="text-[10px] text-slate-500 font-mono truncate px-4 w-full text-center">
                {value.split('/').pop()?.split('?')[0] || 'Selected File'}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-slate-50/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="bg-white text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 flex items-center gap-1"
            >
              <ImageIcon className="w-3 h-3 text-[#000080]" /> View/Download
            </a>
            <button
              type="button"
              onClick={() => onChange('')}
              className="bg-red-600 text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-lg hover:bg-red-500 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
          <div className="absolute bottom-1 right-2 bg-white/80 backdrop-blur text-[9px] text-[#000080] px-1.5 py-0.5 rounded border border-slate-300 font-mono">
            {value.startsWith('blob:') ? 'Local Preview' : value.startsWith('data:') ? 'Base64 Upload' : 'Stored Asset'}
          </div>
        </div>
      )}

      {helpText && <p className="text-[11px] text-slate-500">{helpText}</p>}

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
          <div className="w-full max-w-6xl h-full max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
            <MediaManager 
              selectable 
              onSelect={(url) => {
                onChange(url);
                setShowMediaLibrary(false);
              }}
              onClose={() => setShowMediaLibrary(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
