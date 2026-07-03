// Single source of truth for social presence. The footer renders ALL nine
// platforms; entries with an empty url appear dimmed with "launching soon"
// until you create the account and paste the profile URL here — one edit,
// icon goes live. Claim the SAME handle everywhere before posting anything.

export interface SocialEntry {
  id: string;
  label: string;
  /** Fill this in when the account exists. Empty = shown dimmed, not linked. */
  url: string;
  /** Suggested handle to claim — keep it identical across platforms. */
  handle: string;
}

export const SOCIALS: SocialEntry[] = [
  { id: 'x', label: 'X', url: '', handle: '@palletizerapp' },
  { id: 'linkedin', label: 'LinkedIn', url: '', handle: 'company/palletizer' },
  { id: 'youtube', label: 'YouTube', url: '', handle: '@palletizerapp' },
  { id: 'instagram', label: 'Instagram', url: '', handle: '@palletizerapp' },
  { id: 'facebook', label: 'Facebook', url: '', handle: 'palletizerapp' },
  { id: 'tiktok', label: 'TikTok', url: '', handle: '@palletizerapp' },
  { id: 'whatsapp', label: 'WhatsApp', url: '', handle: 'business line' },
  { id: 'github', label: 'GitHub', url: 'https://github.com/iceccarelli/palletizer', handle: 'iceccarelli/palletizer' },
  { id: 'email', label: 'Email', url: 'mailto:contact@palletizer.app', handle: 'contact@palletizer.app' },
];

export const LEGAL_ENTITY = 'Grimaldi Engineering Services, Inc.';
export const COPYRIGHT_LINE = `© 2026, ${LEGAL_ENTITY} or its affiliates. All rights reserved.`;
