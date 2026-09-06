import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useEffect, useState, useMemo } from 'react';
import { NavItem, CustomPage, PortfolioItem, PortfolioCategory, Service } from '../../types';
import { defaultCustomPages, defaultPortfolioItems, defaultPortfolioCategories, services as defaultServices } from '../../data';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Link as LinkIcon,
  ExternalLink,
  Menu as MenuIcon,
  CornerDownRight,
  Menu,
  FileText,
  CheckSquare,
  Square,
  Layers,
  Layout,
  Check,
  Globe,
  Lock,
  Briefcase,
  Tag,
  FolderKanban,
  CheckCircle2,
  GripVertical,
  ChevronRight,
  Settings2,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { getPagePath } from '../../lib/seoUrls';
import { DEFAULT_MAIN_NAVIGATION, normalizeNavigationHref, normalizeNavigationMenu } from '../../lib/siteNavigation';

interface CustomMenuManagerProps {
  navItems: NavItem[];
  customPages?: CustomPage[];
  portfolioItems?: PortfolioItem[];
  portfolioCategories?: PortfolioCategory[];
  services?: Service[];
  onChange: (updatedItems: NavItem[], selectedLocations?: string[]) => void;
}

// Helper to generate unique IDs for NavItems if they don't have one
const ensureIds = (items: NavItem[]): (NavItem & { id: string })[] => {
  return normalizeNavigationMenu(items).map((item, idx) => ({
    ...item,
    id: item.id || `menu-item-${idx}-${item.label}-${item.href}`,
    children: item.children ? ensureIds(item.children) : undefined
  })) as (NavItem & { id: string })[];
};

function DraggableSourceItem({ id, label, icon: Icon, data }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center justify-between p-2 rounded-lg cursor-grab active:cursor-grabbing text-xs transition-colors border ${
        isDragging 
          ? 'bg-[#000080]/10 border-[#000080]/30 opacity-50 z-50' 
          : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-[#000080]/30 text-slate-700'
      }`}
   >
      <div className="flex items-center gap-2 min-w-0 pr-2">
        <Icon className="w-3.5 h-3.5 text-[#000080] shrink-0" />
        <span className="font-medium truncate">{label}</span>
      </div>
      <Plus className="w-3 h-3 text-slate-400 shrink-0" />
    </div>
  );
}

function SortableMenuItem({ 
  item, 
  depth = 0, 
  onRemove, 
  onUpdate, 
  onAddSub, 
  onToggleMega,
  getEligibleParents,
  findParentIdOfItem,
  onMoveToParent
}: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    marginLeft: `${depth * 20}px`,
  };

  const [isExpanded, setIsExpanded] = useState(true);

  const currentParentId = findParentIdOfItem ? findParentIdOfItem(item.id) : 'root';
  const eligibleParents = getEligibleParents ? getEligibleParents(item.id) : [];

  return (
    <div ref={setNodeRef} style={style} className={`group ${isDragging ? 'opacity-50 z-50' : ''}`}>
      <div className={`bg-white border ${
        isOver 
          ? 'border-[#000080] bg-[#000080]/5 ring-4 ring-[#000080]/10' 
          : item.isMegaMenu 
            ? 'border-[#000080]/30 ring-1 ring-[#000080]/10' 
            : 'border-slate-200'
      } rounded-2xl p-3 shadow-sm hover:shadow-md transition-all space-y-2`}>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            {...attributes} 
            {...listeners} 
            className="p-1 text-slate-400 hover:text-[#000080] cursor-grab active:cursor-grabbing"
>
            <GripVertical className="w-4 h-4" />
          </button>

          <div className="flex-1 grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="text"
                value={item.label}
                onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
                placeholder="Menu Label"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-[#000080]"
              />
            </div>
            <div className="relative">
              <input
                type="text"
                value={item.href}
                onChange={(e) => onUpdate(item.id, 'href', e.target.value)}
                placeholder="URL / Anchor"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#000080] font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
              title={isExpanded ? "Collapse item" : "Expand item"}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
              title="Delete Item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => onToggleMega(item.id)}
                className={`px-2 py-1 rounded-lg font-bold text-[10px] flex items-center gap-1.5 border transition-all ${
                  item.isMegaMenu 
                    ? 'bg-[#000080] text-white border-[#000080] shadow-sm' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-[#000080]/30 hover:text-slate-700'
                }`}>
                <Layers className="w-3.5 h-3.5" />
                {item.isMegaMenu ? 'Mega Menu: ON' : 'Make Mega Menu'}
              </button>

              <div className="relative group/badge">
                <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#000080]" />
                <input
                  type="text"
                  value={item.badge || ''}
                  onChange={(e) => onUpdate(item.id, 'badge', e.target.value)}
                  placeholder="Badge (NEW)"
                  className="w-28 bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-[10px] font-bold text-[#000080] focus:outline-none focus:border-[#000080]"
                />
              </div>
            </div>

            {depth < 1 && (
              <button
                type="button"
                onClick={() => onAddSub(item.id)}
                className="px-2 py-1 bg-slate-50 hover:bg-[#000080]/10 text-slate-600 hover:text-[#000080] border border-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Sub-Item
              </button>
            )}
          </div>
        )}

        {isExpanded && onMoveToParent && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100/60 text-[11px]">
            <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Parent Item:</span>
            <select
              value={currentParentId}
              onChange={(e) => onMoveToParent(item.id, e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-[#000080]">
              <option value="root">— None (Top Level) —</option>
              {eligibleParents.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {Array(p.depth).fill('  ').join('')}↳ {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {isExpanded && item.description !== undefined && (
          <div className="pt-2 animate-in fade-in duration-200">
             <textarea
                value={item.description || ''}
                onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
                placeholder="Optional description (shows in some menu styles)..."
                rows={1}
                className="w-full bg-slate-50/50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-500 italic focus:outline-none focus:border-[#000080] resize-none"
              />
          </div>
        )}
      </div>

      {item.children && item.children.length> 0 && (
        <div className="mt-2 space-y-2">
          {item.children.map((child: any) => (
            <SortableMenuItem
              key={child.id}
              item={child}
              depth={depth + 1}
              onRemove={onRemove}
              onUpdate={onUpdate}
              onAddSub={onAddSub}
              onToggleMega={onToggleMega}
              getEligibleParents={getEligibleParents}
              findParentIdOfItem={findParentIdOfItem}
              onMoveToParent={onMoveToParent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomMenuManager({ 
  navItems, 
  customPages = [], 
  portfolioItems = [],
  portfolioCategories = [],
  services = [],
  onChange 
}: CustomMenuManagerProps) {
  const [items, setItems] = useState<(NavItem & { id: string })[]>(() => ensureIds(navItems || []));
  const [activeLocation, setActiveLocation] = useState<'header' | 'footerCompany' | 'footerServices' | 'footerLegal'>('header');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  useEffect(() => {
    setItems(ensureIds(navItems || DEFAULT_MAIN_NAVIGATION));
  }, [navItems]);
  
  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<any>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveDragData(active.data.current);
  };

  const findItemById = (id: string, list: (NavItem & { id: string })[]): NavItem & { id: string } | null => {
    for (const item of list) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItemById(id, item.children as (NavItem & { id: string })[]);
        if (found) return found;
      }
    }
    return null;
  };

  const findParentIdOfItem = (itemId: string, list: (NavItem & { id: string })[] = items, currentParentId: string = 'root'): string => {
    for (const item of list) {
      if (item.id === itemId) return currentParentId;
      if (item.children) {
        const found = findParentIdOfItem(itemId, item.children as (NavItem & { id: string })[], item.id);
        if (found !== 'root') return found;
      }
    }
    return 'root';
  };

  const getAllPotentialParents = (list: (NavItem & { id: string })[], depth = 0): { id: string, label: string, depth: number }[] => {
    const result: { id: string, label: string, depth: number }[] = [];
    for (const item of list) {
      result.push({ id: item.id, label: item.label, depth });
      if (item.children) {
        result.push(...getAllPotentialParents(item.children as (NavItem & { id: string })[], depth + 1));
      }
    }
    return result;
  };

  const getDescendantIds = (itemId: string, list: (NavItem & { id: string })[]): string[] => {
    const item = findItemById(itemId, list);
    if (!item) return [];
    const ids: string[] = [];
    const collect = (children: any[]) => {
      for (const child of children) {
        ids.push(child.id);
        if (child.children) collect(child.children);
      }
    };
    if (item.children) collect(item.children);
    return ids;
  };

  const getEligibleParents = (itemId: string): { id: string, label: string, depth: number }[] => {
    const all = getAllPotentialParents(items);
    const descendants = getDescendantIds(itemId, items);
    return all.filter(p => p.id !== itemId && !descendants.includes(p.id));
  };

  const handleMoveToParent = (itemId: string, newParentId: string) => {
    let movingItem: (NavItem & { id: string }) | null = null;

    const extractItem = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
      return list.filter(item => {
        if (item.id === itemId) {
          movingItem = item;
          return false;
        }
        if (item.children) {
          item.children = extractItem(item.children as (NavItem & { id: string })[]);
        }
        return true;
      });
    };

    const listWithoutItem = extractItem(items);

    if (!movingItem) return;

    if (newParentId === 'root') {
      const next = [...listWithoutItem, { ...movingItem, children: movingItem.children || [] }];
      setItems(next);
      onChange(next);
    } else {
      const insertUnderParent = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === newParentId) {
            return {
              ...item,
              children: [...(item.children || []), movingItem!]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderParent(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      const next = insertUnderParent(listWithoutItem);
      setItems(next);
      onChange(next);
    }
  };

  const updateNestedItem = (id: string, field: string, value: any, list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
    return list.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      if (item.children) {
        return { ...item, children: updateNestedItem(id, field, value, item.children as (NavItem & { id: string })[]) };
      }
      return item;
    });
  };

  const removeNestedItem = (id: string, list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
    return list.filter(item => item.id !== id).map(item => {
      if (item.children) {
        return { ...item, children: removeNestedItem(id, item.children as (NavItem & { id: string })[]) };
      }
      return item;
    });
  };

  const addNestedSubItem = (parentId: string, list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
    return list.map(item => {
      if (item.id === parentId) {
        const newChild: NavItem & { id: string } = {
          id: `sub-${Date.now()}`,
          label: `New Sub-link`,
          href: '#',
          description: ''
        };
        return { ...item, children: [...(item.children || []), newChild] };
      }
      if (item.children) {
        return { ...item, children: addNestedSubItem(parentId, item.children as (NavItem & { id: string })[]) };
      }
      return item;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragData(null);

    if (!over) return;

    // Case 1: Dragging from sidebar to main list
    if (active.id.toString().startsWith('source-') && over.id === 'menu-structure-dropzone') {
      const sourceData = active.data.current;
      if (sourceData) {
        const newItem: NavItem & { id: string } = {
          id: `menu-item-${Date.now()}`,
          label: sourceData.label,
          href: sourceData.href,
          target: '_self',
          badge: sourceData.badge,
          description: sourceData.description
        };
        const next = [...items, newItem];
        setItems(next);
        onChange(next);
      }
      return;
    }

    // Case 1b: Dragging from sidebar and dropping over a specific menu item to nest it as a sublink!
    if (active.id.toString().startsWith('source-') && over.id !== 'menu-structure-dropzone') {
      const sourceData = active.data.current;
      const targetId = over.id.toString();
      if (sourceData) {
        const newItem: NavItem & { id: string } = {
          id: `menu-item-${Date.now()}`,
          label: sourceData.label,
          href: sourceData.href,
          target: '_self',
          badge: sourceData.badge,
          description: sourceData.description
        };
        const addAsChild = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
          return list.map(item => {
            if (item.id === targetId) {
              return {
                ...item,
                children: [...(item.children || []), newItem]
              };
            }
            if (item.children) {
              return {
                ...item,
                children: addAsChild(item.children as (NavItem & { id: string })[])
              };
            }
            return item;
          });
        };
        const next = addAsChild(items);
        setItems(next);
        onChange(next);
      }
      return;
    }

    // Case 2: Sorting items in the main list
    if (active.id !== over.id) {
      const oldIndex = items.findIndex(i => i.id === active.id);
      const newIndex = items.findIndex(i => i.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(items, oldIndex, newIndex) as (NavItem & { id: string })[];
        setItems(next);
        onChange(next);
      }
    }
  };

  const handleRemoveItem = (id: string) => {
    const next = removeNestedItem(id, items);
    setItems(next);
    onChange(next);
  };

  const handleUpdateItemField = (id: string, field: string, value: any) => {
    const next = updateNestedItem(id, field, value, items);
    setItems(next);
    onChange(next);
  };

  const handleAddSubItem = (parentId: string) => {
    const next = addNestedSubItem(parentId, items);
    setItems(next);
    onChange(next);
  };

  const handleToggleMega = (id: string) => {
    const item = findItemById(id, items);
    if (item) {
      handleUpdateItemField(id, 'isMegaMenu', !item.isMegaMenu);
    }
  };

  const [pageFilter, setPageFilter] = useState<'available' | 'all'>('available');

  // WordPress Left Panel - Checkboxes state for Pages
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  // Portfolio Left Panel - State for Case Studies & Categories
  const [selectedCaseStudies, setSelectedCaseStudies] = useState<string[]>([]);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [portfolioTagFilter, setPortfolioTagFilter] = useState<string>('all');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  
  // Custom Link Form State
  const [customLabel, setCustomLabel] = useState('');
  const [customHref, setCustomHref] = useState('');
  const [customTarget, setCustomTarget] = useState<'_self' | '_blank'>('_self');

  // Sub-menu assignment dropdown target parents
  const [targetParentForPages, setTargetParentForPages] = useState<string>('root');
  const [targetParentForPortfolio, setTargetParentForPortfolio] = useState<string>('root');
  const [targetParentForServices, setTargetParentForServices] = useState<string>('root');
  const [targetParentForCustom, setTargetParentForCustom] = useState<string>('root');

  // Menu Settings - Display Locations
  const [displayLocations, setDisplayLocations] = useState<{ [key: string]: boolean }>({
    header: true,
    footerCompany: false,
    footerServices: false,
    footerLegal: false
  });

  const updateAndEmit = (newItems: NavItem[]) => {
    const itemsWithIds = ensureIds(newItems);
    setItems(itemsWithIds);
    // Find checked location keys
    const locs = Object.keys(displayLocations).filter(k => displayLocations[k]);
    onChange(itemsWithIds, locs.length> 0 ? locs : [activeLocation]);
  };

  // Get pages created & added in the Pages section
  const pagesFromManager = customPages && customPages.length> 0 ? customPages : defaultCustomPages;

  // Combine portfolio items with defaults
  const availablePortfolioItems: PortfolioItem[] = [...portfolioItems];
  for (const def of defaultPortfolioItems) {
    if (!availablePortfolioItems.some(p => p.id === def.id || p.slug === def.slug)) {
      availablePortfolioItems.push(def);
    }
  }

  // Combine portfolio categories
  const availablePortfolioCategories: PortfolioCategory[] = [...portfolioCategories];
  for (const defCat of defaultPortfolioCategories) {
    if (!availablePortfolioCategories.some(c => c.id === defCat.id || c.slug === defCat.slug || c.name === defCat.name)) {
      availablePortfolioCategories.push(defCat);
    }
  }

  // Filter available pages (published only or all)
  const filteredCustomPages = pagesFromManager.filter(page => {
    if (pageFilter === 'available') {
      return page.status === 'published' || !page.status;
    }
    return true;
  });

  // Pages list reflected from the Pages & Pages Section
  const availablePagesList = [
    { title: 'Home Page', href: '/', type: 'core', status: 'published' },
    ...filteredCustomPages.map(page => ({
      title: page.title,
      href: getPagePath(page),
      type: 'custom',
      status: page.status || 'published'
    }))
  ];

  // Filtered case studies by category/tag
  const filteredCaseStudies = availablePortfolioItems.filter(item => {
    if (portfolioTagFilter === 'all') return true;
    return item.category === portfolioTagFilter || (item.tags && item.tags.includes(portfolioTagFilter));
  });

  const handleTogglePageSelect = (href: string) => {
    if (selectedPages.includes(href)) {
      setSelectedPages(selectedPages.filter(h => h !== href));
    } else {
      setSelectedPages([...selectedPages, href]);
    }
  };

  const handleToggleCaseStudySelect = (idOrSlug: string) => {
    if (selectedCaseStudies.includes(idOrSlug)) {
      setSelectedCaseStudies(selectedCaseStudies.filter(s => s !== idOrSlug));
    } else {
      setSelectedCaseStudies([...selectedCaseStudies, idOrSlug]);
    }
  };

  const handleToggleCatSelect = (catName: string) => {
    if (selectedCats.includes(catName)) {
      setSelectedCats(selectedCats.filter(c => c !== catName));
    } else {
      setSelectedCats([...selectedCats, catName]);
    }
  };

  const handleToggleServiceSelect = (id: string) => {
    if (selectedServices.includes(id)) {
      setSelectedServices(selectedServices.filter(s => s !== id));
    } else {
      setSelectedServices([...selectedServices, id]);
    }
  };

  const handleAddSelectedPagesToMenu = () => {
    if (selectedPages.length === 0) return;

    const newNavItems: NavItem[] = selectedPages.map(href => {
      const pageObj = availablePagesList.find(p => p.href === href);
      return {
        label: pageObj ? pageObj.title : 'New Page',
        href,
        target: '_self'
      };
    });

    if (targetParentForPages === 'root') {
      updateAndEmit([...items, ...newNavItems]);
    } else {
      const insertUnderSelected = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === targetParentForPages) {
            return {
              ...item,
              children: [...(item.children || []), ...ensureIds(newNavItems)]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderSelected(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      updateAndEmit(insertUnderSelected(items));
    }
    setSelectedPages([]);
    setTargetParentForPages('root');
  };

  const handleAddPortfolioMainPageToMenu = () => {
    // Construct a rich Portfolio Section mega menu or main link
    const portfolioChildren: NavItem[] = availablePortfolioItems.slice(0, 6).map(cs => ({
      label: cs.title,
      href: `/portfolio/${cs.slug || cs.id}`,
      description: cs.shortDescription || `${cs.client} Case Study`,
      badge: cs.category || 'CASE STUDY',
      target: '_self'
    }));

    const portfolioMenuItem: NavItem = {
      label: 'Portfolio & Case Studies',
      href: '/portfolio',
      isMegaMenu: true,
      badge: 'CASE STUDIES',
      description: 'Transformational digital case studies and client success stories.',
      children: portfolioChildren
    };

    updateAndEmit([...items, portfolioMenuItem]);
  };

  const handleAddSelectedCaseStudiesToMenu = () => {
    if (selectedCaseStudies.length === 0) return;

    const newNavItems: NavItem[] = selectedCaseStudies.map(slugOrId => {
      const cs = availablePortfolioItems.find(p => p.slug === slugOrId || p.id === slugOrId);
      return {
        label: cs ? cs.title : 'Case Study',
        href: `/portfolio/${cs ? (cs.slug || cs.id) : slugOrId}`,
        description: cs ? (cs.shortDescription || `${cs.client} Case Study`) : 'Portfolio Case Study',
        badge: cs ? (cs.category || 'CASE STUDY') : 'CASE STUDY',
        target: '_self'
      };
    });

    if (targetParentForPortfolio === 'root') {
      updateAndEmit([...items, ...newNavItems]);
    } else {
      const insertUnderSelected = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === targetParentForPortfolio) {
            return {
              ...item,
              children: [...(item.children || []), ...ensureIds(newNavItems)]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderSelected(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      updateAndEmit(insertUnderSelected(items));
    }
    setSelectedCaseStudies([]);
    setTargetParentForPortfolio('root');
  };

  const handleAddSelectedCategoriesToMenu = () => {
    if (selectedCats.length === 0) return;

    const newNavItems: NavItem[] = selectedCats.map(catName => {
      const catObj = availablePortfolioCategories.find(c => c.name === catName);
      const catSlug = catObj ? catObj.slug : catName.toLowerCase().replace(/\s+/g, '-');
      return {
        label: `${catName} Portfolio`,
        href: `/portfolio?category=${catSlug}`,
        badge: 'TAG',
        description: `Explore all ${catName} case studies and projects`,
        target: '_self'
      };
    });

    if (targetParentForPortfolio === 'root') {
      updateAndEmit([...items, ...newNavItems]);
    } else {
      const insertUnderSelected = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === targetParentForPortfolio) {
            return {
              ...item,
              children: [...(item.children || []), ...ensureIds(newNavItems)]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderSelected(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      updateAndEmit(insertUnderSelected(items));
    }
    setSelectedCats([]);
    setTargetParentForPortfolio('root');
  };

  const handleAddSelectedServicesToMenu = () => {
    if (selectedServices.length === 0) return;

    const newNavItems: NavItem[] = selectedServices.map(id => {
      const s = services.find(service => service.id === id);
      return {
        label: s ? s.title : 'Service',
        href: normalizeNavigationHref(s ? (s.link || `/services/${s.id}`) : `/services/${id}`, s?.description || s?.title),
        description: s ? s.description : 'Service detail page',
        target: '_self'
      };
    });

    if (targetParentForServices === 'root') {
      updateAndEmit([...items, ...newNavItems]);
    } else {
      const insertUnderSelected = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === targetParentForServices) {
            return {
              ...item,
              children: [...(item.children || []), ...ensureIds(newNavItems)]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderSelected(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      updateAndEmit(insertUnderSelected(items));
    }
    setSelectedServices([]);
    setTargetParentForServices('root');
  };

  const handleAddCustomLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLabel.trim()) return;

    const newItem: NavItem = {
      label: customLabel.trim(),
      href: normalizeNavigationHref(customHref, customLabel),
      target: customTarget
    };

    if (targetParentForCustom === 'root') {
      updateAndEmit([...items, newItem]);
    } else {
      const insertUnderSelected = (list: (NavItem & { id: string })[]): (NavItem & { id: string })[] => {
        return list.map(item => {
          if (item.id === targetParentForCustom) {
            return {
              ...item,
              children: [...(item.children || []), ...ensureIds([newItem])]
            };
          }
          if (item.children) {
            return {
              ...item,
              children: insertUnderSelected(item.children as (NavItem & { id: string })[])
            };
          }
          return item;
        });
      };
      updateAndEmit(insertUnderSelected(items));
    }
    setCustomLabel('');
    setCustomHref('');
    setTargetParentForCustom('root');
  };

  const handleLoadPresetMenu = (presetType: 'agency' | 'saas' | 'minimal') => {
    let preset: NavItem[] = [];
    if (presetType === 'agency') {
      preset = [{ label: 'Home', href: '/' }, ...DEFAULT_MAIN_NAVIGATION, { label: 'Contact Us', href: '/contact-us' }];
    } else if (presetType === 'saas') {
      preset = [
        { label: 'Overview', href: '/' },
        { 
          label: 'Platform', 
          href: '/services/website-design-and-development',
          isMegaMenu: true,
          badge: 'PRO',
          description: 'All-in-one cloud platform features and modular tools.',
          children: [
            { label: 'Website Design & Development', href: '/services/website-design-and-development', description: 'Strategy, design and conversion-focused websites' },
            { label: 'Web & Mobile Applications', href: '/services/web-and-mobile-application-development', description: 'Reliable custom applications', badge: 'CORE' },
            { label: 'Business Automation', href: '/services/email-marketing-and-business-automation', description: 'Connected workflows and lifecycle automation' }
          ]
        },
        { label: 'Portfolio', href: '/portfolio' },
        { label: 'Insights', href: '/blog' },
        { label: 'Contact Us', href: '/contact-us' }
      ];
    } else {
      preset = [
        { label: 'Home', href: '/' },
        { label: 'About', href: '/about-us' },
        { label: 'Portfolio', href: '/portfolio' },
        { label: 'Contact', href: '/contact-us' }
      ];
    }
    updateAndEmit(preset);
  };

  const handleToggleDisplayLocation = (locKey: string) => {
    const newLocs = { ...displayLocations, [locKey]: !displayLocations[locKey] };
    setDisplayLocations(newLocs);
    const activeKeys = Object.keys(newLocs).filter(k => newLocs[k]);
    onChange(items, activeKeys.length> 0 ? activeKeys : [activeLocation]);
  };

  function DroppableZone({ children }: any) {
    const { setNodeRef, isOver } = useDroppable({
      id: 'menu-structure-dropzone',
    });
  
    return (
      <div
        ref={setNodeRef}
        className={`min-h-[200px] p-2 rounded-2xl border-2 border-dashed transition-all ${
          isOver ? 'border-[#000080] bg-[#000080]/5 ring-4 ring-[#000080]/10' : 'border-slate-200 bg-white/50'
        }`}
     >
        {children}
        {items.length === 0 && !isOver && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Layers className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">Menu is empty</p>
            <p className="text-xs">Drag items here or use "Add to Menu" buttons</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
   >
      <div className="space-y-6">
      {/* WordPress Menu Location Selector Header */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <MenuIcon className="w-5 h-5 text-[#000080]" />
            <h3 className="font-bold text-base text-slate-900">WordPress Custom Menu Builder</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Select Menu to Edit:</span>
            <select
              value={activeLocation}
              onChange={(e) => setActiveLocation(e.target.value as any)}
              className="bg-slate-50 border border-[#000080]/50 text-[#000080] font-bold text-xs rounded-xl px-3 py-1.5 focus:outline-none">
              <option value="header">Header Primary Navigation</option>
              <option value="footerCompany">Footer Company Links</option>
              <option value="footerServices">Footer Services Links</option>
              <option value="footerLegal">Footer Legal Links</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Select pages from your site on the left to add them directly to the active menu structure. Drag or reorder items, create dropdowns, or assign menus to Header and Footer locations.
        </p>

        {/* Presets */}
        <div className="flex items-center gap-2 pt-1 overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-500 shrink-0">Preset Templates:</span>
          <button 
            type="button" 
            onClick={() => handleLoadPresetMenu('agency')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
          >
            Digital Agency
          </button>
          <button 
            type="button" 
            onClick={() => handleLoadPresetMenu('saas')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
          >
            SaaS & Product
          </button>
          <button 
            type="button" 
            onClick={() => handleLoadPresetMenu('minimal')}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
          >
            Minimal Nav
          </button>
        </div>
        
        <div className="flex justify-end pt-2">
          {!showRestoreConfirm ? (
            <button 
              type="button"
              onClick={() => setShowRestoreConfirm(true)}
              className="px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Restore Default Site Navigation
            </button>
          ) : (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300">
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100">Are you sure?</span>
              <button type="button"
                onClick={() => {
                  const defaultItems = ensureIds(DEFAULT_MAIN_NAVIGATION);
                  setItems(defaultItems);
                  onChange(defaultItems.map(({ id, ...rest }) => rest));
                  setShowRestoreConfirm(false);
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg transition-all shadow-sm cursor-pointer">
                Yes, Restore
              </button>
              <button 
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: WordPress Pages & Add Links Panel */}
        <div className="lg:col-span-5 space-y-4">
          {/* WordPress Pages Selector */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#000080]" /> Site Pages ({availablePagesList.length})
              </h4>
              <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
                <button type="button"
                  onClick={() => setPageFilter('available')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    pageFilter === 'available' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}>
                  Available
                </button>
                <button type="button"
                  onClick={() => setPageFilter('all')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    pageFilter === 'all' ? 'bg-[#000080] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}>
                  All ({pagesFromManager.length + 1})
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Select available pages created in the <strong>Pages Section</strong> to add to your menu:
            </p>

            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar border border-slate-200/80 rounded-xl p-2 bg-white/50">
              {availablePagesList.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No available published pages found. Publish pages in the Pages section first!
                </div>
              ) : (
                availablePagesList.map((page, idx) => {
                  const isChecked = selectedPages.includes(page.href);
                  return (
                    <div key={idx} className="flex items-center gap-2 group">
                      <button type="button"
                        onClick={() => handleTogglePageSelect(page.href)}
                        className={`flex-1 flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          isChecked ? 'bg-[#000080]/10 text-[#000066] border border-[#000080]/30' : 'hover:bg-slate-100/60 text-slate-700'
                        }`}>
                        <div className="flex items-center gap-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[#000080] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <span className="font-medium">{page.title}</span>
                        </div>
                        <span className="text-[9px] bg-[#000080]/5 text-[#000080] px-1.5 py-0.5 rounded font-bold uppercase">
                          {page.status || 'Published'}
                        </span>
                      </button>
                      <DraggableSourceItem
                        id={`source-page-${idx}`}
                        label={page.title}
                        icon={FileText}
                        data={{ label: page.title, href: page.href, type: 'page' }}
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-1.5 pt-1.5 border-t border-slate-200/50">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add as Sub-menu of:</label>
              <select
                value={targetParentForPages}
                onChange={(e) => setTargetParentForPages(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#000080]">
                <option value="root">— None (Top Level) —</option>
                {getAllPotentialParents(items).map(p => (
                  <option key={p.id} value={p.id}>
                    {Array(p.depth).fill('  ').join('')}↳ {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button 
              type="button"
              disabled={selectedPages.length === 0}
              onClick={handleAddSelectedPagesToMenu}
              className="w-full py-2 bg-[#000080] hover:bg-[#000080] disabled:bg-slate-100 disabled:text-slate-600 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
>
              <Plus className="w-3.5 h-3.5" />
              Add Selected ({selectedPages.length}) Pages to Menu
            </button>
          </div>

          {/* Portfolio & Case Studies Selector Panel */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#000080]" /> Portfolio & Case Studies ({availablePortfolioItems.length})
              </h4>
              <button 
                type="button"
                onClick={handleAddPortfolioMainPageToMenu}
                className="text-[10px] bg-[#000080]/10 hover:bg-[#000080]/20 text-[#000080] border border-[#000080]/30 font-bold px-2 py-1 rounded-lg transition-all flex items-center gap-1"
                title="Add entire Portfolio Mega Menu to Navigation"
>
                <Plus className="w-3 h-3" /> Add Portfolio Section
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500">Filter by Tag / Category:</span>
              <select
                value={portfolioTagFilter}
                onChange={(e) => setPortfolioTagFilter(e.target.value)}
                className="bg-white border border-slate-200 text-xs font-bold text-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-[#000080]">
                <option value="all">All Categories ({availablePortfolioItems.length})</option>
                {availablePortfolioCategories.map(cat => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Case Studies Checkbox List */}
            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar border border-slate-200/80 rounded-xl p-2 bg-white/50">
              {filteredCaseStudies.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">
                  No case studies found for this tag filter.
                </div>
              ) : (
                filteredCaseStudies.map((item, idx) => {
                  const key = item.slug || item.id;
                  const isChecked = selectedCaseStudies.includes(key);
                  return (
                    <div key={key} className="flex items-center gap-2 group">
                      <button type="button"
                        onClick={() => handleToggleCaseStudySelect(key)}
                        className={`flex-1 flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          isChecked ? 'bg-[#000080]/10 text-[#000066] border border-[#000080]/30' : 'hover:bg-slate-100/60 text-slate-700'
                        }`}>
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[#000080] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <span className="font-semibold truncate">{item.title}</span>
                        </div>
                        <span className="text-[9px] bg-[#000080]/5 text-[#000080] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                          {item.category || 'CASE STUDY'}
                        </span>
                      </button>
                      <DraggableSourceItem
                        id={`source-portfolio-${idx}`}
                        label={item.title}
                        icon={Briefcase}
                        data={{ 
                          label: item.title, 
                          href: `/portfolio/${item.slug || item.id}`, 
                          description: item.shortDescription,
                          badge: item.category,
                          type: 'portfolio' 
                        }}
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="space-y-1.5 pt-1.5 border-t border-slate-200/50">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add as Sub-menu of:</label>
              <select
                value={targetParentForPortfolio}
                onChange={(e) => setTargetParentForPortfolio(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#000080]">
                <option value="root">— None (Top Level) —</option>
                {getAllPotentialParents(items).map(p => (
                  <option key={p.id} value={p.id}>
                    {Array(p.depth).fill('  ').join('')}↳ {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button 
              type="button"
              disabled={selectedCaseStudies.length === 0}
              onClick={handleAddSelectedCaseStudiesToMenu}
              className="w-full py-2 bg-[#000080] hover:bg-[#000080] disabled:bg-slate-100 disabled:text-slate-600 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
>
              <Plus className="w-3.5 h-3.5" />
              Add Selected ({selectedCaseStudies.length}) Case Studies to Menu
            </button>

            {/* Services Selector Panel */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-[#000080]" /> Services ({services.length})
              </h4>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar border border-slate-200/80 rounded-xl p-2 bg-white/50">
                {services.map((service, idx) => {
                  const isChecked = selectedServices.includes(service.id);
                  return (
                    <div key={service.id} className="flex items-center gap-2 group">
                      <button type="button"
                        onClick={() => handleToggleServiceSelect(service.id)}
                        className={`flex-1 flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                          isChecked ? 'bg-[#000080]/10 text-[#000066] border border-[#000080]/30' : 'hover:bg-slate-100/60 text-slate-700'
                        }`}>
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[#000080] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <span className="font-semibold truncate text-[11px]">{service.title}</span>
                        </div>
                      </button>
                      <DraggableSourceItem
                        id={`source-service-${idx}`}
                        label={service.title}
                        icon={Menu}
                        data={{ 
                          label: service.title, 
                          href: service.link || `/services/${service.id}`, 
                          description: service.description,
                          type: 'service' 
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5 pt-1.5 border-t border-slate-200/50">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add as Sub-menu of:</label>
                <select
                  value={targetParentForServices}
                  onChange={(e) => setTargetParentForServices(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#000080]">
                  <option value="root">— None (Top Level) —</option>
                  {getAllPotentialParents(items).map(p => (
                    <option key={p.id} value={p.id}>
                      {Array(p.depth).fill('  ').join('')}↳ {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                type="button"
                disabled={selectedServices.length === 0}
                onClick={handleAddSelectedServicesToMenu}
                className="w-full py-2 bg-[#000080] hover:bg-[#000080] disabled:bg-slate-100 disabled:text-slate-600 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
>
                <Plus className="w-3.5 h-3.5" />
                Add Selected ({selectedServices.length}) Services to Menu
              </button>
            </div>

            {/* Portfolio Categories / Tags Sub-Section */}
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-[#000080]" /> Portfolio Categories & Tags
              </span>

              <div className="flex flex-wrap gap-1.5">
                {availablePortfolioCategories.map(cat => {
                  const isChecked = selectedCats.includes(cat.name);
                  return (
                    <button type="button"
                      key={cat.id}
                      onClick={() => handleToggleCatSelect(cat.name)}
                      className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 cursor-pointer ${
                        isChecked 
                          ? 'bg-[#000080] text-white border-[#000080]' 
                          : 'bg-white text-slate-700 border-slate-200 hover:border-[#000080]'
                      }`}>
                      {isChecked && <Check className="w-3 h-3" />}
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              {selectedCats.length> 0 && (
                <button 
                  type="button"
                  onClick={handleAddSelectedCategoriesToMenu}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
>
                  <Plus className="w-3 h-3" /> Add Selected Tag Pages ({selectedCats.length}) to Menu
                </button>
              )}
            </div>
          </div>

          {/* Custom Link Form */}
          <form onSubmit={handleAddCustomLink} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-[#000080]" /> Custom URL Link
            </h4>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Link Text</label>
              <input
                type="text"
                placeholder="e.g. Documentation"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">URL / Anchor</label>
              <input
                type="text"
                placeholder="e.g. https://themify.me"
                value={customHref}
                onChange={(e) => setCustomHref(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
              />
            </div>

            <div className="space-y-1.5 pt-1 border-t border-slate-200/50">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Add as Sub-menu of:</label>
              <select
                value={targetParentForCustom}
                onChange={(e) => setTargetParentForCustom(e.target.value)}
                className="w-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#000080]">
                <option value="root">— None (Top Level) —</option>
                {getAllPotentialParents(items).map(p => (
                  <option key={p.id} value={p.id}>
                    {Array(p.depth).fill('  ').join('')}↳ {p.label}
                  </option>
                ))}
              </select>
            </div>

            <button 
              type="submit"
              disabled={!customLabel.trim()}
              className="w-full py-2 bg-[#000080]/10 hover:bg-[#000080] hover:text-white disabled:opacity-50 text-[#000080] border border-[#000080]/20 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2">
              <Plus className="w-3.5 h-3.5" /> Add Custom Link
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Menu Structure Tree & Settings */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#000080]" /> Menu Structure
                </h4>
                <p className="text-[11px] text-slate-500">Drag items up/down or add nested dropdowns</p>
              </div>
              <span className="text-xs font-bold text-[#000080] bg-[#000080]/10 px-2.5 py-1 rounded-full border border-[#000080]/20">
                {items.length} Top Items
              </span>
            </div>

            <DroppableZone>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {items.map((item) => (
                    <SortableMenuItem
                      key={item.id}
                      item={item}
                      onRemove={handleRemoveItem}
                      onUpdate={handleUpdateItemField}
                      onAddSub={handleAddSubItem}
                      onToggleMega={handleToggleMega}
                      getEligibleParents={getEligibleParents}
                      findParentIdOfItem={findParentIdOfItem}
                      onMoveToParent={handleMoveToParent}
                    />
                  ))}
                </div>
              </SortableContext>
            </DroppableZone>

            {/* WordPress Menu Settings: Display Location Assignment */}
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5 text-[#000080]" /> Menu Display Locations
              </h5>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'header', label: 'Primary Header Navigation' },
                  { key: 'footerCompany', label: 'Footer Company Column' },
                  { key: 'footerServices', label: 'Footer Services Column' },
                  { key: 'footerLegal', label: 'Footer Legal Column' }
                ].map(loc => (
                  <label key={loc.key} className="flex items-center gap-2 text-xs text-slate-700 bg-white p-2 rounded-xl border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!displayLocations[loc.key]}
                      onChange={() => handleToggleDisplayLocation(loc.key)}
                      className="accent-[#000080] rounded"
                    />
                    <span>{loc.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </DndContext>
  );
}
