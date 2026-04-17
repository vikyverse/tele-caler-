import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in your environment or Settings menu.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function generateCallSummary(notes: string): Promise<{ summary: string; sentiment: string, temperature: string, suggestedMessage: string }> {
  if (!notes || notes.trim() === '') {
    return { summary: '', sentiment: 'unknown', temperature: 'unassigned', suggestedMessage: '' };
  }

  const prompt = `
    Analyze the following telecaller notes from a customer call.
    1. Write a concise 2-line summary of the call.
    2. Determine the customer's sentiment from these options: positive, neutral, negative, angry, excited.
    3. Classify the lead temperature as: hot, warm, or cold.
    4. Draft a short, professional follow-up WhatsApp message to the customer based on the notes.
    
    Notes: "${notes}"
    
    Respond strictly in JSON format:
    {
      "summary": "The 2-line summary here.",
      "sentiment": "positive",
      "temperature": "hot",
      "suggestedMessage": "Hi [Name], thank you for your time..."
    }
  `;

  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return {
        summary: parsed.summary || '',
        sentiment: parsed.sentiment || 'unknown',
        temperature: parsed.temperature || 'unassigned',
        suggestedMessage: parsed.suggestedMessage || ''
      };
    }
  } catch (error) {
    console.error("Error generating AI summary:", error);
    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      alert("AI capabilities require a Gemini API key. Check your settings.");
    }
  }
  
  return { summary: '', sentiment: 'unknown', temperature: 'unassigned', suggestedMessage: '' };
}

export async function analyzeAudioFeedback(audioBase64: string, mimeType: string): Promise<{ transcript: string, summary: string; sentiment: string, temperature: string, suggestedMessage: string }> {
  const prompt = `
    You are an AI assistant for a CRM. Listen to this audio feedback from a telecaller about a recent customer call.
    1. Transcribe the audio accurately.
    2. Write a concise 2-line summary of the call, including any product details or meeting points discussed.
    3. Determine the customer's sentiment (positive, neutral, negative, angry, excited).
    4. Classify the lead temperature as 'hot', 'warm', or 'cold'.
    5. Draft a short, professional follow-up WhatsApp message to the customer based on the key points.
    
    Respond strictly in JSON format:
    {
      "transcript": "The full transcription...",
      "summary": "The 2-line summary here.",
      "sentiment": "positive",
      "temperature": "hot",
      "suggestedMessage": "Hi [Name], thank you for your time..."
    }
  `;

  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType
          }
        },
        prompt
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return {
        transcript: parsed.transcript || '',
        summary: parsed.summary || '',
        sentiment: parsed.sentiment || 'unknown',
        temperature: parsed.temperature || 'unassigned',
        suggestedMessage: parsed.suggestedMessage || ''
      };
    }
  } catch (error) {
    console.error("Error analyzing audio:", error);
    if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
      alert("AI capabilities require a Gemini API key. Check your settings.");
    }
  }
  
  return { transcript: '', summary: '', sentiment: 'unknown', temperature: 'unassigned', suggestedMessage: '' };
}
