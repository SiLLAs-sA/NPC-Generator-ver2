import { GoogleGenAI } from "@google/genai";

export const getApiKey = (): string => {
  // Priority: localStorage > process.env
  const savedKey = localStorage.getItem('GEMINI_API_KEY');
  if (savedKey) return savedKey;
  return (process.env as any).GEMINI_API_KEY || '';
};

export const saveApiKey = (key: string) => {
  if (key) {
    localStorage.setItem('GEMINI_API_KEY', key.trim());
  } else {
    localStorage.removeItem('GEMINI_API_KEY');
  }
};

export const testApiKey = async (key: string): Promise<boolean> => {
  try {
    const ai = new GoogleGenAI({ apiKey: key.trim() });
    await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Hi",
    });
    return true;
  } catch (error) {
    console.error("API Key Test Failed:", error);
    return false;
  }
};
