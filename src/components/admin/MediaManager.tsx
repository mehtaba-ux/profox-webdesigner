import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Image as ImageIcon, Trash2, Check, X, RefreshCw, AlertCircle, 
  FileText, File as FileIcon, LoaderCircle, Upload, CheckSquare, Square, 
  Copy, ExternalLink, Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { findMediaAssetUsage, type MediaAssetUsage } from '../../lib/mediaUsage';
import { ConfirmDialog } from './ConfirmDialog';
import { AssetUsageDialog } from './AssetUsageDialog';
import { useConfirm } from './useConfirm';
import { MediaAsset } from '../../types';
import { getStoredMediaAssets, deleteMediaAsset, deleteMediaAssets } from '../../lib/mediaStore';
import { uploadOptimizedFile } from '../../lib/optimizedUpload';

const R2_MEDIA_API_BASE = (import.meta.env.VITE_R2_MEDIA_API_URL || '').replace(/\/$/, '');

interface MediaManagerProps {
  onSelect?: (url: string) => void;
  onClose?: () => void;
  selectable?: boolean;
}

export default function MediaManager({ onSelect, onClose, selectable = false }: MediaManagerProps) {
  const { confirmState, confirm: confirmAction, handleConfirm, handleCancel } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'document'>('all');
  
  // Single selection (for picker mode)
  const [selectedAssetUrl, setSelectedAssetUrl] = useState<string | null>(null);
  
  // Multi-selection (for bulk deletion & management)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [checkingAssetId, setCheckingAssetId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  // Dialog state for assets in use
  const [usageWarning, setUsageWarning] = useState<{ asset: MediaAsset; usages: MediaAssetUsage[] } | null>(null);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStoredMediaAssets();
      setAssets(data);
    } catch (err: any) {
      console.error('Error fetching media:', err);
      setError(err.message || 'Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  const handleMultipleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const total = files.length;
    let successfulUploads = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${i + 1} of ${total}: ${file.name}`);
        try {
          const result = await uploadOptimizedFile(file);
          successfulUploads++;
          if (selectable && total === 1) {
            setSelectedAssetUrl(result.url);
          }
        } catch (fileErr: any) {
          console.error(`Failed to upload ${file.name}:`, fileErr);
        }
      }
      await fetchAssets();
    } catch (err: any) {
      console.error('Upload batch error:', err);
      alert(`Upload encountered an error: ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Directly executes deletion of an asset across R2, local storage, and Supabase
   */
  const executeSingleDelete = async (asset: MediaAsset) => {
    try {
      // 1. Delete from R2 Storage if applicable
      if (asset.path && !asset.path.startsWith('db_base64_') && !asset.path.startsWith('stock/')) {
        try {
          const bucket = asset.type.startsWith('image/') ? 'media' : 'documents';
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (accessToken) {
            const apiBase = R2_MEDIA_API_BASE || window.location.origin;
            await fetch(`${apiBase.replace(/\/$/, '')}/api/r2-media/${encodeURIComponent(asset.path)}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
        } catch (storageErr) {
          console.warn('Storage bucket deletion skipped:', storageErr);
        }
      }

      // 2. Delete from Media Store
      await deleteMediaAsset(asset.id);

      setAssets((currentAssets) => currentAssets.filter((a) => a.id !== asset.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
      if (selectedAssetUrl === asset.url) setSelectedAssetUrl(null);
    } catch (err: any) {
      console.error('Error deleting media:', err);
      alert(`Deletion failed: ${err.message || 'The deletion could not be completed.'}`);
    }
  };

  /**
   * User clicks single delete button on a card
   */
  const handleDeleteClick = async (asset: MediaAsset) => {
    if (checkingAssetId) return;
    setCheckingAssetId(asset.id);
    try {
      const usages = await findMediaAssetUsage(asset);
      if (usages.length > 0) {
        // Show usage warning dialog with option to delete anyway
        setUsageWarning({ asset, usages });
        return;
      }

      // If no usages found, prompt normal confirmation
      if (
        await confirmAction(
          'Delete Asset',
          `Are you sure you want to delete "${asset.name}" permanently from your media library?`
        )
      ) {
        await executeSingleDelete(asset);
      }
    } catch (err: any) {
      console.error('Usage check error:', err);
      // If check fails, still allow deletion with confirmation
      if (
        await confirmAction(
          'Delete Asset',
          `Could not verify active usages. Delete "${asset.name}" permanently anyway?`
        )
      ) {
        await executeSingleDelete(asset);
      }
    } finally {
      setCheckingAssetId(null);
    }
  };

  /**
   * Handles multi-selection toggle
   */
  const toggleSelectAsset = (assetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  /**
   * Select All currently filtered assets
   */
  const handleSelectAll = () => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAssets.map((a) => a.id)));
    }
  };

  /**
   * Executes bulk deletion of all selected items
   */
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || isBulkDeleting) return;

    const count = selectedIds.size;
    const confirmed = await confirmAction(
      `Delete ${count} Selected ${count === 1 ? 'Item' : 'Items'}`,
      `Are you sure you want to permanently delete these ${count} items from your media library and storage? This action cannot be undone.`
    );

    if (!confirmed) return;

    setIsBulkDeleting(true);
    const idsToDelete: string[] = Array.from(selectedIds);
    const assetsToDelete = assets.filter((a) => selectedIds.has(a.id));

    try {
      // 1. Delete from R2 storage in parallel
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (accessToken) {
        const apiBase = R2_MEDIA_API_BASE || window.location.origin;
        await Promise.allSettled(
          assetsToDelete.map(async (asset) => {
            if (asset.path && !asset.path.startsWith('db_base64_') && !asset.path.startsWith('stock/')) {
              return fetch(
                `${apiBase.replace(/\/$/, '')}/api/r2-media/${encodeURIComponent(asset.path)}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${accessToken}` },
                }
              );
            }
          })
        );
      }

      // 2. Delete from media store (local storage and Supabase)
      await deleteMediaAssets(idsToDelete);

      // 3. Update component state
      setAssets((prev) => prev.filter((a) => !selectedIds.has(a.id)));
      setSelectedIds(new Set());
      if (selectedAssetUrl && assetsToDelete.some((a) => a.url === selectedAssetUrl)) {
        setSelectedAssetUrl(null);
      }
    } catch (err: any) {
      console.error('Bulk deletion error:', err);
      alert(`Bulk deletion encountered an issue: ${err.message || 'Unknown error'}`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const copyToClipboard = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterType === 'image') return asset.type.startsWith('image/');
    if (filterType === 'document') return !asset.type.startsWith('image/');
    return true;
  });

  const allSelected = filteredAssets.length > 0 && selectedIds.size === filteredAssets.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="flex flex-col h-full bg-white text-slate-900">
      {/* Top Header & Search Bar */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#000080]" />
            Media Library
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
              {assets.length}
            </span>
          </h2>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] w-40 sm:w-56"
            />
          </div>

          {/* Filter Pills */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType('image')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'image' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Images
            </button>
            <button
              type="button"
              onClick={() => setFilterType('document')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filterType === 'document' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Docs
            </button>
          </div>

          <button
            onClick={fetchAssets}
            className="p-1.5 text-slate-500 hover:text-[#000080] hover:bg-slate-200/60 rounded-lg transition-all"
            title="Refresh Library"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleMultipleUpload}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3.5 py-1.5 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{uploading ? uploadProgress || 'Uploading...' : 'Upload Files'}</span>
          </button>

          {onClose && (
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar (Always visible when items are selected or available) */}
      {filteredAssets.length > 0 && (
        <div className="px-6 py-2.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-[#000080] transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-[#000080]" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{allSelected ? 'Deselect All' : `Select All (${filteredAssets.length})`}</span>
            </button>

            {someSelected && (
              <span className="bg-[#000080]/10 text-[#000080] font-bold px-2.5 py-0.5 rounded-full border border-[#000080]/20">
                {selectedIds.size} selected
              </span>
            )}
          </div>

          {someSelected && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Clear Selection
              </button>

              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-sm transition-all disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Media Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#000080]"></div>
            <p className="text-sm text-slate-500 font-medium">Loading assets...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-red-500 gap-4">
            <AlertCircle className="w-12 h-12 opacity-50" />
            <div className="text-center">
              <p className="font-bold">Error Loading Library</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
            <button
              onClick={fetchAssets}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-sm font-bold transition-all"
            >
              Try Again
            </button>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium text-sm">No media files found</p>
            <p className="text-xs text-slate-400 mt-1">Upload images or documents to populate your library.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAssets.map((asset) => {
              const isMultiSelected = selectedIds.has(asset.id);
              const isPickerSelected = selectedAssetUrl === asset.url;

              return (
                <div
                  key={asset.id}
                  className={`group relative aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                    isMultiSelected
                      ? 'border-[#000080] ring-4 ring-[#000080]/15 shadow-md'
                      : isPickerSelected
                      ? 'border-emerald-600 ring-4 ring-emerald-600/15 shadow-md'
                      : 'border-slate-200 hover:border-[#000080]/50 hover:shadow-sm'
                  }`}
                  onClick={() => {
                    if (selectable) {
                      setSelectedAssetUrl(asset.url);
                    } else {
                      toggleSelectAsset(asset.id);
                    }
                  }}
                >
                  {/* Thumbnail Display */}
                  <div className="w-full h-full flex items-center justify-center bg-slate-100">
                    {asset.type.startsWith('image/') ? (
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=600';
                        }}
                      />
                    ) : asset.type.includes('pdf') ? (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <FileText className="w-8 h-8 text-red-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">PDF</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 p-4 text-center">
                        <FileIcon className="w-8 h-8 text-[#000080]" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {asset.name.split('.').pop() || 'FILE'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Multi-Select Checkbox in top-left */}
                  <button
                    type="button"
                    onClick={(e) => toggleSelectAsset(asset.id, e)}
                    className={`absolute top-2 left-2 z-10 p-1 rounded-md transition-all ${
                      isMultiSelected
                        ? 'bg-[#000080] text-white opacity-100 shadow-md'
                        : 'bg-white/80 backdrop-blur-sm text-slate-600 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-[#000080]'
                    }`}
                    title={isMultiSelected ? 'Deselect' : 'Select'}
                  >
                    {isMultiSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  {/* Picker mode active check badge */}
                  {selectable && isPickerSelected && (
                    <div className="absolute top-2 right-2 z-10 bg-emerald-600 text-white p-1 rounded-full shadow-lg">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Action Bar Overlay on Hover */}
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-5">
                    <button
                      type="button"
                      onClick={(e) => copyToClipboard(asset.url, e)}
                      className="p-2 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-all shadow-md"
                      title="Copy URL"
                    >
                      {copiedUrl === asset.url ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>

                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 bg-white/90 hover:bg-white text-slate-800 rounded-lg transition-all shadow-md"
                      title="Open full size"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(asset);
                      }}
                      disabled={checkingAssetId !== null}
                      className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-md disabled:cursor-wait disabled:opacity-70"
                      title="Delete asset"
                    >
                      {checkingAssetId === asset.id ? (
                        <LoaderCircle className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Title Bar at Bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent pointer-events-none">
                    <p className="text-[10px] text-white truncate font-medium">{asset.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selectable Modal Footer */}
      {selectable && (
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 truncate">
            {selectedAssetUrl ? (
              <span className="font-mono text-slate-700 truncate block max-w-md">{selectedAssetUrl}</span>
            ) : (
              'Click an asset above to select it'
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => selectedAssetUrl && onSelect?.(selectedAssetUrl)}
              disabled={!selectedAssetUrl}
              className="px-6 py-2 bg-[#000080] text-white rounded-lg text-sm font-bold shadow-lg shadow-[#000080]/20 hover:bg-[#000066] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Select Asset
            </button>
          </div>
        </div>
      )}

      {/* General Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* Asset In Use / Force Delete Dialog */}
      <AssetUsageDialog
        asset={usageWarning?.asset || null}
        usages={usageWarning?.usages || []}
        onClose={() => setUsageWarning(null)}
        onForceDelete={() => {
          if (usageWarning?.asset) {
            executeSingleDelete(usageWarning.asset);
            setUsageWarning(null);
          }
        }}
      />
    </div>
  );
}
