import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { db, handleFirestoreError } from '../lib/firebase';
import { 
  collection, query, where, orderBy, limit, onSnapshot, 
  doc, updateDoc, arrayRemove, arrayUnion, getDocs, deleteField,
  getDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { 
  CheckSquare, Heart, ArrowRight, Loader2, 
  MessageCircle, Sparkles, HelpCircle, FileText, LayoutDashboard,
  Check, MapPin, RefreshCw, AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getGemini } from '../lib/gemini';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function TraitSkeleton() {
  return (
    <div className="flex flex-wrap gap-4 animate-pulse">
      <div className="h-10 w-32 bg-gray-100 rounded-2xl" />
      <div className="h-10 w-40 bg-gray-100 rounded-2xl" />
      <div className="h-10 w-28 bg-gray-100 rounded-2xl" />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [formationMap, setFormationMap] = useState<Record<string, any>>({});
  const [traitsLoading, setTraitsLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isUpdatingDashboard, setIsUpdatingDashboard] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [traitFetchAttempted, setTraitFetchAttempted] = useState(false);
  
  const getUrgenceOrder = (urg: string) => {
    if (urg === 'URGENT') return 1;
    if (urg === 'BIENTOT') return 2;
    return 3;
  };

  useEffect(() => {
    if (!user) return;

    // 1. User Profile & Traits
    const unsubscribeUser = onSnapshot(doc(db, "users", user.uid), (docS) => {
      if (docS.exists()) {
        const data = docS.data();
        setUserData(data);
      }
    });

    // 2. Recent Sessions
    const qSessions = query(
      collection(db, "sessions"), 
      where("userId", "==", user.uid), 
      orderBy("createdAt", "desc"), 
      limit(3)
    );
    const unsubscribeSessions = onSnapshot(qSessions, (snapshot) => {
      const sess = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSessions(sess);
    });

    // 3. Checklist Items
    const qChecklist = query(
      collection(db, "checklist"),
      where("userId", "==", user.uid)
    );
    const unsubscribeChecklist = onSnapshot(qChecklist, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = items.sort((a: any, b: any) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return getUrgenceOrder(a.urgence) - getUrgenceOrder(b.urgence);
      });
      setChecklist(sorted);
    });

    // 4. Share Comments
    const qComments = query(
      collection(db, "shareComments"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsubscribeComments = onSnapshot(qComments, async (snapshot) => {
      const comms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setComments(comms);

      // Mark unread as read
      const unread = comms.filter((c: any) => c.read === false);
      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach(c => {
          batch.update(doc(db, "shareComments", c.id), { 
            read: true,
            updatedAt: serverTimestamp()
          });
        });
        
        try {
          await batch.commit();
        } catch (e) {
          handleFirestoreError(e, 'update', 'shareComments (batch)');
        }
      }
    }, (err) => {
      handleFirestoreError(err, 'list', 'shareComments');
    });

    // 5. Formations Data
    async function loadFormations() {
       const formSnap = await getDocs(collection(db, "formations"));
       const cmap: Record<string, any> = {};
       formSnap.forEach(d => {
         cmap[d.id] = { id: d.id, ...d.data() };
       });
       setFormationMap(cmap);
       setLoading(false);
    }
    loadFormations();

    return () => {
      unsubscribeUser();
      unsubscribeSessions();
      unsubscribeChecklist();
      unsubscribeComments();
    };
  }, [user]);

  const relTime = (ts: any) => {
    if (!ts) return 'À l\'instant';
    const diff = (Date.now() - (ts.toMillis ? ts.toMillis() : Date.now()));
    if (diff < 3600000) return 'À l\'instant';
    if (diff < 86400000) return 'Aujourd\'hui';
    const d = Math.floor(diff / 86400000);
    return `Il y a ${d} jour${d > 1 ? 's' : ''}`;
  };

  const getCommentColor = (name: string) => {
    const colors = ['bg-blue-100 text-blue-600', 'bg-red-100 text-red-600', 'bg-green-100 text-green-600', 'bg-yellow-100 text-yellow-600', 'bg-purple-100 text-purple-600'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // AUTO-GENERATION ON LOAD
  useEffect(() => {
    if (loading || !userData || !user || isAutoGenerating || isUpdatingDashboard) return;

    const runAutoGeneration = async () => {
      setIsAutoGenerating(true);
      try {
        // 1. Auto-generate profileTraits if empty
        if (userData.swipeProfile && (!userData.profileTraits || userData.profileTraits.length === 0)) {
          await generateProfileTraits();
        }

        // 2. Auto-generate shortlistAnalysis for missing ones
        const shortlist = userData.shortlist || [];
        const shortlistAnalysis = userData.shortlistAnalysis || {};
        for (const fId of shortlist) {
          if (!shortlistAnalysis[fId]) {
            await generateFormationAnalysis(fId);
          }
        }

        // 3. Auto-generate session summaries
        for (const session of sessions) {
          const invalid = !session.summary || 
            session.summary === "" ||
            session.summary.toLowerCase().includes("en cours") ||
            session.summary.toLowerCase().includes("sans résumé");
          
          if (invalid && (session.messages?.length || 0) > 2) {
            await generateSessionSummary(session.id);
          }
        }
      } catch (err) {
        console.error("Auto-generation error", err);
      } finally {
        setIsAutoGenerating(false);
      }
    };

    runAutoGeneration();
  }, [userData, sessions, formationMap, loading]);

  const generateProfileTraits = async () => {
    if (!user || !userData?.swipeProfile) return;
    setTraitsLoading(true);
    try {
      const genAI = getGemini();
      const res = await genAI.models.generateContent({
        model: "gemini-flash-latest",
        contents: `Traduis ce profil d'orientation '${userData.swipeProfile}' en 3-4 traits naturels en français pour un lycéen. Exemple: ['Apprend en faisant', 'Veut entrer vite dans la vie active']. JSON array uniquement.`
      });
      const resText = (res.text || "").replace(/```json/g, '').replace(/```/g, '').trim();
      const traits = JSON.parse(resText);
      if (Array.isArray(traits)) {
        await updateDoc(doc(db, "users", user.uid), { 
          profileTraits: traits,
          updatedAt: serverTimestamp() 
        });
      }
    } catch (e) {
      handleFirestoreError(e, 'update', `users/${user.uid}`);
    } finally {
      setTraitsLoading(false);
    }
  };

  const generateFormationAnalysis = async (fId: string) => {
    if (!user || !formationMap[fId]) return;
    setAnalysisLoading(true);
    try {
      const genAI = getGemini();
      const currentAnalysis = (await getDoc(doc(db, "users", user.uid))).data()?.shortlistAnalysis || {};
      const newAnalysis = { ...currentAnalysis };
      const formation = formationMap[fId];
      const profileTraits = (userData.profileTraits || []).join(", ");

      const prompt = `Profil élève: ${profileTraits}. Formation: ${formation.nom}, durée: ${formation.duree || 'N/A'}, coût: ${formation.cout || 'N/A'}, alternance: ${formation.alternance ? 'Oui' : 'Non'}.
Génère en JSON:
{ 
  pointsForts: string[],    // 0-2 items max, ce qui correspond au profil. Vide si rien ne correspond.
  pointsAttention: string[] // 0-2 items max, ce qui mérite réflexion. Vide si tout correspond.
}
Chaque item: max 6 mots, concret et spécifique.
JSON uniquement.`;

      const res = await genAI.models.generateContent({
        model: "gemini-flash-latest",
        contents: prompt
      });
      
      const text = res.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          newAnalysis[fId] = JSON.parse(jsonMatch[0]);
          await updateDoc(doc(db, "users", user.uid), { 
            shortlistAnalysis: newAnalysis,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Parse error for", fId, e);
        }
      }
    } catch (e) {
      handleFirestoreError(e, 'update', `users/${user.uid}`);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const formatSessionDate = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

    if (date >= today) {
      return `Aujourd'hui, ${format(date, 'HH:mm')}`;
    } else if (date >= yesterday) {
      return `Hier, ${format(date, 'HH:mm')}`;
    } else if (date >= startOfWeek) {
      const day = format(date, 'EEEE', { locale: fr });
      return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${format(date, 'HH:mm')}`;
    } else {
      return format(date, 'd MMMM', { locale: fr });
    }
  };

  const generateSessionSummary = async (sId: string) => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const genAI = getGemini();
      const sessDoc = await getDoc(doc(db, "sessions", sId));
      const messages = sessDoc.data()?.messages || [];
      const firstMessages = messages.slice(0, 5).map((m: any) => `${m.role}: ${m.content}`).join("\n");

      if (firstMessages) {
        const prompt = `Résume en une phrase ce que cet élève a exploré dans cette conversation. Maximum 12 mots. Commence par un verbe d'action à la 3ème personne. Exemple: 'A comparé le BUT MMI et le BTS SIO en détail.' Texte uniquement, sans guillemets.\n\nConversation:\n${firstMessages}`;
        
        const res = await genAI.models.generateContent({
          model: "gemini-flash-latest",
          contents: prompt
        });
        
        const newSummary = (res.text || "").replace(/"/g, '').trim();
        if (newSummary) {
          await updateDoc(doc(db, "sessions", sId), { 
            summary: newSummary,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, 'update', `sessions/${sId}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRegenerateDashboard = async () => {
    if (!user) return;
    setIsUpdatingDashboard(true);
    try {
      // 1. Force Profile Traits
      if (userData?.swipeProfile) {
        await updateDoc(doc(db, "users", user.uid), { 
          profileTraits: deleteField(),
          updatedAt: serverTimestamp()
        });
        await generateProfileTraits();
      }
      
      // 2. Force Shortlist Analysis
      if (userData?.shortlist && userData.shortlist.length > 0) {
        await updateDoc(doc(db, "users", user.uid), { 
          shortlistAnalysis: deleteField(),
          updatedAt: serverTimestamp()
        });
        for (const fId of userData.shortlist) {
          await generateFormationAnalysis(fId);
        }
      }

      // 3. Force Session Summaries (set to null to trigger needsSummary)
      for (const sess of sessions) {
        await updateDoc(doc(db, "sessions", sess.id), { 
          summary: "Régénération en cours...",
          updatedAt: serverTimestamp()
        });
        await generateSessionSummary(sess.id);
      }
      
      const now = new Date().toISOString();
      await updateDoc(doc(db, "users", user.uid), { 
        lastDashboardGenAt: now,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `users/${user.uid}`);
    } finally {
      setIsUpdatingDashboard(false);
    }
  };

  const toggleChecklist = async (id: string, currentDone: boolean) => {
    try {
      await updateDoc(doc(db, "checklist", id), { 
        done: !currentDone,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `checklist/${id}`);
    }
  };

  const toggleFavorite = async (fId: string) => {
    if (!user) return;
    const isFav = (userData?.shortlist || []).includes(fId);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        shortlist: isFav ? arrayRemove(fId) : arrayUnion(fId),
        updatedAt: serverTimestamp()
      });
    } catch(e) {
      handleFirestoreError(e, 'update', `users/${user.uid}`);
    }
  };

  const getComparisonPoints = (fId: string) => {
    let pourToi = "";
    let aPeser = "";
    sessions.forEach(s => {
      if (s.messages) {
        s.messages.forEach((m: any) => {
          if (m.uiTrigger?.startsWith('COMPARE') && m.componentData?.analyses) {
            const analysis = m.componentData.analyses[fId];
            if (analysis) {
              pourToi = analysis.pourToi;
              aPeser = analysis.aPeser;
            }
          }
        });
      }
    });
    return { pourToi, aPeser };
  };

  if (!user || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 h-screen">
        <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin" />
      </div>
    );
  }

  const shortlist = userData?.shortlist || [];
  const naturalTraits = userData?.profileTraits || [];

  return (
    <div className="w-full h-full pb-24 font-lexend bg-background">
      <div className="p-6 md:p-10 flex flex-col gap-10 max-w-[1200px] w-full mx-auto">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-4">
              <h2 className="text-[32px] font-bold text-gray-900 tracking-tight leading-none">Mon orientation</h2>
              <div className="flex items-center gap-3 mt-1">
                <button 
                  onClick={handleRegenerateDashboard}
                  disabled={isUpdatingDashboard}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white disabled:opacity-50"
                >
                  <span className={cn("inline-block", isUpdatingDashboard && "animate-spin")}>↺</span>
                  <span>{isUpdatingDashboard ? "Actualisation..." : "Actualiser"}</span>
                </button>
                {userData?.lastDashboardGenAt && (
                  <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest pt-0.5">
                    Dernière actualisation : {format(new Date(userData.lastDashboardGenAt), 'HH:mm')}
                  </span>
                )}
              </div>
            </div>
            <p className="text-gray-500 font-medium tracking-tight">Voici un résumé de tes avancées et de tes options actuelles.</p>
          </div>
          <button 
            onClick={() => navigate('/chat')}
            className="bg-[#E8002D] text-white font-bold px-6 py-3 rounded-full flex items-center gap-2 hover:bg-red-700 transition-all shadow-sm w-fit"
          >
            <span className="material-symbols-outlined">chat_bubble</span>
            Reprendre la conversation
          </button>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
          
          {/* Learner Profile (Col span 4) */}
          <div className="md:col-span-4 bg-white border border-gray-100 rounded-xl p-6 shadow-sm flex flex-col h-full">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-50 pb-4">
              <span className="material-symbols-outlined text-[#325da4]" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              <h3 className="text-xl font-bold text-gray-900">Profil d'apprentissage</h3>
            </div>
            <p className="text-sm text-gray-500 font-medium mb-3">D'après nos échanges, voici tes traits naturels les plus marqués :</p>
            
            <div className="flex flex-wrap gap-2">
              {(traitsLoading || isUpdatingDashboard) ? (
                <div className="flex flex-wrap gap-2 animate-pulse w-full">
                  <div className="h-8 w-24 bg-gray-100 rounded-full" />
                  <div className="h-8 w-32 bg-gray-100 rounded-full" />
                </div>
              ) : naturalTraits.length > 0 ? (
                naturalTraits.map((t: string, i: number) => (
                  <div key={i} className="bg-[#ffe800] text-[#725c00] px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border border-[#edc200]/30">
                    {t}
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 italic">Portrait en cours de création...</p>
              )}
            </div>
          </div>

          {/* Shortlist Formations (Col span 8) */}
          <div className="md:col-span-8 bg-white border border-gray-100 rounded-xl p-6 shadow-sm flex flex-col h-full">
            <div className="flex items-center justify-between mb-6 border-b border-gray-50 pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#E8002D]" style={{ fontVariationSettings: "'FILL' 1" }}>bookmark_star</span>
                <h3 className="text-xl font-bold text-gray-900">Formations retenues</h3>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar bg-gray-50/40 rounded-xl p-2 -mx-2 border border-gray-100/50">
              {(analysisLoading || isUpdatingDashboard) ? (
                <div className="flex flex-col gap-3 animate-pulse">
                  <div className="h-32 bg-white rounded-xl border border-gray-100" />
                  <div className="h-32 bg-white rounded-xl border border-gray-100" />
                </div>
              ) : shortlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-20">inventory_2</span>
                  <p className="text-sm font-medium">Aucune formation enregistrée</p>
                </div>
              ) : (
                shortlist.map((fId: string) => {
                  const info = formationMap[fId] || { nom: fId, ville: 'Lieu inconnu' };
                  const analysis = userData.shortlistAnalysis?.[fId] || {};
                  const pointsForts = analysis.pointsForts || [];
                  const pointsAttention = analysis.pointsAttention || [];

                  return (
                    <div key={fId} className="bg-white border-l-4 border-l-[#325da4] border-y border-r border-gray-100 rounded-r-xl p-5 flex flex-col gap-4 group relative hover:shadow-md hover:border-gray-200 transition-all duration-300">
                      <div className="flex flex-col gap-1 pr-8">
                        <h4 className="font-bold text-gray-900 text-[15px] leading-tight group-hover:text-[#325da4] transition-colors">{info.nom}</h4>
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <MapPin className="w-3 h-3" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">{info.ville}</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-3 py-1 border-t border-gray-50 mt-1">
                        {pointsForts.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Points forts
                            </span>
                            <p className="text-[11px] font-medium text-gray-700 leading-snug pl-3 border-l border-green-100">
                              {pointsForts.join(" • ")}
                            </p>
                          </div>
                        )}
                        {pointsAttention.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] font-bold text-[#E8002D] uppercase tracking-widest flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#E8002D]" />
                              Points d'attention
                            </span>
                            <p className="text-[11px] font-medium text-gray-700 leading-snug pl-3 border-l border-[#E8002D]">
                              {pointsAttention.join(" • ")}
                            </p>
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={() => toggleFavorite(fId)}
                        className="absolute top-5 right-5 text-[#E8002D] hover:text-gray-300 transition-colors"
                      >
                        <Heart className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>


          {/* Condensed Checklist (Col span 5) */}
          <div className="md:col-span-5 bg-white border border-gray-100 rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-6 border-b border-gray-50 pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-400">checklist</span>
                <h3 className="text-xl font-bold text-gray-900 leading-none">À faire</h3>
              </div>
              <Link to="/checklist" className="text-xs font-bold text-[#325da4] hover:underline uppercase tracking-wider">Voir tout</Link>
            </div>
            
            <ul className="flex flex-col gap-5">
              {checklist.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-10 italic">Aucune tâche en attente</p>
              ) : (
                checklist.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex items-start gap-3">
                    <div className={cn(
                      "mt-1.5 w-2.5 h-2.5 rounded-full shrink-0",
                      item.done ? "bg-gray-200" : 
                      item.urgence === 'URGENT' ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-sm font-bold leading-tight",
                        item.done ? "text-gray-300 line-through" : "text-gray-900"
                      )}>
                        {item.title}
                      </span>
                      {!item.done && (
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded w-fit mt-1 uppercase tracking-wider",
                          item.urgence === 'URGENT' ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"
                        )}>
                          {item.urgence === 'URGENT' ? 'Urgent - ' : 'Avant le '} {item.deadline}
                        </span>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Session History (Col span 7) */}
          <div className="md:col-span-7 bg-white border border-gray-100 rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6 border-b border-gray-50 pb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-400">history</span>
                <h3 className="text-xl font-bold text-gray-900">Historique des échanges</h3>
              </div>
            </div>
            
            <div className="flex flex-col gap-8 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-gray-100 mt-2">
              {(historyLoading || isUpdatingDashboard) ? (
                <div className="flex flex-col gap-8 animate-pulse pl-10">
                  <div className="h-20 bg-gray-50 rounded-xl" />
                  <div className="h-20 bg-gray-50 rounded-xl" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-10 text-center text-gray-300 text-sm italic">Aucun historique</div>
              ) : (
                sessions.slice(0, 3).map((sess, idx) => (
                  <HistoryItem 
                    key={sess.id} 
                    sess={sess} 
                    navigate={navigate} 
                    isLatest={idx === 0} 
                    formatDate={formatSessionDate}
                  />
                ))
              )}
            </div>
          </div>

          {/* Share Comments (New Section) */}
          {comments.length > 0 && (
            <div className="md:col-span-12 bg-white border border-gray-100 rounded-xl p-6 shadow-sm flex flex-col">
              <div className="flex items-center gap-2 mb-6 border-b border-gray-50 pb-4">
                <MessageCircle className="w-5 h-5 text-[#325da4]" />
                <h3 className="text-xl font-bold text-gray-900">💬 Messages de tes proches</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex gap-3 shadow-sm hover:shadow-md transition-shadow">
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
                      <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function HistoryItem({ sess, navigate, isLatest, formatDate }: any) {
  const summary = sess.summary || "Exploration en cours...";
  const date = sess.createdAt?.toDate ? sess.createdAt.toDate() : new Date();
  const dStr = formatDate(date);

  const getSessionEmoji = (mode: string) => {
    switch (mode) {
      case 'swipe': return '🃏';
      case 'compare': return '📊';
      case 'map': return '🗺️';
      case 'idee': return '💡';
      case 'question': return '❓';
      default: return '💬';
    }
  };

  return (
    <div className="relative pl-10 group">
      <div className={cn(
        "absolute left-0 top-1 w-[24px] h-[24px] bg-white border-2 rounded-full flex items-center justify-center z-10 transition-colors",
        isLatest ? "border-[#E8002D]" : "border-gray-200 group-hover:border-gray-300 shadow-sm"
      )}>
        {isLatest ? (
          <div className="w-2.5 h-2.5 bg-[#E8002D] rounded-full" />
        ) : (
          <div className="w-2 h-2 bg-gray-100 rounded-full" />
        )}
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{dStr}</div>
          <div className="text-xl leading-none" title={sess.mode?.toUpperCase()}>{getSessionEmoji(sess.mode)}</div>
        </div>
        
        <div 
          onClick={() => navigate('/chat', { state: { sessionId: sess.id } })}
          className={cn(
            "p-4 rounded-xl border transition-all cursor-pointer",
            isLatest 
              ? "bg-white border-gray-200 shadow-sm hover:border-red-200 hover:bg-red-50/10" 
              : "bg-gray-50 border-gray-100 hover:bg-gray-100 hover:border-gray-200"
          )}
        >
          <p className={cn(
            "text-[13px] font-bold leading-relaxed",
            isLatest ? "text-gray-900" : "text-gray-600"
          )}>
            {summary}
          </p>
        </div>
      </div>
    </div>
  );
}

function SessionRow({ sess, navigate }: { sess: any, navigate: any }) {
  const summary = sess.summary || "Conversation d'orientation";
  const loading = false;

  const date = sess.createdAt?.toDate ? sess.createdAt.toDate() : new Date();
  const dStr = format(date, 'd MMM yyyy', { locale: fr });

  const getSessionEmoji = (mode: string) => {
    switch (mode) {
      case 'swipe': return '🃏';
      case 'compare': return '📊';
      case 'map': return '🗺️';
      case 'idee': return '💡';
      case 'question': return '❓';
      default: return '💬';
    }
  };

  return (
    <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-gray-50/80 transition-colors group">
      <div className="flex items-start gap-5 w-full">
         <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform">
           {getSessionEmoji(sess.mode)}
         </div>
         <div className="flex-1">
            {loading ? (
              <div className="flex flex-col gap-2 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-50 rounded w-1/4" />
              </div>
            ) : (
              <>
                <p className="text-[15px] font-bold text-gray-900 mb-1 leading-snug">
                  {summary}
                </p>
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                  Session du {dStr}
                </span>
              </>
            )}
         </div>
      </div>
      
      {!loading && (
        <button 
         onClick={() => navigate('/chat', { state: { sessionId: sess.id } })}
         className="flex items-center gap-2 text-sm font-bold text-[#E8002D] hover:underline whitespace-nowrap"
        >
          Reprendre <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
