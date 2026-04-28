import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

export function getGemini() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
      // We still try to initialize, as GoogleGenAI constructor might be called, 
      // but the specific error "An API Key must be set when running in a browser"
      // happens if we pass undefined to the constructor in some versions/env.
      aiInstance = new GoogleGenAI({ apiKey: "" });
    } else {
      aiInstance = new GoogleGenAI({ apiKey });
    }
  }
  return aiInstance;
}
