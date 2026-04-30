import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';
import { format } from 'date-fns';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { SwipeCards } from '../components/SwipeCards';
import { WordCloudGame } from '../components/WordCloudGame';
import { EliminationGame } from '../components/EliminationGame';

export default function Profile() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    class: '',
    track: '',
    mobility: ''
  });

  const handleRegenerateProfile = async () => {
    if (!user || !userData?.swipeProfile) return;
    setIsRegenerating(true);
    try {
      const genAI = getGemini();
      
      // 1. Regenerate Traits
      const traitsPrompt = `Traduis ce profil d'orientation '${userData.swipeProfile}' en 3-4 traits naturels en français pour un lycéen. Exemple: ['Apprend en faisant', 'Veut entrer vite dans la vie active']. JSON array uniquement.`;
      const traitsRes = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: traitsPrompt
      });
      const traitsText = traitsRes.text.replace(/```json/g, '').replace(/```/g, '').trim();
      const traits = JSON.parse(traitsText);

      // 2. Regenerate Insight
      const insightPrompt = `Basé sur ce profil : "${userData.swipeProfile}", donne un conseil d'une phrase (15-20 mots max) sur le type d'environnement de travail qui lui correspondrait le mieux. Texte pur.`;
      const insightRes = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: insightPrompt
      });
      const insight = insightRes.text.trim();

      const now = new Date().toISOString();
      await updateDoc(doc(db, "users", user.uid), {
        profileTraits: traits,
        profileInsight: insight,
        lastProfileGenAt: now,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `users/${user.uid}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) {
        const data = s.data();
        setUserData(data);
        setEditForm({
          name: data.name || '',
          class: data.class || '',
          track: data.track || '',
          mobility: data.mobility || ''
        });

        // Auto-generate profile traits & insight if missing and swipeProfile exists
        if (data.swipeProfile && (!data.profileTraits || data.profileTraits.length === 0) && !isRegenerating) {
          handleRegenerateProfile();
        }
      }
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: editForm.name,
        class: editForm.class,
        track: editForm.track,
        mobility: editForm.mobility,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${user.uid}`);
    }
  };

  const calculateProgress = () => {
    if (!userData) return 0;
    const fields = [
      userData.name,
      userData.class,
      userData.track,
      userData.mobility,
      userData.swipeProfile,
      userData.profileTraits?.length > 0,
      userData.shortlist?.length > 0
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  };

  const progress = calculateProgress();

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto flex flex-col gap-10 font-lexend">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-[32px] font-bold text-gray-900 leading-none">Mon profil</h1>
            <div className="flex items-center gap-3 mt-1">
              <button 
                onClick={handleRegenerateProfile}
                disabled={isRegenerating || !userData?.swipeProfile}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-1.5 transition-colors bg-white disabled:opacity-50"
              >
                <span className={cn("inline-block", isRegenerating && "animate-spin")}>↺</span>
                <span>{isRegenerating ? "Actualisation..." : "Actualiser"}</span>
              </button>
              {userData?.lastProfileGenAt && (
                <span className="text-gray-400 text-[10px] uppercase font-bold tracking-widest pt-0.5">
                  Dernière actualisation : {format(new Date(userData.lastProfileGenAt), 'HH:mm')}
                </span>
              )}
            </div>
          </div>
          <p className="text-gray-500">Découvre ce qu'ORI a appris sur toi et gère tes données.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#E8002D]" style={{ fontVariationSettings: "'FILL' 1" }}>target</span>
              Avancement
            </h2>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-5xl font-bold text-[#E8002D]">{progress}%</span>
              <span className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-widest leading-none">complété</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-[#E8002D] rounded-full transition-all duration-1000" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              Continue de discuter avec ORI ou joue à des mini-jeux pour affiner ton profil.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -top-4 text-gray-100 opacity-50 pointer-events-none">
              <span className="material-symbols-outlined" style={{ fontSize: '140px', fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined text-[#325da4]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              Ma personnalité
            </h2>
            <div className="relative z-10 space-y-6">
              {isRegenerating ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-20 bg-gray-50 rounded-xl" />
                  <div className="flex gap-2">
                    <div className="h-8 w-20 bg-gray-50 rounded-full" />
                    <div className="h-8 w-24 bg-gray-50 rounded-full" />
                  </div>
                </div>
              ) : (
                <>
                  {userData?.profileInsight && (
                    <p className="text-xs text-blue-600 bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 leading-relaxed">
                      <span className="font-bold flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3" /> Conseil Ori :
                      </span>
                      {userData.profileInsight}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-[#725c00]">
                    {userData?.profileTraits?.map((t: string, i: number) => (
                      <span key={i} className="bg-[#ffe800] px-4 py-2 rounded-full shadow-sm">{t}</span>
                    )) || <span className="bg-gray-100 text-gray-400 px-4 py-2 rounded-full">Analyse en cours...</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-8">
          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
                <span className="material-symbols-outlined text-[#E8002D] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>database</span>
                Données collectées
              </h2>
              <button 
                onClick={() => setIsEditing(true)}
                className="text-[#325da4] font-bold text-sm flex items-center gap-1.5 hover:underline"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                Tout modifier
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DataItem 
                label="PRÉNOM" 
                value={userData?.name || 'Non renseigné'} 
              />
              <DataItem 
                label="CLASSE ACTUELLE" 
                value={userData?.class || 'Non renseigné'} 
              />
              <DataItem 
                label="FILIÈRE" 
                value={userData?.track || 'Non renseigné'} 
              />
              <DataItem 
                label="MOBILITÉ GÉOGRAPHIQUE" 
                value={userData?.mobility || 'Non renseigné'} 
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <h2 className="text-xl font-bold mb-8 flex items-center gap-3">
              <span className="material-symbols-outlined text-[#E8002D] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>sports_esports</span>
              Tests & Mini-jeux
            </h2>
            <div className="space-y-4">
               <GameRow 
                 title="Le Swipe des Métiers" 
                 status={userData?.swipeProfile ? "Complété" : "Disponible"} 
                 done={!!userData?.swipeProfile} 
                 onClick={() => setActiveGame('swipe')}
               />
               <GameRow 
                 title="Le Nuage d'Intérêts" 
                 status={userData?.wordCloudResults ? "Complété" : "Disponible"} 
                 done={!!userData?.wordCloudResults}
                 onClick={() => setActiveGame('wordcloud')}
               />
               <GameRow 
                 title="L'Élimination Directe" 
                 status={userData?.eliminationProfile ? "Complété" : "Disponible"} 
                 done={!!userData?.eliminationProfile}
                 onClick={() => setActiveGame('elimination')}
               />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold mb-6">Modifier mes informations</h3>
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">PRÉNOM</label>
                <input 
                  type="text" 
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({...prev, name: e.target.value}))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#E8002D] outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">CLASSE ACTUELLE</label>
                <input 
                  type="text" 
                  value={editForm.class}
                  onChange={(e) => setEditForm(prev => ({...prev, class: e.target.value}))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#E8002D] outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">FILIÈRE</label>
                <input 
                  type="text" 
                  value={editForm.track}
                  onChange={(e) => setEditForm(prev => ({...prev, track: e.target.value}))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#E8002D] outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">MOBILITÉ GÉOGRAPHIQUE</label>
                <input 
                  type="text" 
                  value={editForm.mobility}
                  onChange={(e) => setEditForm(prev => ({...prev, mobility: e.target.value}))}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#E8002D] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsEditing(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-500 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-[#E8002D] text-white font-bold hover:opacity-90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Modal */}
      {activeGame && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col">
          <div className="p-4 border-b flex justify-between items-center bg-white">
            <h3 className="font-bold text-gray-900">
               {activeGame === 'swipe' && 'Le Swipe des Métiers'}
               {activeGame === 'wordcloud' && 'Le Nuage d\'Intérêts'}
               {activeGame === 'elimination' && 'L\'Élimination Directe'}
            </h3>
            <button 
              onClick={() => setActiveGame(null)}
              className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex-1 relative overflow-auto p-4 flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex items-center justify-center">
              {activeGame === 'swipe' && <SwipeCards onComplete={async (natural, raw) => {
                if (user) {
                  try {
                    await updateDoc(doc(db, "users", user.uid), { 
                      swipeProfile: natural, 
                      swipeProfileRaw: raw,
                      updatedAt: serverTimestamp() 
                    });
                  } catch (e) {
                    handleFirestoreError(e, 'update', `users/${user.uid}`);
                  }
                }
                setActiveGame(null);
              }} />}
              {activeGame === 'wordcloud' && <WordCloudGame onComplete={async (liked, disliked, desired, natural) => {
                if (user) {
                  try {
                    await updateDoc(doc(db, "users", user.uid), { 
                      wordCloudResults: { liked, disliked, desired },
                      wordCloudSummary: natural,
                      updatedAt: serverTimestamp()
                    });
                  } catch (e) {
                    handleFirestoreError(e, 'update', `users/${user.uid}`);
                  }
                }
                setActiveGame(null);
              }} />}
              {activeGame === 'elimination' && <EliminationGame onComplete={async (eliminated, natural) => {
                if (user) {
                  try {
                    await updateDoc(doc(db, "users", user.uid), { 
                      eliminationProfile: eliminated,
                      eliminationSummary: natural,
                      updatedAt: serverTimestamp()
                    });
                  } catch (e) {
                    handleFirestoreError(e, 'update', `users/${user.uid}`);
                  }
                }
                setActiveGame(null);
              }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-6 flex justify-between items-start group hover:border-[#E8002D]/30 transition-all">
      <div className="min-w-0">
        <span className="block text-[10px] font-bold text-[#725c00] uppercase tracking-widest mb-2">{label}</span>
        <span className="block font-bold text-gray-900 text-lg leading-tight truncate">{value}</span>
      </div>
    </div>
  );
}

function GameRow({ title, status, done, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-5 rounded-2xl flex items-center justify-between cursor-pointer transition-all border-2",
        done ? "bg-[#f8fafc] border-gray-100 hover:border-gray-200" : "bg-white border border-gray-100 hover:border-[#E8002D]/50 shadow-sm"
      )}
    >
      <div className="flex items-center gap-5">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform active:scale-90",
          done ? "bg-gray-100 text-gray-400" : "bg-[#E8002D] text-white shadow-lg shadow-red-100"
        )}>
           <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: done ? "'FILL' 0" : "'FILL' 1" }}>
             {done ? 'check_circle' : 'play_arrow'}
           </span>
        </div>
        <div>
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{status}</p>
        </div>
      </div>
      <button className={cn(
        "px-6 py-2 rounded-xl text-xs font-bold transition-all",
        done ? "bg-white border-2 border-gray-200 text-gray-400 hover:border-gray-900 hover:text-gray-900" : "bg-[#E8002D] text-white hover:opacity-90 shadow-sm"
      )}>
        {done ? 'Refaire' : 'Lancer'}
      </button>
    </div>
  );
}
