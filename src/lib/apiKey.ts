
export const getApiKey = (): string => {
  // Priority: localStorage > process.env
  const savedKey = localStorage.getItem('GEMINI_API_KEY');
  if (savedKey) return savedKey;
  return process.env.GEMINI_API_KEY || '';
};

export const saveApiKey = (key: string) => {
  if (key) {
    localStorage.setItem('GEMINI_API_KEY', key);
  } else {
    localStorage.removeItem('GEMINI_API_KEY');
  }
};
