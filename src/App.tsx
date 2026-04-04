import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  where,
  getDoc,
  getDocFromServer,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { Note, NoteDesign } from './types';
import { generateSummary, askAI } from './lib/gemini';
import * as d3 from 'd3';
import { 
  BookOpen, 
  Plus, 
  LayoutGrid, 
  Type, 
  Zap, 
  Printer, 
  Search, 
  MessageSquare, 
  LogOut, 
  LogIn,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  Sparkles,
  Map as MapIcon,
  Table as TableIcon,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  Eye,
  EyeOff,
  Award,
  Share2,
  Filter,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let displayError = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) displayError = parsed.error;
      } catch (e) {
        displayError = this.state.error.message || displayError;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Plus className="rotate-45 w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Application Error</h2>
            <p className="text-neutral-600 mb-6">{displayError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const FilterBar = ({ 
  notes, 
  selectedCategory, 
  setSelectedCategory, 
  selectedTags, 
  setSelectedTags 
}: { 
  notes: Note[], 
  selectedCategory: string | null, 
  setSelectedCategory: (c: string | null) => void,
  selectedTags: string[],
  setSelectedTags: (tags: string[]) => void
}) => {
  const categories = useMemo(() => Array.from(new Set(notes.map(n => n.category))), [notes]);
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  }, [notes]);

  const toggleTag = (tag: string) => {
    const newTags = selectedTags.includes(tag) 
      ? selectedTags.filter(t => t !== tag) 
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm mb-8 space-y-6 no-print">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-neutral-400" />
          <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-widest">Advanced Filters</h3>
        </div>
        {(selectedCategory || selectedTags.length > 0) && (
          <button 
            onClick={() => { setSelectedCategory(null); setSelectedTags([]); }}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest"
          >
            Clear All Filters
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em] mb-3">Filter by Category</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                !selectedCategory 
                  ? "bg-neutral-900 text-white border-neutral-900 shadow-lg" 
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              )}
            >
              All Categories
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                  selectedCategory === cat 
                    ? "bg-blue-600 text-white border-blue-600 shadow-lg" 
                    : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-[0.2em] mb-3">Filter by Tags</label>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2",
                  selectedTags.includes(tag)
                    ? "bg-blue-50 text-blue-600 border-blue-200 shadow-sm" 
                    : "bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400"
                )}
              >
                {selectedTags.includes(tag) && <Check className="w-3 h-3" />}
                #{tag}
              </button>
            ))}
            {allTags.length === 0 && (
              <p className="text-xs text-neutral-400 italic">No tags available yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const NoteReader = ({ 
  notes, 
  initialNote, 
  onClose,
  onEdit,
  onDelete,
  onSummary
}: { 
  notes: Note[], 
  initialNote: Note, 
  onClose: () => void,
  onEdit: (note: Note) => void,
  onDelete: (id: string) => void,
  onSummary: (note: Note) => void
}) => {
  const [currentIndex, setCurrentIndex] = useState(notes.findIndex(n => n.id === initialNote.id));
  const currentNote = notes[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextNote();
      if (e.key === 'ArrowLeft') prevNote();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const nextNote = () => {
    if (currentIndex < notes.length - 1) setCurrentIndex(prev => prev + 1);
  };

  const prevNote = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  if (!currentNote) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-white z-[70] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="h-20 border-b border-neutral-100 flex items-center justify-between px-8 shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
          >
            <ChevronDown className="w-6 h-6 rotate-90" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{currentNote.title}</h2>
            <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">{currentNote.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onSummary(currentNote)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-sm font-semibold transition-all"
          >
            <Sparkles className="w-4 h-4" />
            AI Summary
          </button>
          <button 
            onClick={() => onEdit(currentNote)}
            className="flex items-center gap-2 px-4 py-2 hover:bg-neutral-100 rounded-xl text-sm font-semibold transition-all"
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
          <button 
            onClick={() => {
              onDelete(currentNote.id);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 hover:bg-red-50 text-red-500 rounded-xl text-sm font-semibold transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <div className="w-px h-6 bg-neutral-200 mx-2" />
          <button 
            onClick={onClose}
            className="w-10 h-10 bg-neutral-900 text-white rounded-full flex items-center justify-center hover:bg-neutral-800 transition-all shadow-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-neutral-50/50">
        <div className="max-w-4xl mx-auto px-8 py-16">
          <motion.div
            key={currentNote.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-12 sm:p-20 rounded-[3rem] shadow-2xl shadow-neutral-200/50 border border-neutral-100"
          >
            <div className="flex flex-wrap gap-2 mb-8">
              {currentNote.tags.map(t => (
                <span key={t} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                  #{t}
                </span>
              ))}
            </div>
            
            <h1 className="text-4xl sm:text-6xl font-black text-neutral-900 mb-12 leading-[1.1] tracking-tight">
              {currentNote.title}
            </h1>

            <div className="prose prose-neutral prose-lg max-w-none">
              <p className="text-neutral-700 leading-relaxed whitespace-pre-wrap text-xl">
                {currentNote.content}
              </p>
            </div>

            {currentNote.relatedNoteIds && currentNote.relatedNoteIds.length > 0 && (
              <div className="mt-20 pt-12 border-t border-neutral-100">
                <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-[0.2em] mb-6">Related Concepts</h3>
                <div className="flex flex-wrap gap-3">
                  {currentNote.relatedNoteIds.map(rid => {
                    const related = notes.find(n => n.id === rid);
                    if (!related) return null;
                    return (
                      <button
                        key={rid}
                        onClick={() => setCurrentIndex(notes.findIndex(n => n.id === rid))}
                        className="px-6 py-3 bg-neutral-100 hover:bg-blue-600 hover:text-white rounded-2xl text-sm font-bold transition-all"
                      >
                        {related.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="h-24 border-t border-neutral-100 flex items-center justify-center px-8 shrink-0 bg-white">
        <div className="flex items-center gap-8">
          <button 
            disabled={currentIndex === 0}
            onClick={prevNote}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-neutral-500 hover:bg-neutral-100 disabled:opacity-20 transition-all"
          >
            <ChevronDown className="w-5 h-5 rotate-90" />
            Previous Note
          </button>
          
          <div className="flex items-center gap-2">
            {notes.map((_, i) => (
              <div 
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  i === currentIndex ? "w-8 bg-blue-600" : "w-1.5 bg-neutral-200"
                )}
              />
            ))}
          </div>

          <button 
            disabled={currentIndex === notes.length - 1}
            onClick={nextNote}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-neutral-900 hover:bg-neutral-100 disabled:opacity-20 transition-all"
          >
            Next Note
            <ChevronDown className="w-5 h-5 -rotate-90" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const TagInput = ({ 
  tags, 
  allTags, 
  onChange 
}: { 
  tags: string[], 
  allTags: string[], 
  onChange: (tags: string[]) => void 
}) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (input.trim()) {
      const filtered = allTags.filter(t => 
        t.toLowerCase().includes(input.toLowerCase()) && !tags.includes(t)
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [input, allTags, tags]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setSuggestions([]);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter(t => t !== tag));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 p-2 border border-neutral-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 transition-all bg-white min-h-[42px]">
        {tags.map(tag => (
          <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium border border-blue-100">
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-blue-900 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
            } else if (e.key === 'Backspace' && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 outline-none text-sm min-w-[100px] bg-transparent"
        />
      </div>
      
      {suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-w-xs bg-white border border-neutral-200 rounded-lg shadow-xl overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => addTag(s)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-0"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const StudyMode = ({ 
  notes, 
  onClose, 
  onToggleMastered 
}: { 
  notes: Note[], 
  onClose: () => void,
  onToggleMastered: (id: string, mastered: boolean) => void
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);

  const currentNote = notes[currentIndex];
  const progress = notes.length > 0 ? ((currentIndex + 1) / notes.length) * 100 : 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextNote();
      if (e.key === 'ArrowLeft') prevNote();
      if (e.key === ' ') {
        e.preventDefault();
        setIsRevealed(true);
      }
      if (e.key === 'm' || e.key === 'M') {
        if (currentNote) onToggleMastered(currentNote.id, !currentNote.mastered);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isRevealed, currentNote]);

  const nextNote = () => {
    if (currentIndex < notes.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsRevealed(false);
    }
  };

  const prevNote = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsRevealed(false);
    }
  };

  if (notes.length === 0) {
    return (
      <div className="fixed inset-0 bg-neutral-900 z-[60] flex items-center justify-center p-6">
        <div className="text-center text-white">
          <BookOpen className="w-16 h-16 mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-bold mb-4 tracking-tight">No notes to study!</h2>
          <p className="text-neutral-400 mb-8 max-w-xs mx-auto">Add some revision notes first to start your study session.</p>
          <button 
            onClick={onClose} 
            className="px-8 py-4 bg-blue-600 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[60] flex flex-col overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-neutral-800/50 border-b border-neutral-700 relative z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
          <div className="h-8 w-px bg-neutral-700" />
          <div className="flex items-center gap-2 text-white">
            <Award className="w-5 h-5 text-yellow-500" />
            <span className="font-bold tracking-tight">Study Mode</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Session Progress</p>
            <p className="text-sm font-mono text-white">{currentIndex + 1} / {notes.length}</p>
          </div>
          <div className="w-32 h-2 bg-neutral-700 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Card Area */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentNote.id}
            initial={{ opacity: 0, x: 50, rotateY: 90 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: -50, rotateY: -90 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-[450px] max-h-[80vh] border border-white/20"
          >
            <div className="p-8 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest block mb-1">{currentNote.category}</span>
                <h3 className="text-2xl font-bold text-neutral-900 tracking-tight">{currentNote.title}</h3>
              </div>
              {currentNote.mastered && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold"
                >
                  <CheckCircle className="w-3 h-3" />
                  Mastered
                </motion.div>
              )}
            </div>

            <div className="flex-1 p-8 overflow-y-auto flex flex-col items-center justify-center text-center">
              <AnimatePresence mode="wait">
                {isRevealed ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full"
                  >
                    <div className="prose prose-neutral max-w-none">
                      <p className="text-xl text-neutral-700 leading-relaxed whitespace-pre-wrap font-medium">
                        {currentNote.content}
                      </p>
                    </div>
                    <div className="mt-10 flex flex-wrap justify-center gap-2">
                      {currentNote.tags.map(t => (
                        <span key={t} className="px-4 py-1.5 bg-neutral-100 text-neutral-500 rounded-full text-[10px] font-bold uppercase tracking-wider">#{t}</span>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="reveal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsRevealed(true)}
                    className="flex flex-col items-center gap-6 group"
                  >
                    <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center group-hover:bg-blue-100 group-hover:shadow-xl group-hover:shadow-blue-200/50 transition-all duration-500">
                      <Eye className="w-12 h-12 text-blue-600" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-neutral-900 font-bold uppercase tracking-[0.2em] text-sm block">Reveal Content</span>
                      <span className="text-neutral-400 text-xs font-medium block">Press Space or Click to show</span>
                    </div>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="p-8 bg-neutral-50 border-t border-neutral-100 flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => onToggleMastered(currentNote.id, !currentNote.mastered)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-8 py-5 rounded-3xl font-bold transition-all text-sm uppercase tracking-widest",
                  currentNote.mastered 
                    ? "bg-green-600 text-white shadow-xl shadow-green-500/20" 
                    : "bg-white border-2 border-neutral-200 text-neutral-600 hover:border-green-500 hover:text-green-600"
                )}
              >
                <CheckCircle className="w-5 h-5" />
                {currentNote.mastered ? 'Mastered!' : 'Mark as Mastered'}
              </button>
              <div className="flex gap-4 flex-1">
                <button
                  disabled={currentIndex === 0}
                  onClick={prevNote}
                  className="flex-1 px-8 py-5 bg-white border-2 border-neutral-200 rounded-3xl font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm uppercase tracking-widest"
                >
                  Prev
                </button>
                <button
                  disabled={currentIndex === notes.length - 1}
                  onClick={nextNote}
                  className="flex-1 px-8 py-5 bg-neutral-900 text-white rounded-3xl font-bold hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl text-sm uppercase tracking-widest"
                >
                  Next
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer / Shortcuts */}
      <div className="p-8 text-center text-neutral-500 text-[10px] font-bold uppercase tracking-[0.3em] relative z-10">
        Arrows to navigate • Space to reveal • M to master
      </div>
    </div>
  );
};

const NoteEditor = ({ 
  note, 
  allNotes,
  onSave, 
  onCancel 
}: { 
  note?: Partial<Note>, 
  allNotes: Note[],
  onSave: (data: Partial<Note>) => void, 
  onCancel: () => void 
}) => {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [category, setCategory] = useState(note?.category || '');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [relatedNoteIds, setRelatedNoteIds] = useState<string[]>(note?.relatedNoteIds || []);

  const allUniqueTags = useMemo(() => {
    const tagSet = new Set<string>();
    allNotes.forEach(n => n.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet);
  }, [allNotes]);

  const toggleRelatedNote = (id: string) => {
    setRelatedNoteIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold">{note?.id ? 'Edit Note' : 'New Revision Note'}</h2>
          <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <Plus className="rotate-45 w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g., Photosynthesis Overview"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">Category</label>
              <input 
                type="text" 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g., Biology"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">Content</label>
            <textarea 
              value={content} 
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-neutral-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all h-48 resize-none"
              placeholder="Write your notes here..."
            />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">Tags</label>
            <TagInput 
              tags={tags} 
              allTags={allUniqueTags} 
              onChange={setTags} 
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">Related Notes</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-neutral-100 rounded-lg bg-neutral-50">
              {allNotes.filter(n => n.id !== note?.id).map(n => (
                <button
                  key={n.id}
                  onClick={() => toggleRelatedNote(n.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                    relatedNoteIds.includes(n.id)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300"
                  )}
                >
                  {n.title}
                </button>
              ))}
              {allNotes.length <= 1 && (
                <p className="text-xs text-neutral-400 italic">No other notes to link yet.</p>
              )}
            </div>
          </div>
        </div>
        <div className="p-6 bg-neutral-50 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-neutral-600 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave({ 
              title, 
              content, 
              category, 
              tags,
              relatedNoteIds
            })}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            Save Note
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const DesignSelector = ({ current, onSelect }: { current: NoteDesign, onSelect: (d: NoteDesign) => void }) => {
  const designs: { id: NoteDesign, icon: any, label: string }[] = [
    { id: 'minimal', icon: LayoutGrid, label: 'Minimal Grid' },
    { id: 'technical', icon: Zap, label: 'Technical' },
    { id: 'editorial', icon: Type, label: 'Editorial' },
    { id: 'brutalist', icon: BookOpen, label: 'Brutalist' },
    { id: 'mapping', icon: MapIcon, label: 'Mapping' },
    { id: 'graph', icon: Share2, label: 'Knowledge Graph' },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-8 no-print">
      {designs.map((d) => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
            current === d.id 
              ? "bg-neutral-900 text-white border-neutral-900 shadow-lg" 
              : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
          )}
        >
          <d.icon className="w-4 h-4" />
          {d.label}
        </button>
      ))}
    </div>
  );
};

const NoteCard = ({ 
  note, 
  design, 
  allNotes,
  onEdit, 
  onDelete,
  onSummary,
  onRead,
  onNavigateToNote
}: { 
  note: Note, 
  design: NoteDesign, 
  allNotes: Note[],
  onEdit: () => void, 
  onDelete: () => void,
  onSummary: () => void,
  onRead: () => void,
  onNavigateToNote: (id: string) => void
}) => {
  const relatedNotes = useMemo(() => {
    return allNotes.filter(n => note.relatedNoteIds?.includes(n.id));
  }, [note.relatedNoteIds, allNotes]);

  const RelatedLinks = () => (
    relatedNotes.length > 0 ? (
      <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-wrap gap-2">
        <span className="text-[9px] uppercase font-bold text-neutral-400 w-full mb-1">Related:</span>
        {relatedNotes.map(rn => (
          <button
            key={rn.id}
            onClick={(e) => { e.stopPropagation(); onNavigateToNote(rn.id); }}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline font-medium"
          >
            <ChevronRight className="w-3 h-3" />
            {rn.title}
          </button>
        ))}
      </div>
    ) : null
  );

  if (design === 'technical') {
    return (
      <motion.div 
        layout
        whileHover={{ y: -4 }}
        id={`note-${note.id}`}
        onClick={onRead}
        className="design-technical border-b border-neutral-900 p-6 hover:bg-neutral-900 hover:text-neutral-50 transition-all duration-300 group cursor-pointer relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-serif italic text-[11px] uppercase opacity-50 tracking-widest">{note.category}</span>
              {note.mastered && <CheckCircle className="w-3 h-3 text-green-500" />}
            </div>
            <h3 className="text-xl sm:text-2xl font-mono tracking-tight leading-none uppercase">{note.title}</h3>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity no-print">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 hover:bg-white/20 rounded-full"><Edit3 className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 hover:bg-red-500/20 text-red-400 rounded-full"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="font-mono text-sm line-clamp-3 mb-4 opacity-80">{note.content}</p>
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            {note.tags.map(t => (
              <span key={t} className="text-[10px] font-mono border border-current px-2 py-0.5 rounded-full">#{t}</span>
            ))}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onSummary(); }}
            className="flex items-center gap-1 text-[10px] uppercase font-mono border-b border-current pb-0.5 hover:opacity-50 no-print"
          >
            <Sparkles className="w-3 h-3" />
            AI Summary
          </button>
        </div>
        <RelatedLinks />
      </motion.div>
    );
  }

  if (design === 'editorial') {
    return (
      <motion.div 
        layout
        whileHover={{ scale: 1.01 }}
        id={`note-${note.id}`}
        onClick={onRead}
        className="design-editorial bg-neutral-950 text-white p-8 rounded-3xl overflow-hidden relative group transition-shadow hover:shadow-2xl hover:shadow-orange-500/10 cursor-pointer"
      >
        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity no-print flex gap-2">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full"><Edit3 className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-2 bg-red-500/20 text-red-400 rounded-full"><Trash2 className="w-4 h-4" /></button>
        </div>
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-orange-500 font-semibold block">{note.category}</span>
            {note.mastered && <CheckCircle className="w-3 h-3 text-green-500" />}
          </div>
          <h3 className="text-2xl sm:text-4xl font-display uppercase leading-[0.85] tracking-tighter mb-4">{note.title}</h3>
          <div className="h-px bg-white/20 w-full mb-6" />
        </div>
        <p className="text-neutral-400 text-lg leading-relaxed font-light line-clamp-4 mb-8 italic serif">
          {note.content}
        </p>
        <div className="flex justify-between items-end mb-6">
          <div className="flex flex-wrap gap-2">
            {note.tags.map(t => (
              <span key={t} className="text-[11px] uppercase tracking-wider border border-white/30 px-3 py-1 rounded-full">
                {t}
              </span>
            ))}
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onSummary(); }}
            className="w-12 h-12 rounded-full border border-white/30 flex items-center justify-center hover:bg-orange-500 hover:border-orange-500 transition-all no-print"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        </div>
        <RelatedLinks />
      </motion.div>
    );
  }

  if (design === 'brutalist') {
    return (
      <motion.div 
        layout
        whileHover={{ x: 4, y: 4 }}
        id={`note-${note.id}`}
        onClick={onRead}
        className="design-brutalist bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all group cursor-pointer"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="bg-black text-white px-3 py-1 text-xs font-bold uppercase tracking-tighter">
            {note.category}
          </div>
          <div className="flex gap-1 no-print">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 border-2 border-black hover:bg-yellow-400"><Edit3 className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 border-2 border-black hover:bg-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter mb-4 leading-none">
          {note.title}
        </h3>
        <p className="font-bold text-sm mb-6 line-clamp-4 border-l-4 border-black pl-4">
          {note.content}
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {note.tags.map(t => (
            <span key={t} className="bg-green-400 border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase">
              {t}
            </span>
          ))}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onSummary(); }}
          className="w-full border-4 border-black py-2 font-black uppercase hover:bg-black hover:text-white transition-colors no-print flex items-center justify-center gap-2 mb-4"
        >
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
        <RelatedLinks />
      </motion.div>
    );
  }

  // Default Minimal
  return (
    <motion.div 
      layout
      whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" }}
      id={`note-${note.id}`}
      onClick={onRead}
      className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm hover:border-blue-200 transition-all duration-300 group cursor-pointer"
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-md">{note.category}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity no-print">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 hover:bg-neutral-100 rounded-lg text-neutral-500"><Edit3 className="w-4 h-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-2">{note.title}</h3>
      <p className="text-neutral-600 text-sm line-clamp-3 mb-4 leading-relaxed">{note.content}</p>
      <div className="flex justify-between items-center">
        <div className="flex flex-wrap gap-1">
          {note.tags.map(t => (
            <span key={t} className="text-[10px] text-neutral-400 font-medium">#{t}</span>
          ))}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onSummary(); }}
          className="p-2 text-neutral-400 hover:text-blue-600 transition-colors no-print"
          title="AI Summary"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>
      <RelatedLinks />
    </motion.div>
  );
};

const KnowledgeGraph = ({ notes, onNavigateToNote }: { notes: Note[], onNavigateToNote: (id: string) => void }) => {
  const svgRef = React.useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = 600;

    const nodes = notes.map(n => ({ id: n.id, title: n.title, category: n.category }));
    const links: { source: string, target: string }[] = [];

    notes.forEach(n => {
      n.relatedNoteIds?.forEach(rid => {
        if (notes.find(note => note.id === rid)) {
          links.push({ source: n.id, target: rid });
        }
      });
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60));

    const link = svg.append("g")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any)
      .on("click", (event, d: any) => {
        onNavigateToNote(d.id);
      })
      .style("cursor", "pointer");

    node.append("circle")
      .attr("r", 40)
      .attr("fill", "#fff")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2);

    node.append("text")
      .text((d: any) => d.title)
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .attr("fill", "#1e293b")
      .call(wrap, 70);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    function wrap(text: any, width: number) {
      text.each(function(this: any) {
        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line: string[] = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            y = text.attr("y"),
            dy = parseFloat(text.attr("dy")),
            tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
        while (word = words.pop()) {
          line.push(word);
          tspan.text(line.join(" "));
          if ((tspan.node() as any).getComputedTextLength() > width) {
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
          }
        }
      });
    }

  }, [notes]);

  return (
    <div className="bg-white rounded-3xl border border-neutral-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
        <h3 className="font-bold text-neutral-900 flex items-center gap-2">
          <Share2 className="w-4 h-4 text-blue-600" />
          Knowledge Graph
        </h3>
        <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">Drag to explore • Click to open</p>
      </div>
      <svg ref={svgRef} className="w-full h-[600px]" />
    </div>
  );
};

const MappingView = ({ notes, onRead }: { notes: Note[], onRead: (note: Note) => void }) => {
  const categories = Array.from(new Set(notes.map(n => n.category)));

  return (
    <div className="p-8 bg-neutral-100 rounded-3xl min-h-[600px] relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      
      <div className="relative z-10 flex flex-wrap justify-center gap-6 sm:gap-12">
        {categories.map((cat, i) => (
          <div key={cat} className="flex flex-col items-center w-full sm:w-auto">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="bg-neutral-900 text-white px-6 py-3 rounded-full font-bold uppercase tracking-widest shadow-xl mb-6 sm:mb-8 border-4 border-white text-sm sm:text-base"
            >
              {cat}
            </motion.div>
            <div className="grid grid-cols-1 gap-4 w-full sm:w-auto px-4 sm:px-0">
              {notes.filter(n => n.category === cat).map((note, ni) => (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: (i * 0.1) + (ni * 0.05) }}
                  onClick={() => onRead(note)}
                  className="bg-white p-4 rounded-xl shadow-sm border border-neutral-200 w-full sm:w-48 text-center hover:shadow-lg transition-all cursor-pointer group"
                >
                  <h4 className="font-bold text-sm mb-1 group-hover:text-blue-600 transition-colors">{note.title}</h4>
                  <div className="flex justify-center gap-1">
                    {note.tags.slice(0, 2).map(t => (
                      <span key={t} className="text-[8px] text-neutral-400">#{t}</span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AISummaryModal = ({ 
  note, 
  onClose 
}: { 
  note: Note, 
  onClose: () => void 
}) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await generateSummary(note.content);
        setSummary(res || 'Failed to generate summary.');
      } catch (err) {
        setSummary('Error generating summary.');
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [note.content]);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden"
      >
        <div className="p-6 bg-blue-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-xl font-semibold">AI Study Summary</h2>
          </div>
          <button onClick={onClose} className="hover:opacity-70 transition-opacity">
            <Plus className="rotate-45 w-6 h-6" />
          </button>
        </div>
        <div className="p-8 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-neutral-500 font-medium animate-pulse">Analyzing your notes...</p>
            </div>
          ) : (
            <div className="prose prose-neutral max-w-none">
              <Markdown>{summary || ''}</Markdown>
            </div>
          )}
        </div>
        <div className="p-6 bg-neutral-50 flex justify-between items-center">
          <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">Generated by Gemini AI</p>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors text-sm font-medium"
          >
            <Printer className="w-4 h-4" /> Print Summary
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const AIChat = ({ notes, onAddNote }: { notes: Note[], onAddNote: (data: Partial<Note>) => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string, files?: { name: string, type: string }[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{ name: string, type: string, data: string }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'chat_messages'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => doc.data() as any);
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: { name: string, type: string, data: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const data = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      newFiles.push({ name: file.name, type: file.type, data });
    }
    setSelectedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearHistory = async () => {
    if (!auth.currentUser) return;
    
    try {
      const q = query(collection(db, 'chat_messages'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  const handleSend = async () => {
    if (!queryText.trim() && selectedFiles.length === 0) return;
    if (!auth.currentUser) return;
    
    const userMsg = queryText;
    const currentFiles = [...selectedFiles];
    setQueryText('');
    setSelectedFiles([]);
    setLoading(true);

    try {
      // Save user message
      await addDoc(collection(db, 'chat_messages'), {
        userId: auth.currentUser.uid,
        role: 'user',
        text: userMsg,
        files: currentFiles.map(f => ({ name: f.name, type: f.type })),
        createdAt: new Date().toISOString()
      });

      const context = notes.map(n => `[ID: ${n.id}] [${n.category}] ${n.title}: ${n.content}`).join('\n\n');
      const response = await askAI(userMsg, context, currentFiles.map(f => ({ data: f.data, mimeType: f.type })));
      
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          let aiMsg = '';
          if (call.name === 'addNote') {
            const args = call.args as any;
            onAddNote({
              title: args.title,
              content: args.content,
              category: args.category,
              tags: args.tags || []
            });
            aiMsg = `I've added a new note for you: **${args.title}**.`;
          } else if (call.name === 'updateNote') {
            const args = call.args as any;
            onAddNote({
              id: args.id,
              title: args.title,
              content: args.content,
              category: args.category,
              tags: args.tags,
              mastered: args.mastered
            });
            aiMsg = `I've updated the note: **${args.title || 'Note'}**.`;
          }
          
          if (aiMsg) {
            await addDoc(collection(db, 'chat_messages'), {
              userId: auth.currentUser.uid,
              role: 'ai',
              text: aiMsg,
              createdAt: new Date().toISOString()
            });
          }
        }
      } else {
        await addDoc(collection(db, 'chat_messages'), {
          userId: auth.currentUser.uid,
          role: 'ai',
          text: response.text || 'I couldn\'t find an answer.',
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      await addDoc(collection(db, 'chat_messages'), {
        userId: auth.currentUser.uid,
        role: 'ai',
        text: 'Sorry, I encountered an error.',
        createdAt: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-40 no-print"
      >
        <MessageSquare className="w-8 h-8" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-8 sm:w-96 h-[500px] max-h-[calc(100vh-120px)] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden z-50 border border-neutral-200"
          >
            <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span className="font-bold">Revision Assistant</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={clearHistory}
                  className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  title="Clear History"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsOpen(false)} className="hover:opacity-70"><Plus className="rotate-45 w-6 h-6" /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50">
              {messages.length === 0 && (
                <div className="text-center py-12 text-neutral-400">
                  <p className="text-sm">Ask me anything about your notes!</p>
                  <p className="text-xs mt-1 italic">"What are the main stages of mitosis?"</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn("flex flex-col", m.role === 'user' ? "items-end" : "items-start")}>
                  {m.files && m.files.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {m.files.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-[10px] font-medium border border-blue-200">
                          {f.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                          <span className="max-w-[100px] truncate">{f.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm",
                    m.role === 'user' ? "bg-blue-600 text-white rounded-tr-none" : "bg-white text-neutral-800 shadow-sm border border-neutral-100 rounded-tl-none"
                  )}>
                    <Markdown>{m.text}</Markdown>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-neutral-100 rounded-tl-none flex gap-1">
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-neutral-100 bg-white">
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-1 px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md text-xs border border-neutral-200">
                      {file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      <span className="max-w-[80px] truncate">{file.name}</span>
                      <button onClick={() => removeFile(idx)} className="hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-center">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden" 
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-neutral-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
                  title="Attach files"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input 
                  type="text" 
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type your question..."
                  className="flex-1 px-4 py-2 rounded-full bg-neutral-100 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <button 
                  onClick={handleSend}
                  disabled={loading || (!queryText.trim() && selectedFiles.length === 0)}
                  className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors shrink-0"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [design, setDesign] = useState<NoteDesign>('minimal');
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null);
  const [summarizingNote, setSummarizingNote] = useState<Note | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [readingNote, setReadingNote] = useState<Note | null>(null);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }
    }
    testConnection();
  }, []);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => signOut(auth);

  // Firestore
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      setNotes(newNotes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    return () => unsubscribe();
  }, [user]);

  const saveNote = async (data: Partial<Note>) => {
    if (!user) return;
    
    const noteId = data.id || editingNote?.id;
    
    // Clean up undefined values as Firestore doesn't support them
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    ) as Partial<Note>;

    try {
      if (noteId) {
        // For updates, remove the id from the data payload
        const { id, ...updateData } = cleanData;
        await updateDoc(doc(db, 'notes', noteId), updateData);
      } else {
        // For new notes, ensure tags is at least an empty array
        await addDoc(collection(db, 'notes'), {
          tags: [],
          ...cleanData,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      setEditingNote(null);
    } catch (err) {
      handleFirestoreError(err, noteId ? OperationType.UPDATE : OperationType.CREATE, 'notes');
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notes/${id}`);
    }
  };

  const toggleMastered = async (id: string, mastered: boolean) => {
    try {
      await updateDoc(doc(db, 'notes', id), { mastered });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notes/${id}`);
    }
  };

  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      const matchesSearch = 
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = !selectedCategory || n.category === selectedCategory;
      const matchesTags = selectedTags.length === 0 || selectedTags.every(t => n.tags.includes(t));

      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [notes, searchTerm, selectedCategory, selectedTags]);

  const handleNavigateToNote = (id: string) => {
    setDesign('minimal'); // Switch to minimal to see the note
    setTimeout(() => {
      const element = document.getElementById(`note-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-4', 'ring-blue-500', 'ring-offset-2');
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-blue-500', 'ring-offset-2');
        }, 2000);
      }
    }, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-200">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-neutral-900 mb-4 tracking-tight">School of Revision</h1>
          <p className="text-neutral-600 mb-8 leading-relaxed">
            Your personal AI-powered revision companion. Organize notes, generate summaries, and study smarter.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-white text-neutral-900 border border-neutral-200 rounded-2xl font-semibold hover:bg-neutral-50 transition-all shadow-sm"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-neutral-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">School of Revision</h1>
          </div>

          <div className="flex-1 max-w-md mx-4 sm:mx-8 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 bg-neutral-100 rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2 rounded-full transition-all",
                showFilters || selectedCategory || selectedTags.length > 0
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              )}
              title="Advanced Filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{user.displayName}</p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Student</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-neutral-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 no-print">
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Total Notes</p>
            <p className="text-4xl font-bold text-neutral-900">{notes.length}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Subjects</p>
            <p className="text-4xl font-bold text-neutral-900">{new Set(notes.map(n => n.category)).size}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Recent Activity</p>
            <p className="text-lg font-semibold text-neutral-900 mt-2">
              {notes.length > 0 ? `Last note: ${notes[0].title}` : 'No notes yet'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 no-print">
          <DesignSelector current={design} onSelect={setDesign} />
          <div className="flex gap-3">
            <button 
              onClick={() => setIsStudyMode(true)}
              className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-2xl text-sm font-semibold hover:bg-neutral-800 transition-all shadow-lg"
            >
              <Award className="w-4 h-4 text-yellow-500" />
              Study Mode
            </button>
            <button 
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-neutral-200 rounded-2xl text-sm font-semibold hover:bg-neutral-50 transition-all shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print All
            </button>
            <button 
              onClick={() => setEditingNote({})}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
            >
              <Plus className="w-4 h-4" />
              Add Note
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <FilterBar 
                notes={notes}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        <AnimatePresence mode="wait">
          {design === 'mapping' ? (
            <MappingView notes={filteredNotes} onRead={setReadingNote} />
          ) : design === 'graph' ? (
            <KnowledgeGraph notes={filteredNotes} onNavigateToNote={(id) => {
              const note = notes.find(n => n.id === id);
              if (note) setReadingNote(note);
            }} />
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "grid gap-6",
                design === 'minimal' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : 
                design === 'editorial' ? "grid-cols-1 lg:grid-cols-2" :
                design === 'brutalist' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
                "grid-cols-1" // technical is a list
              )}
            >
              {filteredNotes.map((note) => (
                <NoteCard 
                  key={note.id} 
                  note={note} 
                  design={design} 
                  allNotes={notes}
                  onEdit={() => setEditingNote(note)}
                  onDelete={() => deleteNote(note.id)}
                  onSummary={() => setSummarizingNote(note)}
                  onRead={() => setReadingNote(note)}
                  onNavigateToNote={(id) => {
                    const n = notes.find(note => note.id === id);
                    if (n) setReadingNote(n);
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {filteredNotes.length === 0 && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-300">
            <BookOpen className="w-12 h-12 text-neutral-200 mx-auto mb-4" />
            <p className="text-neutral-400 font-medium">No notes found. Start by adding your first revision note!</p>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isStudyMode && (
          <StudyMode 
            notes={notes} 
            onClose={() => setIsStudyMode(false)}
            onToggleMastered={toggleMastered}
          />
        )}
        {editingNote && (
          <NoteEditor 
            note={editingNote} 
            allNotes={notes}
            onSave={saveNote} 
            onCancel={() => setEditingNote(null)} 
          />
        )}
        {summarizingNote && (
          <AISummaryModal 
            note={summarizingNote} 
            onClose={() => setSummarizingNote(null)} 
          />
        )}
        {readingNote && (
          <NoteReader 
            notes={filteredNotes}
            initialNote={readingNote}
            onClose={() => setReadingNote(null)}
            onEdit={(note) => { setReadingNote(null); setEditingNote(note); }}
            onDelete={deleteNote}
            onSummary={(note) => { setReadingNote(null); setSummarizingNote(note); }}
          />
        )}
      </AnimatePresence>

      {/* AI Chat */}
      <AIChat notes={notes} onAddNote={saveNote} />

      {/* Print View (Hidden on screen) */}
      <div className="print-only printable-content">
        <h1 className="text-4xl font-bold mb-8">School of Revision - Study Guide</h1>
        <div className="space-y-12">
          {notes.map(note => (
            <div key={note.id} className="border-b border-neutral-200 pb-8">
              <div className="flex justify-between items-baseline mb-4">
                <h2 className="text-2xl font-bold">{note.title}</h2>
                <span className="text-sm text-neutral-500 uppercase font-bold tracking-widest">{note.category}</span>
              </div>
              <p className="text-neutral-800 leading-relaxed whitespace-pre-wrap mb-4">{note.content}</p>
              <div className="flex gap-2">
                {note.tags.map(t => (
                  <span key={t} className="text-xs text-neutral-400">#{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
