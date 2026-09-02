import React from 'react';

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

function normalizedHref(value: string) {
  const candidate = value.startsWith('www.') ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function appendCommunicationUrl(current: string) {
  const raw = window.prompt('Paste an http:// or https:// URL');
  if (!raw) return current;
  const trimmed = raw.trim();
  const href = normalizedHref(trimmed);
  if (!href) throw new Error('Enter a valid http:// or https:// URL.');
  return `${current}${current.trim() ? '\n' : ''}${href}`;
}

export default function RichMessageText({ text, className = '', inverse = false }: { text: string; className?: string; inverse?: boolean }) {
  const parts = String(text || '').split(URL_PATTERN);
  return <p className={`whitespace-pre-wrap break-words ${className}`}>
    {parts.map((part, index) => {
      const href = normalizedHref(part);
      if (!href) return <React.Fragment key={`${index}-${part.slice(0, 12)}`}>{part}</React.Fragment>;
      return <a key={`${index}-${href}`} href={href} target="_blank" rel="noopener noreferrer" className={`break-all font-bold underline underline-offset-2 ${inverse ? 'text-white' : 'text-[#000080]'}`}>{part}</a>;
    })}
  </p>;
}
