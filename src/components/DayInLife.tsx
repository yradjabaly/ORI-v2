import { useState, useEffect } from 'react';
import { Type, Schema } from '@google/genai';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { resolveEntity } from '../lib/resolveEntity';

import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface Slot {
  time: string;
  title: string;
  description: string;
  color: 'purple' | 'red' | 'green' | 'blue' | 'orange' | 'gray';
}

interface DayInLifeProps {
  formationId: string;
  onComplete: () => void;
  sessionId?: string;
  messageId?: string;
  initialData?: any;
}

const colorMap: Record<string, { border: string; dot: string }> = {
  purple: { border: '#8b5cf6', dot: '#8b5cf6' },
  red:    { border: '#ef4444', dot: '#ef4444' },
  green:  { border: '#22c55e', dot: '#22c55e' },
  blue:   { border: '#3b82f6', dot: '#3b82f6' },
  orange: { border: '#f97316', dot: '#f97316' },
  gray:   { border: '#9ca3af', dot: '#9ca3af' },
  yellow: { border: '#eab308', dot: '#eab308' },
};

export function DayInLife({ formationId, onComplete, sessionId, messageId, initialData }: DayInLifeProps) {
  const [slots, setSlots] = useState<Slot[]>(initialData?.slots || []);
  const [formationName, setFormationName] = useState<string>(initialData?.formationName || '');
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    console.log('[DayInLife] useEffect fired', {
      initialData,
      hasData: !!initialData,
      formationId
    });
    if (initialData) {
      setSlots(initialData.slots);
      setFormationName(initialData.formationName);
      setLoading(false);
      return;
    }

    let isCanceled = false;
    
    async function fetchTimeline() {
      try {
        let realName = formationId;
        try {
          const formDoc = await getDoc(doc(db, 'formations', formationId.trim()));
          if (formDoc.exists()) {
            realName = formDoc.data().nom;
          } else {
            const resolved = await resolveEntity(formationId.trim());
            realName = resolved.nom || formationId;
          }
        } catch (e) {
          realName = formationId;
        }
        
        if (isCanceled) return;
        setFormationName(realName);

        const prompt = `Génère une journée type pour un étudiant en ${realName}. Retourne exactement 6-7 créneaux horaires au format JSON :
[{ "time": "8h00", "title": "Titre de l'activité", "description": "Une phrase de contexte", "color": "purple" }]
Base-toi sur des emplois du temps réels et typiques. Rends le contenu engageant et spécifique. Les couleurs indiquent le type d'activité : purple=cours théorique, red=TD pratique, green=projet/groupe, blue=entreprise/stage, orange=autonome/perso, gray=pause. Retourne uniquement le JSON, sans markdown.`;

        const schema: Schema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              color: { type: Type.STRING }
            },
            required: ["time", "title", "description", "color"]
          }
        };

        const aiInstance = getGemini();
        const response = await aiInstance.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema
          }
        });
        
        if (response.text) {
           const parsedSlots = JSON.parse(response.text) as Slot[];
           console.log('[DayInLife] parsed result:', JSON.stringify(parsedSlots));
           console.log('[DayInLife] slots (direct):', parsedSlots);
           console.log('[DayInLife] slots length:', parsedSlots?.length);
           
           if (!isCanceled) {
             setSlots(parsedSlots);
             setLoading(false);
             console.log('[DayInLife] state after setSlots:', slots, 'loading:', loading);
             console.log('[DayInLife] state updated (local vars):', parsedSlots, 'loading: false');

             // Save to Firestore
             if (sessionId && messageId) {
               const generatedData = { slots: parsedSlots, formationName: realName };
               const sessionRef = doc(db, 'sessions', sessionId);
               const sessionSnap = await getDoc(sessionRef);
               if (sessionSnap.exists()) {
                 const msgs = sessionSnap.data().messages || [];
                 const msgIdx = Number(messageId);
                 if (!isNaN(msgIdx) && msgs[msgIdx]) {
                   msgs[msgIdx].componentData = generatedData;
                   await updateDoc(sessionRef, { messages: msgs, updatedAt: serverTimestamp() });
                 }
               }
             }

             // Trigger auto follow-up after rendering the timeline smoothly
             setTimeout(() => {
                onComplete();
             }, 800);
           }
        }
      } catch (err) {
        console.error("Error fetching Day in Life schedule", err);
        if (!isCanceled) setLoading(false);
      }
    }

    fetchTimeline();
    return () => { isCanceled = true; };
  }, [formationId]);

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
        <span className="text-[14px] text-gray-500 font-medium">ORI génère la journée type...</span>
      </div>
    );
  }

  console.log('[DayInLife] rendering, slots state:', slots, 'length:', slots?.length);
  if (slots.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4 p-5">
      <h3 className="font-bold text-gray-900 text-[20px] mb-6 text-center">
        Une journée en {formationName}
      </h3>

      <div className="relative">
        {/* Track Line - thin vertical line */}
        <div className="absolute top-2 bottom-4 left-[56px] w-[2px] bg-[#E8002D] opacity-80" />
        
        <div className="flex flex-col gap-4 relative z-10 w-full">
          {slots.map((slot, idx) => {
            const mappedColor = colorMap[slot.color] || colorMap.gray;
            return (
              <div 
                key={idx} 
                className="flex items-start gap-4" 
                style={{}}
              >
                {/* Time */}
                <div className="w-10 text-right text-xs font-bold text-gray-600 mt-1.5 shrink-0">
                  {slot.time}
                </div>
                
                {/* Timeline Dot */}
                <div className="shrink-0 w-4 pl-1 flex justify-center mt-1.5">
                  <div 
                    className="rounded-full border-[3px] border-white shadow-sm z-10" 
                    style={{ 
                      backgroundColor: mappedColor.dot, 
                      width: '14px', 
                      height: '14px' 
                    }} 
                  />
                </div>
                
                {/* Content Card */}
                <div 
                  className="flex-1 bg-white rounded-lg shadow-sm px-3 py-2 ring-1 ring-gray-100"
                  style={{ 
                    borderLeftColor: mappedColor.border,
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid'
                  }}
                >
                  <div className="font-bold text-[13px] text-gray-900">{slot.title}</div>
                  <div className="text-[12px] text-gray-500 mt-0.5 leading-snug">{slot.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
