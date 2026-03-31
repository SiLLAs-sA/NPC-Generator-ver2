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

export const testApiKey = async (key: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: key.trim() });
    // Use the most stable version to avoid 503/404 errors
    await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Hi",
    });
    return { success: true };
  } catch (error: any) {
    console.error("API Key Test Failed:", error);
    // Extract a more readable error message if possible
    const errorMsg = error?.message || JSON.stringify(error);
    return { success: false, error: errorMsg };
  }
};
