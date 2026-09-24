import React, { useEffect, useState } from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-7 w-7 text-[9px]',
  sm: 'h-9 w-9 text-[10px]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-14 w-14 text-sm',
  xl: 'h-20 w-20 text-lg'
};

function initials(name?: string | null) {
  return (name || 'ProFox User')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'PF';
}

interface AppAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}

export default function AppAvatar({
  name,
  src,
  size = 'md',
  className = '',
  alt
}: AppAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src?.trim()) && !failed;

  useEffect(() => setFailed(false), [src]);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#e8edff] font-black text-[#000080] shadow-sm ring-1 ring-slate-200 ${SIZE_CLASSES[size]} ${className}`}
      aria-label={alt || name || 'Profile image'}
    >
      {showImage ? (
        <img
          src={src!.trim()}
          alt={alt || name || 'Profile'}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
