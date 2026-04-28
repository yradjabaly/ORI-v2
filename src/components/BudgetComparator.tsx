import React, { useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGemini } from '../lib/gemini';
import { Loader2, TrendingUp, Info, ChevronRight, Calculator, PieChart, Home, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface BudgetComparatorProps {
  sessionId?: string;
  messageId?: number;
  initialData?: any;
  onComplete?: () => void;
}

const VILLES = [
  'Paris', 'Lyon', 'Bordeaux', 'Marseille', 'Toulouse',
  'Lille', 'Nantes', 'Strasbourg', 'Rennes', 'Montpellier',
  'Nice', 'Grenoble', 'Dijon', 'Rouen', 'Clermont-Ferrand',
  'Tours', 'Angers', 'Metz', 'Nancy', 'Aix-en-Provence',
  'Versailles', 'Créteil', 'Nanterre', 'Évry', 'Massy',
  'Saint-Denis', 'Orsay', 'Boulogne-Billancourt'
].sort();

const BOURSE_AMOUNTS: Record<string, number> = {
  '0': 100, '1': 1084, '2': 1703, '3': 2514, 
  '4': 3118, '5': 3669, '6': 4243, '7': 5914
};

export function BudgetComparator({ 
  sessionId, 
  messageId, 
  initialData, 
  onComplete 
}: BudgetComparatorProps) {
  const [step, setStep] = useState<'form' | 'result'>(
    initialData?.completed ? 'result' : 'form'
  );
  const [form, setForm] = useState({
    villeActuelle: initialData?.form?.villeActuelle || '',
    villeCiblee: initialData?.form?.villeCiblee || '',
    avecParents: initialData?.form?.avecParents ?? true,
    boursier: initialData?.form?.boursier || 'non',
    echelonBourse: initialData?.form?.echelonBourse || '0',
    transport: initialData?.form?.transport || 'transports'
  });
  const [result, setResult] = useState<any>(initialData?.result || null);
  const [loading, setLoading] = useState(false);

  const calculateBudget = async () => {
    setLoading(true);
    try {
      const sameCity = form.villeActuelle === form.villeCiblee;
      const bourseAnnuelle = form.boursier === 'oui' ? BOURSE_AMOUNTS[form.echelonBourse] : 0;
      const bourseMensuelle = Math.round(bourseAnnuelle / 10);
      
      const aiInstance = getGemini();
      const prompt = `Tu es un expert du budget étudiant français.
  
Profil:
- Ville actuelle: ${form.villeActuelle}
- Ville ciblée: ${form.villeCiblee}
- Situation actuelle: ${form.avecParents ? 'vit chez ses parents' : 'déjà autonome'}
- Boursier: ${form.boursier} ${form.boursier === 'oui' ? '(échelon ' + form.echelonBourse + ', ' + bourseMensuelle + '€/mois)' : ''}
- Transport actuel: ${form.transport}
- Même ville: ${sameCity ? 'oui' : 'non'}

Génère un budget mensuel réaliste basé sur les coûts moyens réels en France pour chaque ville.

Retourne UNIQUEMENT ce JSON:
{
  "maintenant": {
    "loyer": number,
    "nourriture": number,
    "transport": number,
    "loisirs": number,
    "divers": number,
    "aides": number,
    "note_loyer": "string"
  },
  "formation": {
    "loyer": number,
    "nourriture": number,
    "transport": number,
    "loisirs": number,
    "divers": number,
    "aides": ${bourseMensuelle},
    "apl": number,
    "note_loyer": "string"
  },
  "analyse": {
    "difference_mensuelle": number,
    "effort_parental": number,
    "conseil": "string"
  }
}

Règles:
- Si même ville ET chez parents: loyer formation = 0 (reste chez parents), ajuste les autres postes
- Si déjà autonome: loyer maintenant = loyer moyen de ${form.villeActuelle}, pas 0
- APL: estime selon ville et loyer (entre 80 et 250€)
- difference_mensuelle = total formation - total maintenant
- effort_parental = difference si positive, 0 si negative
- Toutes les valeurs en euros entiers`;

      const response = await aiInstance.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt
      });

      if (response.text) {
        const cleanJson = response.text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        setResult(parsed);
        setStep('result');

        // Save to Firestore
        if (sessionId && messageId !== undefined) {
          const generatedData = { 
            completed: true, 
            form, 
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
      console.error("Error calculating budget:", error);
    } finally {
      setLoading(false);
      onComplete?.();
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm mt-4 mb-2">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
        <p className="text-gray-500 font-medium italic text-center">
          ORI compare les coûts de la vie pour toi...
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
              <h3 className="text-lg font-bold text-[#003D82] mb-1 flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Simulateur de budget étudiant
              </h3>
              <p className="text-xs text-gray-500">Compare ton budget actuel avec le coût réel de ta formation ciblée</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Ta ville actuelle</label>
                  <select 
                    value={form.villeActuelle}
                    onChange={(e) => setForm({...form, villeActuelle: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#003D82] transition-all"
                  >
                    <option value="">Sélectionne une ville</option>
                    {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Ville de ta formation</label>
                  <select 
                    value={form.villeCiblee}
                    onChange={(e) => setForm({...form, villeCiblee: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#003D82] transition-all"
                  >
                    <option value="">Sélectionne une ville</option>
                    {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {form.villeActuelle && form.villeCiblee && form.villeActuelle === form.villeCiblee && (
                    <p className="text-[10px] text-blue-500 mt-1.5 flex items-center gap-1 font-medium">
                      <Info className="w-3 h-3" /> Même ville — pas de déménagement prévu
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tu vis chez tes parents actuellement ?</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setForm({...form, avecParents: true})}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-xl text-xs font-bold border transition-all",
                      form.avecParents 
                        ? "bg-[#003D82] text-white border-[#003D82]" 
                        : "bg-white text-gray-500 border-gray-200"
                    )}
                  >
                    Oui
                  </button>
                  <button 
                    onClick={() => setForm({...form, avecParents: false})}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-xl text-xs font-bold border transition-all",
                      !form.avecParents 
                        ? "bg-[#003D82] text-white border-[#003D82]" 
                        : "bg-white text-gray-500 border-gray-200"
                    )}
                  >
                    Non
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tu seras boursier ?</label>
                <div className="flex gap-2 mb-3">
                  {['non', 'peut-être', 'oui'].map(b => (
                    <button 
                      key={b}
                      onClick={() => setForm({...form, boursier: b})}
                      className={cn(
                        "flex-1 py-2 px-4 rounded-xl text-[10px] uppercase font-black border transition-all",
                        form.boursier === b 
                          ? "bg-[#003D82] text-white border-[#003D82]" 
                          : "bg-white text-gray-500 border-gray-200"
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {form.boursier === 'oui' && (
                  <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex items-center justify-between animate-in slide-in-from-top-2">
                    <span className="text-xs font-medium text-blue-700">Sélectionne ton échelon</span>
                    <select 
                      value={form.echelonBourse}
                      onChange={(e) => setForm({...form, echelonBourse: e.target.value})}
                      className="bg-white border border-blue-100 rounded-lg px-2 py-1 text-xs font-bold text-blue-700 outline-none"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(e => <option key={e} value={e}>Échelon {e}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Ton transport actuel</label>
                <div className="flex gap-2">
                  {[
                    {id: 'aucun', label: 'Aucun 🚶'},
                    {id: 'transports', label: 'Transports 🚇'},
                    {id: 'voiture', label: 'Voiture 🚗'}
                  ].map(t => (
                    <button 
                      key={t.id}
                      onClick={() => setForm({...form, transport: t.id})}
                      className={cn(
                        "flex-1 py-2 px-2 rounded-xl text-[10px] font-bold border transition-all",
                        form.transport === t.id 
                          ? "bg-[#003D82] text-white border-[#003D82]" 
                          : "bg-white text-gray-500 border-gray-200"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={calculateBudget}
              disabled={!form.villeActuelle || !form.villeCiblee}
              className={cn(
                "w-full font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 text-sm flex items-center justify-center gap-2",
                form.villeActuelle && form.villeCiblee 
                  ? "bg-[#E8002D] text-white hover:bg-[#c00025]" 
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
            >
              Calculer mon budget →
            </button>
          </motion.div>
        ) : (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
              <div className="grid grid-cols-2 border-b border-gray-100">
                <div className="p-2 border-r border-gray-100 bg-gray-50 text-gray-500 text-[11px] font-bold uppercase tracking-wider flex items-center gap-2">
                  <Home className="w-3 h-3" /> Maintenant
                </div>
                <div className="p-2 bg-[#003D82]/5 text-[#003D82] text-[11px] font-bold uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" /> En formation
                </div>
              </div>
              
              <div className="divide-y divide-gray-100">
                {[
                  { label: 'Logement', key: 'loyer', icon: <Home className="w-3 h-3 text-gray-400" /> },
                  { label: 'Nourriture', key: 'nourriture', icon: <PieChart className="w-3 h-3 text-gray-400" /> },
                  { label: 'Transport', key: 'transport', icon: <ChevronRight className="w-3 h-3 text-gray-400" /> },
                  { label: 'Loisirs', key: 'loisirs', icon: <Calculator className="w-3 h-3 text-gray-400" /> },
                  { label: 'Divers', key: 'divers', icon: <Info className="w-3 h-3 text-gray-400" /> }
                ].map((row, idx) => (
                  <div key={idx} className="grid grid-cols-2 text-sm">
                    <div className="p-2 border-r border-gray-100">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-gray-400">{row.label}</span>
                      </div>
                      <div className="text-gray-700 font-medium">{result.maintenant[row.key]}€</div>
                      {row.key === 'loyer' && <div className="text-[9px] text-gray-400 italic leading-tight mt-1">{result.maintenant.note_loyer}</div>}
                    </div>
                    <div className="p-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-gray-400">{row.label}</span>
                      </div>
                      <div className={result.formation[row.key] > result.maintenant[row.key] ? "text-[#E8002D] font-bold" : "text-gray-700 font-medium"}>
                        {result.formation[row.key]}€
                      </div>
                      {row.key === 'loyer' && <div className="text-[9px] text-gray-400 italic leading-tight mt-1">{result.formation.note_loyer}</div>}
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-2 text-sm bg-gray-50/30">
                  <div className="p-2 border-r border-gray-100">
                    <div className="text-[10px] font-medium text-emerald-600 mb-0.5">Bourses / Aides</div>
                    <div className="text-emerald-600 font-medium">-{result.maintenant.aides}€</div>
                  </div>
                  <div className="p-2">
                    <div className="text-[10px] font-medium text-emerald-600 mb-0.5">Bourses / APL</div>
                    <div className="text-emerald-600 font-medium">-{result.formation.aides + result.formation.apl}€</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 border-t-2 border-gray-200">
                  <div className="p-2 border-r border-gray-100">
                    <div className="text-[9px] font-black uppercase text-gray-400 mb-0.5">TOTAL NET</div>
                    <div className="text-gray-800 font-bold text-base">
                      {result.maintenant.loyer + result.maintenant.nourriture + result.maintenant.transport + result.maintenant.loisirs + result.maintenant.divers - result.maintenant.aides}€
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-[9px] font-black uppercase text-gray-400 mb-0.5">TOTAL NET</div>
                    <div className="text-[#003D82] font-bold text-base">
                      {result.formation.loyer + result.formation.nourriture + result.formation.transport + result.formation.loisirs + result.formation.divers - result.formation.aides - result.formation.apl}€
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl border border-gray-200 bg-white flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm",
                result.analyse.difference_mensuelle > 0 ? "bg-[#003D82]/10 text-[#003D82]" : "bg-emerald-100 text-emerald-600"
              )}>
                <Wallet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                {result.analyse.difference_mensuelle > 0 ? (
                  <>
                    <p className="text-gray-500 text-sm">Effort supplémentaire estimé</p>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-[#003D82]">+{result.analyse.difference_mensuelle}€</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">/ mois</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 text-sm">Situation favorable ✅</p>
                    <p className="text-base font-bold text-emerald-600">Budget optimisé !</p>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 italic text-gray-500 text-sm leading-relaxed relative">
              <span className="absolute -top-3 left-4 bg-white px-2 py-0.5 border border-gray-100 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest">Conseil d'ORI</span>
              "{result.analyse.conseil}"
            </div>

            <p className="text-[9px] text-gray-400 text-center italic">Estimations basées sur les moyennes nationales — à vérifier selon ta situation personnelle</p>

            <button 
              onClick={() => setStep('form')}
              className="w-full text-gray-400 text-[10px] font-bold uppercase tracking-widest hover:text-gray-600 transition-colors"
            >
              Recalculer ↺
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
