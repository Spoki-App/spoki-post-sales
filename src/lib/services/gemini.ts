import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:gemini');

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    if (!config.ai.googleApiKey) throw new Error('GOOGLE_AI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(config.ai.googleApiKey);
  }
  return genAI;
}

export async function generateJson(prompt: string): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: config.ai.geminiModel,
    generationConfig: { responseMimeType: 'application/json' },
  });

  logger.info('Generating JSON via Gemini', { model: config.ai.geminiModel, promptLen: prompt.length });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  logger.info('Gemini response received', { responseLen: text.length });
  return text;
}
