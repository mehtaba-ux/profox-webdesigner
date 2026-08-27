import React, { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Upload } from 'lucide-react';
import { uploadOptimizedFile } from '../../../lib/optimizedUpload';
import AppAvatar from './AppAvatar';

interface ProfileImageUploaderProps {
  value?: string | null;
  name?: string | null;
  onChange: (url: string) => void;
  disabled?: boolean;
  compact?: boolean;
  professionalRequired?: boolean;
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be read.'));
    };
    image.src = objectUrl;
  });
}

export default function ProfileImageUploader({
  value,
  name,
  onChange,
  disabled = false,
  compact = false,
  professionalRequired = false
}: ProfileImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const chooseImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const allowedTypes = professionalRequired
      ? ['image/jpeg', 'image/png', 'image/webp']
      : ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError(professionalRequired
        ? 'Upload a professional JPG, PNG or WebP headshot. Animated GIFs are not accepted for Sales profiles.'
        : 'Choose a JPG, PNG, WebP or GIF image.');
      return;
    }

    setUploading(true);
    setError('');
    try {
      if (professionalRequired) {
        const dimensions = await imageDimensions(file);
        if (dimensions.width < 320 || dimensions.height < 320) {
          throw new Error('Use a clear professional photo that is at least 320 × 320 pixels.');
        }
      }
      const result = await uploadOptimizedFile(file, {
        purpose: 'profile',
        registerInMediaLibrary: false,
      });
      onChange(result.url);
    } catch (uploadError: any) {
      setError(uploadError?.message || 'The profile image could not be uploaded.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-2xl border ${professionalRequired ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50/70'} ${compact ? 'p-3' : 'p-4'}`}>
      <input
        ref={inputRef}
        type="file"
        accept={professionalRequired ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,image/gif'}
        className="hidden"
        onChange={chooseImage}
      />
      <div className="flex items-center gap-4">
        <div className="relative">
          <AppAvatar name={name} src={value} size={compact ? 'lg' : 'xl'} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#000080] text-white shadow-sm">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-900">
            <span>{professionalRequired ? 'Professional profile photo' : 'Profile photo'}</span>
            {professionalRequired && <span className="rounded-full bg-[#000080] px-2 py-0.5 text-[9px] uppercase tracking-wide text-white">Required</span>}
          </div>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">
            {professionalRequired
              ? 'Use a recent head-and-shoulders photo with your face clearly visible, good lighting, a clean background and professional appearance. No logos, group photos or animated images.'
              : 'This image is reused across Team, chat, calendar and profile views.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#000080] px-3 text-[11px] font-black text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
            </button>
            {value && !professionalRequired && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => onChange('')}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
