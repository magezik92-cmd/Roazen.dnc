export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
  userId: string;
  relatedNoteIds?: string[];
}

export interface Summary {
  id: string;
  noteId: string;
  summaryText: string;
  createdAt: string;
}

export type NoteDesign = 'technical' | 'editorial' | 'brutalist' | 'minimal' | 'mapping' | 'graph';
