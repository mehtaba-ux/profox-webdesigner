/**
 * Media Utilities for Blog & Portfolio Images
 * Ensures all blog cover images and inline article content images are served
 * reliably with fast local fallback and R2 compatibility.
 */

const R2_PUBLIC_DOMAIN = (import.meta.env.VITE_R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');
const R2_API_DOMAIN = (import.meta.env.VITE_R2_MEDIA_API_URL || '').replace(/\/$/, '');

// Static asset dictionary for guaranteed local resolution
const KNOWN_STATIC_ASSET_MAP: Record<string, string> = {
  'blog_cost_cover.jpg': '/blog_cost_cover.jpg',
  'blog_cost_spectrum.jpg': '/blog_cost_spectrum.jpg',
  'blog_hidden_costs.jpg': '/blog_hidden_costs.jpg',
  'blog_roi_value.jpg': '/blog_roi_value.jpg',
  'website-cost-cover.jpg': '/blog_cost_cover.jpg',
  'website-cost-spectrum.jpg': '/blog_cost_spectrum.jpg',
  'website-hidden-costs.jpg': '/blog_hidden_costs.jpg',
  'website-roi-value.jpg': '/blog_roi_value.jpg',
  'website_cost_guide_cover.jpg': '/blog_cost_cover.jpg',
  'website_cost_spectrum.jpg': '/blog_cost_spectrum.jpg',
  'website_hidden_costs.jpg': '/blog_hidden_costs.jpg',
  'website_roi_value.jpg': '/blog_roi_value.jpg',
  'website_cost_guide_cover_1786960747990.jpg': '/blog_cost_cover.jpg',
  'website_cost_spectrum_1786960762784.jpg': '/blog_cost_spectrum.jpg',
  'website_hidden_costs_1786960776401.jpg': '/blog_hidden_costs.jpg',
  'website_roi_value_1786960794301.jpg': '/blog_roi_value.jpg',
  'website_cost_guide_cover.webp': '/blog_cost_cover.jpg',
  'website_cost_spectrum.webp': '/blog_cost_spectrum.jpg',
  'website_hidden_costs.webp': '/blog_hidden_costs.jpg',
  'how_to_choose_web_design_company_cover.jpg': '/how_to_choose_web_design_company_cover.jpg',
  'freelancer_vs_agency_comparison.jpg': '/freelancer_vs_agency_comparison.jpg',
  'red_flags_vs_green_flags.jpg': '/red_flags_vs_green_flags.jpg',
  'site_to_system_flow.jpg': '/site_to_system_flow.jpg',
  'wordpress_vs_custom_cover.jpg': '/wordpress_vs_custom_cover.jpg',
  'decision_tree_flowchart.jpg': '/decision_tree_flowchart.jpg',
  'custom_dev_workspace.jpg': '/custom_dev_workspace.jpg',
  'hybrid_architecture_diagram.jpg': '/hybrid_architecture_diagram.jpg',
  'site_to_system_boardroom.jpg': '/site_to_system_boardroom.jpg',
  'wp_vs_custom_tech_cover_1786961596252.jpg': '/wordpress_vs_custom_cover.jpg',
  'wp_decision_flowchart_desk_1786961622503.jpg': '/decision_tree_flowchart.jpg',
  'wp_custom_code_workspace_1786961640976.jpg': '/custom_dev_workspace.jpg',
  'wp_hybrid_architecture_screen_1786961664678.jpg': '/hybrid_architecture_diagram.jpg',
  'wp_site_to_system_boardroom_1786961685424.jpg': '/site_to_system_boardroom.jpg',
  'website_cost_guide_cover': '/src/assets/images/website_cost_guide_cover_1786887307779.jpg',
  'website_cost_spectrum_2026': '/src/assets/images/website_cost_spectrum_2026_1786887321213.jpg',
  'website_hidden_costs_iceberg': '/src/assets/images/website_hidden_costs_iceberg_1786887334362.jpg',
  'website_roi_comparison': '/src/assets/images/website_roi_comparison_1786887347231.jpg',
  'website_redesign_signs_cover': '/src/assets/images/website_redesign_signs_cover_1786887365199.jpg',
  'website_performance_redesign': '/src/assets/images/website_performance_redesign_1786887379354.jpg',
  'mobile_responsive_redesign': '/src/assets/images/mobile_responsive_redesign_1786887392871.jpg',
};

/**
 * Converts any image path or URL to a functional image URL,
 * safely resolving local bundled assets, static public assets, and external CDNs.
 */
export function formatR2ImageUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. If it's a data URI or blob URI, return as-is
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  // 2. Check known static asset mapping by filename
  const filenameOnly = trimmed.split('?')[0].split('#')[0].split('/').pop() || '';
  if (KNOWN_STATIC_ASSET_MAP[filenameOnly]) {
    return KNOWN_STATIC_ASSET_MAP[filenameOnly];
  }

  // 3. Handle specific R2 domains (if configured)
  if (R2_PUBLIC_DOMAIN && trimmed.includes(R2_PUBLIC_DOMAIN.replace(/^https?:\/\//, ''))) {
    return trimmed;
  }
  
  if (R2_API_DOMAIN && trimmed.includes(R2_API_DOMAIN.replace(/^https?:\/\//, ''))) {
    return trimmed;
  }

  // 4. Handle generic profoxwebdesigner.com or media subdomain (if those were used historically)
  if (trimmed.includes('profoxwebdesigner.com')) {
    // If it's a known static asset, return local path
    const parts = trimmed.split('profoxwebdesigner.com/');
    if (parts[1]) {
      const cleanPath = parts[1].replace(/^api\/r2-media\//, '').replace(/^\//, '');
      const cleanFilename = cleanPath.split('/').pop() || '';
      if (KNOWN_STATIC_ASSET_MAP[cleanFilename]) {
        return KNOWN_STATIC_ASSET_MAP[cleanFilename];
      }
    }
    return trimmed;
  }

  // 4. Handle R2 API routes (/api/r2-media/...)
  if (trimmed.includes('/api/r2-media/')) {
    const key = trimmed.split('/api/r2-media/')[1];
    if (key) {
      const cleanFilename = key.split('/').pop() || '';
      if (KNOWN_STATIC_ASSET_MAP[cleanFilename]) {
        return KNOWN_STATIC_ASSET_MAP[cleanFilename];
      }
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  // 5. If it's a local Vite development/bundle/public asset path (starting with /), preserve it
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  if (trimmed.startsWith('src/assets/')) {
    return `/${trimmed}`;
  }

  // 6. If it's an external URL (e.g. Unsplash, external CDN), return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // 7. Relative plain filename (e.g. "blog_cost_cover.jpg") -> "/blog_cost_cover.jpg"
  return `/${trimmed}`;
}

/**
 * Scans an HTML article body string and rewrites all <img> src attributes
 * to ensure all image paths are cleanly resolved and load reliably.
 */
export function processBlogContentR2Images(htmlContent: string): string {
  if (!htmlContent) return '';
  
  return htmlContent.replace(/<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, prefix, src, suffix) => {
    const resolvedUrl = formatR2ImageUrl(src);
    const hasLoading = /loading=["']/i.test(match);
    const loadingAttr = hasLoading ? '' : 'loading="lazy"';
    return `<img ${prefix}src="${resolvedUrl}" ${loadingAttr} ${suffix}>`;
  });
}

