import React, { useState } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Check, ArrowLeft, Image as ImageIcon, Save, Settings, 
  FileText, BarChart, MessageSquare, Eye, Tag, X, FolderPlus, Layers, Building2, Palette, 
  Layout, Monitor, Sparkles, Type, Cpu, Code2, Globe, ShoppingBag, ShoppingCart, Store, 
  LayoutTemplate, Workflow, Target, FileCode2, Atom, Terminal, Code, FileCode, RefreshCw, 
  Server, Zap, Boxes, Network, Link as LinkIcon, Radio, CreditCard, Database, HardDrive, 
  Flame, Cloud, CloudLightning, Box, PenTool 
} from 'lucide-react';
import { PortfolioItem, PortfolioCategory, SEOConfig } from '../../types';
import { defaultPortfolioCategories } from '../../data';
import { PREDEFINED_TECH_STACK } from '../../data/techStackOptions';
import ImageUploader from './ImageUploader';
import { ConfirmDialog } from './ConfirmDialog';
import { useConfirm } from './useConfirm';

interface PortfolioManagerProps {
  items: PortfolioItem[];
  categories?: PortfolioCategory[];
  onSave: (item: PortfolioItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBulkDelete?: (itemIds: string[]) => Promise<void>;
  onSaveCategory?: (category: PortfolioCategory) => Promise<void>;
  onDeleteCategory?: (id: string) => Promise<void>;
  onRestoreDefaults?: () => Promise<void>;
}

const defaultSEO: SEOConfig = {
  metaTitle: '',
  metaDescription: '',
  focusKeyword: '',
  canonicalUrl: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  noIndex: false,
  schemaType: 'Article'
};

const emptyItem: PortfolioItem = {
  id: '',
  title: '',
  slug: '',
  client: '',
  category: '',
  shortDescription: '',
  coverImage: '',
  gallery: [],
  content: '',
  results: [],
  problemTitle: '',
  problemContent: '',
  problemBullets: [],
  solutionTitle: '',
  solutionContent: '',
  solutionBullets: [],
  resultsTitle: '',
  resultsContent: '',
  resultsBullets: [],
  industry: '',
  companySize: '',
  painPoint: '',
  solutionsProvided: [],
  aboutCompany: '',
  seo: defaultSEO,
  status: 'published',
  createdAt: '',
  updatedAt: ''
};

export default function PortfolioManager({ items, categories: propsCategories, onSave, onDelete, onBulkDelete, onSaveCategory, onDeleteCategory, onRestoreDefaults }: PortfolioManagerProps) {
  const { confirmState, confirm: confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [editorTab, setEditorTab] = useState<'sections' | 'sidebar' | 'results' | 'content' | 'testimonial' | 'seo' | 'design' | 'tech'>('sections');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Tech stack search & filter state
  const [techSearchTerm, setTechSearchTerm] = useState('');
  const [techCatFilter, setTechCatFilter] = useState('All');
  const [customTechInput, setCustomTechInput] = useState('');

  // Category management state
  const availableCategories = propsCategories && propsCategories.length > 0 ? propsCategories : defaultPortfolioCategories;
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catError, setCatError] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isCustomCategoryInput, setIsCustomCategoryInput] = useState(false);

  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const renderTechIconAdmin = (iconName: string) => {
    const props = { className: "w-4 h-4" };
    switch (iconName) {
      case 'Globe': return <Globe {...props} />;
      case 'ShoppingBag': return <ShoppingBag {...props} />;
      case 'ShoppingCart': return <ShoppingCart {...props} />;
      case 'Store': return <Store {...props} />;
      case 'LayoutTemplate': return <LayoutTemplate {...props} />;
      case 'Workflow': return <Workflow {...props} />;
      case 'Target': return <Target {...props} />;
      case 'Code2': return <Code2 {...props} />;
      case 'FileCode2': return <FileCode2 {...props} />;
      case 'Atom': return <Atom {...props} />;
      case 'Cpu': return <Cpu {...props} />;
      case 'Layout': return <Layout {...props} />;
      case 'Terminal': return <Terminal {...props} />;
      case 'Code': return <Code {...props} />;
      case 'FileCode': return <FileCode {...props} />;
      case 'RefreshCw': return <RefreshCw {...props} />;
      case 'Server': return <Server {...props} />;
      case 'Zap': return <Zap {...props} />;
      case 'Boxes': return <Boxes {...props} />;
      case 'Network': return <Network {...props} />;
      case 'Link': return <LinkIcon {...props} />;
      case 'Radio': return <Radio {...props} />;
      case 'CreditCard': return <CreditCard {...props} />;
      case 'Sparkles': return <Sparkles {...props} />;
      case 'Database': return <Database {...props} />;
      case 'HardDrive': return <HardDrive {...props} />;
      case 'Flame': return <Flame {...props} />;
      case 'Cloud': return <Cloud {...props} />;
      case 'CloudLightning': return <CloudLightning {...props} />;
      case 'Box': return <Box {...props} />;
      case 'Search': return <Search {...props} />;
      case 'Palette': return <Palette {...props} />;
      case 'PenTool': return <PenTool {...props} />;
      default: return <Cpu {...props} />;
    }
  };

  const toggleTechStack = (techName: string) => {
    if (!editingItem) return;
    const currentStack = editingItem.techStack || editingItem.technologies || [];
    let newStack: string[];
    if (currentStack.some(t => t.toLowerCase() === techName.toLowerCase())) {
      newStack = currentStack.filter(t => t.toLowerCase() !== techName.toLowerCase());
    } else {
      newStack = [...currentStack, techName];
    }
    setEditingItem({
      ...editingItem,
      techStack: newStack,
      technologies: newStack
    });
  };

  const handleAddCustomTech = () => {
    if (!customTechInput.trim() || !editingItem) return;
    const val = customTechInput.trim();
    const currentStack = editingItem.techStack || editingItem.technologies || [];
    if (!currentStack.some(t => t.toLowerCase() === val.toLowerCase())) {
      const newStack = [...currentStack, val];
      setEditingItem({
        ...editingItem,
        techStack: newStack,
        technologies: newStack
      });
    }
    setCustomTechInput('');
  };

  const handleCatNameChange = (val: string) => {
    setCatName(val);
    if (!catEditingId && !isSlugManuallyEdited) {
      setCatSlug(generateSlug(val));
    }
  };

  const handleCatSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError('');
    if (!catName.trim()) {
      setCatError('Category name is required.');
      return;
    }
    const finalSlug = catSlug.trim() || generateSlug(catName);
    const catToSave: PortfolioCategory = {
      id: catEditingId || `cat_${Date.now()}`,
      name: catName.trim(),
      slug: finalSlug,
      description: catDesc.trim()
    };

    try {
      if (onSaveCategory) {
        await onSaveCategory(catToSave);
      }
      setCatName('');
      setCatSlug('');
      setCatDesc('');
      setCatEditingId(null);
      setIsSlugManuallyEdited(false);
    } catch (err: any) {
      setCatError(err.message || 'Error saving category.');
    }
  };

  const handleCatEdit = (cat: PortfolioCategory) => {
    setCatEditingId(cat.id);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatDesc(cat.description || '');
    setCatError('');
    setIsSlugManuallyEdited(true);
  };

  const handleCatDelete = async (id: string, name: string) => {
    if (await confirmAction('Delete Category', `Are you sure you want to delete category "${name}"?`)) {
      if (onDeleteCategory) {
        await onDeleteCategory(id);
      }
    }
  };

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(filteredItems.map(item => item.id!));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems(prev => [...prev, id]);
    } else {
      setSelectedItems(prev => prev.filter(itemId => itemId !== id));
    }
  };

  const handleBulkDelete = async () => {
    if (await confirmAction('Delete Selected Portfolio Items', `Are you sure you want to delete ${selectedItems.length} items? This action cannot be undone.`)) {
      if (onBulkDelete) {
        await onBulkDelete(selectedItems);
        setSelectedItems([]);
      }
    }
  };

  const handleCreateNew = () => {
    setEditingItem({
      ...emptyItem,
      id: `portfolio_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setEditorTab('sections');
    setIsEditing(true);
  };

  const handleEdit = (item: PortfolioItem) => {
    setEditingItem({ ...item });
    setEditorTab('sections');
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (await confirmAction('Delete Portfolio Item', 'Are you sure you want to delete this portfolio item?')) {
      await onDelete(id);
    }
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const updated = {
        ...editingItem,
        slug: editingItem.slug || editingItem.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
        updatedAt: new Date().toISOString()
      };
      await onSave(updated);
      setEditingItem(updated);
      setSavedMessage('Portfolio saved successfully!');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      alert('Error saving portfolio item.');
    } finally {
      setSaving(false);
    }
  };

  if (isEditing && editingItem) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIsEditing(false)}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Portfolio
          </button>
          <div className="flex items-center gap-3">
            {editingItem.slug && (
              <a
                href={`/portfolio/${editingItem.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                title="View Live Portfolio Item"
              >
                <Eye className="w-4 h-4 text-slate-500" />
                <span>View Live</span>
              </a>
            )}
            {savedMessage && (
              <span className="text-emerald-600 text-sm font-medium flex items-center gap-1">
                <Check className="w-4 h-4" /> {savedMessage}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-[#000080] hover:bg-[#000066] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              Save Item
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={editingItem.title}
                onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none"
                placeholder="e.g. Acme Corp Rebranding"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Slug</label>
              <input
                type="text"
                value={editingItem.slug}
                onChange={e => setEditingItem({ ...editingItem, slug: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none font-mono"
                placeholder="acme-corp-rebranding"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Client</label>
              <input
                type="text"
                value={editingItem.client}
                onChange={e => setEditingItem({ ...editingItem, client: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none"
                placeholder="Client Name"
              />
            </div>
            {/* Enhanced Category Field with Selection & Quick Add */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Category</label>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="text-[11px] font-bold text-[#000080] hover:text-[#000066] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Tag className="w-3 h-3" /> Manage Categories
                </button>
              </div>
              {!isCustomCategoryInput ? (
                <div className="flex gap-2">
                  <select
                    value={editingItem.category}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCategoryInput(true);
                      } else {
                        setEditingItem({ ...editingItem, category: e.target.value });
                      }
                    }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none font-semibold text-slate-900 cursor-pointer"
                  >
                    {availableCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    {!availableCategories.some(c => c.name === editingItem.category) && editingItem.category && (
                      <option value={editingItem.category}>{editingItem.category}</option>
                    )}
                    <option value="__custom__">+ Enter Custom Category...</option>
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={editingItem.category}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none"
                    placeholder="e.g. AI & Robotics"
                  />
                  <button
                    type="button"
                    onClick={() => setIsCustomCategoryInput(false)}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Select From List
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
              <select
                value={editingItem.status || 'published'}
                onChange={e => setEditingItem({ ...editingItem, status: e.target.value as 'published' | 'draft' })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] focus:ring-1 focus:ring-[#000080] outline-none font-semibold text-slate-900"
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Case Study Tags & Badges (comma-separated)
              </label>
              <input
                type="text"
                value={(editingItem.tags || []).join(', ')}
                onChange={e => {
                  const tagList = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                  setEditingItem({ ...editingItem, tags: tagList });
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none font-medium"
                placeholder="e.g. Featured, E-Commerce, High-Growth, B2B, AI"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] font-bold text-slate-500">Quick Tags:</span>
                {['Featured', 'E-Commerce', 'Digital Experience', 'B2B Enterprise', 'Healthcare', 'Fintech', 'SaaS', 'High-Growth'].map(tagPreset => {
                  const isApplied = (editingItem.tags || []).includes(tagPreset);
                  return (
                    <button
                      type="button"
                      key={tagPreset}
                      onClick={() => {
                        const current = editingItem.tags || [];
                        if (isApplied) {
                          setEditingItem({ ...editingItem, tags: current.filter(t => t !== tagPreset) });
                        } else {
                          setEditingItem({ ...editingItem, tags: [...current, tagPreset] });
                        }
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        isApplied 
                          ? 'bg-[#000080] text-white' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isApplied ? '✓ ' : '+ '}{tagPreset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Short Description</label>
              <textarea
                value={editingItem.shortDescription}
                onChange={e => setEditingItem({ ...editingItem, shortDescription: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-20 resize-none"
                placeholder="A brief summary of the project..."
              />
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-700 mb-2">Cover Image</label>
            <ImageUploader 
              onChange={(url) => setEditingItem({ ...editingItem, coverImage: url })}
              value={editingItem.coverImage}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-1 border-b border-slate-200 p-2 bg-slate-50/50 overflow-x-auto">
            <button
              onClick={() => setEditorTab('sections')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'sections' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" /> Case Study Story
            </button>
            <button
              onClick={() => setEditorTab('sidebar')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'sidebar' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" /> Sidebar Meta
            </button>
            <button
              onClick={() => setEditorTab('results')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'results' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart className="w-4 h-4" /> Hero Highlights
            </button>
            <button
              onClick={() => setEditorTab('content')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'content' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" /> Extra HTML/Content
            </button>
            <button
              onClick={() => setEditorTab('testimonial')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'testimonial' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-4 h-4" /> Testimonial
            </button>
            <button
              onClick={() => setEditorTab('seo')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'seo' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4" /> SEO Data
            </button>
            <button
              onClick={() => setEditorTab('design')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'design' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Palette className="w-4 h-4 text-sky-300" /> Visual & UI/UX Showcase
            </button>
            <button
              onClick={() => setEditorTab('tech')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                editorTab === 'tech' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Cpu className="w-4 h-4 text-emerald-400" /> Tech Stack & Tools (34+)
            </button>
          </div>

          <div className="p-6">
            {editorTab === 'sections' && (
              <div className="space-y-8">
                {/* 1. PROBLEM SECTION */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-[#000080]">1. The Problem Section</h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Problem Heading Title</label>
                    <input
                      type="text"
                      value={editingItem.problemTitle || ''}
                      onChange={e => setEditingItem({ ...editingItem, problemTitle: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none"
                      placeholder="e.g. A Digital Presence That Did Not Reflect Brand Evolution"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Problem Narrative Paragraph</label>
                    <textarea
                      value={editingItem.problemContent || ''}
                      onChange={e => setEditingItem({ ...editingItem, problemContent: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-24 resize-y"
                      placeholder="Explain the background problem and challenges..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700">Problem Bullet Points</label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(editingItem.problemBullets || []), ''];
                          setEditingItem({ ...editingItem, problemBullets: updated });
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Bullet
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(editingItem.problemBullets || []).map((bullet, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={bullet}
                            onChange={e => {
                              const updated = [...(editingItem.problemBullets || [])];
                              updated[idx] = e.target.value;
                              setEditingItem({ ...editingItem, problemBullets: updated });
                            }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#000080]"
                            placeholder="Bullet point..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (editingItem.problemBullets || []).filter((_, i) => i !== idx);
                              setEditingItem({ ...editingItem, problemBullets: updated });
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {(!editingItem.problemBullets || editingItem.problemBullets.length === 0) && (
                        <p className="text-xs text-slate-400 italic">No bullet points added yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. SOLUTION SECTION */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-[#000080]">2. The Solution Section</h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Solution Heading Title</label>
                    <input
                      type="text"
                      value={editingItem.solutionTitle || ''}
                      onChange={e => setEditingItem({ ...editingItem, solutionTitle: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none"
                      placeholder="e.g. A Strategic Digital Transformation Built Around Brand"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Solution Narrative Paragraph</label>
                    <textarea
                      value={editingItem.solutionContent || ''}
                      onChange={e => setEditingItem({ ...editingItem, solutionContent: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-24 resize-y"
                      placeholder="Explain how the solution was executed..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700">Solution Key Highlights / Bullets</label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(editingItem.solutionBullets || []), ''];
                          setEditingItem({ ...editingItem, solutionBullets: updated });
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Bullet
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(editingItem.solutionBullets || []).map((bullet, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={bullet}
                            onChange={e => {
                              const updated = [...(editingItem.solutionBullets || [])];
                              updated[idx] = e.target.value;
                              setEditingItem({ ...editingItem, solutionBullets: updated });
                            }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#000080]"
                            placeholder="e.g. Strategic brand development: Restructured key messaging..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (editingItem.solutionBullets || []).filter((_, i) => i !== idx);
                              setEditingItem({ ...editingItem, solutionBullets: updated });
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {(!editingItem.solutionBullets || editingItem.solutionBullets.length === 0) && (
                        <p className="text-xs text-slate-400 italic">No solution bullets added yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. RESULTS SECTION */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-[#000080]">3. The Results Section</h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Results Heading Title</label>
                    <input
                      type="text"
                      value={editingItem.resultsTitle || ''}
                      onChange={e => setEditingItem({ ...editingItem, resultsTitle: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none"
                      placeholder="e.g. A Digital Platform That Reflects Brand Leadership"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Results Narrative Paragraph</label>
                    <textarea
                      value={editingItem.resultsContent || ''}
                      onChange={e => setEditingItem({ ...editingItem, resultsContent: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-24 resize-y"
                      placeholder="Explain the results and key achievements..."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700">Results Key Bullets</label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(editingItem.resultsBullets || []), ''];
                          setEditingItem({ ...editingItem, resultsBullets: updated });
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Bullet
                      </button>
                    </div>
                    <div className="space-y-2">
                      {(editingItem.resultsBullets || []).map((bullet, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={bullet}
                            onChange={e => {
                              const updated = [...(editingItem.resultsBullets || [])];
                              updated[idx] = e.target.value;
                              setEditingItem({ ...editingItem, resultsBullets: updated });
                            }}
                            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#000080]"
                            placeholder="Bullet point..."
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (editingItem.resultsBullets || []).filter((_, i) => i !== idx);
                              setEditingItem({ ...editingItem, resultsBullets: updated });
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {(!editingItem.resultsBullets || editingItem.resultsBullets.length === 0) && (
                        <p className="text-xs text-slate-400 italic">No result bullets added yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorTab === 'sidebar' && (
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-5">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-[#000080]">Sidebar Metadata & Company Info</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Industry</label>
                    <input
                      type="text"
                      value={editingItem.industry || ''}
                      onChange={e => setEditingItem({ ...editingItem, industry: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none"
                      placeholder="e.g. Wholesale distribution..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Company Size</label>
                    <input
                      type="text"
                      value={editingItem.companySize || ''}
                      onChange={e => setEditingItem({ ...editingItem, companySize: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none"
                      placeholder="e.g. 200 – 500 employees"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">Pain Point & Operational Gaps</label>
                    <span className="text-[10px] text-slate-400 font-medium">Auto-formats into process badges & risk cards</span>
                  </div>
                  <textarea
                    value={editingItem.painPoint || ''}
                    onChange={e => setEditingItem({ ...editingItem, painPoint: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm focus:border-[#000080] outline-none h-24 resize-y leading-relaxed"
                    placeholder="e.g. Hotel teams needed a centralized system capable of managing interconnected operational processes including room availability, reservations, guest info, billing... Without structured controls, hotels face reservation conflicts..."
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Include items after <em>&quot;including&quot;</em> or <em>&quot;covering&quot;</em> to auto-generate workflow tags, and describe consequences after <em>&quot;Without...&quot;</em> or <em>&quot;face...&quot;</em> to auto-generate risk warning cards.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-700">Profox web designer Solution Provided (List)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...(editingItem.solutionsProvided || []), ''];
                        setEditingItem({ ...editingItem, solutionsProvided: updated });
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded border border-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Solution
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(editingItem.solutionsProvided || []).map((sol, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={sol}
                          onChange={e => {
                            const updated = [...(editingItem.solutionsProvided || [])];
                            updated[idx] = e.target.value;
                            setEditingItem({ ...editingItem, solutionsProvided: updated });
                          }}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#000080]"
                          placeholder="e.g. Brand and messaging strategy"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingItem.solutionsProvided || []).filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, solutionsProvided: updated });
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {(!editingItem.solutionsProvided || editingItem.solutionsProvided.length === 0) && (
                      <p className="text-xs text-slate-400 italic">No solutions provided added yet.</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">About the Company</label>
                  <textarea
                    value={editingItem.aboutCompany || ''}
                    onChange={e => setEditingItem({ ...editingItem, aboutCompany: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-24 resize-y"
                    placeholder="Short description about the client company..."
                  />
                </div>
              </div>
            )}

            {editorTab === 'content' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Extra Custom Content (Markdown or HTML)</label>
                <textarea
                  value={editingItem.content}
                  onChange={e => setEditingItem({ ...editingItem, content: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-[#000080] outline-none h-[400px] font-mono resize-y"
                  placeholder="Additional custom HTML or markdown..."
                />
              </div>
            )}
            
            {editorTab === 'results' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">Hero Highlights / Metrics (Appears at bottom of 100vh Header)</label>
                    <p className="text-xs text-slate-500">Each highlight displays a label, a title value, and a description text.</p>
                  </div>
                  <button
                    onClick={() => {
                      const newResults = [...(editingItem.results || []), { label: '', value: '', description: '' }];
                      setEditingItem({ ...editingItem, results: newResults });
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Metric Highlight
                  </button>
                </div>
                {(editingItem.results || []).map((res, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Metric Title (e.g. Process Efficiency)</label>
                        <input
                          type="text"
                          placeholder="Title / Heading (e.g. Process Efficiency)"
                          value={res.label}
                          onChange={(e) => {
                            const updated = [...editingItem.results];
                            updated[idx].label = e.target.value;
                            setEditingItem({ ...editingItem, results: updated });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#000080] outline-none font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Metric Value / Subhead (e.g. Efficiency or +180%)</label>
                        <input
                          type="text"
                          placeholder="Value (e.g. Efficiency)"
                          value={res.value}
                          onChange={(e) => {
                            const updated = [...editingItem.results];
                            updated[idx].value = e.target.value;
                            setEditingItem({ ...editingItem, results: updated });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#000080] outline-none font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1">Description</label>
                        <button
                          onClick={() => {
                            const updated = editingItem.results.filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, results: updated });
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove Metric
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Description (e.g. Stronger digital brand alignment with market position)"
                        value={res.description || ''}
                        onChange={(e) => {
                          const updated = [...editingItem.results];
                          updated[idx].description = e.target.value;
                          setEditingItem({ ...editingItem, results: updated });
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#000080] outline-none"
                      />
                    </div>
                  </div>
                ))}
                {(!editingItem.results || editingItem.results.length === 0) && (
                  <div className="text-center py-8 text-slate-400 text-sm">No metrics added yet.</div>
                )}
              </div>
            )}
            
            {editorTab === 'testimonial' && (
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-700 mb-1">Client Testimonial</label>
                <textarea
                  value={editingItem.testimonial?.quote || ''}
                  onChange={(e) => setEditingItem({ 
                    ...editingItem, 
                    testimonial: { ...(editingItem.testimonial || { author: '', role: '', avatar: '' }), quote: e.target.value } 
                  })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-[#000080] outline-none h-24 resize-none"
                  placeholder="What did the client say?"
                />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={editingItem.testimonial?.author || ''}
                    onChange={(e) => setEditingItem({ 
                      ...editingItem, 
                      testimonial: { ...(editingItem.testimonial || { quote: '', role: '', avatar: '' }), author: e.target.value } 
                    })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none"
                    placeholder="Author Name"
                  />
                  <input
                    type="text"
                    value={editingItem.testimonial?.role || ''}
                    onChange={(e) => setEditingItem({ 
                      ...editingItem, 
                      testimonial: { ...(editingItem.testimonial || { quote: '', author: '', avatar: '' }), role: e.target.value } 
                    })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none"
                    placeholder="Author Role (e.g. CEO)"
                  />
                </div>
              </div>
            )}
            
            {editorTab === 'seo' && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Meta Title</label>
                    <input
                      type="text"
                      value={editingItem.seo?.metaTitle || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, seo: { ...editingItem.seo, metaTitle: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Meta Description</label>
                    <textarea
                      value={editingItem.seo?.metaDescription || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, seo: { ...editingItem.seo, metaDescription: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none h-24 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Focus Keyword</label>
                    <input
                      type="text"
                      value={editingItem.seo?.focusKeyword || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, seo: { ...editingItem.seo, focusKeyword: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:border-[#000080] outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <h4 className="text-sm font-bold text-slate-900 mb-2">Search Preview</h4>
                    <div className="text-[14px] text-[#1a0dab] hover:underline cursor-pointer truncate">
                      {editingItem.seo?.metaTitle || editingItem.title || 'Portfolio Title'}
                    </div>
                    <div className="text-[12px] text-[#006621] truncate mt-0.5">
                      yoursite.com/portfolio/{editingItem.slug || 'slug'}
                    </div>
                    <div className="text-[13px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                      {editingItem.seo?.metaDescription || editingItem.shortDescription || 'Description of the portfolio project will appear here in search results.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorTab === 'design' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[#000080]" /> Visual & UI/UX Design Showcase Editor
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showcase UI screens, wireframes, design systems, color palettes, and Figma prototype links.
                    </p>
                  </div>
                </div>

                {/* Showcase Header & Prototype Links editor removed per user request */}

                {/* Visual Screens & UI Mockups Gallery Editor */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#000080] flex items-center gap-1.5">
                        <Monitor className="w-4 h-4" /> Visual Screens & Mockups Gallery
                      </h4>
                      <p className="text-[11px] text-slate-500">Add UI screens, wireframe flows, mobile viewports, and design system components.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentVisuals = editingItem.designShowcase?.visuals || [];
                        const updatedVisuals = [
                          ...currentVisuals,
                          {
                            title: 'New UI Screen Mockup',
                            caption: 'Description of key UI elements and interactions',
                            category: 'UI Screens',
                            imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200'
                          }
                        ];
                        setEditingItem({
                          ...editingItem,
                          designShowcase: { ...(editingItem.designShowcase || {}), visuals: updatedVisuals }
                        });
                      }}
                      className="px-3 py-1.5 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Visual Screen
                    </button>
                  </div>

                  <div className="space-y-4">
                    {(editingItem.designShowcase?.visuals || []).map((vis, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#000080]/10 text-[#000080] flex items-center justify-center text-[10px] font-extrabold">{idx + 1}</span>
                            <span>{vis.title || `Visual Screen #${idx + 1}`}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedVisuals = (editingItem.designShowcase?.visuals || []).filter((_, i) => i !== idx);
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), visuals: updatedVisuals }
                              });
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Screen Title</label>
                            <input
                              type="text"
                              value={vis.title}
                              onChange={e => {
                                const updated = [...(editingItem.designShowcase?.visuals || [])];
                                updated[idx].title = e.target.value;
                                setEditingItem({
                                  ...editingItem,
                                  designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:border-[#000080] outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Category / Tag</label>
                            <select
                              value={vis.category || 'UI Screens'}
                              onChange={e => {
                                const updated = [...(editingItem.designShowcase?.visuals || [])];
                                updated[idx].category = e.target.value;
                                setEditingItem({
                                  ...editingItem,
                                  designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:border-[#000080] outline-none"
                            >
                              <option value="UI Screens">UI Screens</option>
                              <option value="UX & Wireframes">UX & Wireframes</option>
                              <option value="Mobile Views">Mobile Views</option>
                              <option value="Design System">Design System</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Image URL</label>
                            <input
                              type="text"
                              value={vis.imageUrl}
                              onChange={e => {
                                const updated = [...(editingItem.designShowcase?.visuals || [])];
                                updated[idx].imageUrl = e.target.value;
                                setEditingItem({
                                  ...editingItem,
                                  designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-[#000080] outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Caption / Subtext</label>
                          <input
                            type="text"
                            value={vis.caption || ''}
                            onChange={e => {
                              const updated = [...(editingItem.designShowcase?.visuals || [])];
                              updated[idx].caption = e.target.value;
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                              });
                            }}
                            placeholder="e.g. High-density order configurator grid with real-time stock indicators."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-[#000080] outline-none"
                          />
                        </div>

                        <ImageUploader
                          label="Upload / Change Main Screen Image"
                          value={vis.imageUrl}
                          onChange={url => {
                            const updated = [...(editingItem.designShowcase?.visuals || [])];
                            updated[idx].imageUrl = url;
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                            });
                          }}
                        />

                        {/* Additional Images for this Visual */}
                        <div className="pt-3 border-t border-slate-100 space-y-2">
                          <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-[#000080]" />
                            <span>Additional Carousel / Slide Images ({ (vis.images || []).length })</span>
                          </label>
                          
                          {/* List of existing images */}
                          {vis.images && vis.images.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pb-1">
                              {vis.images.map((imgUrl, imgIdx) => (
                                <div key={imgIdx} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
                                  <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(editingItem.designShowcase?.visuals || [])];
                                      updated[idx].images = (updated[idx].images || []).filter((_, i) => i !== imgIdx);
                                      setEditingItem({
                                        ...editingItem,
                                        designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                      });
                                    }}
                                    className="absolute inset-0 bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Upload additional image */}
                          <div>
                            <ImageUploader
                              label="Upload & Add Another Image to Carousel"
                              value=""
                              onChange={url => {
                                if (!url) return;
                                const updated = [...(editingItem.designShowcase?.visuals || [])];
                                updated[idx].images = [...(updated[idx].images || []), url];
                                setEditingItem({
                                  ...editingItem,
                                  designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                });
                              }}
                            />
                          </div>
                        </div>

                        {/* Associated Documents / Specifications */}
                        <div className="pt-3 border-t border-slate-100 space-y-2">
                          <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#000080]" />
                            <span>Associated Documents & Specification Downloads ({ (vis.documents || []).length })</span>
                          </label>

                          {/* List of existing documents */}
                          {vis.documents && vis.documents.length > 0 && (
                            <div className="space-y-1.5 pb-1">
                              {vis.documents.map((doc, docIdx) => (
                                <div key={docIdx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                                  <div className="flex items-center gap-2 font-medium text-slate-700 truncate">
                                    <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="font-bold text-slate-900 truncate">{doc.name}</span>
                                    <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-500 shrink-0 uppercase font-extrabold">{doc.type || 'file'}</span>
                                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[#000080] hover:underline font-bold text-[10px] truncate">{doc.url}</a>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...(editingItem.designShowcase?.visuals || [])];
                                      updated[idx].documents = (updated[idx].documents || []).filter((_, i) => i !== docIdx);
                                      setEditingItem({
                                        ...editingItem,
                                        designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                      });
                                    }}
                                    className="text-red-500 hover:text-red-700 font-bold p-1 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add Document Input Box */}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              id={`doc-name-${idx}`}
                              placeholder="e.g. Wireframe PDF, Specifications Deck"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-[#000080] outline-none"
                            />
                            <input
                              type="text"
                              id={`doc-url-${idx}`}
                              placeholder="File / Document URL (HTTPS)"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:border-[#000080] outline-none"
                            />
                            <div className="flex gap-2">
                              <select
                                id={`doc-type-${idx}`}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:border-[#000080] outline-none"
                              >
                                <option value="pdf">PDF</option>
                                <option value="figma">Figma</option>
                                <option value="doc">Doc</option>
                                <option value="other">Other</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const nameInput = document.getElementById(`doc-name-${idx}`) as HTMLInputElement;
                                  const urlInput = document.getElementById(`doc-url-${idx}`) as HTMLInputElement;
                                  const typeSelect = document.getElementById(`doc-type-${idx}`) as unknown as HTMLSelectElement;
                                  if (nameInput && urlInput && nameInput.value.trim() && urlInput.value.trim()) {
                                    const updated = [...(editingItem.designShowcase?.visuals || [])];
                                    updated[idx].documents = [...(updated[idx].documents || []), {
                                      name: nameInput.value.trim(),
                                      url: urlInput.value.trim(),
                                      type: typeSelect.value
                                    }];
                                    setEditingItem({
                                      ...editingItem,
                                      designShowcase: { ...(editingItem.designShowcase || {}), visuals: updated }
                                    });
                                    nameInput.value = '';
                                    urlInput.value = '';
                                  }
                                }}
                                className="px-3 py-1.5 bg-[#000080] hover:bg-blue-900 text-white font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1 shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add File</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {(!editingItem.designShowcase?.visuals || editingItem.designShowcase.visuals.length === 0) && (
                      <div className="p-6 text-center text-xs text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                        No visual screens added yet. Click "Add Visual Screen" to showcase UI mockups!
                      </div>
                    )}
                  </div>
                </div>

                {/* Project-Wide Documents & Assets */}
                <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#000080] flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> Project Documentation & Assets
                      </h4>
                      <p className="text-[11px] text-slate-500">Add project-wide files like Case Studies, Figma Links, or Technical Specs.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Document Name</label>
                        <input 
                          id="proj-doc-name"
                          placeholder="e.g. UX Research Spec"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-[#000080]"
                        />
                      </div>
                      <div className="flex-[2] space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">File URL / Link</label>
                        <input 
                          id="proj-doc-url"
                          placeholder="https://..."
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#000080]"
                        />
                      </div>
                      <div className="w-full sm:w-24 space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Type</label>
                        <select id="proj-doc-type" className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-[#000080]">
                          <option value="PDF">PDF</option>
                          <option value="DOC">DOC</option>
                          <option value="Figma">Figma</option>
                          <option value="Zip">Zip</option>
                        </select>
                      </div>
                      <div className="flex items-end pb-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const nameEl = document.getElementById('proj-doc-name') as HTMLInputElement;
                            const urlEl = document.getElementById('proj-doc-url') as HTMLInputElement;
                            const typeEl = document.getElementById('proj-doc-type') as unknown as HTMLSelectElement;
                            if (nameEl.value && urlEl.value) {
                              const current = editingItem.designShowcase?.projectDocuments || [];
                              setEditingItem({
                                ...editingItem,
                                designShowcase: {
                                  ...(editingItem.designShowcase || {}),
                                  projectDocuments: [...current, { name: nameEl.value, url: urlEl.value, type: typeEl.value }]
                                }
                              });
                              nameEl.value = '';
                              urlEl.value = '';
                            }
                          }}
                          className="w-full sm:w-auto px-4 py-2 bg-[#000080] hover:bg-blue-900 text-white rounded-lg transition-colors flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(editingItem.designShowcase?.projectDocuments || []).map((doc, dIdx) => (
                        <div key={dIdx} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl hover:border-blue-200 transition-all group">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-blue-50 text-[#000080] rounded-lg group-hover:bg-[#000080] group-hover:text-white transition-colors">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-900 truncate">{doc.name}</p>
                              <p className="text-[9px] text-slate-400 truncate font-medium">{doc.url}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (editingItem.designShowcase?.projectDocuments || []).filter((_, i) => i !== dIdx);
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), projectDocuments: updated }
                              });
                            }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* UI/UX Highlights Editor */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#000080] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> UI & UX Design Highlights
                      </h4>
                      <p className="text-[11px] text-slate-500">Key pillars like accessibility, micro-interactions, responsive frameworks, or design systems.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentHls = editingItem.designShowcase?.uiUxHighlights || [];
                        const updatedHls = [
                          ...currentHls,
                          {
                            title: 'New UX Highlight',
                            description: 'Description of key UX innovation or interaction pattern',
                            category: 'UX & Wireframes'
                          }
                        ];
                        setEditingItem({
                          ...editingItem,
                          designShowcase: { ...(editingItem.designShowcase || {}), uiUxHighlights: updatedHls }
                        });
                      }}
                      className="px-3 py-1.5 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add UI/UX Highlight
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(editingItem.designShowcase?.uiUxHighlights || []).map((hl, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-800">Highlight #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedHls = (editingItem.designShowcase?.uiUxHighlights || []).filter((_, i) => i !== idx);
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), uiUxHighlights: updatedHls }
                              });
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        </div>
                        <input
                          type="text"
                          value={hl.title}
                          onChange={e => {
                            const updated = [...(editingItem.designShowcase?.uiUxHighlights || [])];
                            updated[idx].title = e.target.value;
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), uiUxHighlights: updated }
                            });
                          }}
                          placeholder="Highlight Title (e.g. Accessible Design System)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:border-[#000080] outline-none"
                        />
                        <input
                          type="text"
                          value={hl.category || 'UI & Design System'}
                          onChange={e => {
                            const updated = [...(editingItem.designShowcase?.uiUxHighlights || [])];
                            updated[idx].category = e.target.value;
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), uiUxHighlights: updated }
                            });
                          }}
                          placeholder="Category Tag (e.g. Accessibility, UX Architecture)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:border-[#000080] outline-none"
                        />
                        <textarea
                          value={hl.description}
                          onChange={e => {
                            const updated = [...(editingItem.designShowcase?.uiUxHighlights || [])];
                            updated[idx].description = e.target.value;
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), uiUxHighlights: updated }
                            });
                          }}
                          rows={2}
                          placeholder="Description of the design highlight..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:border-[#000080] outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Color Palette Swatches Editor */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#000080] flex items-center gap-1.5">
                        <Palette className="w-4 h-4" /> Brand Color Palette Swatches
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentColors = editingItem.designShowcase?.colorPalette || [];
                        const updatedColors = [
                          ...currentColors,
                          { hex: '#000080', name: 'Brand Navy' }
                        ];
                        setEditingItem({
                          ...editingItem,
                          designShowcase: { ...(editingItem.designShowcase || {}), colorPalette: updatedColors }
                        });
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Color Swatch
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(editingItem.designShowcase?.colorPalette || []).map((color, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 relative group">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={color.hex}
                            onChange={e => {
                              const updated = [...(editingItem.designShowcase?.colorPalette || [])];
                              updated[idx].hex = e.target.value;
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), colorPalette: updated }
                              });
                            }}
                            className="w-7 h-7 rounded border-none cursor-pointer p-0"
                          />
                          <input
                            type="text"
                            value={color.hex}
                            onChange={e => {
                              const updated = [...(editingItem.designShowcase?.colorPalette || [])];
                              updated[idx].hex = e.target.value;
                              setEditingItem({
                                ...editingItem,
                                designShowcase: { ...(editingItem.designShowcase || {}), colorPalette: updated }
                              });
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono font-bold"
                          />
                        </div>
                        <input
                          type="text"
                          value={color.name}
                          onChange={e => {
                            const updated = [...(editingItem.designShowcase?.colorPalette || [])];
                            updated[idx].name = e.target.value;
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), colorPalette: updated }
                            });
                          }}
                          placeholder="Color Name"
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingItem.designShowcase?.colorPalette || []).filter((_, i) => i !== idx);
                            setEditingItem({
                              ...editingItem,
                              designShowcase: { ...(editingItem.designShowcase || {}), colorPalette: updated }
                            });
                          }}
                          className="text-[10px] text-red-500 font-bold hover:underline cursor-pointer"
                        >
                          Remove Swatch
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Typography System Editor */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider text-[#000080] flex items-center gap-1.5">
                    <Type className="w-4 h-4" /> Typography System Pairing
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Font Family Names</label>
                      <input
                        type="text"
                        value={editingItem.designShowcase?.typography?.fontName || ''}
                        onChange={e => setEditingItem({
                          ...editingItem,
                          designShowcase: {
                            ...(editingItem.designShowcase || {}),
                            typography: {
                              fontName: e.target.value,
                              usage: editingItem.designShowcase?.typography?.usage || ''
                            }
                          }
                        })}
                        placeholder="e.g. Plus Jakarta Sans & Inter"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#000080] outline-none font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Hierarchy & Usage Description</label>
                      <input
                        type="text"
                        value={editingItem.designShowcase?.typography?.usage || ''}
                        onChange={e => setEditingItem({
                          ...editingItem,
                          designShowcase: {
                            ...(editingItem.designShowcase || {}),
                            typography: {
                              fontName: editingItem.designShowcase?.typography?.fontName || '',
                              usage: e.target.value
                            }
                          }
                        })}
                        placeholder="e.g. Modern sans-serif pairing ensuring clear legibility across high-density tables and mobile apps."
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#000080] outline-none"
                      />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {editorTab === 'tech' && (
              <div className="space-y-6">
                {/* Active Selected Tech Stack Bar */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-[#000080] uppercase tracking-wider flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#000080]" />
                      Selected Tech Stack & Tools ({((editingItem.techStack || editingItem.technologies) || []).length})
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Click any badge or option below to select / unselect
                    </span>
                  </div>

                  {/* Badges List */}
                  {((editingItem.techStack || editingItem.technologies) || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {((editingItem.techStack || editingItem.technologies) || []).map((techName: string, idx: number) => {
                        const matched = PREDEFINED_TECH_STACK.find(t => t.name.toLowerCase() === techName.toLowerCase() || t.id === techName.toLowerCase());
                        return (
                          <div 
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-800 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-all cursor-pointer group"
                            onClick={() => toggleTechStack(techName)}
                            title="Click to remove"
                          >
                            <span className="text-[#000080]">
                              {renderTechIconAdmin(matched?.iconName || 'Code2')}
                            </span>
                            <span>{techName}</span>
                            <X className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 ml-1" />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic py-2">
                      No technologies selected yet. Select from the 34+ options below or add custom tech tags.
                    </div>
                  )}
                </div>

                {/* Add Custom Tech Tag */}
                <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-[#000080]" /> Add Custom Technology / Tool Tag
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customTechInput}
                      onChange={e => setCustomTechInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTech(); } }}
                      placeholder="e.g. Kubernetes, Supabase, FastAPI, Tailwind, etc."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:border-[#000080] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTech}
                      className="px-4 py-2 bg-[#000080] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-4 h-4" /> Add Tag
                    </button>
                  </div>
                </div>

                {/* Predefined 34+ Tech Stack Options Grid */}
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#000080]" />
                      Predefined Tech Stack Library (34+ Options with Icons)
                    </h4>

                    {/* Search & Category Filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative shrink-0 w-48">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={techSearchTerm}
                          onChange={e => setTechSearchTerm(e.target.value)}
                          placeholder="Search tech..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:border-[#000080] outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                        {['All', 'Languages & Frameworks', 'CMS & E-Commerce', 'Backend & APIs', 'Database & Cloud', 'Frontend & Design'].map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setTechCatFilter(cat)}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                              techCatFilter === cat
                                ? 'bg-[#000080] text-white shadow'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {PREDEFINED_TECH_STACK.filter(option => {
                      const matchesCat = techCatFilter === 'All' || option.category === techCatFilter;
                      const matchesSearch = !techSearchTerm.trim() || option.name.toLowerCase().includes(techSearchTerm.toLowerCase()) || option.category.toLowerCase().includes(techSearchTerm.toLowerCase());
                      return matchesCat && matchesSearch;
                    }).map(option => {
                      const isSelected = ((editingItem.techStack || editingItem.technologies) || []).some((t: string) => t.toLowerCase() === option.name.toLowerCase() || t.toLowerCase() === option.id.toLowerCase());
                      return (
                        <div
                          key={option.id}
                          onClick={() => toggleTechStack(option.name)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 select-none ${
                            isSelected
                              ? 'bg-blue-50/90 border-[#000080] shadow-md ring-2 ring-[#000080]/20'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className={`p-2 rounded-xl border ${isSelected ? 'bg-[#000080] text-white border-blue-900' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                              {renderTechIconAdmin(option.iconName)}
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-[#000080] border-[#000080] text-white' : 'border-slate-300'}`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 leading-tight">
                              {option.name}
                            </div>
                            <div className="text-[9px] text-slate-400 font-medium truncate mt-0.5">
                              {option.category}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#000080]/10 rounded-lg text-[#000080]">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Portfolio Categories</h3>
                  <p className="text-xs text-slate-500">Add, edit, or reorganize project categories for your portfolio</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowCategoryModal(false);
                  setCatEditingId(null);
                  setCatName('');
                  setCatSlug('');
                  setCatDesc('');
                }}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Add / Edit Category Form */}
              <form onSubmit={handleCatSave} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-[#000080]" />
                  {catEditingId ? 'Edit Category' : 'Add New Category'}
                </h4>

                {catError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
                    {catError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category Name *</label>
                    <input
                      type="text"
                      required
                      value={catName}
                      onChange={e => handleCatNameChange(e.target.value)}
                      placeholder="e.g. E-Commerce & Retail"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#000080] outline-none font-medium text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Slug</label>
                    <input
                      type="text"
                      value={catSlug}
                      onChange={e => {
                        setCatSlug(generateSlug(e.target.value));
                        setIsSlugManuallyEdited(true);
                      }}
                      placeholder="e-commerce-retail"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#000080] outline-none font-mono text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={catDesc}
                    onChange={e => setCatDesc(e.target.value)}
                    placeholder="Brief overview of projects in this category"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-sm focus:border-[#000080] outline-none text-slate-800"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {catEditingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setCatEditingId(null);
                        setCatName('');
                        setCatSlug('');
                        setCatDesc('');
                        setCatError('');
                        setIsSlugManuallyEdited(false);
                      }}
                      className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {catEditingId ? 'Update Category' : 'Save Category'}
                  </button>
                </div>
              </form>

              {/* Categories List Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Existing Categories ({availableCategories.length})
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase">Category Name</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase">Slug</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase">Projects</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {availableCategories.map(cat => {
                        const count = items.filter(i => i.category === cat.name).length;
                        return (
                          <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-900 text-xs">
                              {cat.name}
                              {cat.description && (
                                <div className="text-[11px] font-normal text-slate-500 truncate max-w-xs">{cat.description}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{cat.slug}</td>
                            <td className="px-4 py-3">
                              <span className="bg-blue-50 text-[#000080] px-2 py-0.5 rounded text-[10px] font-bold">
                                {count} {count === 1 ? 'project' : 'projects'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleCatEdit(cat)}
                                  className="p-1.5 text-slate-600 hover:text-[#000080] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                  title="Edit Category"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCatDelete(cat.id, cat.name)}
                                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Delete Category"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {availableCategories.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-500 text-xs italic">
                            No categories created yet. Add one above!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            Portfolio Management
            <span className="bg-[#000080]/10 text-[#000080] px-2.5 py-0.5 rounded-full text-xs font-bold">
              {items.length} Case Studies Total
            </span>
          </h2>
          <p className="text-xs text-slate-500">Manage case studies, client projects, and project categories</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedItems.length > 0 && onBulkDelete && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-xs flex items-center gap-2 border border-red-200 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Delete Selected ({selectedItems.length})
            </button>
          )}
          {onRestoreDefaults && (
            <button
              onClick={async () => {
                if (await confirmAction('Restore Demo Content', 'Are you sure you want to restore missing demo case studies? This will not delete your existing case studies.')) {
                  await onRestoreDefaults();
                }
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-200 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" /> Restore Demos
            </button>
          )}
          <button
            onClick={() => setShowCategoryModal(true)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-2 border border-slate-200 transition-all cursor-pointer"
          >
            <Tag className="w-4 h-4 text-[#000080]" /> Manage Categories ({availableCategories.length})
          </button>
          <button
            onClick={handleCreateNew}
            className="px-4 py-2 bg-[#000080] hover:bg-[#000066] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Portfolio Item
          </button>
        </div>
      </div>

      {/* Overview Stat Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Published Case Studies</div>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">
              {items.filter(i => i.status === 'published' || !i.status).length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Check className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Drafts / Unpublished</div>
            <div className="text-2xl font-black text-amber-600 mt-0.5">
              {items.filter(i => i.status === 'draft').length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Edit2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Categories</div>
            <div className="text-2xl font-black text-[#000080] mt-0.5">
              {availableCategories.length}
            </div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#000080]/10 text-[#000080] flex items-center justify-center font-bold">
            <Tag className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search portfolio by title or category..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-[#000080] outline-none"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium whitespace-nowrap">
            Showing <strong className="text-slate-900 font-bold">{filteredItems.length}</strong> of <strong className="text-slate-900 font-bold">{items.length}</strong> total case studies
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-[#000080] focus:ring-[#000080] cursor-pointer"
                    checked={filteredItems.length > 0 && selectedItems.length === filteredItems.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map(item => (
                <tr key={item.id} className={`hover:bg-slate-50 transition-colors group ${selectedItems.includes(item.id!) ? 'bg-[#000080]/5' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-[#000080] focus:ring-[#000080] cursor-pointer"
                      checked={selectedItems.includes(item.id!)}
                      onChange={(e) => handleSelectItem(item.id!, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {item.coverImage ? (
                        <img src={item.coverImage} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                        <div className="text-xs text-slate-500 font-mono">/portfolio/{item.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                    {item.client}
                  </td>
                  <td className="px-6 py-4">
                    {item.status === 'draft' ? (
                      <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        Draft
                      </span>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                        Published
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {item.slug && (
                        <a
                          href={`/portfolio/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 text-slate-600 hover:text-[#000080] hover:bg-[#000080]/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                          title="View Portfolio Item"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </a>
                      )}
                      <button
                        onClick={() => handleEdit(item)}
                        className="px-2.5 py-1.5 text-slate-600 hover:text-[#000080] hover:bg-[#000080]/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                        title="Edit Item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-2.5 py-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
                        title="Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No portfolio items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
