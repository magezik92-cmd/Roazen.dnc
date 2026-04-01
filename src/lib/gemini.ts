import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateSummary(noteContent: string) {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize the following revision note into key points and a brief overview. Use markdown for formatting: \n\n ${noteContent}`,
    config: {
      systemInstruction: "You are a helpful study assistant. Your summaries are concise, clear, and highlight the most important concepts for a student preparing for exams.",
    },
  });

  const response = await model;
  return response.text;
}

export async function askAI(question: string, context: string, files?: { data: string, mimeType: string }[]) {
  const parts: any[] = [
    { text: `Based on the following revision notes context, answer the user's question: \n\n Context: ${context} \n\n Question: ${question}` }
  ];

  if (files && files.length > 0) {
    files.forEach(file => {
      parts.push({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType
        }
      });
    });
  }

  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      systemInstruction: "You are a knowledgeable tutor. Answer the student's question accurately based on the provided context and any uploaded files. If the answer isn't in the context, use your general knowledge but mention it's not in the notes.",
    },
  });

  const response = await model;
  return response.text;
}
