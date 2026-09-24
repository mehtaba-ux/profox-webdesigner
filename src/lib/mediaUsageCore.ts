import type { MediaAsset } from '../types';

export type MediaUsageKind = 'Page' | 'Template' | 'Post' | 'Portfolio' | 'Review' | 'CMS section' | 'Media library';

export interface MediaAssetUsage {
  kind: MediaUsageKind;
  sourceId: string;
  sourceTitle: string;
  fieldPath: string;
  fieldLabel: string;
}

export interface ContentRow {
  id: string;
  data: unknown;
}

export interface SearchTarget {
  kind: MediaUsageKind;
  sourceId: string;
  sourceTitle: string;
  value: unknown;
  pathPrefix?: string;
}

export const titleFrom = (value: unknown, fallback: string): string => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ['title', 'name', 'heading', 'slug', 'id']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
};

const humanize = (value: string): string => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^./, (character) => character.toUpperCase());

export const formatMediaUsagePath = (path: string): string => {
  const parts = path
    .replace(/^data\.?/, '')
    .split('.')
    .filter(Boolean)
    .flatMap((part) => {
      const output: string[] = [];
      const property = part.replace(/\[\d+\]/g, '');
      if (property) output.push(humanize(property));
      for (const match of part.matchAll(/\[(\d+)\]/g)) {
        output.push(`Item ${Number(match[1]) + 1}`);
      }
      return output;
    });

  return parts.length ? parts.join(' → ') : 'Asset field';
};

const assetNeedles = (asset: MediaAsset): string[] => {
  const values = new Set<string>();
  const add = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    values.add(trimmed);
    try {
      values.add(decodeURIComponent(trimmed));
    } catch {
      // A malformed percent sequence should not stop a deletion safety check.
    }
  };

  add(asset.url);
  add(asset.url?.split(/[?#]/, 1)[0]);

  if (asset.path && !asset.path.startsWith('db_base64_')) {
    const cleanPath = asset.path.replace(/^\/+/, '');
    const bucket = asset.type.startsWith('image/') ? 'media' : 'documents';
    add(`/${cleanPath}`);
    add(`/${bucket}/${cleanPath}`);
  }

  return [...values].filter((value) => value.length >= 8);
};

const stringReferencesAsset = (value: string, needles: string[]): boolean => needles.some((needle) => {
  if (value === needle) return true;
  if (needle.startsWith('/')) return value.includes(needle);
  return value.includes(needle);
});

const collectMatchingPaths = (
  value: unknown,
  needles: string[],
  path: string,
  matches: Set<string>,
): void => {
  if (typeof value === 'string') {
    if (stringReferencesAsset(value, needles)) matches.add(path || 'value');
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectMatchingPaths(item, needles, `${path}[${index}]`, matches));
    return;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      collectMatchingPaths(item, needles, path ? `${path}.${key}` : key, matches);
    });
  }
};

export const buildMediaContentTargets = (rows: ContentRow[]): SearchTarget[] => rows.flatMap<SearchTarget>((row): SearchTarget[] => {
  const items = Array.isArray(row.data) ? row.data : null;

  if (row.id === 'customPages' && items) {
    return items.map((item, index) => ({
      kind: 'Page' as const,
      sourceId: String((item as Record<string, unknown>)?.id || `custom-page-${index + 1}`),
      sourceTitle: titleFrom(item, `Custom page ${index + 1}`),
      value: item,
    }));
  }

  if (row.id === 'template_blueprints' && items) {
    return items.map((item, index) => ({
      kind: 'Template' as const,
      sourceId: String((item as Record<string, unknown>)?.id || `template-${index + 1}`),
      sourceTitle: titleFrom(item, `Template ${index + 1}`),
      value: item,
    }));
  }

  if (row.id === 'portfolio_items' && items) {
    return items.map((item, index) => ({
      kind: 'Portfolio' as const,
      sourceId: String((item as Record<string, unknown>)?.id || `portfolio-${index + 1}`),
      sourceTitle: titleFrom(item, `Portfolio item ${index + 1}`),
      value: item,
    }));
  }

  if (row.id === 'feedback_submissions' && items) {
    return items.map((item, index) => ({
      kind: 'Review' as const,
      sourceId: String((item as Record<string, unknown>)?.id || `review-${index + 1}`),
      sourceTitle: titleFrom(item, `Customer review ${index + 1}`),
      value: item,
    }));
  }

  return [{
    kind: 'CMS section' as const,
    sourceId: row.id,
    sourceTitle: humanize(row.id),
    value: row.data,
    pathPrefix: 'data',
  }];
});

export function scanMediaAssetTargets(asset: MediaAsset, targets: SearchTarget[]): MediaAssetUsage[] {
  const needles = assetNeedles(asset);
  if (!needles.length) throw new Error('This asset has no stable URL or storage path to verify.');

  const usages: MediaAssetUsage[] = [];
  for (const target of targets) {
    const paths = new Set<string>();
    collectMatchingPaths(target.value, needles, target.pathPrefix || '', paths);
    paths.forEach((fieldPath) => {
      usages.push({
        kind: target.kind,
        sourceId: target.sourceId,
        sourceTitle: target.sourceTitle,
        fieldPath,
        fieldLabel: formatMediaUsagePath(fieldPath),
      });
    });
  }

  return usages.filter((usage, index, all) => all.findIndex((candidate) => (
    candidate.kind === usage.kind
    && candidate.sourceId === usage.sourceId
    && candidate.fieldPath === usage.fieldPath
  )) === index);
}
