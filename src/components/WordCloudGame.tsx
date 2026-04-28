import { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, useDraggable, useDroppable, DragOverlay } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Check, X, Diamond, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

const DEFAULT_WORDS = ["Rédiger", "Analyser", "Terrain", "Équipe", "Théorie", "Autonomie", "Chiffres", "Créer", "Contact client", "Technique", "Organisation", "Parler en public", "Recherche", "Projets", "Procédures", "Innovation", "Répétition", "Management", "Concret", "Abstrait"];

const SKILLS_MAP: Record<string, string> = {
  "Rédiger": "Communication écrite", "Analyser": "Esprit analytique", "Terrain": "Opérationnel",
  "Équipe": "Collaboration", "Théorie": "Conceptualisation", "Autonomie": "Indépendance",
  "Chiffres": "Analyse quantitative", "Créer": "Créativité", "Contact client": "Relationnel",
  "Technique": "Savoir-faire spécialisé", "Organisation": "Gestion de projet", 
  "Parler en public": "Éloquence", "Recherche": "Investigation", "Projets": "Planification",
  "Procédures": "Rigueur", "Innovation": "Inventivité", "Répétition": "Persévérance",
  "Management": "Leadership", "Concret": "Pragmatisme", "Abstrait": "Logique complexe"
};

const DOMAINS_MAP: Record<string, string> = {
  "Terrain": "Métiers de l'action/extérieurs", "Créer": "Design/Arts/Marketing",
  "Chiffres": "Finance/Compta/Data", "Contact client": "Commerce/Vente/Social",
  "Équipe": "Secteurs collaboratifs", "Autonomie": "Freelance/Recherche",
  "Innovation": "R&D/Tech/Startups", "Management": "Ressources Humaines/Direction"
};

interface WordLists {
  source: string[];
  liked: string[];
  disliked: string[];
  desired: string[];
}

interface DraggableWordProps {
  key?: string | number;
  id: string;
  isTouch: boolean;
  onMove?: (zone: keyof WordLists) => void;
  onRemove?: () => void;
}

function DraggableWord({ id, isTouch, onMove, onRemove }: DraggableWordProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { id }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  if (isTouch) {
    if (onRemove) {
       return (
         <div onClick={onRemove} className="inline-flex items-center px-3 py-1.5 m-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-sm transition-colors active:bg-gray-100">
            {id}
         </div>
       );
    }
    return (
      <div className="inline-flex flex-col items-center m-1 p-2 bg-white border border-gray-200 rounded-xl shadow-sm gap-2">
        <span className="text-xs font-bold text-gray-800">{id}</span>
        <div className="flex gap-2">
          <button onClick={() => onMove?.('liked')} className="w-6 h-6 rounded-full bg-green-50 text-green-600 flex items-center justify-center border border-green-200"><Check className="w-3 h-3" /></button>
          <button onClick={() => onMove?.('disliked')} className="w-6 h-6 rounded-full bg-red-50 text-red-600 flex items-center justify-center border border-red-200"><X className="w-3 h-3" /></button>
          <button onClick={() => onMove?.('desired')} className="w-6 h-6 rounded-full bg-yellow-50 text-yellow-600 flex items-center justify-center border border-yellow-200"><Diamond className="w-3 h-3 fill-current" /></button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...listeners} 
      {...attributes}
      className={cn(
        "inline-flex items-center px-3 py-1.5 m-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-700 shadow-sm cursor-grab active:cursor-grabbing hover:border-gray-300 transition-colors",
        isDragging && "opacity-50 border-primary"
      )}
    >
      {id}
    </div>
  );
}

function DropZone({ id, title, items, color, isTouch, onRemove }: { id: string, title: string, items: string[], color: string, isTouch: boolean, onRemove: (val: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id });

  let borderClass = color === 'green' ? "border-green-300" : color === 'red' ? "border-red-300" : "border-yellow-300";
  let bgClass = color === 'green' ? "bg-green-50" : color === 'red' ? "bg-red-50" : "bg-yellow-50";
  let textColor = color === 'green' ? "text-green-800" : color === 'red' ? "text-red-800" : "text-yellow-800";

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "flex-1 p-3 rounded-xl border-2 flex flex-col items-center min-h-[160px] transition-colors",
        bgClass,
        isOver ? `${borderClass} border-dashed shadow-inner bg-opacity-70` : "border-transparent",
        color === 'green' && !isOver && "border-green-200",
        color === 'red' && !isOver && "border-red-200",
        color === 'yellow' && !isOver && "border-yellow-200"
      )}
    >
      <span className={cn("text-xs font-bold mb-3 text-center", textColor)}>{title}</span>
      <div className="flex flex-wrap justify-center w-full">
        {items.map(w => (
          <DraggableWord key={w} id={w} isTouch={isTouch} onRemove={() => onRemove(w)} />
        ))}
        {items.length === 0 && <span className="text-[10px] text-gray-400 mt-4 italic text-center w-full">Glisse des mots ici</span>}
      </div>
    </div>
  );
}

interface WordCloudGameProps {
  onComplete: (liked: string[], disliked: string[], desired: string[], naturalText: string) => void;
  initialData?: any;
}

export function WordCloudGame({ onComplete, initialData }: WordCloudGameProps) {
  const [isTouch, setIsTouch] = useState(false);
  const [isFinished, setIsFinished] = useState(!!initialData?.isFinished);
  const [customWord, setCustomWord] = useState('');
  
  const [lists, setLists] = useState<WordLists>({
    source: [...DEFAULT_WORDS],
    liked: [],
    disliked: [],
    desired: []
  });

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const wordId = active.id as string;
    const fromListKey = Object.keys(lists).find(key => lists[key as keyof WordLists].includes(wordId)) as keyof WordLists;
    const toListKey = over.id as keyof WordLists;

    if (fromListKey && fromListKey !== toListKey) {
      setLists(prev => ({
        ...prev,
        [fromListKey]: prev[fromListKey].filter(w => w !== wordId),
        [toListKey]: [...prev[toListKey], wordId]
      }));
    }
  };

  const handleMoveMobile = (wordId: string, toListKey: keyof WordLists) => {
    const fromListKey = Object.keys(lists).find(key => lists[key as keyof WordLists].includes(wordId)) as keyof WordLists;
    if (fromListKey && fromListKey !== toListKey) {
      setLists(prev => ({
        ...prev,
        [fromListKey]: prev[fromListKey].filter(w => w !== wordId),
        [toListKey]: [...prev[toListKey], wordId]
      }));
    }
  };

  const addCustomWord = () => {
    if (!customWord.trim() || Object.values(lists).flat().includes(customWord.trim())) return;
    setLists(prev => ({ ...prev, source: [customWord.trim(), ...prev.source] }));
    setCustomWord('');
  };

  const validate = () => {
    setIsFinished(true);
    
    // Mapping 
    const acquiredSkills = lists.liked.map(w => SKILLS_MAP[w] || w);
    const domainPointers = lists.desired.map(w => DOMAINS_MAP[w] || w);

    const naturalText = `Tu as acquis/apprécié des compétences comme : ${acquiredSkills.join(', ')}. 
    Ce qui te manquait semble pointer vers ces pistes à explorer : ${domainPointers.join(', ')}.`;

    onComplete(lists.liked, lists.disliked, lists.desired, naturalText);
  };

  const isReady = lists.liked.length >= 2 && lists.disliked.length >= 2 && lists.desired.length >= 2;

  if (isFinished) {
    return (
      <div className="w-full max-w-[500px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-5 flex flex-col items-center text-center mt-4 mb-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
        <h3 className="font-bold text-[20px] text-gray-900 mb-2">Nuage validé</h3>
        <p className="text-[14px] text-gray-500">Tes acquis et attentes ont bien été structurés par ORI.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[600px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-[20px]">Glisse chaque mot dans la bonne case</h3>
        {isReady && (
          <button onClick={validate} className="px-5 py-2 bg-[#E8002D] text-white text-[14px] font-medium rounded-lg hover:opacity-90 transition">Valider</button>
        )}
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        {/* Source Box */}
        <div className="p-4 bg-gray-50/50 pt-5">
           <div className="w-full flex mb-4 relative max-w-[300px] mx-auto">
             <input type="text" value={customWord} onChange={e => setCustomWord(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomWord()} placeholder="Ajouter un mot..." className="w-full text-xs py-2 pl-4 pr-10 border border-gray-200 rounded-full focus:outline-none focus:border-gray-300" />
             <button onClick={addCustomWord} className="absolute right-1 top-1 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200"><Plus className="w-3 h-3" /></button>
           </div>
           
           <div className="flex flex-wrap justify-center min-h-[100px]">
              {lists.source.map(w => (
                <DraggableWord key={w} id={w} isTouch={isTouch} onMove={(zone) => handleMoveMobile(w, zone)} />
              ))}
              {lists.source.length === 0 && <span className="text-gray-400 text-xs italic mt-4">Tous les mots sont placés !</span>}
           </div>
        </div>

        {/* Drop Zones */}
        <div className="p-4 bg-white grid grid-cols-3 gap-2">
           <DropZone id="liked" title="J'ai aimé ✓" items={lists.liked} color="green" isTouch={isTouch} onRemove={(w) => handleMoveMobile(w, 'source')} />
           <DropZone id="disliked" title="Pas aimé ✕" items={lists.disliked} color="red" isTouch={isTouch} onRemove={(w) => handleMoveMobile(w, 'source')} />
           <DropZone id="desired" title="J'aurais aimé ◇" items={lists.desired} color="yellow" isTouch={isTouch} onRemove={(w) => handleMoveMobile(w, 'source')} />
        </div>
      </DndContext>
    </div>
  );
}
