import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Sparkles, MapPin, Briefcase, Heart, AlertCircle, ArrowRight } from 'lucide-react';
import { getGemini } from '../lib/gemini';

// We initialize a new specific model for this specific generation. 
// A production app might pass the instance down, but this ensures it works instantly here.



interface FlashForwardProps {
  formationIds: string[];
  onComplete: (choice: string) => void;
  sessionId?: string;
  messageId?: string;
  initialData?: any;
}

interface Narrative {
  formationId: string;
  nom: string;
  text: string;
  color: 'blue' | 'purple';
}

export function FlashForward({ formationIds, onComplete, sessionId, messageId, initialData }: FlashForwardProps) {
  const [step, setStep] = useState<'ASK' | 'LOADING' | 'SHOW'>(initialData ? 'SHOW' : 'ASK');
  const [narratives, setNarratives] = useState<Narrative[]>(initialData?.narratives || []);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  useEffect(() => {
    console.log('[FlashForward] useEffect fired', {
      initialData,
      hasData: !!initialData,
      formationIds
    });
    if (initialData) {
      setNarratives(initialData.narratives);
      setStep('SHOW');
    }
  }, [initialData]);

  const handleStart = async () => {
    setStep('LOADING');
    try {
      if (formationIds.length < 2) throw new Error("Besoin de 2 formations");

      const n1 = await fetchNarrative(formationIds[0], 'blue');
      const n2 = await fetchNarrative(formationIds[1], 'purple');

      const generatedNarratives = [n1, n2];
      setNarratives(generatedNarratives);
      setStep('SHOW');

      // Save to Firestore
      if (sessionId && messageId) {
        const generatedData = { narratives: generatedNarratives };
        const sessionRef = doc(db, 'sessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const msgs = sessionSnap.data().messages || [];
          const msgIdx = Number(messageId);
          if (!isNaN(msgIdx) && msgs[msgIdx]) {
            msgs[msgIdx].componentData = generatedData;
            await updateDoc(sessionRef, { 
              messages: msgs,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    } catch (e) {
      console.error("Failed to generate narratives", e);
      // Fallback
      onComplete("J'ai eu un bug pour afficher la projection. On revient aux formations.");
    }
  };

  const fetchNarrative = async (id: string, color: 'blue' | 'purple'): Promise<Narrative> => {
    const docSnap = await getDoc(doc(db, "formations", id));
    const nom = docSnap.exists() ? docSnap.data().nom : "Cette formation";

    const prompt = `Write a short narrative 'flash forward' for a student who chose ${nom} after high school. They now have 5 years of hindsight. Write in second person (tu), 4-5 sentences, present tense, realistic but positive. Include: job title, city, one thing they love about their career, one thing they sometimes miss. Make it authentic, not idealistic. Do NOT mention salary. Return plain text only, no markdown.`;

    const aiInstance = getGemini();
    const response = await aiInstance.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
    });

    return {
      formationId: id,
      nom,
      text: response.text || "Tu as tracé ta route et tu as trouvé ta place !",
      color
    };
  };

  const handleChoice = (choice: string) => {
    setSelectedChoice(choice);
    
    // We send a conversational payload back to the Chat
    let reply = "";
    if (choice === 'A') reply = `La version ${narratives[0].nom} me parle plus.`;
    else if (choice === 'B') reply = `La version ${narratives[1].nom} me parle plus.`;
    else if (choice === 'BOTH') reply = "Les deux me conviennent.";
    else reply = "Ni l'une ni l'autre.";

    setTimeout(() => {
      onComplete(reply);
    }, 500);
  };

  if (step === 'ASK') {
    return (
      <div className="flex flex-col gap-3 my-4 self-center w-full max-w-[800px]">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col items-center text-center">
          <Sparkles className="w-8 h-8 text-[#E8002D] mb-3" />
          <h3 className="font-bold text-[20px] text-gray-900 mb-2">Saut dans le temps</h3>
          <p className="text-gray-600 text-[14px] mb-6 max-w-[400px]">
            Tu veux voir à quoi ça pourrait ressembler dans 5 ans dans chaque cas ? Ce ne sont que des projections — mais ça aide parfois à trancher.
          </p>
          <div className="flex gap-3 w-full justify-center">
            <button 
              onClick={handleStart}
              className="bg-[#E8002D] hover:opacity-90 text-white font-medium px-5 py-2.5 rounded-lg transition"
            >
              Oui, montre-moi !
            </button>
            <button 
              onClick={() => onComplete("Non merci, continuons sans ça.")}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-medium px-5 py-2.5 rounded-lg transition"
            >
              Non merci, continuons
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'LOADING') {
    return (
      <div className="flex flex-col gap-3 my-4 self-center w-full max-w-[800px]">
         <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center min-h-[200px]">
            <div className="w-10 h-10 border-4 border-gray-100 border-t-[#E8002D] rounded-full animate-spin mb-4"></div>
            <p className="font-bold text-gray-900">Génération des futurs possibles...</p>
            <p className="text-[14px] text-gray-500 mt-1">Voyage dans le temps en cours ⏳</p>
         </div>
      </div>
    );
  }

  if (step === 'SHOW' && narratives.length === 2) {
    return (
      <div className="flex flex-col gap-4 my-6 w-full max-w-[800px] self-center">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A */}
          <div className="bg-white border border-gray-200 flex flex-col rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
             <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 border-l-4 border-l-blue-500">
                <span className="text-[11px] font-medium text-blue-600 uppercase tracking-widest mb-1 block">Option A</span>
                <h4 className="font-bold text-gray-900 leading-tight">{narratives[0].nom}</h4>
                <p className="text-blue-500 text-[12px] italic mt-1">5 ans plus tard...</p>
             </div>
             <div className="p-5 flex-1 relative border-l-4 border-l-blue-500">
                <p className="text-[14px] leading-[1.7] italic text-gray-700">
                  "{narratives[0].text}"
                </p>
             </div>
          </div>

          {/* Card B */}
          <div className="bg-white border border-gray-200 flex flex-col rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
             <div className="bg-purple-50 px-4 py-3 border-b border-purple-100 border-l-4 border-l-purple-500">
                <span className="text-[11px] font-medium text-purple-600 uppercase tracking-widest mb-1 block">Option B</span>
                <h4 className="font-bold text-gray-900 leading-tight">{narratives[1].nom}</h4>
                <p className="text-purple-500 text-[12px] italic mt-1">5 ans plus tard...</p>
             </div>
             <div className="p-5 flex-1 relative border-l-4 border-l-purple-500">
                <p className="text-[14px] leading-[1.7] italic text-gray-700">
                  "{narratives[1].text}"
                </p>
             </div>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center flex items-center justify-center gap-1 mt-2">
          ◎ Projection fictive générée par IA basée sur des données réelles
        </p>

        {!selectedChoice ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mt-4 flex flex-col items-center text-center">
             <h4 className="font-bold text-gray-900 mb-4 text-[16px]">Est-ce que l'une de ces deux visions te parle plus que l'autre ?</h4>
             <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 w-full">
                <button onClick={() => handleChoice('A')} className="bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 text-gray-700 text-[14px] font-medium py-2 px-4 rounded-lg transition">
                  La version {narratives[0].nom}
                </button>
                <button onClick={() => handleChoice('B')} className="bg-white border border-gray-200 hover:border-purple-500 hover:text-purple-600 text-gray-700 text-[14px] font-medium py-2 px-4 rounded-lg transition">
                  La version {narratives[1].nom}
                </button>
                <button onClick={() => handleChoice('BOTH')} className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-[14px] font-medium py-2 px-4 rounded-lg transition">
                  Les deux !
                </button>
                <button onClick={() => handleChoice('NONE')} className="bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-[14px] font-medium py-2 px-4 rounded-lg transition">
                  Aucune des deux
                </button>
             </div>
          </div>
        ) : null}

      </div>
    );
  }

  return null;
}
