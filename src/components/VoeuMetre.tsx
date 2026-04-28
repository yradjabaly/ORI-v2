import React, { useState, useEffect } from 'react';
import { 
  getDocs, 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGemini } from '../lib/gemini';
import { Loader2, Search, X, Check, AlertCircle, TrendingUp, ShieldCheck, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface VoeuMetreProps {
  userId: string;
  sessionId?: string;
  messageId?: number;
  initialData?: any;
  onComplete?: () => void;
}

const SPECIALITES_OPTIONS = [
  'Maths', 'NSI', 'Physique-Chimie', 'SVT', 'SES', 
  'HLP', 'LLCE Anglais', 'LLCE Espagnol', 'Arts', 
  'Histoire-Géo-Géopolitique', 'Philosophie', 'STMG'
];

export function VoeuMetre({ 
  userId, 
  sessionId, 
  messageId, 
  initialData, 
  onComplete 
}: VoeuMetreProps) {
  const [step, setStep] = useState<'form' | 'result'>(
    initialData?.completed ? 'result' : 'form'
  );
  
  const [matieres, setMatieres] = useState<Record<string, string>>(
    initialData?.matieres || {
      'Français': '', 'Maths': '', 'Histoire-Géo': '',
      'Anglais': '', 'Spécialité 1': '', 'Spécialité 2': ''
    }
  );
  
  const [specialites, setSpecialites] = useState<string[]>(
    initialData?.specialites || []
  );
  
  const [selectedVoeux, setSelectedVoeux] = useState<any[]>(
    initialData?.voeux || []
  );
  
  const [availableVoeux, setAvailableVoeux] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [result, setResult] = useState<any>(initialData?.result || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchVoeux = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'voeux'));
        const voeux = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAvailableVoeux(voeux);
      } catch (error) {
        console.error("Error fetching voeux:", error);
      }
    };
    if (step === 'form') {
      fetchVoeux();
    }
  }, [step]);

  const toggleSpecialite = (s: string) => {
    if (specialites.includes(s)) {
      setSpecialites(specialites.filter(item => item !== s));
    } else if (specialites.length < 2) {
      setSpecialites([...specialites, s]);
    }
  };

  const filteredVoeux = availableVoeux
    .filter(v => 
      v.nom.toLowerCase().includes(searchQuery.toLowerCase()) && 
      !selectedVoeux.some(sv => sv.id === v.id)
    )
    .slice(0, 8);

  const analyzeVoeux = async () => {
    setLoading(true);
    try {
      const filled = Object.values(matieres).filter(v => v !== '');
      const moyenne = filled.length > 0 
        ? filled.reduce((a, b) => a + Number(b), 0) / filled.length 
        : 10;
        
      const aiInstance = getGemini();
      const prompt = `Tu es un conseiller Parcoursup expert.
  
Profil élève:
- Moyenne générale: ${moyenne.toFixed(1)}/20
- Spécialités: ${specialites.join(', ') || 'non renseignées'}
- Notes par matière: ${JSON.stringify(matieres)}

Liste de vœux (${selectedVoeux.length} vœux):
${selectedVoeux.map((v, i) => `${i+1}. ID: "${v.id}" — ${v.nom}
  - Sélectivité: ${v.selectivite}/5
  - Moyenne admis: ${v.moyenneAdmis}/20
  - Grille CEV: Résultats ${v.grilleCEV?.resultats}%, Motivation ${v.grilleCEV?.motivation}%, Méthodes ${v.grilleCEV?.methodes}%, Savoir-être ${v.grilleCEV?.savoirEtre}%
  - Bonus spécialités: ${v.bonusSpecialites?.join(', ')}
`).join('\n')}

IMPORTANT: Dans classifications, utilise EXACTEMENT le champ ID fourni (ex: V018) comme voeuxId, pas le nom de la formation.

Pour chaque vœu, classe-le en:
- "reve": formation très ambitieuse pour ce profil
- "realiste": formation accessible et cohérente
- "parachute": quasi-garanti pour ce profil

Prends en compte:
1. L'écart entre la moyenne de l'élève et la moyenne des admis de la formation
2. La pondération CEV (si résultats=80%, les notes comptent beaucoup)
3. Si l'élève a des spécialités bonus pour cette formation

Retourne UNIQUEMENT ce JSON:
{
  "classifications": [
    { "voeuxId": "...", "categorie": "reve|realiste|parachute", "raison": "Une phrase courte" }
  ],
  "bilan": {
    "reve": number, "realiste": number, "parachute": number,
    "equilibre": "equilibree|trop_risquee|trop_safe",
    "conseil": "2 phrases de conseil personnalisé"
  }
}`;

      const response = await aiInstance.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt
      });

      if (response.text) {
        const cleanJson = response.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        
        console.log('[VoeuMetre] raw parsed result:', JSON.stringify(parsed));
        console.log('[VoeuMetre] classifications voeuxIds:', parsed.classifications?.map((c: any) => c.voeuxId));
        console.log('[VoeuMetre] selectedVoeux ids:', selectedVoeux.map(v => v.id));

        setResult(parsed);
        setStep('result');

        // Save to Firestore
        if (sessionId && messageId !== undefined) {
          const generatedData = {
            completed: true,
            voeux: selectedVoeux,
            matieres,
            specialites,
            result: parsed
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
      }
    } catch (error) {
      console.error("Error analyzing voeux:", error);
    } finally {
      setLoading(false);
      onComplete?.();
    }
  };

  const isFormValid = selectedVoeux.length > 0 && Object.values(matieres).some(v => v !== '');

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm mt-4 mb-2">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
        <p className="text-gray-500 font-medium italic text-center">
          ORI analyse l'équilibre de tes vœux...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4 mb-2 shadow-sm font-sans max-w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {step === 'form' ? (
          <motion.div 
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Tes notes du dernier trimestre</h3>
              <p className="text-xs text-gray-500 mb-3">Donne ta moyenne approximative par matière</p>
              <div className="space-y-1">
                {Object.keys(matieres).map(matiere => (
                  <div key={matiere} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-700">{matiere}</span>
                    <input
                      type="number" min="0" max="20" step="0.5"
                      placeholder="—"
                      value={matieres[matiere]}
                      onChange={(e) => setMatieres({
                        ...matieres, [matiere]: e.target.value
                      })}
                      className="w-16 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:ring-1 focus:ring-[#003D82] outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Tes spécialités</h3>
              <p className="text-xs text-gray-500 mb-3">Sélectionne celles que tu as gardées en Terminale</p>
              <div className="flex flex-wrap gap-2">
                {SPECIALITES_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSpecialite(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                      specialites.includes(s)
                        ? "bg-[#003D82] text-white border-[#003D82]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Tes 10 vœux Parcoursup</h3>
              <p className="text-xs text-gray-500 mb-3">Choisis parmi les formations disponibles (max 10)</p>
              
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  placeholder="Rechercher une formation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-[#003D82]"
                />
              </div>

              {searchQuery && filteredVoeux.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden mb-4 bg-gray-50">
                  {filteredVoeux.map(v => (
                    <button
                      key={v.id}
                      onClick={() => {
                        if (selectedVoeux.length < 10) {
                          setSelectedVoeux([...selectedVoeux, v]);
                          setSearchQuery('');
                        }
                      }}
                      className="w-full text-left p-3 hover:bg-white border-b border-gray-100 last:border-0 transition-colors flex items-center justify-between group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-gray-800 truncate">{v.nom}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-tight">{v.ville}</div>
                      </div>
                      <div className="flex gap-0.5 ml-2">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < v.selectivite ? "bg-red-500" : "bg-gray-200")} />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-2">
                {selectedVoeux.map(v => (
                  <div key={v.id} className="bg-[#003D82]/5 text-[#003D82] border border-[#003D82]/20 px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1.5 animate-in zoom-in-95">
                    <span className="truncate max-w-[120px]">{v.nom}</span>
                    <button onClick={() => setSelectedVoeux(selectedVoeux.filter(sv => sv.id !== v.id))}>
                      <X className="w-3 h-3 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{selectedVoeux.length}/10 vœux sélectionnés</div>
            </div>

            <button
              onClick={analyzeVoeux}
              disabled={!isFormValid}
              className={cn(
                "w-full font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 text-sm uppercase tracking-widest",
                isFormValid 
                  ? "bg-[#E8002D] text-white hover:bg-[#c00025]" 
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              Analyser ma liste 📊
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            {(() => {
              const validClassifications = result.classifications.filter(
                (c: any) => selectedVoeux.some(v => v.id === c.voeuxId || v.nom === c.voeuxId)
              );
              
              const countReve = validClassifications.filter((c: any) => c.categorie === 'reve').length;
              const countRealiste = validClassifications.filter((c: any) => c.categorie === 'realiste').length;
              const countParachute = validClassifications.filter((c: any) => c.categorie === 'parachute').length;

              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">🔴</div>
                      <div className="text-lg font-black text-red-700">{countReve}</div>
                      <div className="text-[9px] uppercase font-bold text-red-500">Ambitieux</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">🟡</div>
                      <div className="text-lg font-black text-yellow-700">{countRealiste}</div>
                      <div className="text-[9px] uppercase font-bold text-yellow-600">Réaliste</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                      <div className="text-xl mb-1">🟢</div>
                      <div className="text-lg font-black text-emerald-700">{countParachute}</div>
                      <div className="text-[9px] uppercase font-bold text-emerald-600">Sécurisé</div>
                    </div>
                  </div>

                  {result.bilan.equilibre === 'trop_risquee' && (
                    <div className="bg-red-500 text-white px-4 py-3 rounded-xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p className="text-xs font-bold">⚠️ Ta liste est très ambitieuse — ajoute quelques vœux plus accessibles pour te rassurer</p>
                    </div>
                  )}
                  {result.bilan.equilibre === 'trop_safe' && (
                    <div className="bg-blue-500 text-white px-4 py-3 rounded-xl flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                      <p className="text-xs font-bold">💡 Ta liste est très sécurisée — tu pourrais envisager quelques vœux plus ambitieux</p>
                    </div>
                  )}
                  {result.bilan.equilibre === 'equilibree' && (
                    <div className="bg-emerald-500 text-white px-4 py-3 rounded-xl flex items-center gap-3">
                      <Check className="w-5 h-5 flex-shrink-0" />
                      <p className="text-xs font-bold">Liste bien équilibrée !</p>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 italic text-gray-500 text-sm leading-relaxed">
                    "{result.bilan.conseil}"
                  </div>

                  <div className="space-y-3">
                    {['reve', 'realiste', 'parachute'].map(cat => {
                      const categoryVoeux = validClassifications.filter((c: any) => c.categorie === cat);
                      if (categoryVoeux.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-2">
                          <div className="text-[10px] uppercase font-black tracking-widest text-gray-400 px-1">{cat === 'reve' ? '🔴 Ambitieux' : cat === 'realiste' ? '🟡 Réalistes' : '🟢 Sécurisés'}</div>
                          {categoryVoeux.map((c: any) => {
                            const voeu = selectedVoeux.find(
                              v => v.id === c.voeuxId || v.nom === c.voeuxId
                            );
                            if (!voeu) return null;
                            return (
                              <div key={voeu.id} className="bg-white border border-gray-100 rounded-xl p-3 shadow-xs">
                                <div className="flex justify-between items-start mb-1">
                                  <div className="font-bold text-gray-800 text-sm">{voeu.nom}</div>
                                  <div className={cn(
                                    "text-[8px] uppercase font-black px-1.5 py-0.5 rounded-sm border",
                                    cat === 'reve' ? "text-red-500 border-red-100 bg-red-50" :
                                    cat === 'realiste' ? "text-yellow-600 border-yellow-100 bg-yellow-50" :
                                    "text-emerald-600 border-emerald-100 bg-emerald-50"
                                  )}>
                                    {cat === 'reve' ? 'Ambitieux' : cat === 'realiste' ? 'Réaliste' : 'Sécurisé'}
                                  </div>
                                </div>
                                <p className="text-[11px] text-gray-500 line-clamp-2">{c.raison}</p>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
            
            <button 
              onClick={() => setStep('form')}
              className="w-full text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-gray-600 py-2"
            >
              Modifier mes vœux ↺
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
