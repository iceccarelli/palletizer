// Single source of truth for social presence. All nine icons are clickable;
// urls are staged: platform landing pages as placeholders now, upgraded to
// profile URLs one edit at a time as each account launches. (An entry with
// an empty url would render dimmed/unlinked — the SocialRow supports both.)

export interface SocialEntry {
  id: string;
  label: string;
  /** Fill this in when the account exists. Empty = shown dimmed, not linked. */
  url: string;
  /** Suggested handle to claim — keep it identical across platforms. */
  handle: string;
}

// MARKETING STAGE: placeholder landing pages. Each url currently points to
// the platform's home page; when a profile goes live, replace with the
// profile URL (keep the handle column as the claim list — identical handle
// everywhere: @palletizerapp).
export const SOCIALS: SocialEntry[] = [
  { id: 'x', label: 'X', url: 'https://x.com', handle: '@palletizerapp' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com', handle: 'company/palletizer' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com', handle: '@palletizerapp' },
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com', handle: '@palletizerapp' },
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com', handle: 'palletizerapp' },
  { id: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com', handle: '@palletizerapp' },
  { id: 'whatsapp', label: 'WhatsApp', url: 'https://www.whatsapp.com', handle: 'business line' },
  { id: 'github', label: 'GitHub', url: 'https://github.com/iceccarelli/palletizer', handle: 'iceccarelli/palletizer' },
  { id: 'email', label: 'Email', url: 'mailto:contact@palletizer.app', handle: 'contact@palletizer.app' },
];

export const LEGAL_ENTITY = 'Grimaldi Engineering Services, Inc.';
export const COPYRIGHT_LINE = `© 2026, ${LEGAL_ENTITY} or its affiliates. All rights reserved.`;
