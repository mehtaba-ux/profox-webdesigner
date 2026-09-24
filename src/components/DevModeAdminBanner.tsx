import React, { useState } from 'react';
import { Hammer, AlertTriangle, Eye, Settings, X, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCMS } from '../lib/CMSProvider';

interface DevModeAdminBannerProps {
  onDisable?: () => void;
}

export default function DevModeAdminBanner({ onDisable }: DevModeAdminBannerProps) {
  const { content, updateSection } = useCMS();
  const [isDisabling, setIsDisabling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const maintenance = content.siteSettings?.maintenanceMode;
  if (!maintenance?.enabled || dismissed) return null;

  const handleDisableDevMode = async () => {
    setIsDisabling(true);
    try {
      const updatedSiteSettings = {
        ...(content.siteSettings || {}),
        maintenanceMode: {
          ...(maintenance || {}),
          enabled: false,
          updatedAt: new Date().toISOString(),
        },
      };
      await updateSection('siteSettings', updatedSiteSettings);
      if (onDisable) onDisable();
    } catch (err) {
      console.error('Failed to disable development mode:', err);
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <div className="sticky top-0 z-[999] bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-slate-950 px-4 py-2.5 shadow-lg border-b border-amber-400 flex flex-wrap items-center justify-between gap-3 font-sans text-xs">
      <div className="flex items-center gap-2.5 font-bold">
        <span className="p-1 bg-black/15 rounded-md text-slate-950 animate-pulse">
          <Hammer className="w-4 h-4" />
        </span>
        <span>
          <strong>🚧 DEVELOPMENT MODE IS ACTIVE:</strong> Public visitors see your custom maintenance screen. You are viewing the live site with Admin bypass.
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/admin?tab=siteSettings"
          className="px-3 py-1.5 bg-black/20 hover:bg-black/30 text-slate-950 font-extrabold rounded-lg transition-all flex items-center gap-1.5 backdrop-blur-sm"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Configure Message</span>
        </Link>
        <button
          onClick={handleDisableDevMode}
          disabled={isDisabling}
          className="px-3.5 py-1.5 bg-slate-950 hover:bg-black text-amber-300 font-black rounded-lg transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer disabled:opacity-75"
        >
          {isDisabling ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Restoring Public Site...</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Turn OFF Dev Mode (Go Live)</span>
            </>
          )}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 hover:bg-black/15 text-slate-950 rounded-lg transition-colors cursor-pointer"
          title="Dismiss notification for this session"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
