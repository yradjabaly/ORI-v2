import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, updateDoc, deleteField, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { Loader2, MessageCircle, Printer, Calendar, ArrowRight, RefreshCw, Send, Check } from 'lucide-react';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import Header from '../components/Header';
import { cn } from '../lib/utils';
import { handleFirestoreError } from '../lib/firebase';

function ShareSkeleton() {
  return (
    <div className="max-w-[640px] w-full mx-auto px-6 pt-12 pb-20 flex flex-col gap-10 animate-pulse">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-64 bg-gray-100 rounded-lg" />
        <div className="h-6 w-32 bg-gray-50 rounded-full" />
      </div>
      <div className="h-40 bg-gray-50 rounded-3xl" />
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 bg-gray-100 rounded-lg" />
        <div className="h-32 bg-gray-50 rounded-2xl" />
        <div className="h-32 bg-gray-50 rounded-2xl" />
      </div>
    </div>
  );
}

interface GeneratedContent {
  formations: {
    nom: string;
    description: string;
    whatAttractsMe: string;
  }[];
  questions: string[];
}

interface Task {
  id: string;
  title: string;
  deadline: string;
  urgence: 'URGENT' | 'BIENTOT' | 'TRANQUILLE';
  done: boolean;
}

export default function Share() {
  const { userId } = useParams();
  
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [shortlistData, setShortlistData] = useState<any[]>([]);
  const [topTasks, setTopTasks] = useState<Task[]>([]);
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'shareComments'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      handleFirestoreError(err, 'list', 'shareComments');
    });
    return () => unsubscribe();
  }, [userId]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !authorName.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'shareComments'), {
        userId: userId,
        authorName: authorName.trim(),
        content: content.trim(),
        createdAt: serverTimestamp(),
        read: false
      });
      setHasSubmitted(true);
      setAuthorName('');
      setContent('');
    } catch (err) {
      handleFirestoreError(err, 'create', 'shareComments');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCommentColor = (name: string) => {
    const colors = ['bg-blue-100 text-blue-600', 'bg-red-100 text-red-600', 'bg-green-100 text-green-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const relTime = (ts: any) => {
    if (!ts) return 'À l\'instant';
    const diff = Date.now() - ts.toMillis();
    if (diff < 3600000) return 'À l\'instant';
    if (diff < 86400000) return 'Aujourd\'hui';
    const d = Math.floor(diff / 86400000);
    return `Il y a ${d} jour${d > 1 ? 's' : ''}`;
  };

  const fetchAndCacheContent = async (uData: any, fData: any[], latestSummary: string) => {
    if (!userId) return;
    setGenerating(true);
    try {
      const formationNames = fData.map(f => f.nom).join(', ');
      const prompt = `Étudiant: ${uData.name || 'Élève'}, ${uData.class || 'Lycéen'}, profil: ${uData.swipeProfile || ''}, formations explorées: ${formationNames}. 
Génère une page de partage parents en JSON:
{
  "formations": [{ 
    "nom": "string", 
    "description": "Une phrase simple pour des parents",
    "whatAttractsMe": "Une phrase commençant par Ce qui m'attire"
  }],
  "questions": [
    "2-3 questions que l'élève veut poser à ses parents, commençant par Est-ce que vous ou Qu'est-ce que vous pensez"
  ]
}
JSON uniquement, sans markdown.`;

      const genAI = getGemini();
      const result = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const text = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(text);
      
      const dateStr = new Date().toLocaleDateString('fr-FR', { 
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
      });

      await updateDoc(doc(db, "users", userId), {
        parentPageCache: parsed,
        parentPageCacheDate: dateStr
      });

      setGenerated(parsed);
      setUserData(prev => ({ ...prev, parentPageCache: parsed, parentPageCacheDate: dateStr }));
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${userId}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!userId || !userData) return;
    setGenerating(true);
    try {
      await updateDoc(doc(db, "users", userId), {
        parentPageCache: deleteField(),
        parentPageCacheDate: deleteField()
      });
      // We need shortlist data which should be in state
      await fetchAndCacheContent(userData, shortlistData, "");
    } catch (e) {
      handleFirestoreError(e, 'update', `users/${userId}`);
      setGenerating(false);
    }
  };

  useEffect(() => {
    async function loadSharedData() {
      if (!userId) return;
      try {
        setLoading(true);
        // 1. Fetch User
        const uDoc = await getDoc(doc(db, "users", userId));
        if (!uDoc.exists()) {
           setLoading(false);
           return;
        }
        const uData = uDoc.data();
        setUserData(uData);

        // 2. Fetch Shortlist formations
        const list = uData.shortlist || [];
        const fData: any[] = [];
        for (const fId of list.slice(0, 5)) {
          const fDoc = await getDoc(doc(db, "formations", fId));
          if (fDoc.exists()) {
            fData.push({ id: fDoc.id, ...fDoc.data() });
          }
        }
        setShortlistData(fData);

        // 3. Fetch Top 3 Checklist items
        const qCheck = query(
          collection(db, "checklist"), 
          where("userId", "==", userId),
          where("done", "==", false)
        );
        const checkSnap = await getDocs(qCheck);
        let tasks = checkSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
        tasks = tasks.filter(t => t.urgence === 'URGENT' || t.urgence === 'BIENTOT');
        tasks.sort((a, b) => (a.urgence === 'URGENT' ? -1 : 1));
        setTopTasks(tasks.slice(0, 3));

        // 4. Check Cache or Generate
        if (uData.parentPageCache) {
          setGenerated(uData.parentPageCache);
        } else if (userId === auth.currentUser?.uid) {
          // Fetch latest session for context (optional but used in prompt)
          const qSession = query(
            collection(db, "sessions"),
            where("userId", "==", userId),
            orderBy("createdAt", "desc"),
            limit(1)
          );
          try {
            const sessionSnap = await getDocs(qSession);
            const lastSession = sessionSnap.empty ? null : sessionSnap.docs[0].data();
            const latestSummary = lastSession?.summary || "";
            await fetchAndCacheContent(uData, fData, latestSummary);
          } catch (e) {
            console.error("Failed to fetch session for generation", e);
            await fetchAndCacheContent(uData, fData, "");
          }
        }

      } catch (err) {
        console.error("Error loading shared data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSharedData();
  }, [userId]);

  if (loading) return <div className="min-h-screen bg-white"><ShareSkeleton /></div>;

  if (!userData || (!generated && !generating)) {
     return (
       <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-8 text-center font-lexend">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Profil introuvable</h1>
          <p className="text-gray-500 text-sm">Ce lien de partage semble invalide ou a expiré.</p>
          <button 
            onClick={() => window.location.href = '/'}
            className="mt-6 bg-[#E8002D] text-white px-6 py-2 rounded-xl text-sm font-bold shadow-sm"
          >
            Retour à l'accueil
          </button>
       </div>
     );
  }

  const studentName = userData.name || 'Moi';
  const firstName = studentName.split(' ')[0];
  const studentTrack = userData.class || 'Terminale';

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      // Handle the custom format stored in DB if it's already localized, 
      // but the tool says "it currently shows the raw ISO string"
      // Looking at line 83-85, it seems it already stores localized string.
      // If it's an ISO string as the user says:
      const date = new Date(iso);
      if (isNaN(date.getTime())) return iso; // return raw if not parseable as ISO
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch (e) {
      return iso;
    }
  };

  const formations = generated?.formations || [];
  const questions = generated?.questions || [];
  const checklist = topTasks;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center font-lexend pb-24 lg:overflow-y-auto print:bg-white text-[#141414]">
      <style>{`
        .print-only-layout { display: none; }

        @media print {
          @page { size: A4 portrait; margin: 0; }

          /* Hide all direct children of the wrapper EXCEPT print-only-layout */
          .min-h-screen > *:not(.print-only-layout) { 
            display: none !important; 
          }
          
          .min-h-screen {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            overflow: hidden !important;
          }

          /* Show print layout */
          .print-only-layout {
            display: flex !important;
            flex-direction: column;
            width: 210mm;
            height: 297mm;
            background: white;
            font-family: 'Lexend', sans-serif;
            overflow: hidden;
          }

          .print-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 28px;
            border-bottom: 1px solid #e5e7eb;
            flex-shrink: 0;
          }
          .print-logo {
            font-size: 14px; font-weight: 900;
            color: #E8002D; letter-spacing: -0.5px;
          }
          .print-subtitle {
            font-size: 10px; color: #6b7280; font-weight: 500;
          }

          .print-main {
            flex: 1;
            padding: 20px 32px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            overflow: hidden;
          }

          .print-intro h1 {
            font-size: 20px; font-weight: 700;
            color: #111827; margin: 0 0 2px 0;
          }
          .print-intro-sub {
            font-size: 11px; color: #6b7280; margin: 0;
          }

          .print-h2 {
            font-size: 13px; font-weight: 700;
            color: #111827; margin: 0 0 10px 0;
          }

          .print-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }

          .print-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 12px;
            background: white;
          }
          .print-card-title {
            font-size: 12px; font-weight: 700;
            color: #111827; margin: 0 0 3px 0;
          }
          .print-card-desc {
            font-size: 10px; color: #6b7280;
            margin: 0 0 6px 0; line-height: 1.4;
          }
          .print-card-highlight {
            font-size: 10px; color: #374151;
            background: #f3f4f6; border-radius: 4px;
            padding: 5px 8px; line-height: 1.4;
          }
          .print-card-highlight strong { color: #003D82; }

          .print-question-card {
            background: #f0f4f8;
            border-radius: 6px;
            padding: 8px 10px;
          }
          .print-question-text {
            font-size: 10px; color: #1e3a5f;
            margin: 0; line-height: 1.4; font-weight: 500;
          }

          .print-checklist {
            display: flex; flex-direction: column; gap: 4px;
          }
          .print-checklist-item {
            display: flex; align-items: center; gap: 8px;
            padding: 5px 8px;
            border: 1px solid #f3f4f6;
            border-radius: 6px;
          }
          .print-check-circle {
            width: 12px; height: 12px;
            border: 1.5px solid #d1d5db;
            border-radius: 50%; flex-shrink: 0;
          }
          .print-task-title {
            font-size: 11px; color: #111827; display: block;
          }
          .print-task-date {
            font-size: 10px; color: #6b7280;
          }
          .print-urgence-badge {
            margin-left: auto; font-size: 9px;
            font-weight: 700; padding: 2px 6px;
            border-radius: 99px; flex-shrink: 0;
          }
          .print-urgence-URGENT {
            background: #fee2e2; color: #E8002D;
          }
          .print-urgence-BIENTOT {
            background: #fef3c7; color: #92400e;
          }
          .print-urgence-PLUS_TARD {
            background: #f3f4f6; color: #6b7280;
          }

          .print-cta { 
            padding: 0 32px 12px 32px;
            flex-shrink: 0;
          }
          .print-cta-inner {
            background: #E8002D;
            border-radius: 10px;
            padding: 12px 16px;
            text-align: center;
          }
          .print-cta-inner-debug {
            background: red !important;
            min-height: 60px !important;
            display: block !important;
          }
          .print-cta-title {
            font-size: 13px; font-weight: 700;
            color: white; margin: 0 0 4px 0;
          }
          .print-cta-text {
            font-size: 10px; color: rgba(255,255,255,0.85);
            margin: 0 0 6px 0; line-height: 1.4;
          }
          .print-cta-url {
            font-size: 11px; font-weight: 700;
            color: white; opacity: 0.9;
            border: 1px solid rgba(255,255,255,0.4);
            border-radius: 99px;
            padding: 2px 10px;
            display: inline-block;
          }

          .print-footer {
            border-top: 1px solid #e5e7eb;
            padding: 10px 32px;
            display: flex; align-items: center; gap: 6px;
            flex-shrink: 0;
          }
          .print-footer-logo {
            font-size: 13px; font-weight: 900; color: #E8002D;
          }
          .print-footer-text {
            font-size: 10px; color: #9ca3af;
          }
        }
      `}</style>
      {generating ? (
        <ShareSkeleton />
      ) : (
        <div className="w-full max-w-[800px] px-6 pt-16 flex flex-col gap-12 animate-in fade-in duration-700">
          
          {/* HEADER */}
          <header className="flex flex-col items-center text-center gap-4">
             <div className="w-16 h-16 bg-[#E8002D] rounded-3xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-red-100 uppercase tracking-tighter">ORI</div>
             <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-4">
                   <h1 className="text-[32px] md:text-[40px] font-bold text-gray-900 tracking-tight leading-tight max-w-[500px]">
                      Le parcours d'orientation de {studentName}
                   </h1>
                   <button 
                    onClick={handleRegenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white disabled:opacity-50"
                  >
                    <span className={cn("inline-block", generating && "animate-spin")}>↺</span>
                    <span>{generating ? "Actualisation..." : "Actualiser"}</span>
                  </button>
                </div>
                {userData.parentPageCacheDate && (
                  <p className="text-gray-400 text-[10px] uppercase font-bold tracking-widest">
                    Dernière actualisation : {formatDate(userData.parentPageCacheDate)}
                  </p>
                )}
             </div>
             <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="bg-gray-100 text-gray-500 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">{studentTrack}</span>
             </div>
          </header>

          <section className="flex flex-col gap-6">
             <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#E8002D]" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                <h2 className="text-2xl font-bold text-gray-900 leading-none">Les pistes explorées</h2>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {generated?.formations.slice(0, 2).map((f, i) => (
                 <div key={i} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4">
                   <div>
                     <h3 className="font-bold text-lg text-gray-900 mb-1 leading-tight">{f.nom}</h3>
                     <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
                   </div>
                   <div className="mt-auto bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className="text-[13px] text-gray-800 leading-relaxed font-medium">
                        <span className="text-[#325da4] font-bold">Pourquoi ça l'intéresse :</span> {f.whatAttractsMe}
                      </p>
                   </div>
                 </div>
               ))}
             </div>
          </section>

          <section className="bg-[#325da4] rounded-3xl p-8 md:p-10 text-white shadow-xl shadow-blue-100">
             <h2 className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70 mb-8 border-b border-white/10 pb-4">On pourrait en parler ensemble</h2>
             <div className="flex flex-col gap-6">
               {generated?.questions.map((q, i) => (
                 <div key={i} className="flex gap-4 items-start group">
                    <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0 transition-colors group-hover:bg-white/20">
                      <span className="material-symbols-outlined text-white">forum</span>
                    </div>
                    <p className="text-[18px] font-medium leading-tight pt-1">
                      {q}
                    </p>
                 </div>
               ))}
             </div>
          </section>

          <section className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <span className="material-symbols-outlined text-gray-400">checklist</span>
                   <h2 className="text-2xl font-bold text-gray-900 leading-none">Le plan d'action</h2>
                </div>
             </div>
             <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                {topTasks.length > 0 ? topTasks.map((task, i) => (
                  <div key={i} className="p-6 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                     <span className="material-symbols-outlined text-gray-200 mt-0.5">radio_button_unchecked</span>
                     <div className="flex flex-col">
                       <h4 className="text-base font-bold text-gray-900 leading-tight">{task.title}</h4>
                       <span className="text-[11px] font-bold text-[#E8002D] mt-2 bg-red-50 px-2 py-0.5 rounded w-fit uppercase tracking-widest">
                         Échéance : {task.deadline}
                       </span>
                     </div>
                  </div>
                )) : (
                  <div className="p-12 text-center text-gray-300 text-sm italic">
                    Aucune action urgente identifiée.
                  </div>
                )}
             </div>
          </section>

          <div className="bg-[#fffbeb] border-2 border-dashed border-[#edc200]/50 rounded-3xl p-8 md:p-10 text-center flex flex-col items-center">
            <span className="material-symbols-outlined text-[#725c00] text-3xl mb-4">notifications_active</span>
            <h3 className="text-xl font-bold text-[#725c00] mb-3 leading-tight">
              Envie d'aider {studentName} sans rien rater ?
            </h3>
            <p className="text-sm text-[#725c00]/80 mb-8 leading-relaxed max-w-[500px]">
              En créant un espace parents gratuitement, vous pourrez synchroniser 
              la checklist de {studentName} avec votre propre calendrier pour ne 
              rater aucune échéance et profiter de nombreuses autres fonctionnalités 
              pour aider {studentName} à réussir son orientation.
            </p>
            <button className="bg-[#325da4] text-white rounded-full px-8 py-4 font-bold text-sm shadow-lg shadow-blue-200 hover:bg-[#2a4d87] transition-all flex items-center gap-2 group active:scale-95">
              Accéder à l'Espace Parents Gratuit
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>

          {/* COMMENTS SECTION */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[#325da4]">chat_bubble</span>
              <h2 className="text-2xl font-bold text-gray-900 leading-none">Laisser un message à {studentName.split(' ')[0]}</h2>
            </div>
            <p className="text-sm text-gray-500 font-medium -mt-2">
              {studentName.split(' ')[0]} pourra le lire depuis son espace ORI.
            </p>

            <div className="flex flex-col gap-4">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex gap-4 shadow-sm">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 uppercase",
                    getCommentColor(comment.authorName)
                  )}>
                    {comment.authorName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-gray-900 text-sm truncate">{comment.authorName}</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{relTime(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{comment.content}</p>
                  </div>
                </div>
              ))}

              {hasSubmitted ? (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-8 text-center animate-in zoom-in duration-300">
                  <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6" />
                  </div>
                  <p className="text-green-800 font-bold">✓ Ton message a été envoyé à {studentName.split(' ')[0]} !</p>
                  <button 
                    onClick={() => setHasSubmitted(false)}
                    className="mt-4 text-xs font-bold text-green-600 hover:underline uppercase tracking-widest"
                  >
                    Envoyer un autre message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCommentSubmit} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Ton prénom</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Maman, Papa, Tonton..." 
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      maxLength={30}
                      required
                      className="w-full bg-gray-50 border border-gray-50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#E8002D] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Ton message</label>
                    <textarea 
                      placeholder="Un conseil, une expérience à partager sur son orientation..." 
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      maxLength={300}
                      rows={3}
                      required
                      className="w-full bg-gray-50 border border-gray-50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#E8002D] outline-none resize-none"
                    />
                    <div className="text-right text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">
                      {content.length}/300
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="bg-[#E8002D] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-all disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Envoyer →</span>
                  </button>
                </form>
              )}
            </div>
          </section>

          <footer className="flex flex-col items-center gap-10 pt-10 border-t border-gray-100">
             <div className="flex flex-wrap justify-center gap-6">
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors font-bold text-xs uppercase tracking-widest"
                >
                  <span className="material-symbols-outlined text-[18px]">print</span>
                  Imprimer la version PDF
                </button>
                <button className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors font-bold text-xs uppercase tracking-widest">
                  <span className="material-symbols-outlined text-[18px]">share</span>
                  Partager le lien
                </button>
             </div>
             
             <div className="flex flex-col items-center gap-2 opacity-30 scale-75 md:scale-100">
                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-lg bg-[#E8002D] text-white flex items-center justify-center font-bold text-xs">ORI</div>
                   <span className="text-[10px] font-bold text-gray-900 tracking-[0.3em] uppercase">ORI • L'ÉTUDIANT</span>
                </div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest italic">Intelligent Orientation Assistant</p>
             </div>
          </footer>

        </div>
      )}

      <div className="print-only-layout">
        <header className="print-header">
          <span className="print-logo">ORI by l'Étudiant</span>
          <span className="print-subtitle">Rapport d'orientation · {studentName}</span>
        </header>

        <main className="print-main">
          
          <section className="print-intro">
            <h1 className="print-h1">Coucou, voici où j'en suis !</h1>
            <p className="print-intro-sub">
              Mes pistes préférées et questions pour qu'on en discute ensemble.
            </p>
          </section>

          <section>
            <h2 className="print-h2">🎓 Mes pistes préférées</h2>
            <div className="print-grid-2">
              {formations.slice(0,2).map((f, i) => (
                <div className="print-card" key={i}>
                  <h3 className="print-card-title">{f.nom}</h3>
                  <p className="print-card-desc">{f.description}</p>
                  <div className="print-card-highlight">
                    <strong>Pourquoi ça m'intéresse : </strong>
                    {f.whatAttractsMe}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="print-h2">💬 Pour en discuter ensemble</h2>
            <div className="print-grid-2">
              {questions.map((q, i) => (
                <div className="print-question-card" key={i}>
                  <p className="print-question-text">{q}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="print-h2">📋 Mes prochaines étapes</h2>
            <div className="print-checklist">
              {checklist.map((item, i) => (
                <div className="print-checklist-item" key={i}>
                  <span className="print-check-circle" />
                  <div style={{flex:1}}>
                    <strong className="print-task-title">{item.title}</strong>
                    <span className="print-task-date">Échéance : {item.deadline}</span>
                  </div>
                  <span className={`print-urgence-badge print-urgence-${item.urgence}`}>
                    {item.urgence}
                  </span>
                </div>
              ))}
            </div>
          </section>

        </main>

        <section className="print-cta">
          <div className="print-cta-inner print-cta-inner-debug">
            <h2 className="print-cta-title">
              Envie d'aider {firstName || studentName || userData?.name}{' '}
              sans rien rater ?
            </h2>
            <p className="print-cta-text">
              En créant un espace parents gratuitement, vous pourrez 
              suivre les étapes clés et aider à réussir l'orientation.
            </p>
            <span className="print-cta-url">ori.letudiant.fr</span>
          </div>
        </section>

        <footer className="print-footer">
          <span className="print-footer-logo">ORI</span>
          <span className="print-footer-text">
            par l'Étudiant · Intelligent Orientation Assistant
          </span>
        </footer>
      </div>
    </div>
  );
}
