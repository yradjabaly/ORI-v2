import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { Loader2, ArrowRight, GraduationCap, Briefcase, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';

import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface LinkedInPathwayProps {
  formationId?: string;
  formationName?: string;
  sessionId?: string;
  messageId?: string;
  initialData?: any;
}

interface Stat {
  metier: string;
  pourcentage: number;
  couleur: string;
}

interface Etape {
  label: string;
  detail: string;
  type: 'formation' | 'stage' | 'poste';
}

interface LinkedInData {
  stats: Stat[];
  parcours: {
    prenom: string;
    formation: string;
    etapes: Etape[];
  };
  disclaimer: string;
}

export const LinkedInPathway: React.FC<LinkedInPathwayProps> = ({ 
  formationId, 
  formationName = "cette formation",
  sessionId,
  messageId,
  initialData 
}) => {
  const [data, setData] = useState<LinkedInData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[LinkedInPathway] useEffect fired', {
      initialData,
      hasData: !!initialData,
      formationId
    });
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const genAI = getGemini();
        
        const prompt = `Génère des données réalistes de débouchés LinkedIn pour la formation '${formationName}' (ID: ${formationId || 'N/A'}) en France. 
        JSON uniquement sans markdown:
        {
          "stats": [
            { "metier": string, "pourcentage": number, "couleur": string }
          ],
          "parcours": {
            "prenom": string,
            "formation": string,
            "etapes": [{ "label": string, "detail": string, "type": "formation"|"stage"|"poste" }]
          },
          "disclaimer": string
        }
        Génère 3 stats de débouchés réalistes et 1 parcours fictif mais plausible. Disclaimer: 'Données générées à titre illustratif'.`;

        const result = await genAI.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });
        const text = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const generatedData = JSON.parse(text);
        setData(generatedData);
        setLoading(false);

        // Save to Firestore
        if (sessionId && messageId) {
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
      } catch (err) {
        console.error("LinkedInPathway error:", err);
        setError("Impossible de charger les données LinkedIn.");
        setLoading(false);
      }
    };

    fetchData();
  }, [formationName, formationId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white border border-gray-100 rounded-3xl shadow-sm space-y-3">
        <Loader2 className="w-6 h-6 text-[#E8002D] animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Analyse des débouchés LinkedIn en cours...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-100 rounded-3xl text-red-600 text-sm">
        {error || "Une erreur est survenue."}
      </div>
    );
  }

  const getTypeIcon = (type: Etape['type']) => {
    switch (type) {
      case 'formation': return <GraduationCap className="w-3 h-3" />;
      case 'stage': return <MapPin className="w-3 h-3" />;
      case 'poste': return <Briefcase className="w-3 h-3" />;
    }
  };

  const getTypeColor = (type: Etape['type']) => {
    switch (type) {
      case 'formation': return 'bg-blue-500';
      case 'stage': return 'bg-orange-500';
      case 'poste': return 'bg-green-500';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-100 rounded-3xl shadow-lg p-6 space-y-8"
    >
      {/* Section 1: Stats */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#E8002D]">📊</span> Où vont les diplômés ?
        </h3>
        <div className="space-y-4">
          {data.stats.map((stat, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium text-gray-700">
                <span>{stat.metier}</span>
                <span>{stat.pourcentage}%</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stat.pourcentage}%` }}
                  transition={{ duration: 1, delay: i * 0.1 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: stat.couleur }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Pathway */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <span className="text-[#E8002D]">🛣️</span> Un parcours type : {data.parcours.prenom}
        </h3>
        <div className="relative flex items-start justify-between min-h-[100px] pt-4">
          {data.parcours.etapes.map((etape, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center text-center space-y-2 flex-1 relative z-10">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-1 h-4">
                  {etape.label}
                </div>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm",
                  getTypeColor(etape.type)
                )}>
                  {getTypeIcon(etape.type)}
                </div>
                <div className="text-[10px] text-gray-500 leading-tight max-w-[80px]">
                  {etape.detail}
                </div>
              </div>
              {i < data.parcours.etapes.length - 1 && (
                <div className="flex-1 flex items-center justify-center pt-8">
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </React.Fragment>
          ))}
          {/* Background line */}
          <div className="absolute top-[52px] left-[10%] right-[10%] h-[1px] bg-gray-100 -z-0" />
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-50">
        <p className="text-[10px] text-gray-400 italic">
          {data.disclaimer}
        </p>
      </div>
    </motion.div>
  );
};
