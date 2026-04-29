import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { Type } from '@google/genai';
import { Check, AlertTriangle, ChevronDown, ChevronUp, Loader2, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { resolveEntity } from '../lib/resolveEntity';

interface ComparisonTableProps {
  formationIds: string[];
  userId: string;
  onComplete: (dealbreakerQuestion: string) => void;
  sessionId?: string;
  messageId?: string;
  initialData?: any;
}

interface FormationData {
  id: string;
  nom: string;
  duree: number;
  cout: number;
  alternance: boolean;
  selectivite: number;
  salaireJunior: number;
  type: string;
  localisation: string[];
  isGuessed?: boolean;
}

interface GeminiAnalysis {
  pourToi: string[];
  aPeser: string[];
  journeeType: {
    heure: string;
    activite: string;
    detail: string;
    type: 'cours' | 'td' | 'projet' | 'entreprise' | 'autonome';
  }[];
}

const TYPE_STYLES: Record<string, string> = {
  cours: 'border-l-blue-500',
  td: 'border-l-purple-500',
  projet: 'border-l-green-500',
  entreprise: 'border-l-orange-500',
  autonome: 'border-l-gray-400',
};

const COLORS = [
  { header: 'bg-blue-100 text-blue-800', border: 'border-blue-200' },
  { header: 'bg-purple-100 text-purple-800', border: 'border-purple-200' },
  { header: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200' },
];

export function ComparisonTable({ formationIds, userId, onComplete, sessionId, messageId, initialData }: ComparisonTableProps) {
  const [formations, setFormations] = useState<FormationData[]>(initialData?.formations || []);
  const [analyses, setAnalyses] = useState<Record<string, GeminiAnalysis>>(initialData?.analyses || {});
  const [loading, setLoading] = useState(!initialData);
  const [showJourneeTask, setShowJourneeTask] = useState<Record<string, boolean>>({});

  useEffect(() => {
    console.log('[ComparisonTable] useEffect fired', {
      initialData,
      hasData: !!initialData,
      formationIds
    });
    if (initialData) {
      setFormations(initialData.formations);
      setAnalyses(initialData.analyses || {});
      setLoading(false);
      return;
    }

    let isCanceled = false;
    async function fetchData() {
      try {
        // Fetch User
        const userDoc = await getDoc(doc(db, "users", userId));
        const swipeProfile = userDoc.exists() ? userDoc.data().swipeProfile || "Un élève en recherche d'orientation" : "Un élève";

        // Fetch Formations
        const fetchedFormations: FormationData[] = [];
        for (const idOrName of formationIds) {
          const resolved = await resolveEntity(idOrName.trim());
          fetchedFormations.push({
            id: resolved.id,
            nom: resolved.nom,
            duree: resolved.duree,
            cout: resolved.cout,
            alternance: resolved.alternance,
            selectivite: resolved.selectivite,
            salaireJunior: resolved.salaireJunior,
            type: resolved.type,
            localisation: [], // resolved.localisation if added to type
            isGuessed: resolved.source === 'gemini'
          } as FormationData);
        }
        
        if (isCanceled) return;
        setFormations(fetchedFormations);

        // Fetch Gemini Analysis specific to each formation relative to the user
        const newAnalyses: Record<string, GeminiAnalysis> = {};
        
        for (const f of fetchedFormations) {
          const prompt = `Given this user profile: "${swipeProfile}", analyze formation "${f.nom}" with these attributes: ${JSON.stringify(f)}. Generate:
- 'pourToi': array of 2-4 strings starting with ✓ explaining what matches the profile (in French, specific to declared preferences)
- 'aPeser': array of 1-3 strings starting with ! explaining divergences from profile (in French, honest but not discouraging)
- 'journeeType': Génère une journée type réaliste pour un étudiant en ${f.nom} en France. Retourne UNIQUEMENT ce JSON:
[
  { "heure": "8h30", "activite": "titre court", "detail": "une phrase max", "type": "cours"|"td"|"projet"|"entreprise"|"autonome" }
]
Génère exactement 5 créneaux horaires réalistes. Sois précis et spécifique à cette formation, pas générique.
Return as JSON only.`;

          const aiInstance = getGemini();
          const response = await aiInstance.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  pourToi: { type: Type.ARRAY, items: { type: Type.STRING } },
                  aPeser: { type: Type.ARRAY, items: { type: Type.STRING } },
                  journeeType: { 
                    type: Type.ARRAY, 
                    items: { 
                      type: Type.OBJECT,
                      properties: {
                        heure: { type: Type.STRING },
                        activite: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        type: { type: Type.STRING }
                      },
                      required: ["heure", "activite", "detail", "type"]
                    } 
                  }
                },
                required: ["pourToi", "aPeser", "journeeType"]
              }
            }
          });
          
          if (response.text) {
             newAnalyses[f.id] = JSON.parse(response.text);
          }
        }
        
        if (isCanceled) return;
        setAnalyses(newAnalyses);
        setLoading(false);

        // Save to Firestore
        if (sessionId && messageId) {
          const generatedData = { formations: fetchedFormations, analyses: newAnalyses };
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

        // Calculate dealbreaker for onComplete hook
        let criticalDivergence = "";
        let targetFormation = "";
        
        for (const f of fetchedFormations) {
          if (newAnalyses[f.id] && newAnalyses[f.id].aPeser.length > 0) {
            criticalDivergence = newAnalyses[f.id].aPeser[0].replace('!', '').trim();
            targetFormation = f.nom;
            break;
          }
        }

        if (criticalDivergence) {
           const dealbreakerQuestion = `Concernant ${targetFormation}, tu as noté : "${criticalDivergence}". Est-ce que ça, c'est vraiment éliminatoire pour toi ?`;
           onComplete(dealbreakerQuestion);
        } else {
           onComplete("Ces options semblent très bien correspondre à ton profil. Laquelle te tente le plus ?");
        }

      } catch (err) {
        console.error("Error fetching comparison data", err);
        if (!isCanceled) setLoading(false);
      }
    }

    if (formationIds.length > 0) fetchData();
    return () => { isCanceled = true; };
  }, [formationIds.join(','), userId]);

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
        <span className="text-[14px] text-gray-500 font-medium">ORI analyse ces formations pour toi...</span>
      </div>
    );
  }

  if (formations.length === 0) return null;
  const hasGuessed = formations.some(f => f.isGuessed);

  return (
    <div className="w-full max-w-full flex flex-col gap-2 mt-4 mb-4">
      {hasGuessed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 mx-4">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-800 leading-relaxed italic">
            Une ou plusieurs formations n'ont pas été trouvées dans notre base de données. 
            <strong> ORI a simulé leurs caractéristiques</strong> pour te permettre de comparer quand même.
          </p>
        </div>
      )}
      <div className="w-full overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
      {/* 
        SECTION 1: DATA TABLE 
      */}
      <div className="min-w-[600px] w-full p-4">
        <div className="flex w-full mt-2 mb-4 border-b border-gray-200 pb-2">
          <div className="w-[110px] shrink-0"></div>
          {formations.map((f, i) => (
            <div key={f.id} className="flex-1 px-3">
              <div className={cn("px-3 py-2 rounded-xl text-center text-sm font-bold flex flex-col items-center justify-center min-h-[48px]", COLORS[i % COLORS.length].header)}>
                <span>{f.nom}</span>
                {f.isGuessed && (
                  <span className="text-[9px] uppercase tracking-tighter opacity-70">ID non trouvé</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Row: Durée */}
        <div className="flex w-full py-3 border-b border-gray-50 items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Durée</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center text-sm font-medium text-gray-800">
                Bac +{f.duree}
              </div>
            ))}
        </div>

        {/* Row: Coût */}
        <div className="flex w-full py-3 border-b border-gray-50 items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Coût</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center text-sm font-medium text-gray-800">
                {f.cout === 0 ? "Gratuit / Public" : `${f.cout} €/an`}
              </div>
            ))}
        </div>

        {/* Row: Alternance */}
        <div className="flex w-full py-3 border-b border-gray-50 items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Alternance</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center text-sm font-medium text-gray-800 flex items-center justify-center gap-1">
                {f.alternance ? <><span className="text-green-500 font-bold">✓</span> Oui</> : <><span className="text-red-500 font-bold">✗</span> Non</>}
              </div>
            ))}
        </div>

        {/* Row: Sélectivité */}
        <div className="flex w-full py-3 border-b border-gray-50 items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Sélectivité</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center flex items-center justify-center gap-0.5">
                {[1,2,3,4,5].map(dot => (
                  <span key={dot} className={cn("text-lg leading-none", dot <= f.selectivite ? "text-[#E8002D]" : "text-gray-200")}>●</span>
                ))}
              </div>
            ))}
        </div>
        
        {/* Row: Salaire Junior */}
        <div className="flex w-full py-3 border-b border-gray-50 items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Salaire Junior</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center text-sm font-medium text-gray-800">
                ~{f.salaireJunior} €<span className="text-xs text-gray-400 font-normal">/mois</span>
              </div>
            ))}
        </div>

        {/* Row: Journée Type */}
        <div className="flex flex-col w-full py-3">
          <div className="flex w-full items-center">
            <div className="w-[110px] shrink-0 text-xs font-bold text-gray-400 tracking-wider uppercase">Journée type</div>
            {formations.map(f => (
              <div key={f.id} className="flex-1 px-3 text-center">
                <button 
                  onClick={() => setShowJourneeTask(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                  className="text-[11px] font-bold text-[#E8002D] hover:underline flex items-center justify-center w-full gap-1"
                >
                  {showJourneeTask[f.id] ? <>Masquer la journée <ChevronUp className="w-3 h-3" /></> : <>Voir la journée type <ChevronDown className="w-3 h-3" /></>}
                </button>
              </div>
            ))}
          </div>
          {formations.some(f => showJourneeTask[f.id]) && (
             <div className="flex w-full mt-3">
               <div className="w-[110px] shrink-0"></div>
               {formations.map(f => (
                 <div key={f.id} className="flex-1 px-3">
                   {showJourneeTask[f.id] ? (
                     <div className="flex flex-col gap-1">
                       {analyses[f.id]?.journeeType.map((slot, i) => (
                         <div 
                           key={i} 
                           className={cn(
                             "p-1.5 border-l-[3px] flex flex-col gap-0.5",
                             TYPE_STYLES[slot.type] || 'border-l-gray-400'
                           )}
                         >
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-900">{slot.heure}</span>
                             <span className="text-[11px] font-bold text-gray-900">{slot.activite}</span>
                           </div>
                           <p className="text-[10px] text-gray-500 italic leading-tight">
                             {slot.detail}
                           </p>
                         </div>
                       ))}
                     </div>
                   ) : <div />}
                 </div>
               ))}
             </div>
          )}
        </div>
      </div>

      {/* 
        SECTION 2: POUR TOI / À PESER 
      */}
      <div className="min-w-[600px] w-full p-4 border-t border-gray-100 bg-gray-50/50 flex gap-4">
         {formations.map(f => (
           <div key={f.id} className="flex-1 flex flex-col gap-3">
             {/* Pour toi block */}
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-green-50 px-3 py-2 border-b border-green-100 flex items-center gap-2">
                   <div className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center text-green-700">✓</div>
                   <span className="text-xs font-bold text-green-800">Pour toi</span>
                </div>
                <div className="p-3">
                   <ul className="flex flex-col gap-2">
                     {analyses[f.id]?.pourToi.map((item, idx) => (
                       <li key={idx} className="text-[11px] text-gray-700 leading-snug flex items-start line-clamp-3">
                         <span className="text-green-500 mr-1 shrink-0 font-medium">✓</span> {item.replace('✓', '').trim()}
                       </li>
                     ))}
                   </ul>
                </div>
             </div>

             {/* A Peser block */}
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-orange-50 px-3 py-2 border-b border-orange-100 flex items-center gap-2">
                   <div className="w-5 h-5 rounded-full bg-orange-200 flex items-center justify-center text-orange-700">!</div>
                   <span className="text-xs font-bold text-orange-800">À peser</span>
                </div>
                <div className="p-3">
                   <ul className="flex flex-col gap-2">
                     {analyses[f.id]?.aPeser.map((item, idx) => (
                       <li key={idx} className="text-[11px] text-gray-700 leading-snug flex items-start line-clamp-3">
                         <span className="text-orange-500 mr-1 shrink-0 font-medium">!</span> {item.replace('!', '').trim()}
                       </li>
                     ))}
                   </ul>
                </div>
             </div>

           </div>
         ))}
      </div>
    </div>
  </div>
);
}
