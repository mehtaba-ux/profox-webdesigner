import React from 'react';
import { useCMS } from '../lib/CMSProvider';
import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  light?: boolean;
}

export default function Logo({ className = '', light = false }: LogoProps) {
  const { content } = useCMS();
  const theme = content?.theme || {};
  const siteSettings = content?.siteSettings || {};
  const customLogoUrl = theme.logoUrl;
  const businessName = siteSettings.businessName || 'PROFOX';
  const tagline = siteSettings.website ? new URL(siteSettings.website).hostname.toUpperCase().replace('WWW.', '') : 'WEBDESIGNER';

  // If a custom logo image has been uploaded, render it directly
  if (customLogoUrl) {
    return (
      <img 
        src={customLogoUrl} 
        alt={businessName} 
        className={cn(className, "transition-all duration-300")}
        style={{ 
          objectFit: 'contain', 
          maxHeight: '100%',
          filter: light ? 'brightness(0) invert(1)' : 'none'
        }}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Brand Colors:
  // Navy: #000080 (Dark) / #FFFFFF (Light)
  // Vivid Red: #FF0E0E
  
  const textColor = light ? '#FFFFFF' : '#000080';
  const taglineColor = light ? 'rgba(255, 255, 255, 0.85)' : '#555B6E';
  const accentColor = '#FF0E0E';

  return (
    <svg 
      viewBox="0 0 280 64" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className, "transition-all duration-300")}
      style={{ height: '100%', width: 'auto' }}
    >
      {/* Gradients */}
      <defs>
        <linearGradient id={light ? "profoxLogoGradientLight" : "profoxLogoGradientDark"} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={textColor} />
          <stop offset="100%" stopColor={light ? '#E0E7FF' : '#2A0896'} />
        </linearGradient>
        <linearGradient id="chevronRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accentColor} />
          <stop offset="100%" stopColor="#A80000" />
        </linearGradient>
        <linearGradient id={light ? "chevronBlueLight" : "chevronBlueDark"} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? '#3B82F6' : '#000080'} />
          <stop offset="100%" stopColor={light ? '#60A5FA' : '#2A0896'} />
        </linearGradient>
      </defs>

      {/* sloped text dynamic business name */}
      <text
        x="10"
        y="45"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="36"
        fontStyle="italic"
        fill={`url(#${light ? "profoxLogoGradientLight" : "profoxLogoGradientDark"})`}
        letterSpacing="-1.5px"
      >
        {businessName.toUpperCase().split(' ')[0]}
      </text>

      {/* Stylized Double Wings / Chevron mark on the right */}
      <g transform="translate(175, 4)">
        {/* Left red wing pointing up-right */}
        <path 
          d="M 5 44 L 38 12 L 48 20 L 22 48 Z" 
          fill="url(#chevronRed)" 
          opacity="0.95"
        />
        {/* Right wing pointing down-right overlapping */}
        <path 
          d="M 28 12 L 64 36 L 52 46 L 16 22 Z" 
          fill={`url(#${light ? "chevronBlueLight" : "chevronBlueDark"})`} 
          opacity="0.9"
        />
        {/* Fine intersection/shadow accent */}
        <path 
          d="M 22 24 L 38 12 L 28 12 Z" 
          fill="#FF0E0E" 
        />
      </g>

      {/* Tagline tag */}
      <text
        x="11"
        y="58"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="600"
        fontSize="10"
        letterSpacing="3.5px"
        fill={taglineColor}
      >
        {businessName.toUpperCase().split(' ').slice(1).join(' ') || tagline}
      </text>
    </svg>
  );
}
