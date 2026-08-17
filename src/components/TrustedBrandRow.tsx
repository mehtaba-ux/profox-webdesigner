import React, { createElement } from 'react';

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

  // Support repeating the logos list to make sure the slider is dense enough to scroll seamlessly
  const sliderLogos = logos.length < 8 ? [...logos, ...logos, ...logos, ...logos] : logos;

  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8 ${className}`}>
      <div className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div 
        className="relative flex-1 overflow-hidden py-1"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 6%, #000 94%, transparent 100%)'
        }}
      >
        <div className="flex w-full items-center">
          <div className="flex min-w-max flex-shrink-0 items-center justify-around gap-12 px-6 animate-scroll-logos">
            {sliderLogos.map((item, index) => (
              <React.Fragment key={`slide-1-${index}`}>
                {createElement(BrandLogo, { item, logoClassName })}
              </React.Fragment>
            ))}
          </div>
          <div className="flex min-w-max flex-shrink-0 items-center justify-around gap-12 px-6 animate-scroll-logos">
            {sliderLogos.map((item, index) => (
              <React.Fragment key={`slide-2-${index}`}>
                {createElement(BrandLogo, { item, logoClassName })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

