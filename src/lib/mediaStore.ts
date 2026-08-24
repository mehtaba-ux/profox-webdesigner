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
];

const UNWANTED_DUMMY_PATTERNS = [
  'stock-1', 'stock-2', 'stock-3', 'stock-4', 'stock-5', 'stock-6',
  'jackson design award', 'jackson design consultation',
  'quik car buyers', 'quik car 3-step', 'quik car instant quote', 'quik car rating',
  'hispanic research center', 'hispanic research digital', 'hispanic research faceted', 'hispanic research citation',
  'lambert dynamics engineering', 'lambert dynamics interactive',
  'corporate office headquarters', 'digital strategy & analytics', 'team collaboration session',
  'professional client headshot', 'swimming pool diagnostics'
];

/**
 * Identifies unwanted generated dummy / placeholder assets
 */
export function isUnwantedDummyAsset(asset: Partial<MediaAsset>): boolean {
  if (!asset) return true;
  const id = (asset.id || '').toLowerCase();
  const name = (asset.name || '').toLowerCase();
  const url = (asset.url || '').toLowerCase();
  const path = (asset.path || '').toLowerCase();

  if (id.startsWith('stock-')) return true;
  if (path.startsWith('stock/')) return true;
  if (url.includes('photo-1460925895917-afdab827c52f')) return true;
  if (url.includes('photo-1497366216548')) return true;
  if (url.includes('photo-1522071820081')) return true;
  if (url.includes('photo-1534528741775')) return true;
  if (url.includes('photo-1507003211169')) return true;
  if (url.includes('photo-1576013551627')) return true;

  for (const pattern of UNWANTED_DUMMY_PATTERNS) {
    if (name.includes(pattern) || id.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Reads locally stored media assets from localStorage
 */
export function getLocalMediaAssets(): MediaAsset[] {
  try {
    const deletedIds = getDeletedMediaAssetIds();
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STOCK_ASSETS.filter(a => !deletedIds.has(a.id) && !isUnwantedDummyAsset(a));
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_STOCK_ASSETS.filter(a => !deletedIds.has(a.id) && !isUnwantedDummyAsset(a));
    }
    
    // Filter out deleted assets and unwanted dummy placeholders
    const activeParsed = parsed.filter(
      (a: MediaAsset) => a && a.id && !deletedIds.has(a.id) && !isUnwantedDummyAsset(a)
    );

    // Update active parsed with any refreshed URLs from DEFAULT_STOCK_ASSETS
    const defaultMap = new Map(DEFAULT_STOCK_ASSETS.map(d => [d.id, d]));
    const updatedActive = activeParsed.map((a: MediaAsset) => {
      const defaultItem = defaultMap.get(a.id);
      if (defaultItem) {
        return {
          ...a,
          url: defaultItem.url,
          path: defaultItem.path || a.path,
          name: defaultItem.name || a.name,
          size: defaultItem.size || a.size
        };
      }
      return a;
    });

    // Ensure all DEFAULT_STOCK_ASSETS that haven't been deleted exist in the list
    const existingIds = new Set(updatedActive.map((a: MediaAsset) => a.id));
    const missingDefaults = DEFAULT_STOCK_ASSETS.filter(
      a => !existingIds.has(a.id) && !deletedIds.has(a.id) && !isUnwantedDummyAsset(a)
    );
    const merged = [...updatedActive, ...missingDefaults];
    saveLocalMediaAssets(merged);
    return merged;
  } catch (err) {
    console.error('Error reading local media assets:', err);
    return DEFAULT_STOCK_ASSETS.filter(a => !isUnwantedDummyAsset(a));
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
  const dummyRemoteIds: string[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('media')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        for (const a of data as MediaAsset[]) {
          if (!a || !a.id || deletedIds.has(a.id)) continue;
          if (isUnwantedDummyAsset(a)) {
            dummyRemoteIds.push(a.id);
          } else {
            remoteAssets.push(a);
          }
        }
      }

      // Automatically clean up dummy assets from Supabase backend in the background
      if (dummyRemoteIds.length > 0) {
        supabase.from('media').delete().in('id', dummyRemoteIds).then(() => {
          console.info(`Cleaned up ${dummyRemoteIds.length} dummy assets from Supabase media table.`);
        }).catch(err => {
          console.warn('Could not delete dummy media from Supabase:', err);
        });
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
    if (asset && !deletedIds.has(asset.id) && !isUnwantedDummyAsset(asset)) {
      const key = asset.id || asset.url;
      combinedMap.set(key, asset);
    }
  }

  // Remote assets override/extend
  for (const asset of remoteAssets) {
    if (asset && !deletedIds.has(asset.id) && !isUnwantedDummyAsset(asset)) {
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
 * Explicitly cleans up and deletes all dummy/placeholder assets from both
 * Supabase database and local storage.
 */
export async function purgeUnwantedDummyMediaAssets(): Promise<number> {
  let purgedCount = 0;
  try {
    // 1. Clean localStorage
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((a: MediaAsset) => !isUnwantedDummyAsset(a));
        purgedCount += (parsed.length - cleaned.length);
        saveLocalMediaAssets(cleaned);
      }
    }

    // 2. Clean Supabase media table
    if (isSupabaseConfigured) {
      const { data } = await supabase.from('media').select('id, name, url, path');
      if (Array.isArray(data)) {
        const dummyIds = data.filter(isUnwantedDummyAsset).map(a => a.id);
        if (dummyIds.length > 0) {
          await supabase.from('media').delete().in('id', dummyIds);
          purgedCount += dummyIds.length;
        }
      }
    }
  } catch (err) {
    console.error('Error during dummy asset purge:', err);
  }
  return purgedCount;
}

/**
 * Adds or updates a media asset in both local storage and Supabase (if configured)
 */
export async function addMediaAsset(assetData: Partial<MediaAsset>): Promise<MediaAsset> {
  const newAsset: MediaAsset = {
    id: assetData.id || crypto.randomUUID(),
    url: assetData.url || '',
    name: assetData.name || 'Uploaded File',
    type: assetData.type || 'image/png',
    size: assetData.size || 0,
    path: assetData.path || `upload/${Date.now()}`,
    created_at: assetData.created_at || assetData.createdAt || new Date().toISOString(),
    createdAt: assetData.created_at || assetData.createdAt || new Date().toISOString(),
  };

  // Persist remotely first so the UI never reports an R2 upload as registered
  // when its canonical media record was rejected.
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('media').upsert({
      id: newAsset.id,
      url: newAsset.url,
      name: newAsset.name,
      type: newAsset.type,
      size: newAsset.size,
      path: newAsset.path,
      created_at: newAsset.created_at,
    });
    if (error) throw new Error(error.message || 'The media record could not be saved.');
  }

  const localAssets = getLocalMediaAssets();
  const updatedLocal = [newAsset, ...localAssets.filter(a => a.id !== newAsset.id && a.url !== newAsset.url)];
  saveLocalMediaAssets(updatedLocal);

  return newAsset;
}

/**
 * Removes a media asset from local storage and Supabase (if configured)
 */
export async function deleteMediaAsset(assetId: string): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('media').delete().eq('id', assetId);
    if (error) throw new Error(error.message || 'The media record could not be deleted.');
  }

  saveDeletedMediaAssetIds([assetId]);
  const localAssets = getLocalMediaAssets();
  saveLocalMediaAssets(localAssets.filter(a => a.id !== assetId));
}

/**
 * Removes multiple media assets from local storage and Supabase (if configured)
 */
export async function deleteMediaAssets(assetIds: string[]): Promise<void> {
  if (!assetIds || assetIds.length === 0) return;
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('media').delete().in('id', assetIds);
    if (error) throw new Error(error.message || 'The media records could not be deleted.');
  }

  saveDeletedMediaAssetIds(assetIds);
  const idsSet = new Set(assetIds);
  const localAssets = getLocalMediaAssets();
  saveLocalMediaAssets(localAssets.filter(a => !idsSet.has(a.id)));
}
