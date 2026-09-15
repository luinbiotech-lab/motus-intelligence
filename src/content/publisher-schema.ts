export const MOTUS_BRAND = 'MOTUS';
export const MOTUS_DISPLAY_NAME = 'MOTUS | What Moves the World';
export const MOTUS_CTA_TEXT = '전체 분석은 MOTUS에서 확인하세요';

export const MOTUS_CATEGORIES = [
  'Daily Market',
  'AI & Industry',
  'Global Company',
  'Market / Investment Insight',
  'Evergreen'
] as const;

export type MotusCategory = typeof MOTUS_CATEGORIES[number];

export interface GlobalContentMetadata {
  schemaVersion: '1.0';
  brand: typeof MOTUS_BRAND;
  displayName: typeof MOTUS_DISPLAY_NAME;
  primaryCategory: MotusCategory;
  categories: MotusCategory[];
  companies: string[];
  sectors: string[];
  themes: string[];
  countries: string[];
  regions: string[];
}

export interface PublisherGlossaryEntry {
  term: string;
  explanation: string;
  evergreenKey: string;
  evergreenTitle: string;
  publishedUrl?: string;
}

export interface PublisherContentDocument {
  title: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  markdown: string;
  hashtags: string[];
  glossary: PublisherGlossaryEntry[];
  sources: { label: string; url: string }[];
  metadata: GlobalContentMetadata;
}
