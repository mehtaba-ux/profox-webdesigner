import { supabase, isSupabaseConfigured } from './supabase';
import { MediaAsset } from '../types';

import coverImg from '../assets/images/how_to_choose_web_design_company_cover_1786884646364.jpg';
import visual1Img from '../assets/images/freelancer_vs_agency_comparison_1786884592585.jpg';
import visual3Img from '../assets/images/red_flags_vs_green_flags_1786884608036.jpg';
import visual5Img from '../assets/images/site_to_system_flow_1786884625148.jpg';

import coverCostImg from '../assets/images/website_cost_guide_cover_1786960747990.jpg';
import spectrumImg from '../assets/images/website_cost_spectrum_1786960762784.jpg';
import hiddenCostsImg from '../assets/images/website_hidden_costs_1786960776401.jpg';
import roiValueImg from '../assets/images/website_roi_value_1786960794301.jpg';

import wpVsCustomCover from '../assets/images/wp_vs_custom_tech_cover_1786961596252.jpg';
import decisionTreeImg from '../assets/images/wp_decision_flowchart_desk_1786961622503.jpg';
import customDevImg from '../assets/images/wp_custom_code_workspace_1786961640976.jpg';
import hybridArchImg from '../assets/images/wp_hybrid_architecture_screen_1786961664678.jpg';
import boardroomImg from '../assets/images/wp_site_to_system_boardroom_1786961685424.jpg';

const MEDIA_STORAGE_KEY = 'cms_media_library_assets';
const DELETED_MEDIA_STORAGE_KEY = 'cms_media_library_deleted_ids';

/**
 * Returns set of media IDs that were deleted by the user
 */
export function getDeletedMediaAssetIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_MEDIA_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    return new Set();
  }
}

/**
 * Records deleted media IDs in localStorage so they don't resurrect
 */
export function saveDeletedMediaAssetIds(ids: string[]): void {
  try {
    const current = getDeletedMediaAssetIds();
    ids.forEach(id => {
      if (id) current.add(id);
    });
    localStorage.setItem(DELETED_MEDIA_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch (err) {
    console.error('Error saving deleted media IDs:', err);
  }
}

// Default starter stock assets to ensure the library is never empty
const DEFAULT_STOCK_ASSETS: MediaAsset[] = [
  {
    id: 'blog-graphic-cover',
    name: 'How to Choose Web Design Company Cover',
    url: coverImg,
    type: 'image/jpeg',
    size: 580000,
    path: 'blog/how-to-choose-cover.jpg',
    created_at: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'blog-graphic-visual-1',
    name: 'Freelancer vs Studio vs Agency Table',
    url: visual1Img,
    type: 'image/jpeg',
    size: 490000,
    path: 'blog/freelancer-vs-agency.jpg',
    created_at: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'blog-graphic-visual-3',
    name: 'Web Design Red Flags vs Green Flags',
    url: visual3Img,
    type: 'image/jpeg',
    size: 510000,
    path: 'blog/red-flags-vs-green-flags.jpg',
    created_at: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'blog-graphic-visual-5',
    name: 'Site to System Customer Journey Flow',
    url: visual5Img,
    type: 'image/jpeg',
    size: 530000,
    path: 'blog/site-to-system-flow.jpg',
    created_at: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'blog-cost-cover',
    name: 'Website Cost 2026 Pricing Guide Cover',
    url: coverCostImg,
    type: 'image/jpeg',
    size: 560000,
    path: 'blog/website-cost-cover.jpg',
    created_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'blog-cost-spectrum',
    name: 'Website Cost Spectrum Breakdown Table',
    url: spectrumImg,
    type: 'image/jpeg',
    size: 520000,
    path: 'blog/website-cost-spectrum.jpg',
    created_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'blog-cost-hidden',
    name: 'Hidden Costs of Web Design Iceberg Visual',
    url: hiddenCostsImg,
    type: 'image/jpeg',
    size: 490000,
    path: 'blog/website-hidden-costs.jpg',
    created_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'blog-cost-roi',
    name: 'Website Cost vs Value Realized ROI Chart',
    url: roiValueImg,
    type: 'image/jpeg',
    size: 510000,
    path: 'blog/website-roi-value.jpg',
    created_at: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 'blog-wp-vs-custom-cover',
    name: 'WordPress vs Custom Website Guide Cover',
    url: wpVsCustomCover,
    type: 'image/jpeg',
    size: 720000,
    path: 'blog/wordpress-vs-custom-cover.jpg',
    created_at: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'blog-wp-decision-tree',
    name: 'CMS vs Custom Logic Decision Tree Flowchart',
    url: decisionTreeImg,
    type: 'image/jpeg',
    size: 660000,
    path: 'blog/decision-tree-flowchart.jpg',
    created_at: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'blog-wp-custom-dev-workspace',
    name: 'Custom Application Full-Stack Dev Workspace',
    url: customDevImg,
    type: 'image/jpeg',
    size: 710000,
    path: 'blog/custom-dev-workspace.jpg',
    created_at: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'blog-wp-hybrid-architecture',
    name: 'Hybrid Architecture Diagram (WordPress + Cloud App)',
    url: hybridArchImg,
    type: 'image/jpeg',
    size: 670000,
    path: 'blog/hybrid-architecture-diagram.jpg',
    created_at: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'blog-wp-site-to-system',
    name: 'Site to System Executive Strategy Presentation',
    url: boardroomImg,
    type: 'image/jpeg',
    size: 680000,
    path: 'blog/site-to-system-boardroom.jpg',
    created_at: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'stock-1',
    name: 'Corporate Office Headquarters',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200',
    type: 'image/jpeg',
    size: 450000,
    path: 'stock/office.jpg',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'stock-2',
    name: 'Digital Strategy & Analytics',
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    type: 'image/jpeg',
    size: 520000,
    path: 'stock/analytics.jpg',
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'stock-3',
    name: 'Team Collaboration Session',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    type: 'image/jpeg',
    size: 480000,
    path: 'stock/team.jpg',
    created_at: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 'stock-4',
    name: 'Professional Client Headshot 1',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600',
    type: 'image/jpeg',
    size: 210000,
    path: 'stock/avatar-1.jpg',
    created_at: '2026-01-04T00:00:00.000Z',
  },
  {
    id: 'stock-5',
    name: 'Professional Client Headshot 2',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600',
    type: 'image/jpeg',
    size: 195000,
    path: 'stock/avatar-2.jpg',
    created_at: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'stock-6',
    name: 'Swimming Pool Diagnostics & Leak Detection',
    url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&q=80&w=1200',
    type: 'image/jpeg',
    size: 610000,
    path: 'stock/pool.jpg',
    created_at: '2026-01-06T00:00:00.000Z',
  },
];

/**
 * Reads locally stored media assets from localStorage
 */
export function getLocalMediaAssets(): MediaAsset[] {
  try {
    const deletedIds = getDeletedMediaAssetIds();
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STOCK_ASSETS.filter(a => !deletedIds.has(a.id));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_STOCK_ASSETS.filter(a => !deletedIds.has(a.id));
    }
    
    // Filter out deleted assets from parsed
    const activeParsed = parsed.filter((a: MediaAsset) => a && a.id && !deletedIds.has(a.id));

    // Ensure all DEFAULT_STOCK_ASSETS that haven't been deleted exist in the list
    const existingIds = new Set(activeParsed.map((a: MediaAsset) => a.id));
    const missingDefaults = DEFAULT_STOCK_ASSETS.filter(a => !existingIds.has(a.id) && !deletedIds.has(a.id));
    if (missingDefaults.length > 0) {
      const merged = [...activeParsed, ...missingDefaults];
      saveLocalMediaAssets(merged);
      return merged;
    }
    return activeParsed;
  } catch (err) {
    console.error('Error reading local media assets:', err);
    return DEFAULT_STOCK_ASSETS;
  }
}

/**
 * Saves media assets to localStorage
 */
export function saveLocalMediaAssets(assets: MediaAsset[]): void {
  try {
    localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(assets));
  } catch (err) {
    console.error('Error saving local media assets:', err);
  }
}

/**
 * Fetches all media assets, seamlessly combining Supabase records (if configured)
 * and local persistent storage.
 */
export async function getStoredMediaAssets(): Promise<MediaAsset[]> {
  const deletedIds = getDeletedMediaAssetIds();
  let remoteAssets: MediaAsset[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('media')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        remoteAssets = (data as MediaAsset[]).filter(a => a && a.id && !deletedIds.has(a.id));
      }
    } catch (err) {
      console.warn('Supabase media fetch skipped:', err);
    }
  }

  const localAssets = getLocalMediaAssets();

  // Combine remote and local assets using unique ID or URL
  const combinedMap = new Map<string, MediaAsset>();

  // Add stock / local assets first
  for (const asset of localAssets) {
    if (asset && !deletedIds.has(asset.id)) {
      const key = asset.id || asset.url;
      combinedMap.set(key, asset);
    }
  }

  // Remote assets override/extend
  for (const asset of remoteAssets) {
    if (asset && !deletedIds.has(asset.id)) {
      const key = asset.id || asset.url;
      combinedMap.set(key, asset);
    }
  }

  const combined = Array.from(combinedMap.values());

  // Sort newest first
  combined.sort((a, b) => {
    const dateA = new Date(a.created_at || a.createdAt || 0).getTime();
    const dateB = new Date(b.created_at || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  return combined;
}

/**
 * Adds or updates a media asset in both local storage and Supabase (if configured)
 */
export async function addMediaAsset(assetData: Partial<MediaAsset>): Promise<MediaAsset> {
  const newAsset: MediaAsset = {
    id: assetData.id || `media-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    url: assetData.url || '',
    name: assetData.name || 'Uploaded File',
    type: assetData.type || 'image/png',
    size: assetData.size || 0,
    path: assetData.path || `upload/${Date.now()}`,
    created_at: assetData.created_at || assetData.createdAt || new Date().toISOString(),
    createdAt: assetData.created_at || assetData.createdAt || new Date().toISOString(),
  };

  // 1. Save to local persistent storage immediately
  const localAssets = getLocalMediaAssets();
  // Filter out duplicate url if exists
  const updatedLocal = [newAsset, ...localAssets.filter(a => a.id !== newAsset.id && a.url !== newAsset.url)];
  saveLocalMediaAssets(updatedLocal);

  // 2. Sync to Supabase if configured
  if (isSupabaseConfigured) {
    try {
      await supabase.from('media').upsert({
        id: newAsset.id,
        url: newAsset.url,
        name: newAsset.name,
        type: newAsset.type,
        size: newAsset.size,
        path: newAsset.path,
        created_at: newAsset.created_at,
      });
    } catch (err) {
      console.warn('Supabase media insert skipped:', err);
    }
  }

  return newAsset;
}

/**
 * Removes a media asset from local storage and Supabase (if configured)
 */
export async function deleteMediaAsset(assetId: string): Promise<void> {
  saveDeletedMediaAssetIds([assetId]);

  // 1. Delete from local storage
  const localAssets = getLocalMediaAssets();
  const filtered = localAssets.filter(a => a.id !== assetId);
  saveLocalMediaAssets(filtered);

  // 2. Delete from Supabase if configured
  if (isSupabaseConfigured) {
    try {
      await supabase.from('media').delete().eq('id', assetId);
    } catch (err) {
      console.warn('Supabase media delete skipped:', err);
    }
  }
}

/**
 * Removes multiple media assets from local storage and Supabase (if configured)
 */
export async function deleteMediaAssets(assetIds: string[]): Promise<void> {
  if (!assetIds || assetIds.length === 0) return;
  saveDeletedMediaAssetIds(assetIds);

  const idsSet = new Set(assetIds);

  // 1. Delete from local storage
  const localAssets = getLocalMediaAssets();
  const filtered = localAssets.filter(a => !idsSet.has(a.id));
  saveLocalMediaAssets(filtered);

  // 2. Delete from Supabase if configured
  if (isSupabaseConfigured) {
    try {
      await supabase.from('media').delete().in('id', assetIds);
    } catch (err) {
      console.warn('Supabase bulk media delete skipped:', err);
    }
  }
}
