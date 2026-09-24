export const CONTACT_PAGE_PATH = '/contact-us';

const CONTACT_INTENT_PATTERNS = [
  /\bcontact us\b/i,
  /\bconnect (?:with|to) us\b/i,
  /\bget in touch\b/i,
  /\blet['’]?s talk\b/i,
  /\bstart (?:a |the |your )?(?:project|conversation)\b/i,
  /\bspeak (?:with|to)\b/i,
  /\bdigital advisor\b/i,
  /\bconsult (?:with )?(?:us|our|an? )?\w*/i,
  /\b(?:inquire|enquire)(?: now)?\b/i,
  /\brequest (?:a )?(?:quote|consultation)\b/i,
  /\bbook (?:a )?(?:call|consultation|meeting)\b/i,
  /\bschedule (?:a )?(?:call|consultation|meeting)\b/i,
  /\bwork with us\b/i,
];

export function isContactIntentCta(label?: string | null) {
  if (!label) return false;
  return CONTACT_INTENT_PATTERNS.some((pattern) => pattern.test(label.trim()));
}

export function resolveContactCtaUrl(label?: string | null, configuredUrl?: string | null, fallback = '#') {
  return isContactIntentCta(label) ? CONTACT_PAGE_PATH : (configuredUrl || fallback);
}
