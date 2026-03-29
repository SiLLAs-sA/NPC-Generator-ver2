export type ImageEngine = 'gemini' | 'dalle3' | 'stability' | 'leonardo';

export interface NPC {
  id: string;
  name: string;
  description: string;
  traits: string[];
  style: string;
  positivePrompt: string;
  negativePrompt: string;
  images: string[]; // Base64 or URLs
  referenceImage?: string; // Base64 of uploaded reference
  selectedImageIndex?: number;
  seed?: number;
  isLocked: boolean;
  createdAt: number;
}

export interface ArchiveNPC extends NPC {
  mainImage: string;
  notes?: string;
  detailImages?: string[]; // For anchor details like items
  turnaroundImage?: string; // For three-view generation
}

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey?: string;
  stabilityApiKey?: string;
  leonardoApiKey?: string;
  defaultEngine: ImageEngine;
  concurrencyLimit: number;
}
