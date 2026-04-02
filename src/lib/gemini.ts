import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const addNoteTool: FunctionDeclaration = {
  name: "addNote",
  description: "Add a new revision note to the student's collection.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "The title of the note." },
      content: { type: Type.STRING, description: "The main content of the note." },
      category: { type: Type.STRING, description: "The subject or category of the note." },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of tags for the note." }
    },
    required: ["title", "content", "category"]
  }
};

const updateNoteTool: FunctionDeclaration = {
  name: "updateNote",
  description: "Update an existing revision note with new content or metadata.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: "The unique ID of the note to update." },
      title: { type: Type.STRING, description: "The updated title of the note." },
      content: { type: Type.STRING, description: "The updated content of the note." },
      category: { type: Type.STRING, description: "The updated category." },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The updated tags." },
      mastered: { type: Type.BOOLEAN, description: "Update the mastery status." }
    },
    required: ["id"]
  }
};

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
    { text: `Based on the following revision notes context, answer the user's question. 
    If the user asks to add a new note, use the addNote tool.
    If the user asks to modify, update, or add information to an existing note, use the updateNote tool.
    The context includes IDs for existing notes like [ID: note_id_here]. Use these IDs when calling updateNote.
    
    Context: ${context} 
    
    Question: ${question}` }
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

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      systemInstruction: "You are a knowledgeable tutor. Answer the student's question accurately based on the provided context and any uploaded files. If the user asks to create or add a note based on the discussion or their request, use the addNote tool. If they ask to modify or add to an existing note, use the updateNote tool with the correct ID from the context.",
      tools: [{ functionDeclarations: [addNoteTool, updateNoteTool] }]
    },
  });

  return response;
}
