import React, { useState, useEffect } from 'react';
import { Loader2, Target, Info } from 'lucide-react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { cn } from '../lib/utils';

interface CampusVibeProps {
  formationId: string;
  formationName: string;
  etablissementName?: string;
  sessionId?: string;
  messageId?: number;
  initialData?: any;
  onComplete?: () => void;
}

const AXES = [
  { 
    id: 'rythme', 
    label: 'Rythme', 
    left: 'Modéré 😌', 
    right: '🔥 Intensif'
  },
  { 
    id: 'social', 
    label: 'Vie sociale', 
    left: 'Campus isolé 🏫', 
    right: '🏙️ Vie de ville'
  },
  { 
    id: 'competition', 
    label: 'Compétition', 
    left: 'Entraide 🤝', 
    right: '🏆 Compétitif'
  },
  { 
    id: 'pratique', 
    label: 'Pratique', 
    left: 'Théorique 📚', 
    right: '🛠️ Terrain'
  },
  { 
    id: 'charge', 
    label: 'Charge perso', 
    left: 'Raisonnable 🌱', 
    right: '💀 Lourde'
  }
];

export function CampusVibe({ 
  formationId, 
  formationName, 
  etablissementName,
  sessionId, 
  messageId, 
  initialData, 
  onComplete 
}: CampusVibeProps) {
  const [axes, setAxes] = useState<Record<string, number> | null>(
    initialData?.axes || null
  );
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    if (initialData?.axes) {
      setAxes(initialData.axes);
      setLoading(false);
      return;
    }
    const fetchAxes = async () => {
      setLoading(true);
      try {
        const aiInstance = getGemini();
        const contextName = etablissementName 
          ? `${formationName} à l'${etablissementName}`
          : formationName;

        const prompt = `Tu es ORI, expert des formations françaises post-bac.
  
Pour la formation "${contextName}", positionne-la sur 5 axes de 1 à 10.
  
Axes:
- rythme: 1=très modéré, 10=très intensif
- social: 1=campus très isolé, 10=grande ville animée
- competition: 1=très collaborative/entraide, 10=très compétitive/sélective
- pratique: 1=très théorique, 10=très pratique/terrain
- charge: 1=charge perso raisonnable, 10=charge de travail perso très lourde
  
Base-toi sur les caractéristiques réelles connues de ce type de formation en France.
  
Retourne UNIQUEMENT ce JSON:
{
  "rythme": 7,
  "social": 6,
  "competition": 5,
  "pratique": 8,
  "charge": 6
}`;
        
        const response = await aiInstance.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt
        });

        if (response.text) {
          const cleanJson = response.text.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          setAxes(parsed);
          setLoading(false);
          
          if (sessionId && messageId !== undefined) {
            const generatedData = { 
              axes: parsed, 
              formationId, 
              formationName 
            };
            const sessionRef = doc(db, 'sessions', sessionId);
            const sessionSnap = await getDoc(sessionRef);
            if (sessionSnap.exists()) {
              const msgs = sessionSnap.data().messages || [];
              if (msgs[messageId]) {
                msgs[messageId].componentData = generatedData;
                await updateDoc(sessionRef, { 
                  messages: msgs,
                  updatedAt: serverTimestamp()
                });
              }
            }
          }
          onComplete?.();
        }
      } catch (error) {
        console.error("Error fetching campus vibe axes:", error);
        setLoading(false);
      }
    };
    fetchAxes();
  }, [formationId, formationName, sessionId, messageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-white border border-gray-100 rounded-2xl shadow-sm mt-4 mb-2">
        <Loader2 className="animate-spin text-[#E8002D] w-6 h-6 mr-3"/>
        <span className="text-sm text-gray-500 font-medium">
          ORI analyse l'ambiance de la formation...
        </span>
      </div>
    );
  }

  if (!axes) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4 mb-2 shadow-sm font-sans">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Target className="w-5 h-5 text-[#E8002D]" />
          Ambiance & Rythme
        </h3>
        <p className="text-sm font-medium text-gray-400">
          {etablissementName 
            ? `${formationName} — ${etablissementName}`
            : formationName}
        </p>
        <div className="mt-2 p-2 bg-gray-50 rounded-lg flex items-start gap-2">
          <Info className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-gray-400 leading-relaxed italic">
            Estimation illustrative basée sur les caractéristiques connues de cette formation en France.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {AXES.map((axis) => {
          const value = axes[axis.id] || 5;
          const percentage = (value / 10) * 100;
          return (
            <div key={axis.id} className="relative">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#003D82]">{axis.label}</span>
              </div>
              
              <div className="relative h-2.5 rounded-full bg-gray-100/80 overflow-hidden">
                <div 
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ 
                    width: `${percentage}%`,
                    background: 'linear-gradient(to right, #e2e8f0, #003D82)'
                  }}
                />
              </div>
              <div
                className="absolute left-0 top-[11px] h-2.5 w-full pointer-events-none"
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 shadow-md transition-all duration-1000 ease-out z-10"
                  style={{ 
                    left: `calc(${percentage}% - 8px)`,
                    borderColor: '#003D82'
                  }}
                />
              </div>

              <div className="flex justify-between mt-1.5">
                <span className={`text-[11px] ${
                  value <= 4 ? 'text-gray-700 font-semibold' 
                             : 'text-gray-400 font-normal'
                }`}>{axis.left}</span>
                <span className={`text-[11px] ${
                  value >= 7 ? 'text-gray-700 font-semibold' 
                             : 'text-gray-400 font-normal'
                }`}>{axis.right}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
