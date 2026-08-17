import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState, useEffect } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { SiteSettings, MaintenanceConfig } from '../../types';
import { SITE_SETTINGS_DEFAULTS } from '../../lib/siteSettings';
import DevelopmentModeScreen from '../DevelopmentModeScreen';
import { 
  Building2, 
  Globe, 
  Mail, 
  Phone, 
  ShieldCheck, 
  MapPin, 
  Home,
  Save,
  Check,
  Loader2,
  Clock,
  Hammer,
  AlertTriangle,
  Eye,
  X,
  Sparkles,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

export default function SiteSettingsManager() {
  const { content, updateSection } = useCMS();
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const defaultSettings: SiteSettings = {
    ...SITE_SETTINGS_DEFAULTS,
    lastUpdated: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  };

  const [settings, setSettings] = useState<SiteSettings>(() => {
    const raw = content.siteSettings || defaultSettings;
    return {
      ...defaultSettings,
      ...raw,
      maintenanceMode: {
        ...defaultSettings.maintenanceMode,
        ...(raw.maintenanceMode || {}),
      }
    };
  });

  useEffect(() => {
    if (content.siteSettings) {
      setSettings({
        ...defaultSettings,
        ...content.siteSettings,
        maintenanceMode: {
          ...defaultSettings.maintenanceMode,
          ...(content.siteSettings.maintenanceMode || {}),
        }
      });
    }
  }, [content.siteSettings]);

  const handleSave = async (overrideSettings?: SiteSettings) => {
    setIsSaving(true);
    try {
      const targetSettings = overrideSettings || settings;
      const updatedSettings: SiteSettings = {
        ...targetSettings,
        lastUpdated: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        maintenanceMode: {
          ...defaultSettings.maintenanceMode,
          ...(targetSettings.maintenanceMode || {}),
          updatedAt: new Date().toISOString(),
        }
      };
      await updateSection('siteSettings', updatedSettings);
      setSettings(updatedSettings);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
    } catch (error) {
      console.error('Error saving site settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof SiteSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleMaintenanceChange = (field: keyof MaintenanceConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      maintenanceMode: {
        ...defaultSettings.maintenanceMode,
        ...(prev.maintenanceMode || {}),
        [field]: value,
      }
    }));
  };

  const toggleDevelopmentMode = async () => {
    const nextState = !settings.maintenanceMode?.enabled;
    const updated: SiteSettings = {
      ...settings,
      maintenanceMode: {
        ...defaultSettings.maintenanceMode,
        ...(settings.maintenanceMode || {}),
        enabled: nextState,
      }
    };
    setSettings(updated);
    await handleSave(updated);
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 transition-all";
  const labelClass = "block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider flex items-center gap-2";

  const isDevModeActive = Boolean(settings.maintenanceMode?.enabled);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Globe className="w-8 h-8 text-[#000080]" />
            Site Settings & Development Mode
          </h2>
          <p className="text-slate-500 text-sm mt-1">Manage global business identity and toggle maintenance mode with custom announcements.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <ConfirmButton
            onClick={() => setShowPreviewModal(true)}
            className="px-4 py-3 rounded-xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            title="Preview Development Mode as seen by public visitors"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span>Preview Dev Screen</span>
          </ConfirmButton>

          <ConfirmButton
            onClick={() => handleSave()}
            disabled={isSaving}
            className={`px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all min-w-[160px] justify-center ${
              showSaved 
                ? 'bg-green-500 text-white shadow-green-200 scale-105' 
                : 'bg-[#000080] hover:bg-[#000066] text-white hover:scale-105 active:scale-95'
            } ${isSaving ? 'opacity-80 cursor-not-allowed' : ''}`}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : showSaved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Saving...' : showSaved ? 'Saved!' : 'Save Settings'}
          </ConfirmButton>
        </div>
      </div>

      {/* PROMINENT DEVELOPMENT & MAINTENANCE MODE CARD */}
      <div className={`rounded-2xl border-2 transition-all p-6 sm:p-8 shadow-sm ${
        isDevModeActive 
          ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-orange-500/10 border-amber-500/60 ring-4 ring-amber-500/10' 
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div className="flex items-start gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              isDevModeActive 
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 animate-pulse' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              <Hammer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-black text-slate-900">
                  Website Development Mode
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                  isDevModeActive
                    ? 'bg-amber-500 text-slate-950 animate-pulse shadow-sm'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {isDevModeActive ? 'Active (Public Restricted)' : 'Live to Public'}
                </span>
              </div>
              <p className="text-slate-500 text-xs mt-1 max-w-xl">
                Push your website to development mode whenever you are making updates. Public visitors will see your custom announcement, while logged-in Admins bypass it to inspect and edit the live site.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ConfirmButton
              onClick={toggleDevelopmentMode}
              disabled={isSaving}
              className={`px-5 py-3 rounded-xl font-bold text-xs flex items-center gap-2.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                isDevModeActive
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {isDevModeActive ? (
                <>
                  <ToggleRight className="w-5 h-5 text-slate-950" />
                  <span>Dev Mode is ON (Turn OFF)</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-5 h-5 text-slate-400" />
                  <span>Push to Dev Mode</span>
                </>
              )}
            </ConfirmButton>
          </div>
        </div>

        {/* Development Mode Customization Inputs */}
        <div className="pt-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>
                <Hammer className="w-3.5 h-3.5 text-amber-500" /> Particular Headline / Title
              </label>
              <input
                type="text"
                value={settings.maintenanceMode?.title || ''}
                onChange={(e) => handleMaintenanceChange('title', e.target.value)}
                placeholder="e.g. We're Currently Enhancing Our Platform"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1">Main title displayed to visitors on the maintenance screen.</p>
            </div>

            <div>
              <label className={labelClass}>
                <Clock className="w-3.5 h-3.5 text-blue-500" /> Expected Return Time or Status
              </label>
              <input
                type="text"
                value={settings.maintenanceMode?.estimatedTime || ''}
                onChange={(e) => handleMaintenanceChange('estimatedTime', e.target.value)}
                placeholder="e.g. Expected back online: Today at 5:00 PM EST"
                className={inputClass}
              />
              <p className="text-[11px] text-slate-400 mt-1">Informs visitors about when the site will be fully accessible again.</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              <Mail className="w-3.5 h-3.5 text-emerald-500" /> Particular Announcement Message
            </label>
            <textarea
              rows={3}
              value={settings.maintenanceMode?.message || ''}
              onChange={(e) => handleMaintenanceChange('message', e.target.value)}
              placeholder="Write the specific message or update you want your visitors and clients to see while development is ongoing..."
              className={`${inputClass} resize-y min-h-[90px]`}
            />
            <p className="text-[11px] text-slate-400 mt-1">This specific message is rendered on the public screen.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
            <div>
              <label className={labelClass}>
                <Mail className="w-3.5 h-3.5 text-purple-500" /> Emergency / Direct Support Email
              </label>
              <input
                type="email"
                value={settings.maintenanceMode?.contactEmail || ''}
                onChange={(e) => handleMaintenanceChange('contactEmail', e.target.value)}
                placeholder="contact@profoxwebdesigner.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Badge Label
              </label>
              <input
                type="text"
                value={settings.maintenanceMode?.badgeText || ''}
                onChange={(e) => handleMaintenanceChange('badgeText', e.target.value)}
                placeholder="Development & Maintenance Mode"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-50">
            <div className="w-8 h-8 bg-blue-50 text-[#000080] rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900">Basic Information</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                <Building2 className="w-3.5 h-3.5" /> Business Name
              </label>
              <input
                type="text"
                value={settings.businessName}
                onChange={(e) => handleChange('businessName', e.target.value)}
                placeholder="e.g. ProFox Webdesigner"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Globe className="w-3.5 h-3.5" /> Website URL
              </label>
              <input
                type="url"
                value={settings.website}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="https://www.example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Globe className="w-3.5 h-3.5" /> Google Review Link
              </label>
              <input
                type="url"
                value={settings.googleReviewUrl || ''}
                onChange={(e) => handleChange('googleReviewUrl', e.target.value)}
                placeholder="https://g.page/r/.../review"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-50">
            <div className="w-8 h-8 bg-blue-50 text-[#000080] rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900">Contact Channels</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                <Mail className="w-3.5 h-3.5" /> General Contact Email
              </label>
              <input
                type="email"
                value={settings.contactEmail}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                placeholder="contact@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Phone className="w-3.5 h-3.5" /> Support/Sales Phone
              </label>
              <input
                type="text"
                value={settings.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                placeholder="+1 234 567 890"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-50">
            <div className="w-8 h-8 bg-blue-50 text-[#000080] rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900">Global Presence</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                <MapPin className="w-3.5 h-3.5" /> Primary Country/Region
              </label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="e.g. India"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Home className="w-3.5 h-3.5" /> Full Business Address
              </label>
              <textarea
                value={settings.businessAddress}
                onChange={(e) => handleChange('businessAddress', e.target.value)}
                placeholder="Street address, City, State, Zip"
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* Security & System */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-50">
            <div className="w-8 h-8 bg-blue-50 text-[#000080] rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900">Security & Maintenance</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                <ShieldCheck className="w-3.5 h-3.5" /> Security Contact Email
              </label>
              <input
                type="email"
                value={settings.securityContact}
                onChange={(e) => handleChange('securityContact', e.target.value)}
                placeholder="security@example.com"
                className={inputClass}
              />
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Modified</p>
                <p className="text-sm font-bold text-slate-700">{settings.lastUpdated}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Live Preview of Development Mode */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Eye className="w-4 h-4 text-blue-400" />
                <span>Simulated Visitor Preview: Development Mode Screen</span>
              </div>
              <ConfirmButton
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </ConfirmButton>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DevelopmentModeScreen
                config={settings.maintenanceMode}
                businessName={settings.businessName}
                isPreview={true}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
