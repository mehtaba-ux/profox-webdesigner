import React, { useState, useEffect } from 'react';
import { Search, Image as ImageIcon, Trash2, Check, X, RefreshCw, AlertCircle, FileText, File as FileIcon, LoaderCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { findMediaAssetUsage, type MediaAssetUsage } from '../../lib/mediaUsage';
import { ConfirmDialog } from './ConfirmDialog';
import { AssetUsageDialog } from './AssetUsageDialog';
import { useConfirm } from './useConfirm';
import { MediaAsset } from '../../types';

const R2_MEDIA_API = (import.meta.env.VITE_R2_MEDIA_API_URL || 'https://media-api.profoxwebdesigner.com').replace(/\/$/, '');

interface MediaManagerProps {
  onSelect?: (url: string) => void;
  onClose?: () => void;
  selectable?: boolean;
}

export default function MediaManager({ onSelect, onClose, selectable = false }: MediaManagerProps) {
  const { confirmState, confirm: confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingAssetId, setCheckingAssetId] = useState<string | null>(null);
  const [usageWarning, setUsageWarning] = useState<{ asset: MediaAsset; usages: MediaAssetUsage[] } | null>(null);

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching media assets from Supabase...');
      const { data, error: fetchError } = await supabase
        .from('media')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      console.log(`Fetched ${data?.length || 0} assets.`);
      setAssets((data || []) as MediaAsset[]);
    } catch (err: any) {
      console.error('Error fetching media:', err);
      setError(err.message || 'Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (checkingAssetId) return;
    setCheckingAssetId(asset.id);
    try {
      const usages = await findMediaAssetUsage(asset);
      if (usages.length > 0) {
        setUsageWarning({ asset, usages });
        return;
      }

      if (!(await confirmAction(
        'Delete Unused Asset',
        `No references were found for "${asset.name}". Delete its R2 file and media-library record permanently?`,
      ))) return;

      // 1. Delete from Storage (only if it was actually uploaded to storage and is not a base64 db asset)
      if (asset.path && !asset.path.startsWith('db_base64_')) {
        const bucket = asset.type.startsWith('image/') ? 'media' : 'documents';
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('Please sign in again before deleting media.');
        const storageResponse = await fetch(`${R2_MEDIA_API}/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(asset.path)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!storageResponse.ok && storageResponse.status !== 404) {
          const details = await storageResponse.text();
          throw new Error(details || `R2 deletion failed with status ${storageResponse.status}.`);
        }
      }

      // 2. Delete from Database
      const { error: dbError } = await supabase
        .from('media')
        .delete()
        .eq('id', asset.id);
      
      if (dbError) throw dbError;

      setAssets((currentAssets) => currentAssets.filter(a => a.id !== asset.id));
      if (selectedAsset === asset.url) setSelectedAsset(null);
    } catch (err: any) {
      console.error('Error deleting media:', err);
      alert(`Deletion blocked: ${err.message || 'The asset usage check or deletion failed.'}`);
    } finally {
      setCheckingAssetId(null);
    }
  };

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#000080]" />
            Media Library
          </h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] w-64"
            />
          </div>
          <button 
            onClick={fetchAssets}
            className="p-2 text-slate-500 hover:text-[#000080] hover:bg-slate-50 rounded-lg transition-all"
            title="Refresh Library"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        )}
      </div>

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
            <p>No media found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredAssets.map((asset) => (
              <div 
                key={asset.id} 
                className={`group relative aspect-square rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                  selectedAsset === asset.url ? 'border-[#000080] ring-4 ring-[#000080]/10' : 'border-slate-100 hover:border-emerald-200'
                }`}
                onClick={() => selectable ? setSelectedAsset(asset.url) : null}
              >
                <div className="w-full h-full flex items-center justify-center bg-slate-50">
                  {asset.type.startsWith('image/') ? (
                    <img 
                      src={asset.url} 
                      alt={asset.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : asset.type.includes('pdf') ? (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <FileText className="w-8 h-8 text-red-500" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">PDF</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-4 text-center">
                      <FileIcon className="w-8 h-8 text-[#000080]" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">{asset.name.split('.').pop() || 'FILE'}</span>
                    </div>
                  )}
                </div>
                
                {/* Selection Overlay */}
                {selectedAsset === asset.url && (
                  <div className="absolute inset-0 bg-[#000080]/20 flex items-center justify-center">
                    <div className="bg-[#000080] text-white p-1 rounded-full shadow-lg">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                )}

                {/* Actions Overlay */}
                {!selectable && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset); }}
                      disabled={checkingAssetId !== null}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-lg disabled:cursor-wait disabled:opacity-70"
                      title="Check usage before deleting"
                    >
                      {checkingAssetId === asset.id ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                  <p className="text-[10px] text-slate-900 truncate font-medium">{asset.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectable && (
        <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => selectedAsset && onSelect?.(selectedAsset)}
            disabled={!selectedAsset}
            className="px-6 py-2 bg-[#000080] text-white rounded-lg text-sm font-bold shadow-lg shadow-[#000080]/20 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Select Asset
          </button>
        </div>
      )}
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <AssetUsageDialog
        asset={usageWarning?.asset || null}
        usages={usageWarning?.usages || []}
        onClose={() => setUsageWarning(null)}
      />
    </div>
  );
}
