export type ImageEngine = 'gemini' | 'dalle3' | 'stability' | 'leonardo';

export interface ReferenceGroup {
  id: string;
  name: string;
  images: string[];
}

export interface NPC {
  id: string;
  name: string;
  description: string;
  traits: string[];
  style: string;
  positivePrompt: string;
  negativePrompt: string;
  images: string[]; // Base64 or URLs
  referenceImages?: string[]; // Base64 of uploaded references
  referenceGroupId?: string; // ID of the selected reference group
  worldContext?: string; // Specific world context for this NPC
  selectedImageIndex?: number;
  seed?: number;
  isLocked: boolean;
  originalInput?: string;
  createdAt: number;
}

export interface ArchiveNPC extends NPC {
  mainImage: string;
  notes?: string;
  detailImages?: string[]; // For anchor details like items
  turnaroundImage?: string; // For three-view generation
  palette?: string[]; // Extracted color palette
  voice?: string; // Base64 audio data
  chatHistory?: { role: 'user' | 'model'; text: string }[];
}

export interface AppSettings {
  geminiApiKey: string;
  openaiApiKey?: string;
  stabilityApiKey?: string;
  leonardoApiKey?: string;
  defaultEngine: ImageEngine;
  concurrencyLimit: number;
}
