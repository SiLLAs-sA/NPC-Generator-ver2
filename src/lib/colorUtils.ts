/**
 * Simple utility to extract dominant colors from an image using HTML5 Canvas.
 */
export async function extractPalette(imageUrl: string, colorCount: number = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Palette extraction timed out")), 5000);
    const img = new Image();
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = "Anonymous";
    }
    img.src = imageUrl;
    
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        // Scale down image for faster processing
        const scale = Math.min(100 / img.width, 100 / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const colorCounts: Record<string, number> = {};
        
        // Sample pixels
        for (let i = 0; i < imageData.length; i += 4 * 5) { // Sample every 5th pixel
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];
          
          if (a < 128) continue; // Skip transparent
          
          // Quantize colors to reduce noise (group similar colors)
          // Clamp to 255 to avoid invalid hex codes
          const qr = Math.min(255, Math.round(r / 10) * 10);
          const qg = Math.min(255, Math.round(g / 10) * 10);
          const qb = Math.min(255, Math.round(b / 10) * 10);
          
          // Skip very bright (white-ish) or very dark (black-ish) if they are just background
          const isTooBright = qr > 245 && qg > 245 && qb > 245;
          const isTooDark = qr < 10 && qg < 10 && qb < 10;
          
          const hex = `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`;
          const weight = (isTooBright || isTooDark) ? 0.05 : 1;
          colorCounts[hex] = (colorCounts[hex] || 0) + weight;
        }
        
        // Sort and pick top colors
        const sortedColors = Object.entries(colorCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, colorCount)
          .map(([hex]) => hex.toUpperCase());
          
        resolve(sortedColors);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}
