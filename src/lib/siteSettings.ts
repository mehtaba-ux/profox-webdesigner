export const SITE_SETTINGS_DEFAULTS = {
  businessName: 'ProFox Webdesigner',
  website: 'https://www.profoxwebdesigner.com/',
  contactEmail: 'contact@profoxwebdesigner.com',
  supportEmail: 'support@profoxwebdesigner.com',
  contactPhone: '',
  securityContact: 'support@profoxwebdesigner.com',
  address: 'India',
  businessAddress: 'ProFox Headquarters, India',
  maintenanceMode: {
    enabled: false,
    title: "We're Currently Enhancing Our Platform",
    message: "Our team is actively performing scheduled updates and deploying new features. The site will be back online shortly. Thank you for your patience!",
    estimatedTime: "Coming back online soon",
    contactEmail: "contact@profoxwebdesigner.com",
    badgeText: "Development & Maintenance Mode",
    allowAdminBypass: true,
  },
  chatWidgetEnabled: true,
  faviconUrl: '/favicon.svg',
};

export function resolveSiteSettings(settings: Record<string, any> | null | undefined) {
  return { ...SITE_SETTINGS_DEFAULTS, ...(settings || {}) };
}
