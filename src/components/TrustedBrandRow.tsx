import { createElement } from 'react';

interface TrustedBrandRowProps {
  logos?: any[];
  title?: string;
  className?: string;
  logoClassName?: string;
}

function BrandLogo({ item, logoClassName = '' }: { item: any; logoClassName?: string }) {
  const name = typeof item === 'string' ? item : item?.name || item?.value || 'Trusted brand';
  if (typeof item === 'object' && item?.type === 'image' && item?.image) {
    return <img src={item.image} alt={name} className={`h-8 max-w-[120px] object-contain grayscale opacity-65 transition-all hover:grayscale-0 hover:opacity-100 sm:h-9 ${logoClassName}`} loading="lazy" />;
  }
  return <span className={`whitespace-nowrap text-lg font-bold tracking-[-0.03em] text-slate-700 opacity-65 transition-opacity hover:opacity-100 sm:text-xl ${logoClassName}`}>{typeof item === 'string' ? item : item?.value || item?.name}</span>;
}

export default function TrustedBrandRow({ logos = [], title = 'Trusted by:', className = '', logoClassName = '' }: TrustedBrandRowProps) {
  if (!Array.isArray(logos) || logos.length === 0) return null;
  return <div className={`flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-9 ${className}`}><div className="shrink-0 text-sm font-medium text-slate-500">{title}</div><div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-5 sm:gap-x-10">{logos.map((item, index) => createElement(BrandLogo, { key: `${typeof item === 'string' ? item : item?.name || item?.value || 'brand'}-${index}`, item, logoClassName }))}</div></div>;
}
