import { supabase } from './supabase';
import type { MediaAsset } from '../types';
import {
  buildMediaContentTargets,
  scanMediaAssetTargets,
  titleFrom,
  type ContentRow,
  type MediaAssetUsage,
  type SearchTarget,
} from './mediaUsageCore';

export type { MediaAssetUsage, MediaUsageKind } from './mediaUsageCore';

const ensureQuerySucceeded = <T>(label: string, data: T[] | null, error: { message?: string } | null): T[] => {
  if (error) throw new Error(`Could not verify ${label}: ${error.message || 'unknown database error'}`);
  return data || [];
};

/**
 * Searches every editable CMS content source before an R2 object can be deleted.
 * This intentionally fails closed: if any source cannot be checked, deletion is blocked.
 */
export async function findMediaAssetUsage(asset: MediaAsset): Promise<MediaAssetUsage[]> {
  const [contentResult, pagesResult, postsResult, mediaResult] = await Promise.all([
    supabase.from('content').select('id,data'),
    supabase.from('pages').select('*'),
    supabase.from('posts').select('*'),
    supabase.from('media').select('*'),
  ]);

  const content = ensureQuerySucceeded<ContentRow>('CMS content', contentResult.data, contentResult.error);
  const pages = ensureQuerySucceeded<Record<string, unknown>>('pages', pagesResult.data, pagesResult.error);
  const posts = ensureQuerySucceeded<Record<string, unknown>>('posts', postsResult.data, postsResult.error);
  const media = ensureQuerySucceeded<Record<string, unknown>>('media library records', mediaResult.data, mediaResult.error);

  const targets: SearchTarget[] = [
    ...buildMediaContentTargets(content),
    ...pages.map((page, index) => ({
      kind: 'Page' as const,
      sourceId: String(page.id || `page-${index + 1}`),
      sourceTitle: titleFrom(page, `Page ${index + 1}`),
      value: page,
    })),
    ...posts.map((post, index) => ({
      kind: 'Post' as const,
      sourceId: String(post.id || `post-${index + 1}`),
      sourceTitle: titleFrom(post, `Post ${index + 1}`),
      value: post,
    })),
    ...media
      .filter((record) => String(record.id) !== asset.id)
      .map((record, index) => ({
        kind: 'Media library' as const,
        sourceId: String(record.id || `media-${index + 1}`),
        sourceTitle: titleFrom(record, `Media record ${index + 1}`),
        value: record,
      })),
  ];

  return scanMediaAssetTargets(asset, targets);
}
