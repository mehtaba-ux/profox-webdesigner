import { supabase } from './supabase';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const MIN_IMAGE_BYTES_TO_OPTIMIZE = 40 * 1024;
const MIN_SAVING_RATIO = 0.05;
const OPTIMIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const R2_MEDIA_API = (import.meta.env.VITE_R2_MEDIA_API_URL || 'https://media-api.profoxwebdesigner.com').replace(/\/$/, '');

export interface OptimizedUploadResult {
  url: string;
  path: string;
  bucket: 'media' | 'documents';
  name: string;
  type: string;
  originalSize: number;
  uploadedSize: number;
  savedBytes: number;
  optimized: boolean;
}

interface PreparedFile {
  data: Blob | File;
  name: string;
  type: string;
  originalSize: number;
  optimized: boolean;
}

function extensionForMimeType(type: string, fallbackName: string) {
  const known: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };

  return known[type] || fallbackName.split('.').pop()?.toLowerCase() || 'bin';
}

function safeBaseName(name: string) {
  const withoutExtension = name.replace(/\.[^/.]+$/, '');
  return withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'asset';
}

function makeStoragePath(name: string, type: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  if (typeof crypto === 'undefined' || !('randomUUID' in crypto)) {
    throw new Error('Secure file naming is not supported by this browser. Please update it before uploading.');
  }
  const random = crypto.randomUUID().slice(0, 8);
  const extension = extensionForMimeType(type, name);
  return `${year}/${month}/${Date.now()}-${random}-${safeBaseName(name)}.${extension}`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImage(file: File) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be decoded.'));
      element.src = objectUrl;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(image, 0, 0, width, height);
      },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareImage(file: File): Promise<PreparedFile> {
  if (!OPTIMIZABLE_IMAGE_TYPES.has(file.type) || file.size < MIN_IMAGE_BYTES_TO_OPTIMIZE) {
    return { data: file, name: file.name, type: file.type, originalSize: file.size, optimized: false };
  }

  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Image processing is not supported by this browser.');

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    image.draw(context, width, height);

    const optimized = await canvasToBlob(canvas, 'image/webp', 0.84);
    const minimumSaving = Math.ceil(file.size * MIN_SAVING_RATIO);
    if (!optimized || optimized.type !== 'image/webp' || file.size - optimized.size < minimumSaving) {
      return { data: file, name: file.name, type: file.type, originalSize: file.size, optimized: false };
    }

    return {
      data: optimized,
      name: `${safeBaseName(file.name)}.webp`,
      type: 'image/webp',
      originalSize: file.size,
      optimized: true,
    };
  } catch (error) {
    console.warn('Image optimization was skipped because decoding failed.', error);
    return { data: file, name: file.name, type: file.type, originalSize: file.size, optimized: false };
  }
}

async function prepareFile(file: File): Promise<PreparedFile> {
  const isImage = file.type.startsWith('image/');
  const allowed = isImage ? ALLOWED_IMAGE_TYPES.has(file.type) : ALLOWED_DOCUMENT_TYPES.has(file.type);
  if (!allowed) {
    throw new Error('This file type is not supported. Upload a standard image, PDF, Office document, text file, or CSV.');
  }
  const sizeLimit = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size > sizeLimit) {
    const limitMb = Math.round(sizeLimit / 1024 / 1024);
    throw new Error(`This file is larger than the ${limitMb} MB upload limit.`);
  }

  if (isImage) return prepareImage(file);

  // PDF and modern Office files already contain compressed streams. Rewriting them
  // in a browser can invalidate signatures, forms, links, or accessibility data.
  return { data: file, name: file.name, type: file.type || 'application/octet-stream', originalSize: file.size, optimized: false };
}

export async function uploadOptimizedFile(file: File): Promise<OptimizedUploadResult> {
  const prepared = await prepareFile(file);
  const bucket = file.type.startsWith('image/') ? 'media' : 'documents';
  const path = makeStoragePath(prepared.name, prepared.type);

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in again before uploading media.');

  const response = await fetch(`${R2_MEDIA_API}/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': prepared.type,
    },
    body: prepared.data,
  });
  const uploaded = await response.json().catch(() => null) as { url?: string; path?: string; size?: number; error?: string } | null;
  if (!response.ok || !uploaded?.url) throw new Error(uploaded?.error || `R2 upload failed with status ${response.status}.`);

  const storagePath = uploaded.path || path;
  const publicUrl = uploaded.url;

  const { error: metadataError } = await supabase.from('media').insert({
    url: publicUrl,
    name: prepared.name,
    type: prepared.type,
    size: prepared.data.size,
    path: storagePath,
    created_at: new Date().toISOString(),
  });

  if (metadataError) {
    await fetch(`${R2_MEDIA_API}/?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(storagePath)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    throw new Error(`The file was not saved to the media library: ${metadataError.message}`);
  }

  return {
    url: publicUrl,
    path: storagePath,
    bucket,
    name: prepared.name,
    type: prepared.type,
    originalSize: prepared.originalSize,
    uploadedSize: prepared.data.size,
    savedBytes: Math.max(0, prepared.originalSize - prepared.data.size),
    optimized: prepared.optimized,
  };
}
