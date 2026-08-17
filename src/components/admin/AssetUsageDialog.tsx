import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, AlertTriangle, X, Trash2 } from 'lucide-react';
import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import type { MediaAsset } from '../../types';
import type { MediaAssetUsage, MediaUsageKind } from '../../lib/mediaUsage';

interface AssetUsageDialogProps {
  asset: MediaAsset | null;
  usages: MediaAssetUsage[];
  onClose: () => void;
  onForceDelete?: () => void;
}

const badgeStyles: Record<MediaUsageKind, string> = {
  Page: 'bg-blue-50 text-blue-700 border-blue-100',
  Template: 'bg-violet-50 text-violet-700 border-violet-100',
  Post: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Portfolio: 'bg-amber-50 text-amber-700 border-amber-100',
  Review: 'bg-pink-50 text-pink-700 border-pink-100',
  'CMS section': 'bg-slate-100 text-slate-700 border-slate-200',
  'Media library': 'bg-cyan-50 text-cyan-700 border-cyan-100',
};

export function AssetUsageDialog({ asset, usages, onClose, onForceDelete }: AssetUsageDialogProps) {
  return (
    <AnimatePresence>
      {asset && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-slate-950/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-usage-title"
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[82vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-start gap-4 border-b border-slate-100 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-600">Asset In Use</p>
                <h3 id="asset-usage-title" className="text-xl font-bold text-slate-950">Active references found</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  <span className="font-semibold text-slate-900">{asset.name}</span> is currently referenced in {usages.length} {usages.length === 1 ? 'location' : 'locations'}. You can still delete it now, or review the referenced places below.
                </p>
              </div>
              <button 
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close asset usage warning"
>
                <X className="h-5 w-5"  />
              </button>
            </div>

            <div className="overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
              <div className="space-y-3">
                {usages.map((usage, index) => (
                  <div key={`${usage.kind}-${usage.sourceId}-${usage.fieldPath}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${badgeStyles[usage.kind]}`}>
                        {usage.kind}
                      </span>
                      <span className="truncate text-sm font-bold text-slate-950">{usage.sourceTitle}</span>
                    </div>
                    <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />
                      <div>
                        <span className="font-semibold text-slate-800">Field: </span>{usage.fieldLabel}
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{usage.fieldPath}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-white p-4 sm:px-6">
              <button 
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              
                Cancel>
              </button>
              {onForceDelete ? (
                <button type="button"
                  onClick={() => {
                    onClose();
                    onForceDelete();
                  }}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 shadow-md shadow-red-600/20">
                  <Trash2 className="w-4 h-4" />
                  Delete Asset Anyway
                </button>
              ) : (
                <button 
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-[#000080] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#000066]"
                
                  I Understand>
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
