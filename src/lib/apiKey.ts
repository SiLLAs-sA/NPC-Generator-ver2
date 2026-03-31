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
  const modelsToTry = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-1.5-flash"];
  let lastError = "";

  for (const modelName of modelsToTry) {
    try {
      const ai = new GoogleGenAI({ apiKey: key.trim() });
      await ai.models.generateContent({
        model: modelName,
        contents: "Hi",
      });
      console.log(`API Key Test Succeeded with model: ${modelName}`);
      return { success: true };
    } catch (error: any) {
      console.warn(`API Key Test failed for model ${modelName}:`, error?.message || error);
      lastError = error?.message || JSON.stringify(error);
      // If it's a 401 (Unauthorized), no point in trying other models
      if (lastError.includes("401") || lastError.toLowerCase().includes("unauthorized") || lastError.toLowerCase().includes("invalid api key")) {
        return { success: false, error: "API Key 无效，请检查您的密钥。" };
      }
      // Continue to next model for 404 or 503
    }
  }

  return { success: false, error: lastError || "所有测试模型均不可用，请稍后再试。" };
};
