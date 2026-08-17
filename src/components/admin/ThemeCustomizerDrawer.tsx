import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState } from 'react';
import { useCMS } from '../../lib/CMSProvider';
import { defaultTheme, defaultDynamicSections, navItems as defaultNavItems, services as defaultServices, featuredCaseStudies, recentSuccess, articles as defaultArticles } from '../../data';
import { ThemeConfig, DynamicSection, DynamicSectionItem, NavItem } from '../../types';
import { 
  Palette, 
  Type, 
  Layout, 
  Layers, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Sliders, 
  X, 
  Check, 
  Sparkles, 
  ArrowUp, 
  ArrowDown, 
  Menu,
  Briefcase, 
  Image as ImageIcon,
  MessageSquare,
  HelpCircle,
  Award,
  Maximize2,
  DollarSign,
  Users,
  Grid,
  Play,
  Download,
  Footprints
} from 'lucide-react';

import CustomMenuManager from './CustomMenuManager';
import ImageUploader from './ImageUploader';



interface ThemeCustomizerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isLiveEditing?: boolean;
  onToggleLiveEditing?: (enabled: boolean) => void;
}

const colorPresets = [
  { name: 'ProFox Navy & Red', primary: '#000080', secondary: '#FF0E0E' },
  { name: 'Ocean WP Blue', primary: '#0284c7', secondary: '#0369a1' },
  { name: 'Themify Dark Indigo', primary: '#6366f1', secondary: '#4f46e5' },
  { name: 'Sunset Rose Agency', primary: '#f43f5e', secondary: '#e11d48' },
  { name: 'Luxury Obsidian Gold', primary: '#eab308', secondary: '#ca8a04' }
];

const skinsPresets = [
  {
    id: 'profox-luxury',
    name: 'ProFox Premium (Default)',
    description: 'High-end web design skin with deep navy primary, vivid red accent, and Inter typography',
    primaryColor: '#000080',
    font: 'Inter',
    headingFont: 'Inter',
    radius: 'rounded-xl'
  },
  {
    id: 'ultra-agency',
    name: 'Ultra Agency',
    description: 'Modern high-converting digital agency skin with dark hero & navy accents',
    primaryColor: '#000080',
    font: 'Plus Jakarta Sans',
    headingFont: 'Plus Jakarta Sans',
    radius: 'rounded-lg'
  },
  {
    id: 'ocean-wp-blue',
    name: 'Ocean WP Clean Corporate',
    description: 'Crisp corporate aesthetic with ocean blue palette and Outfit typography',
    primaryColor: '#0284c7',
    font: 'Inter',
    headingFont: 'Outfit',
    radius: 'rounded-xl'
  },
  {
    id: 'themify-dark-luxury',
    name: 'Themify Luxury Dark',
    description: 'High-contrast luxury theme with serif headers and gold accents',
    primaryColor: '#eab308',
    font: 'Inter',
    headingFont: 'Playfair Display',
    radius: 'rounded-none'
  },
  {
    id: 'ultra-fitness',
    name: 'Ultra Fitness & Wellness',
    description: 'Vibrant energy skin with crimson accents and rounded pill buttons',
    primaryColor: '#f43f5e',
    font: 'Space Grotesk',
    headingFont: 'Space Grotesk',
    radius: 'rounded-full'
  }
];

const fontFamilies = [
  'Plus Jakarta Sans',
  'Playfair Display',
  'Inter',
  'Outfit',
  'Montserrat',
  'Poppins',
  'Cinzel',
  'Space Grotesk'
];

export default function ThemeCustomizerDrawer({ isOpen, onClose, isLiveEditing, onToggleLiveEditing }: ThemeCustomizerDrawerProps) {
  const { confirm: confirmAction } = useConfirmContext();
  const { content, updateSection } = useCMS();
  const [activeTab, setActiveTab] = useState<'typography' | 'colors' | 'skins' | 'header' | 'sections' | 'footer'>('typography');

  // Active theme config from CMS or defaults
  const theme: ThemeConfig = { ...defaultTheme, ...(content.theme || {}) };
  const dynamicSections: DynamicSection[] = content.dynamicSections || defaultDynamicSections;
  const navItemsList: NavItem[] = content.header?.navItems || defaultNavItems;

  const handleUpdateTheme = async (updatedFields: Partial<ThemeConfig>) => {
    const newTheme = { ...theme, ...updatedFields };
    await updateSection('theme', newTheme);
  };

  const handleUpdateSections = async (newSections: DynamicSection[]) => {
    await updateSection('dynamicSections', newSections);
  };

  const handleApplySkin = async (skinId: string) => {
    const skin = skinsPresets.find(s => s.id === skinId);
    if (!skin) return;

    await handleUpdateTheme({
      primaryColor: skin.primaryColor,
      fontFamily: skin.font as any,
      headingFontFamily: skin.font as any,
      buttonRadius: skin.radius as any,
      themePreset: skinId as any
    });
  };

  // Add a new dynamic section (Themify Builder)
  const handleAddSection = async (type: DynamicSection['type']) => {
    let items: DynamicSectionItem[] = [
      {
        id: `item-1`,
        title: 'Custom Highlight Feature',
        description: 'Click anywhere on this block to edit typography, text, and images in 1 click.',
        badge: 'FEATURE'
      }
    ];

    if (type === 'pricing') {
      items = [
        {
          id: 'p1',
          title: 'Starter Package',
          price: '$49',
          period: 'month',
          description: 'Perfect for growing businesses establishing digital presence.',
          features: ['5 Core Pages', 'Responsive Design', 'Basic SEO Setup', 'Supabase Storage']
        },
        {
          id: 'p2',
          title: 'Pro Ultra Agency',
          price: '$149',
          period: 'month',
          popular: true,
          badge: 'MOST POPULAR',
          description: 'Full end-to-end digital transformation and live builder support.',
          features: ['Unlimited Pages', 'Full CMS Admin Access', 'Custom Animations', '24/7 Dedicated Advisor']
        },
        {
          id: 'p3',
          title: 'Enterprise Custom',
          price: '$399',
          period: 'month',
          description: 'Dedicated infrastructure with bespoke API integrations.',
          features: ['Multi-site Network', 'Custom Cloud Architecture', 'SLA Guarantee', 'Dedicated Architect']
        }
      ];
    } else if (type === 'counter') {
      items = [
        { id: 'c1', title: '500+', statNumber: '500+', statLabel: 'Projects Completed' },
        { id: 'c2', title: '99.8%', statNumber: '99.8%', statLabel: 'Client Satisfaction' },
        { id: 'c3', title: '12+', statNumber: '12+', statLabel: 'Industry Awards' },
        { id: 'c4', title: '24/7', statNumber: '24/7', statLabel: 'Live Support Response' }
      ];
    }

    const newSec: DynamicSection = {
      id: `sec-${Date.now()}`,
      type,
      title: type === 'testimonials' ? 'What Our Clients Say' : type === 'faq' ? 'Frequently Asked Questions' : type === 'pricing' ? 'Flexible Pricing Plans' : type === 'counter' ? 'By The Numbers' : 'New Custom Section',
      subtitle: 'Customizable section powered by Themify & Ocean WP engine.',
      badge: type.toUpperCase(),
      bgType: 'light',
      enabled: true,
      order: dynamicSections.length + 1,
      items
    };
    const updated = [...dynamicSections, newSec];
    await handleUpdateSections(updated);
  };

  const handleMoveSection = async (index: number, direction: 'up' | 'down') => {
    const newSecs = [...dynamicSections];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx>= newSecs.length) return;
    const temp = newSecs[index];
    newSecs[index] = newSecs[targetIdx];
    newSecs[targetIdx] = temp;
    await handleUpdateSections(newSecs);
  };

  const handleToggleSection = async (index: number) => {
    const newSecs = [...dynamicSections];
    newSecs[index].enabled = !newSecs[index].enabled;
    await handleUpdateSections(newSecs);
  };

  const handleDeleteSection = async (index: number) => {
    if (!(await confirmAction('Delete Section', 'Are you sure you want to delete this section?'))) return;
    const newSecs = dynamicSections.filter((_, i) => i !== index);
    await handleUpdateSections(newSecs);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 h-full w-[380px] bg-white border-r border-slate-200 text-slate-900 z-[90] shadow-2xl flex flex-col font-sans transition-all">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#000080] to-teal-400 flex items-center justify-center text-slate-900 shadow-lg">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
              Ocean WP & Themify Customizer
            </h2>
            <p className="text-[11px] text-slate-500">Real-time Front-End Builder</p>
          </div>
        </div>

        <button 
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-slate-900 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Live Front-End 1-Click Editing Toggle Banner */}
      <div className="p-4 bg-[#000080]/10 border-b border-[#000080]/20 flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-xs font-bold text-[#000080] flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> 1-Click Front-End Hover Edit
          </span>
          <p className="text-[10px] text-slate-700">Hover over any text or image to edit</p>
        </div>
        <button onClick={() => onToggleLiveEditing && onToggleLiveEditing(!isLiveEditing)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            isLiveEditing 
              ? 'bg-[#000080] text-white shadow-lg shadow-[#000080]/30' 
              : 'bg-slate-100 text-slate-700 hover:bg-slate-700'
          }`} >
          {isLiveEditing ? 'Active' : 'Enable'}
        </button>
      </div>

      {/* Navigation Customizer Tabs */}
      <div className="flex items-center gap-1 p-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
        <button onClick={() => setActiveTab('typography')}
          className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'typography' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-white hover:bg-slate-100'
          }`} >
          <Type className="w-3.5 h-3.5" /> Fonts
        </button>
        <button onClick={() => setActiveTab('colors')}
          className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'colors' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-white hover:bg-slate-100'
          }`} >
          <Palette className="w-3.5 h-3.5" /> Color
        </button>
        <button onClick={() => setActiveTab('skins')}
          className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'skins' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-white hover:bg-slate-100'
          }`} >
          <Download className="w-3.5 h-3.5" /> Skins
        </button>
        <button onClick={() => setActiveTab('sections')}
          className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'sections' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-white hover:bg-slate-100'
          }`} >
          <Layers className="w-3.5 h-3.5" /> Builder
        </button>
        <button onClick={() => setActiveTab('header')}
          className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'header' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-white hover:bg-slate-100'
          }`} >
          <Menu className="w-3.5 h-3.5" /> Header
        </button>
      </div>

      {/* Main Customizer Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">

        {/* TAB 1: TYPOGRAPHY */}
        {activeTab === 'typography' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Website Font Family
              </label>
              <select
                value={theme.fontFamily}
                onChange={(e) => handleUpdateTheme({ fontFamily: e.target.value as any, headingFontFamily: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]">
                {fontFamilies.map((font) => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>

            <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">This single font is applied consistently to headings, body text, navigation, buttons, forms, cards, and the footer across the public website.</p>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Base Typography Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['14px', '16px', '18px'] as const).map((size) => (
                  <button key={size}
                    onClick={() => handleUpdateTheme({ baseFontSize: size })}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      theme.baseFontSize === size 
                        ? 'bg-[#000080] text-white border-[#000080]' 
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`} >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-slate-700">Live Typography Preview</span>
              <p className="text-xs text-slate-500 leading-relaxed" style={{ fontFamily: theme.fontFamily, fontSize: theme.baseFontSize }}>
                The quick brown fox jumps over the lazy dog. Responsive typography rendered in real-time.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: STYLING & COLORS */}
        {activeTab === 'colors' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Color Presets (Ocean & Themify)
              </label>
              <div className="grid grid-cols-1 gap-2">
                {colorPresets.map((preset) => (
                  <button key={preset.name}
                    onClick={() => handleUpdateTheme({ primaryColor: preset.primary, secondaryColor: preset.secondary })}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      theme.primaryColor === preset.primary 
                        ? 'border-[#000080] bg-slate-50 shadow-md' 
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                    }`} >
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full shadow-inner" style={{ backgroundColor: preset.primary }} />
                      <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                    </div>
                    {theme.primaryColor === preset.primary && <Check className="w-4 h-4 text-[#000080]" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Custom Accent Color Picker
              </label>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                <input
                  type="color"
                  value={theme.primaryColor}
                  onChange={(e) => handleUpdateTheme({ primaryColor: e.target.value })}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                />
                <input
                  type="text"
                  value={theme.primaryColor}
                  onChange={(e) => handleUpdateTheme({ primaryColor: e.target.value })}
                  className="bg-transparent text-sm font-mono text-slate-900 focus:outline-none w-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Button Border Radius
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Pill Rounded', value: 'rounded-full' },
                  { label: 'Curved XL', value: 'rounded-xl' },
                  { label: 'Standard LG', value: 'rounded-lg' },
                  { label: 'Square', value: 'rounded-none' }
                ].map((rad) => (
                  <button key={rad.value}
                    onClick={() => handleUpdateTheme({ buttonRadius: rad.value as any })}
                    className={`py-2.5 px-3 text-xs font-bold border transition-all ${
                      theme.buttonRadius === rad.value 
                        ? 'bg-[#000080] text-white border-[#000080]' 
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`} >
                    {rad.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DEMO SKINS IMPORTER */}
        {activeTab === 'skins' && (
          <div className="space-y-4">
            <div className="p-3 bg-[#000080]/10 border border-[#000080]/20 rounded-xl space-y-1">
              <span className="text-xs font-bold text-[#000080] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Themify Ultra Skins Demo Import
              </span>
              <p className="text-[11px] text-slate-700">
                Instantly re-skin the entire site with preset typography, button radius, and palette styles.
              </p>
            </div>

            <div className="space-y-3">
              {skinsPresets.map((skin) => (
                <div key={skin.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: skin.primaryColor }} />
                      <h4 className="font-bold text-sm text-slate-900">{skin.name}</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{skin.description}</p>
                  <button
                    type="button"
                    onClick={() => handleApplySkin(skin.id)}
                    className="w-full py-2 bg-[#000080] hover:bg-[#000066] text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Apply Skin
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SECTIONS & THEMIFY BUILDER */}
        {activeTab === 'sections' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center justify-between">
                <span>Add Dynamic Section</span>
                <Sparkles className="w-3.5 h-3.5 text-[#000080]" />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleAddSection('portfolio')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Briefcase className="w-4 h-4 text-[#000080]" />
                  <span>Portfolio Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('pricing')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 text-[#000080]" />
                  <span>Pricing Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('testimonials')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-[#000080]" />
                  <span>Testimonials</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('faq')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4 text-teal-500" />
                  <span>FAQ Accordion</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('features')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Award className="w-4 h-4 text-cyan-500" />
                  <span>Features Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('counter')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Grid className="w-4 h-4 text-amber-500" />
                  <span>Stats Counter</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddSection('cta')}
                  className="p-3 bg-slate-50 hover:bg-[#000080]/10 hover:text-[#000080] border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center gap-2 col-span-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#000080]" />
                  <span>CTA Banner</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Homepage Section Order
              </label>

              <div className="space-y-2">
                {dynamicSections.map((sec, idx) => (
                  <div
                    key={sec.id || idx}
                    className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <button onClick={() => handleToggleSection(idx)}
                        type="button"
                        className={`p-1 rounded-md transition-colors cursor-pointer ${
                          sec.enabled ? 'text-[#000080] bg-[#000080]/10' : 'text-slate-500 bg-white'
                        }`}
                        title={sec.enabled ? 'Disable section' : 'Enable section'} >
                        {sec.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-900 block">{sec.title}</span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{sec.type}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveSection(idx, 'up')}
                        className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSection(idx, 'down')}
                        className="p-1 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSection(idx)}
                        className="p-1 hover:bg-red-100 text-red-600 rounded cursor-pointer"
                        title="Delete Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: HEADER CUSTOMIZER */}
        {activeTab === 'header' && (
          <div className="space-y-5">
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <label className="text-xs font-bold uppercase text-slate-700 tracking-wider block">
                Brand Logo Image
              </label>
              <p className="text-[10px] text-slate-500 mb-2">
                Upload your custom logo to display in both the header and footer. SVG or transparent PNG/WebP files look best. If removed, the default vector logo will be used.
              </p>
              <ImageUploader
                value={theme.logoUrl || ''}
                onChange={(url) => handleUpdateTheme({ logoUrl: url })}
                label="Custom Logo File"
                placeholder="Upload or enter logo URL..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Logo First Text (Dot)
              </label>
              <input
                type="text"
                value={content.header?.dotText || 'dot'}
                onChange={(e) => updateSection('header', { ...(content.header || {}), dotText: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Logo Second Text (Logics)
              </label>
              <input
                type="text"
                value={content.header?.logicsText || 'logics'}
                onChange={(e) => updateSection('header', { ...(content.header || {}), logicsText: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                Header Button Text
              </label>
              <input
                type="text"
                value={content.header?.buttonText || 'Get in Touch'}
                onChange={(e) => updateSection('header', { ...(content.header || {}), buttonText: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <CustomMenuManager
                navItems={content.header?.navItems || defaultNavItems}
                customPages={content.customPages || []}
                onChange={(updatedNavItems, locations) => {
                  if (!locations || locations.includes('header')) {
                    updateSection('header', { ...(content.header || {}), navItems: updatedNavItems });
                  }
                  if (locations && locations.length> 0) {
                    const footerObj = { ...(content.footer || {}) };
                    if (locations.includes('footerCompany')) footerObj.companyLinks = updatedNavItems;
                    if (locations.includes('footerServices')) footerObj.servicesLinks = updatedNavItems;
                    if (locations.includes('footerLegal')) footerObj.legalLinks = updatedNavItems;
                    updateSection('footer', footerObj);
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Drawer Status Bar */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5 text-[#000080] font-bold">
          <Check className="w-4 h-4" /> Syncs Live to Supabase
        </span>
        <button 
          type="button"
          onClick={onClose}
          className="bg-[#000080] hover:bg-[#000066] text-white px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
