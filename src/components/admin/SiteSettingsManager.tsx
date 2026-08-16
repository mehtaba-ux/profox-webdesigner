import React, { useState, useEffect } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { SiteSettings } from '../../types';
import { SITE_SETTINGS_DEFAULTS } from '../../lib/siteSettings';
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
  Clock
} from 'lucide-react';

export default function SiteSettingsManager() {
  const { content, updateSection } = useCMS();
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const defaultSettings: SiteSettings = {
    ...SITE_SETTINGS_DEFAULTS,
    lastUpdated: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  };

  const [settings, setSettings] = useState<SiteSettings>(content.siteSettings || defaultSettings);

  useEffect(() => {
    if (content.siteSettings) {
      setSettings(content.siteSettings);
    }
  }, [content.siteSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedSettings = {
        ...settings,
        lastUpdated: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

  const handleChange = (field: keyof SiteSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 transition-all";
  const labelClass = "block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider flex items-center gap-2";

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Globe className="w-8 h-8 text-[#000080]" />
            Site Settings & Identity
          </h2>
          <p className="text-slate-500 text-sm mt-1">Manage your global business information and contact details across the entire website.</p>
        </div>
        
        <button
          onClick={handleSave}
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
        </button>
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

      <div className="bg-[#000080]/5 border border-[#000080]/10 rounded-2xl p-6 flex gap-4">
        <div className="w-10 h-10 bg-[#000080] text-white rounded-full flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-slate-900">Dynamic Synchronization Active</h4>
          <p className="text-sm text-slate-600 mt-1">
            The information saved here is the single source of truth for public business identity, address, region, email and phone details across the Footer, Contact, About, Legal and shared page sections.
          </p>
        </div>
      </div>
    </div>
  );
}
