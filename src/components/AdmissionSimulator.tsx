import { useState, useEffect } from 'react';
import { Loader2, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { resolveEntity } from '../lib/resolveEntity';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AdmissionSimulatorProps {
  formationId: string;
  onComplete: (level: 'bonne' | 'moyenne' | 'difficile') => void;
  sessionId?: string;
  messageId?: string;
  initialData?: Record<string, any>;
}

const ALL_SPECIALTIES = ['Maths', 'NSI', 'Physique', 'SES', 'Sciences', 'HLP', 'Humanités', 'LLCE', 'Arts'];

export function AdmissionSimulator({ formationId, onComplete, sessionId, messageId, initialData }: AdmissionSimulatorProps) {
  const [frozenId] = useState(initialData?.formationId || formationId);
  const [formation, setFormation] = useState<any>(initialData?.formation || null);
  const [loading, setLoading] = useState(!initialData?.formation);
  const [moyenne, setMoyenne] = useState<number>(12);
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [resultGiven, setResultGiven] = useState(false);

  useEffect(() => {
    console.log('[AdmissionSimulator] useEffect fired', {
      initialData,
      hasData: !!initialData,
      frozenId
    });
    if (initialData?.formation) return;

    async function fetchFormation() {
      try {
        const resolved = await resolveEntity(frozenId.trim());
        const data = {
          nom: resolved.nom,
          moyenneMin: 11,
          moyenneMax: 16,
          bonusSpecialites: ['Maths','NSI','Physique','SES','Sciences','HLP'],
          tauxAdmission: 42
        };
        setFormation(data);

        // Persistence
        if (sessionId && messageId) {
          try {
            const sessionRef = doc(db, 'sessions', sessionId);
            const sessionSnap = await getDoc(sessionRef);
            if (sessionSnap.exists()) {
              const msgs = sessionSnap.data().messages || [];
              const msgIdx = Number(messageId);
              if (!isNaN(msgIdx) && msgs[msgIdx]) {
                msgs[msgIdx].componentData = { formationId: frozenId, formation: data };
                await updateDoc(sessionRef, { 
                  messages: msgs,
                  updatedAt: serverTimestamp()
                });
              }
            }
          } catch(e) {
            console.error("Failed to persist simulator data", e);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchFormation();
  }, [frozenId, initialData, sessionId, messageId]);

  const toggleSpec = (spec: string) => {
    setSelectedSpecs(prev => 
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
  };

  if (loading) {
     return (
       <div className="w-full flex flex-col items-center justify-center p-8 bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4">
         <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
         <span className="text-[14px] text-gray-500 font-medium">Chargement du simulateur...</span>
       </div>
     );
  }

  if (!formation) return null;

  const validBonusSpecs = formation.bonusSpecialites.filter((s: string) => selectedSpecs.includes(s)).length;
  // Score formula
  const score = (moyenne / 16 * 50) + (validBonusSpecs * 12);
  
  let resultType: 'bonne' | 'moyenne' | 'difficile' = 'bonne';
  if (score < 45) resultType = 'difficile';
  else if (score < 70) resultType = 'moyenne';

  const sendResult = () => {
    setResultGiven(true);
    onComplete(resultType);
  };

  const getSliderColor = (val: number) => {
    if (val < 11) return '#EF4444'; // red-500
    if (val < 14) return '#F97316'; // orange-500
    return '#22C55E'; // green-500
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4 overflow-hidden flex flex-col">
      {/* HEADER */}
      <div className="bg-[#E8002D] text-white p-4">
        <h3 className="font-bold text-[20px] leading-tight">{formation.nom}</h3>
        <p className="text-[11px] font-medium text-red-100 mt-1 flex items-center gap-1 opacity-90 tracking-wide">
          <Info className="w-3 h-3" />
          Estimation basée sur Parcoursup 2024
        </p>
      </div>

      <div className="p-5 flex flex-col gap-6">
        {/* MOYENNE SLIDER */}
        <div className="flex flex-col gap-3">
           <label className="text-sm font-bold text-gray-800 flex justify-between">
              Ta moyenne générale : 
              <span className="text-[#E8002D]">{moyenne}/20</span>
           </label>
           <div className="relative pt-1 pb-2">
             <input
               type="range"
               min={8}
               max={20}
               step={0.5}
               value={moyenne}
               onChange={(e) => setMoyenne(parseFloat(e.target.value))}
               disabled={resultGiven}
               className={cn(
                 "w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E8002D]/50 bg-gray-200"
               )}
               style={{
                 accentColor: getSliderColor(moyenne),
                 background: `linear-gradient(to right, ${getSliderColor(moyenne)} 0%, ${getSliderColor(moyenne)} ${((moyenne - 8)/(20 - 8))*100}%, #e5e7eb ${((moyenne - 8)/(20 - 8))*100}%, #e5e7eb 100%)`
               }}
             />
             <div className="flex justify-between w-full text-[10px] text-gray-400 font-medium px-1 mt-1">
               <span>8</span>
               <span>10</span>
               <span>12</span>
               <span>14</span>
               <span>16</span>
               <span>18</span>
               <span>20</span>
             </div>
           </div>
        </div>

        {/* SPECIALTIES MULTI-SELECT */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold text-gray-800 flex justify-between">
            Tes spécialités :
            <span className="text-gray-500 font-normal text-xs">{selectedSpecs.length} sélectionnée(s)</span>
          </label>
          <div className="flex flex-wrap gap-2">
             {ALL_SPECIALTIES.map(spec => {
               const isSelected = selectedSpecs.includes(spec);
               return (
                 <button
                   key={spec}
                   disabled={resultGiven}
                   onClick={() => toggleSpec(spec)}
                   className={cn(
                     "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                     isSelected 
                       ? "bg-[#E8002D] text-white border-[#E8002D]" 
                       : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"
                   )}
                 >
                   {spec}
                 </button>
               );
             })}
          </div>
        </div>

        {/* LIVE RESULT CARD */}
        {resultType === 'bonne' && (
          <div className="bg-green-50 rounded-xl p-4 border border-green-200 flex flex-col gap-2">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm leading-none shrink-0 border border-green-600 shadow-sm">✓</div>
               <h4 className="font-bold text-green-900 text-sm">Probabilité : Bonne</h4>
             </div>
             <p className="text-xs text-green-800 leading-tight">Ton dossier est dans la fourchette des profils habituellement admis. Continue à soigner tes notes en Terminale.</p>
          </div>
        )}

        {resultType === 'moyenne' && (
          <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 flex flex-col gap-2">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm leading-none shrink-0 border border-orange-600 shadow-sm">⚡</div>
               <h4 className="font-bold text-orange-900 text-sm">Probabilité : Moyenne</h4>
             </div>
             <p className="text-xs text-orange-800 leading-tight">Ton profil est dans la zone de tension. Mets ce choix en plan B solide et postule aussi à une alternative accessible.</p>
          </div>
        )}

        {resultType === 'difficile' && (
          <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex flex-col gap-2">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm leading-none shrink-0 border border-red-600 shadow-sm">✕</div>
               <h4 className="font-bold text-red-900 text-sm">Probabilité : Difficile</h4>
             </div>
             <p className="text-xs text-red-800 leading-tight">Ce dossier sera compliqué pour cette formation. ORI peut te proposer 2-3 alternatives qui te ressemblent autant.</p>
          </div>
        )}
        
        <div className="w-full text-center">
            <p className="text-[11px] text-gray-500 mb-3">Estimation indicative — basée sur les profils Parcoursup 2024.</p>
            {!resultGiven && (
              <button 
                onClick={sendResult}
                className="w-full bg-[#E8002D] hover:opacity-90 text-white font-medium py-2.5 rounded-lg shadow-sm transition-colors text-[14px]"
              >
                Sauvegarder ma simulation
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
