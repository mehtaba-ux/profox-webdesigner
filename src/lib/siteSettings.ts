export const SITE_SETTINGS_DEFAULTS = {
  businessName: 'ProFox Webdesigner',
  website: 'https://www.profoxwebdesigner.com/',
  contactEmail: 'contact@profoxwebdesigner.com',
  supportEmail: 'support@profoxwebdesigner.com',
  contactPhone: '',
  securityContact: 'support@profoxwebdesigner.com',
  address: 'India',
  businessAddress: 'ProFox Headquarters, India',
};

export function resolveSiteSettings(settings: Record<string, any> | null | undefined) {
  return { ...SITE_SETTINGS_DEFAULTS, ...(settings || {}) };
}
