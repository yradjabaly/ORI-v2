import React, { useState } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGemini } from '../lib/gemini';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, CheckCircle2, Calendar, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface RealityTestProps {
  formationId: string;
  formationName: string;
  sessionId?: string;
  messageId?: number;
  initialData?: any;
  onComplete?: () => void;
}

export function RealityTest({ 
  formationId, 
  formationName, 
  sessionId, 
  messageId, 
  initialData, 
  onComplete 
}: RealityTestProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'intro' | 'question' | 'result'>('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>(initialData?.answers || []);
  const [questions, setQuestions] = useState<string[]>(initialData?.questions || []);
  const [loading, setLoading] = useState(false);
  const [jpoAdded, setJpoAdded] = useState(false);
  const [salonAdded, setSalonAdded] = useState(false);

  const startTest = async () => {
    setLoading(true);
    try {
      const aiInstance = getGemini();
      const prompt = `Tu es ORI. Génère exactement 3 scénarios réalistes et difficiles que vit un étudiant en ${formationName}. Ces scénarios doivent montrer les vrais défis du quotidien (pas les avantages). Format JSON: ["scénario 1", "scénario 2", "scénario 3"] Chaque scénario: 2 phrases max, situation concrète et difficile, commence par "Il est..." ou "Tu es..." ou "C'est..." Retourne uniquement le JSON.`;
      
      const response = await aiInstance.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt
      });
      
      if (response.text) {
        const cleanJson = response.text.replace(/```json|```/g, '').trim();
        const result = JSON.parse(cleanJson);
        setQuestions(result);
        setStep('question');
      }
    } catch (error) {
      console.error("Error generating reality scenarios:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    if (currentQ < 2) {
      setCurrentQ(currentQ + 1);
    } else {
      setStep('result');
      // Save to Firestore
      if (sessionId && messageId !== undefined && user) {
        try {
          const generatedData = {
            completed: true,
            formationId,
            formationName,
            questions,
            answers: newAnswers
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
        } catch (error) {
          console.error("Error saving reality test results:", error);
        }
      }
      onComplete?.();
    }
  };

  const addJpoTask = async () => {
    if (!user || jpoAdded) return;
    try {
      await addDoc(collection(db, "checklist"), {
        userId: user.uid,
        title: `Journée Portes Ouvertes — ${formationName}`,
        urgence: 'BIENTOT',
        deadline: '15/01/2027',
        done: false,
        source: 'ori',
        createdAt: serverTimestamp(),
        sessionId: sessionId || ''
      });
      setJpoAdded(true);
    } catch (error) {
      console.error("Error adding JPO task:", error);
    }
  };

  const addSalonTask = async () => {
    if (!user || salonAdded) return;
    try {
      await addDoc(collection(db, "checklist"), {
        userId: user.uid,
        title: "Salon L'Étudiant — Explorer mes formations",
        urgence: 'BIENTOT',
        deadline: '01/12/2026',
        done: false,
        source: 'ori',
        createdAt: serverTimestamp(),
        sessionId: sessionId || ''
      });
      setSalonAdded(true);
    } catch (error) {
      console.error("Error adding Salon task:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm mt-4 mb-2">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-3" />
        <p className="text-gray-500 font-medium italic text-center">
          ORI imagine les situations pour ton test de réalité...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4 mb-2 shadow-sm font-sans">
      <AnimatePresence mode="wait">
        {step === 'intro' && (
          <motion.div 
            key="intro"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center text-center py-2"
          >
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">🔥</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Le Test de Réalité</h3>
            <p className="text-sm text-gray-600 mb-6 leading-relaxed px-4">
              3 situations concrètes que tu vivras en <span className="font-bold text-gray-900">{formationName}</span>. Réponds franchement.
            </p>
            <button
              onClick={startTest}
              className="bg-[#E8002D] text-white font-bold py-3 px-8 rounded-xl shadow-md hover:scale-105 active:scale-95 transition-all text-sm"
            >
              Je me lance →
            </button>
          </motion.div>
        )}

        {step === 'question' && questions.length > 0 && (
          <motion.div 
            key="question"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="text-[10px] uppercase font-black tracking-widest text-[#E8002D]">Situation {currentQ + 1}/3</div>
              <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#E8002D] transition-all duration-300" 
                  style={{ width: `${((currentQ + 1) / 3) * 100}%` }}
                />
              </div>
            </div>

            <div className="min-h-[100px] flex items-center justify-center mb-8 px-2">
              <p className="text-base md:text-lg font-medium text-gray-800 text-center leading-snug">
                "{questions[currentQ]}"
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleAnswer('Je gère 💪')}
                className="w-full text-left p-4 rounded-xl border border-gray-100 hover:border-emerald-500 hover:bg-emerald-50 transition-all text-sm font-medium text-gray-700 flex items-center justify-between group"
              >
                <span>Je gère 💪</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => handleAnswer('Ça me freine 😬')}
                className="w-full text-left p-4 rounded-xl border border-gray-100 hover:border-orange-500 hover:bg-orange-50 transition-all text-sm font-medium text-gray-700 flex items-center justify-between group"
              >
                <span>Ça me freine 😬</span>
                <CheckCircle2 className="w-4 h-4 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <button
                onClick={() => handleAnswer("Je n'avais pas pensé à ça 🤔")}
                className="w-full text-left p-4 rounded-xl border border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-sm font-medium text-gray-700 flex items-center justify-between group"
              >
                <span>Je n'avais pas pensé à ça 🤔</span>
                <CheckCircle2 className="w-4 h-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
              {(() => {
                const strong = answers.filter(a => a.includes('gère')).length;
                const hesitant = answers.filter(a => a.includes('freine')).length;
                const surprised = answers.filter(a => a.includes('pensé')).length;

                if (strong === 3) {
                  return (
                    <>
                      <p className="font-bold text-gray-900 mb-2">Ta motivation semble solide pour {formationName} 💪</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Pour confirmer que c'est vraiment fait pour toi, rien de mieux qu'un échange direct. Deux options :
                      </p>
                    </>
                  );
                } else if (hesitant >= 2) {
                  return (
                    <>
                      <p className="font-bold text-gray-900 mb-2">Ces situations t'ont surpris — c'est normal !</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Personne ne te les montre avant ! Maintenant tu sais à quoi t'attendre. Pour en parler avec de vrais étudiants, deux options :
                      </p>
                    </>
                  );
                } else {
                  return (
                    <>
                      <p className="font-bold text-gray-900 mb-2">Tu as hésité sur certains points — c'est une bonne chose.</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Ça veut dire que tu réfléchis vraiment. Pour lever ces doutes, deux options :
                      </p>
                    </>
                  );
                }
              })()}
            </div>

            <div className="space-y-4 mb-6 px-1">
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FFD100] mt-1.5 flex-shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">Une <span className="font-bold">JPO</span> te permet de visiter le campus et d'échanger directement avec des étudiants actuels.</p>
              </div>
              <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FFD100] mt-1.5 flex-shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">Un <span className="font-bold">Salon L'Étudiant</span> te permet de comparer plusieurs formations en un seul déplacement.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                disabled={jpoAdded}
                onClick={addJpoTask}
                className={cn(
                  "flex flex-col items-center justify-center text-center p-3 rounded-xl transition-all h-full",
                  jpoAdded 
                    ? "bg-emerald-50 border border-emerald-100 text-emerald-700 cursor-default" 
                    : "bg-[#FFD100] border border-[#FFD100] text-gray-900 font-bold hover:shadow-md active:scale-95"
                )}
              >
                {jpoAdded ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">✓ Ajouté à ta checklist</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">📅 Ajouter une JPO</span>
                  </>
                )}
              </button>
              <button
                disabled={salonAdded}
                onClick={addSalonTask}
                className={cn(
                  "flex flex-col items-center justify-center text-center p-3 rounded-xl transition-all h-full",
                  salonAdded 
                    ? "bg-emerald-50 border border-emerald-100 text-emerald-700 cursor-default" 
                    : "bg-[#FFD100] border border-[#FFD100] text-gray-900 font-bold hover:shadow-md active:scale-95"
                )}
              >
                {salonAdded ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">✓ Ajouté à ta checklist</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-bold">🎪 Ajouter un Salon</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-center mt-4">
              <button
                onClick={() => {
                  setStep('intro');
                  setCurrentQ(0);
                  setAnswers([]);
                  setQuestions([]);
                }}
                className="text-xs text-gray-400 underline"
              >
                Recommencer le test
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
