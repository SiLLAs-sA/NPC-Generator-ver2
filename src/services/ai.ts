import { GoogleGenAI, Type } from "@google/genai";
import { getApiKey } from "../lib/apiKey";

function getAI() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API Key is missing. Please set it in Settings or .env file.");
  }
  return new GoogleGenAI({ apiKey });
}

export async function extractNPCsFromText(text: string) {
  const ai = getAI();
  const modelsToTry = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-1.5-flash"];
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting NPC extraction with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `请从以下游戏设计文本中提取所有 NPC 角色。
        
        对于每个角色，请识别其名称和外貌特征。
        **特别注意**：提取的特征标签 (traits) 需要经过 AI 处理，将其转化为“生图 AI (如 Stable Diffusion/Midjourney) 能够理解的高质量描述词”。
        
        处理要求：
        1. **语言要求**：特征标签 (traits) 请使用 **英文** (English) 编写，因为生图 AI 对英文指令的理解更精准。
        2. **视觉化处理**：将模糊的描述转化为具体的视觉特征（例如：将“看起来很穷”转化为 "worn-out clothes, tattered fabric, dirty face"）。
        3. **关键词化**：每个特征应为一个独立的短语或关键词，使用具体的材质、颜色、款式描述词。
        4. **风格化**：可以包含风格化描述（如：gothic, cyberpunk, ethereal, highly detailed）。
        5. **保留气质**：尽量保留角色的核心气质，但以视觉化呈现为准。
        
        将结果返回为 JSON 对象数组，结构如下：
        {
          "name": "角色名称 (中文)",
          "traits": ["English Tag 1", "English Tag 2", ...],
          "description": "角色角色或性格的简要总结 (中文)"
        }
        
        文本内容：${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                description: { type: Type.STRING }
              },
              required: ["name", "traits", "description"]
            }
          }
        }
      });

      console.log(`AI Extraction Succeeded with model: ${modelName}`, response);
      const resultText = response.text || "[]";
      return JSON.parse(resultText);
    } catch (e: any) {
      console.warn(`Extraction failed for model ${modelName}:`, e?.message || e);
      lastError = e;
      // If it's not a 404 or 503, it might be a prompt issue or other, but we'll try next model anyway
    }
  }

  console.error("All extraction attempts failed:", lastError);
  throw lastError || new Error("所有 AI 模型均无法完成提取任务。");
}

export async function generateNPCImage(prompt: string, negativePrompt: string, baseImages?: string[]) {
  const ai = getAI();
  const modelsToTry = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
  let lastError: any = null;

  const finalPrompt = `character design sheet, full body standing, front view, centered, facing camera, pure white background, isolated on white, no background elements, no props, flat lighting, high detail, masterpiece, ${prompt}`;
  const finalNegativePrompt = `background elements, scenery, furniture, floor, shadow, text, watermark, signature, blurry, low quality, distorted, extra limbs, multiple characters, ${negativePrompt}`;
  
  const contents: any = {
    parts: [
      {
        text: `${finalPrompt}. Negative prompt: ${finalNegativePrompt}`,
      },
    ],
  };

  if (baseImages && baseImages.length > 0) {
    baseImages.forEach(baseImage => {
      const base64Data = baseImage.includes(',') ? baseImage.split(',')[1] : baseImage;
      contents.parts.unshift({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
    });
  }

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting image generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      const images: string[] = [];
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
      if (images.length > 0) {
        console.log(`Image generation succeeded with model: ${modelName}`);
        return images;
      }
    } catch (e: any) {
      console.warn(`Image generation failed for model ${modelName}:`, e?.message || e);
      lastError = e;
    }
  }

  throw lastError || new Error("所有生图模型均无法完成任务。");
}

export async function generateTurnaroundImage(baseImage: string, prompt: string) {
  const ai = getAI();
  const modelsToTry = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
  let lastError: any = null;

  const finalPrompt = `character turnaround sheet, three-view drawing, front view, side view, back view, same character, consistent design, pure white background, isolated on white, ${prompt}`;
  const base64Data = baseImage.includes(',') ? baseImage.split(',')[1] : baseImage;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting turnaround generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data
              }
            },
            {
              text: finalPrompt
            }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          console.log(`Turnaround generation succeeded with model: ${modelName}`);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e: any) {
      console.warn(`Turnaround generation failed for model ${modelName}:`, e?.message || e);
      lastError = e;
    }
  }

  return null;
}

export async function generateDetailItemImage(itemDescription: string, npcStyle: string, baseImage?: string) {
  const ai = getAI();
  const modelsToTry = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
  let lastError: any = null;

  const finalPrompt = `game item concept art, close-up, single object, isolated on white background, pure white background, high detail, ${npcStyle} style, ${itemDescription}`;
  
  const parts: any[] = [];
  if (baseImage) {
    const base64Data = baseImage.includes(',') ? baseImage.split(',')[1] : baseImage;
    parts.push({
      inlineData: {
        mimeType: "image/png",
        data: base64Data
      }
    });
  }
  parts.push({ text: finalPrompt });

  for (const modelName of modelsToTry) {
    try {
      console.log(`Attempting detail item generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          console.log(`Detail item generation succeeded with model: ${modelName}`);
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e: any) {
      console.warn(`Detail item generation failed for model ${modelName}:`, e?.message || e);
      lastError = e;
    }
  }

  return null;
}
