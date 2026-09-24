import React, { useState } from 'react';
import { 
  Hammer, 
  Wrench, 
  Clock, 
  Mail, 
  RefreshCw, 
  ShieldCheck, 
  Lock, 
  Globe, 
  ArrowRight, 
  CheckCircle2,
  PhoneCall
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { MaintenanceConfig } from '../types';
import { SITE_SETTINGS_DEFAULTS } from '../lib/siteSettings';
import Logo from './Logo';

interface DevelopmentModeScreenProps {
  config?: MaintenanceConfig;
  businessName?: string;
  isPreview?: boolean;
}

export default function DevelopmentModeScreen({
  config,
  businessName = 'Profox Webdesigner',
  isPreview = false,
}: DevelopmentModeScreenProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const activeConfig: MaintenanceConfig = {
    ...SITE_SETTINGS_DEFAULTS.maintenanceMode,
    ...(config || {}),
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      if (!isPreview) {
        window.location.reload();
      } else {
        setIsRefreshing(false);
      }
    }, 800);
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-[#0B0F19] to-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans selection:bg-blue-500 selection:text-white">
      {/* Decorative Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-blue-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[500px] h-[300px] bg-amber-500/10 blur-[140px] rounded-full pointer-events-none" />
      
      {/* Top Header Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo light className="h-9 sm:h-11 w-auto" />
        </div>

        <div className="flex items-center gap-3">
          {isPreview ? (
            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-xs font-bold flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Preview Simulation
            </span>
          ) : (
            <Link
              to="/admin"
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-all flex items-center gap-2 backdrop-blur-md hover:border-slate-500"
            >
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>Admin Access</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Center Stage */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl w-full mx-auto text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
          
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wide shadow-sm shadow-amber-500/5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <Hammer className="w-3.5 h-3.5 text-amber-400" />
            <span>{activeConfig.badgeText || 'Development & Maintenance Mode'}</span>
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              {activeConfig.title || "We're Currently Enhancing Our Platform"}
            </h1>
            <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto leading-relaxed font-normal">
              {activeConfig.message || "Our engineering team is actively making performance upgrades and deploying new features. The website will be temporarily unavailable to public visitors. Please check back soon."}
            </p>
          </div>

          {/* Estimated Time Card (if provided) */}
          {activeConfig.estimatedTime && (
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-800/60 border border-slate-700/80 text-slate-200 text-sm font-medium backdrop-blur-md shadow-xl">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>Status: <strong className="text-white font-semibold">{activeConfig.estimatedTime}</strong></span>
            </div>
          )}

          {/* Action Cards & Emergency Contact Box */}
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
            {/* Direct Email Action */}
            <div className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 text-left transition-all backdrop-blur-md space-y-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Need Immediate Help?</h3>
                <p className="text-xs text-slate-400 mt-0.5">Reach out directly to our team</p>
              </div>
              <a
                href={`mailto:${activeConfig.contactEmail || 'contact@profoxwebdesigner.com'}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span>{activeConfig.contactEmail || 'contact@profoxwebdesigner.com'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Check Status Action */}
            <div className="bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 text-left transition-all backdrop-blur-md space-y-3 flex flex-col justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Check Live Status</h3>
                <p className="text-xs text-slate-400 mt-0.5">Refresh to see if maintenance is done</p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-full py-2 bg-slate-700/80 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Checking...' : 'Refresh Page'}</span>
              </button>
            </div>
          </div>

          {/* Security & System Note */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-4">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>All existing client services, scheduled tasks, and inquiries remain secure and active.</span>
          </div>

        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div>
          © {new Date().getFullYear()} {businessName}. All rights reserved.
        </div>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            System Updates in Progress
          </span>
          {!isPreview && (
            <Link to="/admin" className="text-slate-400 hover:text-blue-400 transition-colors font-medium">
              Administrator Login
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}
