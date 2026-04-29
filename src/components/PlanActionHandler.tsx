import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Type, Schema } from '@google/genai';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { Loader2, X } from 'lucide-react';

interface PlanActionProps {
  userId: string;
  sessionId: string;
  onComplete: (summary: string, previewItems: any[]) => void;
  messageId?: string;
  initialData?: any;
}

interface PendingItem {
  id: string;
  title: string;
  deadline: string;
  urgence: string;
  guideUrl: string;
  checked: boolean;
}

export function PlanActionHandler({ userId, sessionId, onComplete, messageId, initialData }: PlanActionProps) {
  const [loading, setLoading] = useState(!initialData);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>(initialData?.pendingItems || []);
  const [summary, setSummary] = useState(initialData?.summary || '');
  const [saved, setSaved] = useState(!!initialData?.saved);

  useEffect(() => {
    if (initialData) return;
    let isCanceled = false;

    async function generatePlan() {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists() || isCanceled) return;
        
        const data = userDoc.data();
        const shortlist = data.shortlist || [];

        const prompt = `The student ${data.name || 'Élève'} in class ${data.class || 'Terminale'} has explored orientation. Shortlist: ${shortlist.join(', ') || 'Vide'}. 
Generate a personalized action plan in JSON formats:
{
  "summary": "Profile summary in 2 sentences",
  "checklist": [
    { "title": "Activity", "deadline": "DD/MM/YYYY", "urgence": "URGENT", "guideUrl": "" }
  ],
  "sessionSummary": "Short 2-sentence summary of this session for next session context"
}
Include 5 checklist items. Base deadlines on Parcoursup calendar. Return JSON only. Urgence: URGENT, BIENTOT, PLUS_TARD.`;

        const schema: Schema = {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            sessionSummary: { type: Type.STRING },
            checklist: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  deadline: { type: Type.STRING },
                  urgence: { type: Type.STRING },
                  guideUrl: { type: Type.STRING }
                },
                required: ["title", "deadline", "urgence"]
              }
            }
          },
          required: ["summary", "sessionSummary", "checklist"]
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

        if (response.text && !isCanceled) {
           const result = JSON.parse(response.text);
           setSummary(result.summary);
           
           const initialItems = result.checklist.map((item: any) => ({
             id: Math.random().toString(36).substr(2, 9),
             title: item.title,
             deadline: item.deadline,
             urgence: item.urgence,
             guideUrl: item.guideUrl || '',
             checked: true
           }));
           
           setPendingItems(initialItems);

           // Persistence
           if (sessionId && messageId) {
             const sessionRef = doc(db, 'sessions', sessionId);
             const sessionSnap = await getDoc(sessionRef);
             if (sessionSnap.exists()) {
               const msgs = sessionSnap.data().messages || [];
               const msgIdx = Number(messageId);
               if (!isNaN(msgIdx) && msgs[msgIdx]) {
                 msgs[msgIdx].componentData = { summary: result.summary, pendingItems: initialItems, saved: false };
                 await updateDoc(sessionRef, { messages: msgs, updatedAt: serverTimestamp() });
               }
             }
           }

           // Update Session Summary immediately
           await updateDoc(doc(db, "sessions", sessionId), {
             summary: result.sessionSummary,
             updatedAt: serverTimestamp()
           });
           await updateDoc(doc(db, "users", userId), {
             lastSessionSummary: result.sessionSummary
           });

           setLoading(false);
        }
      } catch (err) {
        console.error("Error generating action plan", err);
        if (!isCanceled) setLoading(false);
      }
    }

    generatePlan();
    return () => { isCanceled = true; };
  }, [userId, sessionId, messageId, initialData]);

  const toggleItem = (id: string, checked: boolean) => {
    setPendingItems(prev => prev.map(item => item.id === id ? { ...item, checked } : item));
  };

  const updateItemTitle = (id: string, title: string) => {
    setPendingItems(prev => prev.map(item => item.id === id ? { ...item, title } : item));
  };

  const removeItem = (id: string) => {
    setPendingItems(prev => prev.filter(item => item.id !== id));
  };

  const saveChecklist = async () => {
    const itemsToSave = pendingItems.filter(i => i.checked);
    for (const item of itemsToSave) {
      await addDoc(collection(db, "checklist"), {
        userId,
        title: item.title,
        deadline: item.deadline,
        urgence: item.urgence,
        guideUrl: item.guideUrl,
        done: false,
        createdAt: serverTimestamp(),
        sessionId
      });
    }
    
    // Finalize persistence
    if (sessionId && messageId) {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (sessionSnap.exists()) {
        const msgs = sessionSnap.data().messages || [];
        const msgIdx = Number(messageId);
        if (!isNaN(msgIdx) && msgs[msgIdx]) {
          msgs[msgIdx].componentData = { summary, pendingItems, saved: true };
          await updateDoc(sessionRef, { 
            messages: msgs,
            updatedAt: serverTimestamp()
          });
        }
      }
    }

    setSaved(true);
    onComplete(summary, itemsToSave);
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 text-[#E8002D] animate-spin mb-2" />
        <p className="text-sm text-gray-500">ORI prépare ton plan d'action...</p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="border border-emerald-100 bg-emerald-50 rounded-xl p-4 text-center">
        <p className="text-emerald-800 font-semibold text-sm">✓ Ton plan d'action a été enregistré dans ta Checklist !</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 mt-3 bg-white shadow-sm">
      <p className="font-semibold text-sm mb-3">
        ORI a créé ces tâches pour toi — tu peux modifier ou retirer avant de valider :
      </p>
      <div className="flex flex-col gap-1">
        {pendingItems.map(item => (
          <div key={item.id} className="flex gap-3 items-start py-3 border-b border-gray-100 last:border-0 group">
            <input 
              type="checkbox" 
              checked={item.checked}
              onChange={e => toggleItem(item.id, e.target.checked)}
              className="mt-1 accent-[#E8002D] w-4 h-4 cursor-pointer" 
            />
            <div className="flex-1">
              <input 
                defaultValue={item.title}
                onChange={e => updateItemTitle(item.id, e.target.value)}
                className="text-sm font-medium text-gray-800 w-full border-none outline-none bg-transparent hover:bg-gray-50 focus:bg-gray-50 rounded px-1 -ml-1 transition-colors" 
              />
              <p className="text-xs text-gray-400 ml-0.5">{item.deadline}</p>
            </div>
            <button 
              onClick={() => removeItem(item.id)} 
              className="text-gray-300 hover:text-red-500 transition-colors p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <button 
        onClick={saveChecklist}
        className="mt-4 w-full bg-[#E8002D] text-white rounded-xl py-3 text-sm font-bold shadow-sm hover:bg-red-700 transition-all flex items-center justify-center gap-2"
      >
        Valider et enregistrer →
      </button>
    </div>
  );
}
