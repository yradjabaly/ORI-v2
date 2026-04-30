import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Send, Plus, Menu, MessageSquare, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { getGemini, GEMINI_MODEL } from '../lib/gemini';

// Types
type Role = 'ori' | 'user';

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  quickReplies?: string[];
  uiTrigger?: string | null;
  mythText?: string;
  isHistorical?: boolean;
  componentData?: Record<string, any>;
}

const SYSTEM_PROMPT = `
# IDENTITÉ ORI
Tu es ORI, conseiller d'orientation IA de l'Étudiant. Tu aides les élèves de terminale et de 1ère année du supérieur à prendre une décision d'orientation éclairée.

# DÉTECTION DE MYTHES (MYTHE OU RÉALITÉ)
Before generating your regular response, check if the user's message contains any of these common French education myths:
- 'BTS c'est pour les mauvais élèves' / 'BTS c'est facile'
- 'la fac c'est trop libre' / 'on coule en fac'
- 'prépa c'est pour les meilleurs seulement'  
- 'avec un bac pro on peut rien faire'
- 'l'alternance c'est pas sérieux' / 'alternance c'est galère'
- 'psycho ça débouche sur rien'
- 'les grandes écoles c'est pour les riches'
- 'droit c'est très difficile'
- 'informatique c'est que pour les geeks'

If a myth is detected, add [MYTH:true] AND [MYTH_TEXT: brief 2-sentence reality check in French, factual, slightly playful tone, starting with 'En réalité...' or 'Pas tout à fait —'] to the START of your response. Still give your full normal response after.

# CONTEXTE ÉLÈVE
{USER_NAME}
{USER_CLASS}
{USER_TRACK}
- Profil swipe : {SWIPE_PROFILE}
- État émotionnel : {EMOTIONAL_STATE}
- Résumé session précédente : {SESSION_SUMMARY}
- Shortlist actuelle : {SHORTLIST}

# RÈGLES ABSOLUES
1. Toujours terminer chaque réponse par UNE question ou 2-3 boutons de choix au format [BTN:texte du bouton]
2. Maximum 3 phrases par réponse. Jamais de listes à puces. Prose directe uniquement.
3. Tutoiement systématique. Langage direct, sans jargon.
4. ÉTAT ÉMOTIONNEL : tu peux tenir compte de l'état émotionnel de l'élève pour adapter TON TON (être plus rassurant si anxieux, plus enthousiaste si confiant). Mais tu ne dois JAMAIS nommer explicitement cet état dans ta réponse ('je comprends ton anxiété', 'c'est normal d'avoir peur', 'je vois que tu es stressé') sauf si l'élève l'exprime LUI-MÊME dans son message actuel. Traite l'émotion par le fond (en étant concret et rassurant) pas par la forme.
5. Ne jamais dire "tu devrais". Dire "voici ce que ça implique pour toi".
6. Utiliser le prénom de l'élève 1 fois toutes les 4-5 réponses.
7. NEVER output [TRIGGER:WORDCLOUD] or [TRIGGER:ELIMINATION] unless the user explicitly clicked those game buttons. For comparisons, ALWAYS use [TRIGGER:COMPARE:ID1,ID2].

# DÉTECTION D'INTENTION
- Mode A (exploration) : réponses sur l'exploration, profil, univers métiers
- Mode B (idée) : valider, comparer, approfondir une piste
- Mode C (question) : répondre factuellement puis inviter à explorer

# INSTRUCTIONS ONBOARDING (Modes A et B)
Si l'élève donne son prénom, tu DOIS inclure [EXTRACT:NAME:son_prénom] exactement dans ta réponse.
Si l'élève donne sa classe, tu DOIS inclure [EXTRACT:CLASS:sa_classe] exactement.
Si l'élève donne sa filière, tu DOIS inclure [EXTRACT:TRACK:sa_filière] exactement.

En Mode A ou si l'élève accepte l'onboarding en Mode B :
- Demande d'abord le prénom et la classe (si la Classe est INCONNUE). N'invente pas la classe !
- Une fois que tu connais la classe : 
  - Si c'est "Terminale" (et que la Filière est INCONNUE), demande obligatoirement : "Tu es en quelle filière ?" avec [BTN:Générale] [BTN:Technologique] [BTN:Professionnelle].
- Once you have la classe (et la filière si c'est nécessaire), propose les jeux : "Pour mieux te cerner rapidement, je te propose 3 activités. Laquelle t'attire ?" avec [BTN:Tinder Swipe 🃏] [BTN:Je n'aime pas ✕] [BTN:Nuage de mots ☁️].
- When proposing choices or activities, NEVER output a [TRIGGER:xxx] tag in the same message. Only output a TRIGGER tag after the user has made a selection and that selection is reflected in the conversation history. For example, wait for the user to click "[BTN:Tinder Swipe 🃏]" before outputting "[TRIGGER:SWIPE]".

# INSTRUCTIONS MODE C
En Mode C, dès que l'élève pose sa question, tu DOIS obligatoirement classer sa question.
La TOUTE PREMIÈRE LIGNE de ta réponse doit être [CLASS:XXX], où XXX est l'une de ces catégories : PROCEDURE, DATES, COMPARISON, INFO_SCHOOL, FINANCING, ou OFF_TOPIC.
Ensuite, saute une ligne et donne ta réponse.

# FORMATS DE COMPOSANTS UI
Quand tu veux déclencher un composant UI, ajoute ceci (invisible pour l'élève) :
IMPORTANT: only output ONE [TRIGGER:xxx] tag per response, the most relevant one. Never output multiple triggers.
[TRIGGER:COMPARE:F001,F002] — tableau comparatif (formations IDs)
[TRIGGER:SIMULATOR:F001] — simulateur admission
[TRIGGER:DAY_IN_LIFE:F001] — journée type
[TRIGGER:LINKEDIN:F001] — afficher les données de débouchés et parcours LinkedIn pour une formation. Déclencher quand l'élève demande 'que font les diplômés', 'débouchés', 'où travaillent-ils après', 'parcours après la formation'.
[TRIGGER:FLASH_FORWARD:F001,F002] — projection 5 ans
[TRIGGER:MAP] — carte des établissements
[TRIGGER:PLAN_ACTION] — résumé et checklist finale
[TRIGGER:SWIPE] — lancer les swipe cards
[TRIGGER:WORDCLOUD] — jeu de tri de mots (aimé / pas aimé / j'aurais aimé) pour comprendre ce que l'élève a apprécié ou non dans son parcours actuel. Déclencher UNIQUEMENT si l'élève a cliqué sur le bouton 'Nuage de mots ☁️'. Utilisable pour tout élève, pas seulement les 1ère année.
[TRIGGER:ELIMINATION] — jeu élimination (ONLY when user explicitly chooses "Je n'aime pas" game)
[TRIGGER:VIDEO:procedural:{keyword}] — affiche une vidéo pratique (Parcoursup, alternance, etc.). Keywords: alternance, grande école, entreprise alternance, parcoursup, prêt étudiant.
[TRIGGER:VIDEO:vismavie:{formationId}] — affiche une vidéo métier/formation.
[TRIGGER:REALITY_TEST:{formationId}:{formationName}] — test de motivation et réalité d'une formation.
[TRIGGER:VOEU_METRE] — analyse l'équilibre de la liste Parcoursup de l'élève.
[TRIGGER:BUDGET_COMPARATOR] — compare le budget actuel et futur de l'élève selon la ville.
[TRIGGER:CAMPUS_VIBE:{formationId}:{formationName}:{etablissementName}] — affiche l'ambiance et le rythme d'une formation.

# VIDÉOS (TRIGGERS)
- Quand l'élève pose une question procédurale sur Parcoursup, l'alternance, le financement des études, ou les types de formations (BTS/BUT/Prépa/Grande École), réponds normalement puis ajoute [TRIGGER:VIDEO:procedural:{keyword}] à la fin de ton message (ex: [TRIGGER:VIDEO:procedural:alternance]).
- Quand tu génères un DayInLife pour une formation, si une vidéo vis-ma-vie existe pour cette formation, ajoute [TRIGGER:VIDEO:vismavie:{formationId}] après le DayInLife.
- Quand l'élève a exploré une formation en détail (après DayInLife, ComparisonTable ou LinkedIn), propose le test de réalité: "Tu veux tester si le quotidien de {formation} te correspond vraiment ?" avec [BTN:Tester ma motivation 🔥]. Quand ce bouton est cliqué, réponds avec une courte phrase d'introduction et ajoute le trigger: [TRIGGER:REALITY_TEST:{formationId}:{formationName}].
- Quand l'élève parle de Parcoursup, de ses vœux, ou de sa liste de candidatures, propose le Vœu-Mètre: "Tu veux analyser l'équilibre de ta liste Parcoursup ?" avec [BTN:Analyser ma liste 📊]. Quand ce bouton est cliqué, réponds avec une courte phrase d'introduction et ajoute le trigger: [TRIGGER:VOEU_METRE].
- Quand l'élève mentionne une ville différente de la sienne, le coût des études, le budget, le financement ou les aides, propose: "Tu veux voir ce que ça changerait vraiment pour ton budget ?" avec [BTN:Simuler mon budget 💰]. Quand cliqué, ajoute: [TRIGGER:BUDGET_COMPARATOR]
- Quand l'élève explore une formation en détail et semble hésiter ou comparer des ambiances, propose: "Tu veux voir l'ambiance et le rythme de cette formation en un coup d'oeil ?" avec [BTN:Voir l'ambiance 🎯]. Quand cliqué, réponds avec une courte phrase et ajoute: [TRIGGER:CAMPUS_VIBE:{formationId}:{formationName}:{etablissementName}]

# SHORTLIST AUTOMATIQUE
Si tu mentionnes une formation spécifique (ou plusieurs) comme étant une excellente piste pour l'élève et que tu lui conseilles de l'explorer plus en détail, ajoute OBLIGATOIREMENT le tag [SHORTLIST_ADD:ID_DE_LA_FORMATION] (ex: [SHORTLIST_ADD:F001]) TOUT À LA FIN de ta réponse, juste avant les boutons [BTN]. Remplace ID_DE_LA_FORMATION par l'ID réel.

# ÉTATS D'HÉSITATION
- Signaux verts ("ça me parle") → relance de profondeur
- Signaux orange ("je sais pas") → séquence: Pour toi/À peser → DEALBREAKER CHECK → simulateur → instinctif → réalité LinkedIn → shortlist
- Signaux rouges ("j'ai peur") → validation émotionnelle obligatoire en premier
- When a student has been hesitating between two formations for more than 2 exchanges, add [TRIGGER:FLASH_FORWARD:F001,F002] to your response. Replace F001 and F002 with the real formation IDs.

# DEALBREAKER CHECK
Après avoir affiché le tableau comparatif, pose UNE question naturelle sur LE point de divergence le plus important entre le profil de l'élève et une formation.
Format naturel: "Le [Formation] dure [X] ans — c'est plus long que ce que tu avais imaginé. Est-ce que ça, c'est un vrai frein pour toi ou tu pourrais t'y faire ?"
NE PAS reproduire des fragments techniques comme "tu as noté : [texte]". Formuler comme un conseiller humain qui pose une question directe et simple.

10. TON HUMAIN : tes réponses doivent sonner naturel.
N'utilise PAS de mots d'amorce systématiques — des mots comme 'Honnêtement', 'Entre nous', 'Franchement' ne doivent apparaître QUE si le contexte le justifie vraiment (ex: révéler quelque chose de contre-intuitif ou nuancer une affirmation forte). Ne les place jamais en début de réponse par défaut ou pour remplir. La plupart des réponses doivent commencer directement par le sujet : 'Le BUT MMI...', 'Ta moyenne...', 'C'est une bonne piste...'
N'utilise jamais : 'Je comprends que', 'Il est important de', 'Je note que', 'Voici ce que', 'En tant que conseiller'.
Utilise 'on' plutôt que 'nous' ou 'vous'.

11. COMPOSANTS PROACTIFS : n'attends pas que l'élève demande explicitement un composant. Déclenche-les dès que pertinent :
- L'élève mentionne une formation → [TRIGGER:DAY_IN_LIFE:id]
- L'élève hésite entre deux choses → [TRIGGER:COMPARE:id1,id2]
- L'élève demande les débouchés ou 'qu'est-ce qu'on fait après' → [TRIGGER:LINKEDIN:id]
- L'élève évoque une ville ou 'près de chez moi' → [TRIGGER:MAP]
- L'élève dit 'mes chances', 'est-ce que je peux entrer', 'mon dossier' → [TRIGGER:SIMULATOR:id]
Ne jamais répondre uniquement par du texte quand un composant visuel serait plus parlant. Le texte prépare, le composant montre.

Après qu'un jeu de profilage se termine 
(SWIPE, ELIMINATION, WORDCLOUD), tu reçois 
le profil détecté en contexte interne.

Étape 1 : Génère un résumé naturel et bienveillant 
du profil en 2-3 phrases maximum. Termine toujours 
par 'Ça te parle ?' et propose exactement 
ces 2 boutons :
[BTN:Oui, c'est juste !]
[BTN:Pas vraiment]

Étape 2a : Si l'élève répond 'Oui, c'est juste !', 
propose exactement 3 formations adaptées à son profil 
avec une courte description de chacune. Format :
'Basé sur ton profil, 3 formations qui te 
correspondent bien : [Formation 1] (description 
courte), [Formation 2] (description courte), et 
[Formation 3] (description courte). Tu veux 
en explorer une ou comparer deux ?'
Puis propose exactement 3 boutons — choisis 
librement parmi les 3 formations :
[BTN:Explorer {Formation X}]
[BTN:Explorer {Formation Y}]
[BTN:Comparer {Formation X} et {Formation Z}]

Étape 2b : Si l'élève répond 'Pas vraiment', 
réponds : 'Pas de souci ! Dis-moi en quelques mots 
ce qui ne te correspond pas — je vais affiner 
ta recommandation.' et attends sa réponse sans 
proposer de boutons.
`;

import { motion } from 'motion/react';
import { SwipeCards } from '../components/SwipeCards';
import { EliminationGame } from '../components/EliminationGame';
import { WordCloudGame } from '../components/WordCloudGame';
import { ComparisonTable } from '../components/ComparisonTable';
import { DayInLife } from '../components/DayInLife';
import { AdmissionSimulator } from '../components/AdmissionSimulator';
import { SchoolMap } from '../components/SchoolMap';
import { PlanActionHandler } from '../components/PlanActionHandler';
import { FlashForward } from '../components/FlashForward';
import { LinkedInPathway } from '../components/LinkedInPathway';
import { RealityTest } from '../components/RealityTest';
import { VoeuMetre } from '../components/VoeuMetre';
import { BudgetComparator } from '../components/BudgetComparator';
import { CampusVibe } from '../components/CampusVibe';
import VideoCard, { VIDEO_DB } from '../components/VideoCard';

function MythBanner({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={() => setVisible(false)}
      className="ml-10 mb-2 cursor-pointer bg-[#FFD100] text-amber-950 px-4 py-3 rounded-xl shadow-sm border border-amber-200 flex gap-3 items-start w-fit max-w-[85%]"
    >
      <span className="text-xl leading-none mt-0.5">💡</span>
      <div className="flex-1">
        <strong className="text-[#E8002D] font-black uppercase text-xs tracking-wide block mb-1">Mythe</strong>
        <span className="text-sm leading-snug block">{text}</span>
      </div>
    </motion.div>
  );
}

export default function Chat() {
  const { user, userData: globalUserData } = useAuth();
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const sessionIdRef = useRef<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<string>('exploration');
  const [includeLastSessionContext, setIncludeLastSessionContext] = useState(true);
  const [showReturnBanner, setShowReturnBanner] = useState(false);
  const [lastSessionSummaryState, setLastSessionSummaryState] = useState('');
  const [userData, setUserData] = useState<any>({});
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(() => {
    const saved = localStorage.getItem('chat_history_collapsed');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('chat_history_collapsed', String(isHistoryCollapsed));
  }, [isHistoryCollapsed]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Fetch past sessions
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "sessions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPastSessions(sessions);
    });

    return () => unsubscribe();
  }, [user]);

  // Init session & check for returning users
  useEffect(() => {
    let isSubscribed = true;

    async function initUserSession() {
      if (!user) return;
      
      const newSessionId = uuidv4();
      
      try {
        const uDoc = await getDoc(doc(db, "users", user.uid));
        
        if (uDoc.exists()) {
           const data = uDoc.data();
           setUserData(data);
           if (data.lastSessionSummary) {
              setLastSessionSummaryState(data.lastSessionSummary);
              setShowReturnBanner(true);
              setIncludeLastSessionContext(false); // Wait for them to say YES
              
              setMessages([{
                id: '1',
                role: 'ori',
                content: `Bon retour ${data.name || ''} ! 😊 C'est cool de te revoir.`,
                timestamp: new Date(),
                isHistorical: false
              }]);
              
           } else {
              setMessages([
                {
                  id: '1',
                  role: 'ori',
                  content: "Salut ! Je suis ORI, ton conseiller d'orientation personnel. Par où tu veux commencer ?",
                  timestamp: new Date(),
                  quickReplies: ["Explorons ensemble 🧭", "J'ai une idée 💡", "J'ai une question précise ❓"],
                  isHistorical: false
                }
              ]);
           }
        } else {
            setMessages([
              {
                id: '1',
                role: 'ori',
                content: "Salut ! Je suis ORI, ton conseiller d'orientation personnel. Par où tu veux commencer ?",
                timestamp: new Date(),
                quickReplies: ["Explorons ensemble 🧭", "J'ai une idée 💡", "J'ai une question précise ❓"]
              }
            ]);
        }
      } catch (err) { }
      
      if (isSubscribed) {
        setSessionId(newSessionId);
        sessionIdRef.current = newSessionId;
      }
    }
    
    if (user && !sessionId) {
       initUserSession();
    }

    return () => { isSubscribed = false; };
  }, [user, sessionId]);

  const handleReturnChoice = async (continuons: boolean) => {
     setShowReturnBanner(false);
     
     if (continuons) {
        setIncludeLastSessionContext(true);
        handleSend("Oui, continuons !");
     } else {
        setIncludeLastSessionContext(false);
        // Clear it from the user doc so it starts fresh, but keep profile
        if (user) {
          try {
             await updateDoc(doc(db, "users", user.uid), {
                lastSessionSummary: ''
             });
          } catch(e) {}
        }
        handleSend("Je préfère recommencer");
     }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const getInitials = () => {
    const displayName = globalUserData?.name || user?.displayName || user?.email || '';
    if (!displayName) return '??';
    return displayName.slice(0, 2).toUpperCase();
  };

  const updateEmotionalState = async (text: string) => {
    if (!user) return;
    const lowerText = text.toLowerCase();
    
    let state = null;
    if (lowerText.includes('peur') || lowerText.includes('stress') || lowerText.includes('angoisse') || lowerText.includes('perdu')) {
      state = 'Anxieux';
    } else if (lowerText.includes('sûr') || lowerText.includes('motivé') || lowerText.includes('hâte')) {
      state = 'Confiant';
    } else if (lowerText.includes('parents') && lowerText.includes('veulent')) {
      state = 'Pression familiale';
    }

    if (state) {
      try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { emotionalState: state });
      } catch (err) {
        console.error("Failed to update emotional state: ", err);
      }
    }
  };

  const callOriAI = async (text: string, isInternal: boolean = false, userDataOverride?: any, forcedTrigger?: string | null) => {
    console.log('[callOriAI] called with:', { text: text.slice(0, 50), isInternal });
    try {
      const currentSessionId = sessionId || sessionIdRef.current;
      if (!user || !currentSessionId) return;

      // 1. Fetch User Data & Session Data
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const sessionDocRef = doc(db, "sessions", currentSessionId);
      const sessionDataSnap = await getDoc(sessionDocRef);
      
      const firestoreUserData = userDoc.exists() ? userDoc.data() : {};
      const mergedUserData = { ...firestoreUserData, ...userDataOverride };
      const sessionData: any = sessionDataSnap.exists() ? sessionDataSnap.data() : { summary: '', messages: [] };

      // Make sure session exists
      if (!sessionDataSnap.exists()) {
        await setDoc(sessionDocRef, {
          userId: user.uid,
          mode: mode,
          summary: '',
          messages: [],
          createdAt: serverTimestamp()
        });
      }

      // Determine context strings safely
      const rawName = mergedUserData?.name || '';
      const rawClass = mergedUserData?.class || '';
      const rawTrack = mergedUserData?.track || '';

      let userName = (rawName.trim() !== '.' && rawName.trim().length > 1 && rawName.trim() !== 'INCONNU' && rawName.trim() !== 'Élève') ? rawName.trim() : '';
      const userClass = (rawClass.trim() !== '.' && rawClass.trim().length > 1 && rawClass.trim() !== 'ta classe' && rawClass.trim() !== 'INCONNUE') ? rawClass.trim() : '';
      const userTrack = (rawTrack.trim() !== '.' && rawTrack.trim().length > 1 && rawTrack.trim() !== 'ta filière' && rawTrack.trim() !== 'INCONNUE') ? rawTrack.trim() : '';
      const swipeProfile = mergedUserData?.swipeProfile || 'Aucun';
      const emotionalState = mergedUserData?.emotionalState || 'Neutre';
      
      // If includeLastSessionContext is false, we ignore previous memory summaries
      const sessionSummary = includeLastSessionContext 
         ? (sessionData?.summary || mergedUserData?.lastSessionSummary || 'Aucun')
         : (sessionData?.summary || 'Aucun');
      const shortlistStr = mergedUserData?.shortlist?.join(', ') || 'Vide';

      // Ensure naming doesn't break
      userName = userName.replace(/\0/g, '');

      let prompt = SYSTEM_PROMPT
        .replace(/\{USER_NAME\}/g, userName ? `- Prénom : ${userName}` : '')
        .replace(/\{USER_CLASS\}/g, userClass ? `- Classe : ${userClass}` : '')
        .replace(/\{USER_TRACK\}/g, userTrack ? `- Filière : ${userTrack}` : '')
        .replace(/\{SWIPE_PROFILE\}/g, swipeProfile)
        .replace(/\{EMOTIONAL_STATE\}/g, emotionalState)
        .replace(/\{SESSION_SUMMARY\}/g, sessionSummary)
        .replace(/\{SHORTLIST\}/g, shortlistStr)
        .replace(/\n\s*\n/g, '\n'); // Clean up empty lines from missing context

      const recentMessages = sessionData.messages ? sessionData.messages.slice(-5) : [];
      
      const userMessageLower = text.toLowerCase();
      const msgCount = sessionData.messages ? sessionData.messages.length + 1 : 1; 
      // +1 because 'text' is the current user message, messages array has previous ones.
      
      if ((msgCount % 5 === 0) || /c'est bon|merci|à bientôt|c'est clair|j'ai décidé/i.test(userMessageLower)) {
        prompt += "\nIf you have enough information about this student's orientation (class, at least one formation explored), generate a checklist. Add [TRIGGER:PLAN_ACTION] to your response.";
      }

      let historyContext = recentMessages.map((m: any) => `${m.role === 'ori' ? 'ORI' : 'Eleve'}: ${m.content}`).join("\n");
      
      const ragContext = await fetchRAGContext(text);
      const ragSection = ragContext
        ? `\n\nINFORMATION VÉRIFIÉE (source L'Étudiant — utilise ces données en priorité):\n${ragContext}\n`
        : '';

      const fullPrompt = `${prompt}${ragSection}\n\nHistorique récent:\n${historyContext}\nEleve (Mode: ${mode}): ${text}\nORI:`;

      // 2. Call Gemini
      const aiInstance = getGemini();
      const response = await aiInstance.models.generateContent({
        model: GEMINI_MODEL,
        contents: fullPrompt,
      });
      const rawText = response.text || "";

      // 3. Parse tags
      let finalText = rawText;
      const quickReplies: string[] = [];
      let uiTrigger: string | null = null;
      let shortlistAdds: string[] = [];
      let mythText: string | undefined = undefined;

      // Extract MYTH
      const mythTagRegex = /\[MYTH:true\]/i;
      const mythTextRegex = /\[MYTH_TEXT:(.*?)\]/is;
      
      if (mythTagRegex.test(rawText)) {
         const tMatch = mythTextRegex.exec(rawText);
         if (tMatch) {
            mythText = tMatch[1].trim();
            // remove trailing brackets if any
            mythText = mythText.replace(/\]$/, '').trim(); 
         }
      }
      finalText = finalText.replace(/\[MYTH:true\]( AND )?/gi, '').replace(/\[MYTH_TEXT:.*?\]/gis, '').trim();

      // Extract buttons
      const btnRegex = /\[BTN:(.*?)\]/g;
      let match;
      while ((match = btnRegex.exec(rawText)) !== null) {
        quickReplies.push(match[1].trim());
      }
      finalText = finalText.replace(btnRegex, '').trim();

      // Extract shortlist add
      const shortlistAddRegex = /\[SHORTLIST_ADD:(.*?)\]/g;
      let slMatch;
      while ((slMatch = shortlistAddRegex.exec(rawText)) !== null) {
        shortlistAdds.push(slMatch[1].trim());
      }
      finalText = finalText.replace(shortlistAddRegex, '').trim();

      // Extract tags
      const extractNameRegex = /\[EXTRACT:NAME:(.*?)\]/;
      const nameMatch = extractNameRegex.exec(rawText);
      const extractedName = (nameMatch && nameMatch[1].trim() && nameMatch[1].trim() !== '.' && nameMatch[1].trim() !== 'INCONNU' && nameMatch[1].trim() !== 'Élève') ? nameMatch[1].trim() : null;

      const extractClassRegex = /\[EXTRACT:CLASS:(.*?)\]/;
      const classMatch = extractClassRegex.exec(rawText);
      const extractedClass = (classMatch && classMatch[1].trim() && classMatch[1].trim() !== '.' && classMatch[1].trim() !== 'INCONNUE' && classMatch[1].trim() !== 'ta classe') ? classMatch[1].trim() : null;

      const extractTrackRegex = /\[EXTRACT:TRACK:(.*?)\]/;
      const trackMatch = extractTrackRegex.exec(rawText);
      const extractedTrack = (trackMatch && trackMatch[1].trim() && trackMatch[1].trim() !== '.' && trackMatch[1].trim() !== 'INCONNUE' && trackMatch[1].trim() !== 'ta filière') ? trackMatch[1].trim() : null;

      if (extractedName || extractedClass || extractedTrack || shortlistAdds.length > 0) {
         const allowedUpdates: any = {};
         if (extractedName) allowedUpdates.name = extractedName;
         if (extractedClass) allowedUpdates.class = extractedClass;
         if (extractedTrack) allowedUpdates.track = extractedTrack;
         
         try {
            if (Object.keys(allowedUpdates).length > 0) {
              setUserData((prev: any) => ({ ...prev, ...allowedUpdates }));
              await updateDoc(doc(db, "users", user.uid), {
                ...allowedUpdates,
                updatedAt: serverTimestamp()
              });
            }
            if (shortlistAdds.length > 0) {
               await updateDoc(doc(db, "users", user.uid), {
                  shortlist: arrayUnion(...shortlistAdds),
                  updatedAt: serverTimestamp()
               });
            }
         } catch(e) {
            handleFirestoreError(e, 'update', `users/${user.uid}`);
         }
      }

      // Cleanup specific class/extract tags from final text by replacing them with the value
      finalText = finalText.replace(/\[EXTRACT:[^:]+:([^\]]*)\]/g, '$1').trim();

      // Extract trigger with priority
      const triggerPriority = ['COMPARE','SIMULATOR','DAY_IN_LIFE','LINKEDIN',
        'FLASH_FORWARD','MAP','PLAN_ACTION','SWIPE','WORDCLOUD',
        'ELIMINATION', 'VIDEO', 'REALITY_TEST', 'VOEU_METRE', 'BUDGET_COMPARATOR', 'CAMPUS_VIBE'];
      
      uiTrigger = forcedTrigger || null;
      if (!uiTrigger) {
        for (const t of triggerPriority) {
          const r = new RegExp(`\\[TRIGGER:(${t}[^\\]]*?)\\]`);
          const m = r.exec(rawText);
          if (m) { uiTrigger = m[1].trim(); break; }
        }
      }
      finalText = finalText.replace(/\[TRIGGER:[^\]]*\]/g, '').trim();
      
      if (uiTrigger === 'WORDCLOUD') {
        const userChoseWordCloud = messages.some(m => 
          m.role === 'user' && m.content.includes('Nuage de mots')
        );
        if (!userChoseWordCloud) uiTrigger = null;
      }

      const gameButtons = ['Tinder Swipe','Je n\'aime pas','Nuage de mots'];
      const hasGameChoice = quickReplies.some(btn => 
        gameButtons.some(g => btn.includes(g))
      );
      if (hasGameChoice) uiTrigger = null;

      // Extract Mode C topic class
      const classTopicRegex = /\[CLASS:(.*?)\]/;
      const classTopicMatch = classTopicRegex.exec(rawText);
      if (classTopicMatch) {
         // In a real app we might store this in analytics or session state
         console.log("Mode C Classification:", classTopicMatch[1].trim());
         finalText = finalText.replace(classTopicRegex, '').trim();
      }

      // Cleanup any remaining unwanted brackets
      finalText = finalText.replace(/\[.*?\]/g, '').trim();

      // Ensure at least some response
      if (!finalText) {
        finalText = "Désolé, j'ai eu une petite absence. Peux-tu reformuler ?";
      }

      // 4. Save to firestore
      const isoTimestamp = new Date().toISOString();
      const newOriMessageInfo: any = {
        role: 'ori',
        content: finalText,
        timestamp: isoTimestamp,
        uiTrigger: uiTrigger || null,
        quickReplies: quickReplies || [],
        componentData: null
      };
      if (mythText !== undefined) {
        newOriMessageInfo.mythText = mythText;
      }

      const messagesToPush = isInternal 
        ? [newOriMessageInfo]
        : [
            { role: 'user', content: text.trim(), timestamp: new Date().toISOString(), uiTrigger: null, quickReplies: [] },
            newOriMessageInfo
          ];

      try {
        await updateDoc(sessionDocRef, {
          messages: arrayUnion(...messagesToPush),
          mode: mode,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, 'update', `sessions/${currentSessionId}`);
      }

      // Update local state for internal calls
      if (isInternal) {
        const oriMsg: Message = {
          id: Date.now().toString(),
          role: 'ori',
          content: finalText,
          timestamp: new Date(),
          quickReplies,
          uiTrigger,
          mythText,
          isHistorical: false
        };
        setMessages(prev => [...prev, oriMsg]);
      }

      // 5. Periodic summarization every 5 messages
      const finalMsgCount = sessionData.messages ? sessionData.messages.length + messagesToPush.length : messagesToPush.length;
      if (finalMsgCount > 0 && finalMsgCount % 5 === 0) {
         try {
            const needsFullProfile = !userData.profileTraits || userData.profileTraits.length === 0;
            
            const sumPrompt = needsFullProfile
              ? `Analyse cette conversation et génère un objet JSON structuré.
                 1. \"summary\": 2 phrases synthétiques résumant la situation actuelle de l'élève.
                 2. \"profile\": un objet contenant { name, class, track, emotionalState, swipeProfile, profileTraits (array de strings), profileInsight (string) }.
                 
                 Contexte:
                 ${historyContext}
                 Eleve: ${text}
                 ORI: ${finalText}
                 
                 Réponds uniquement avec le JSON brut.`
              : `Génère OBLIGATOIREMENT 2 phrases synthétiques résumant le profil et les intérêts de l'élève d'après ce fil de discussion, pour s'en souvenir plus tard. Renvoie uniquement le texte brut sans aucune introduction : \n\n${historyContext}\nEleve: ${text}\nORI: ${finalText}`;

            const aiInstance = getGemini();
            const sumResp = await aiInstance.models.generateContent({
              model: GEMINI_MODEL,
              contents: sumPrompt,
            });
            const rawOutput = sumResp.text || "";

            if (rawOutput) {
               if (needsFullProfile) {
                  try {
                     const cleanJson = rawOutput.replace(/```json|```/g, '').trim();
                     const json = JSON.parse(cleanJson);
                     
                     if (json.summary) {
                        await updateDoc(sessionDocRef, { 
                          summary: json.summary.trim(),
                          updatedAt: serverTimestamp()
                        });
                        await updateDoc(doc(db, "users", user.uid), { 
                          lastSessionSummary: json.summary.trim(),
                          updatedAt: serverTimestamp()
                        });
                     }
                     
                     if (json.profile) {
                        const profile = json.profile;
                        const allowedProfileFields: Record<string, any> = {};
                        if (profile.name) allowedProfileFields.name = profile.name;
                        if (profile.class) allowedProfileFields.class = profile.class;
                        if (profile.track) allowedProfileFields.track = profile.track;
                        if (profile.emotionalState) allowedProfileFields.emotionalState = profile.emotionalState;
                        if (profile.swipeProfile) allowedProfileFields.swipeProfile = profile.swipeProfile;
                        if (profile.profileTraits) allowedProfileFields.profileTraits = profile.profileTraits;
                        if (profile.profileInsight) allowedProfileFields.profileInsight = profile.profileInsight;
                        
                        await updateDoc(doc(db, "users", user.uid), {
                           ...allowedProfileFields,
                           updatedAt: serverTimestamp()
                        });
                        setUserData((prev: any) => ({ ...prev, ...allowedProfileFields }));
                     }
                  } catch (e) { 
                     console.error("Profile extraction/parsing failed", e); 
                  }
               } else {
                  const sumText = rawOutput.trim();
                  await updateDoc(sessionDocRef, { 
                    summary: sumText,
                    updatedAt: serverTimestamp()
                  });
                  await updateDoc(doc(db, "users", user.uid), { 
                    lastSessionSummary: sumText,
                    updatedAt: serverTimestamp()
                  });
               }
            }
         } catch(e) {
            console.error("Periodic background task failed", e);
         }
      }

      return { text: finalText, quickReplies, uiTrigger, mythText, timestamp: isoTimestamp };

    } catch (error) {
      console.error("AI Error:", error);
      return { 
        text: "Oups, j'ai un petit problème de connexion. Dis-m'en un peu plus sur ce que tu aimes faire !", 
        quickReplies: ["J'aime les sciences", "Je suis plutôt créatif", "J'aime aider les autres"],
        uiTrigger: null,
        mythText: undefined
      };
    }
  };

  const fetchRAGContext = async (message: string): Promise<string> => {
    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          thread_id: (sessionId || sessionIdRef.current) || 'default'
        })
      });
      if (!response.ok) return '';
      const data = await response.json();
      const raw = data.result || '';
      // Clean separator characters and token metadata
      const cleaned = raw
        .replace(/\u241f/g, '')
        .replace(/\{"input_tokens_count":.*\}$/, '')
        .trim();
      console.log('[RAG]', cleaned ? cleaned.slice(0, 200) : 'empty');
      return cleaned;
    } catch {
      return '';
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isTyping) return;

    if (text === "Explorons ensemble 🧭") {
      return handleModeChange('exploration', text);
    } else if (text === "J'ai une idée 💡") {
      return handleModeChange('idee', text);
    } else if (text === "J'ai une question précise ❓") {
      return handleModeChange('question', text);
    }

    // Detect emotional state locally via background task
    updateEmotionalState(text);

    // Client-side extraction from user message
    const clientUpdates: any = {};
    
    // Extract class
    if (/terminale/i.test(text)) clientUpdates.class = 'Terminale';
    else if (/première année|1ère année|1ere année|bts\s|but\s|licence|master/i.test(text)) 
      clientUpdates.class = text.match(/première année|1ère année|BTS|BUT|Licence|Master/i)?.[0] || '';
    
    // Extract track  
    if (/générale/i.test(text)) clientUpdates.track = 'Générale';
    else if (/technologique/i.test(text)) clientUpdates.track = 'Technologique';
    else if (/professionnelle/i.test(text)) clientUpdates.track = 'Professionnelle';
    
    // Extract name: if previous ORI message asked for name 
    // and this message is short (< 25 chars) with no punctuation
    const lastOriMsg = messages.filter(m => m.role === 'ori').slice(-1)[0];
    if (lastOriMsg?.content.includes("appelles") && text.trim().length < 25 && !text.includes('?')) {
      const namePart = text.split(/\s+et\s+|\s+j[e']/i)[0].replace(/je m'appelle\s+/i, '').trim();
      if (namePart.length > 1) clientUpdates.name = namePart;
    }
    
    if (Object.keys(clientUpdates).length > 0 && user) {
      setUserData((prev: any) => ({ ...prev, ...clientUpdates }));
      try { await updateDoc(doc(db, "users", user.uid), clientUpdates); } catch(e) {}
    }

    // Filter quick replies from last ORI bubble
    const updatedMessages = messages.map(msg => 
      messages.length > 0 && msg.id === messages[messages.length - 1].id && msg.role === 'ori'
        ? { ...msg, quickReplies: [] }
        : msg
    );

    // Update UI immediately for User text
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
      isHistorical: false
    };
    setMessages([...updatedMessages, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    if (user && sessionId) {
      // Fetch response with merged context
      const result = await callOriAI(text, false, { ...userData, ...clientUpdates });
      
      const oriMsg: Message = {
        id: result.timestamp || (Date.now() + 1).toString(),
        role: 'ori',
        content: result.text,
        timestamp: result.timestamp ? new Date(result.timestamp) : new Date(),
        quickReplies: result.quickReplies,
        uiTrigger: result.uiTrigger,
        mythText: result.mythText,
        isHistorical: false
      };
      
      setIsTyping(false);
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'ori') {
          updated[updated.length - 1] = { ...updated[updated.length - 1], quickReplies: undefined };
        }
        return [...updated, oriMsg];
      });
    } else {
      // Guest Fallback
      setTimeout(() => {
        setIsTyping(false);
        const oriMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'ori',
          content: "Il faut te connecter pour que je gère ta session de profilage personnalisée. Clique sur 'Se déconnecter' en haut à droite, puis reviens !",
          timestamp: new Date()
        };
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'ori') {
            updated[updated.length - 1] = { ...updated[updated.length - 1], quickReplies: undefined };
          }
          return [...updated, oriMsg];
        });
      }, 1000);
    }
  };

  const handleModeChange = async (newMode: string, userText?: string) => {
    setMode(newMode);
    
    // Inject the startup message into the chat UI seamlessly.
    let starterText = "";
    let quickReplies: string[] = [];

    if (newMode === 'exploration') {
       starterText = "Super ! On commence avec une page blanche — c'est souvent le meilleur point de départ. Comment tu t'appelles, et tu es en quelle classe ?";
    } else if (newMode === 'idee') {
       starterText = "Super ! Avant de répondre, 5 minutes pour mieux te connaître et mes réponses seront 10× plus pertinentes. C'est parti ?";
       quickReplies = ["Oui, allons-y ! ✓", "Je veux juste une réponse rapide →"];
    } else if (newMode === 'question') {
       starterText = "Vas-y, pose ta question ! Je suis là pour les formations, les écoles, les concours, Parcoursup...";
    }

    const startMsg: Message = {
      id: Date.now().toString(),
      role: 'ori',
      content: starterText,
      timestamp: new Date(),
      quickReplies,
      isHistorical: false
    };

    if (userText) {
      // Append case (when user clicks a mode button in the chat)
      const userMsg: Message = {
        id: (Date.now() - 1).toString(),
        role: 'user',
        content: userText.trim(),
        timestamp: new Date()
      };

      // Filter quick replies from last ORI bubble
      const updatedMessages = messages.map(msg => 
        msg.id === messages[messages.length - 1].id && msg.role === 'ori'
          ? { ...msg, quickReplies: [] }
          : msg
      );

      setMessages([...updatedMessages, userMsg, startMsg]);
    } else {
      // Replace/Initial case
      setMessages([startMsg]);
    }

    if (user && sessionId) {
      try {
         const sessionRef = doc(db, "sessions", sessionId);
         const sessionDoc = await getDoc(sessionRef);

         if (userText) {
           // Case 1: userText exists (Append)
           if (sessionDoc.exists()) {
             // Get current messages from local state first
             const currentMsgs = messages.map(m => ({
               role: m.role,
               content: m.content,
               timestamp: m.timestamp instanceof Date 
                 ? m.timestamp.toISOString() 
                 : m.timestamp,
               uiTrigger: m.uiTrigger || null,
               quickReplies: m.quickReplies || []
             }));

             await updateDoc(sessionRef, {
                mode: newMode,
                messages: [
                  ...currentMsgs,
                  { 
                    role: 'user', 
                    content: userText, 
                    timestamp: new Date().toISOString(), 
                    uiTrigger: null, 
                    quickReplies: [] 
                  },
                  { 
                    role: 'ori', 
                    content: starterText, 
                    timestamp: new Date().toISOString(), 
                    uiTrigger: null, 
                    quickReplies: quickReplies 
                  }
                ],
                updatedAt: serverTimestamp()
             });
           } else {
             await setDoc(sessionRef, {
                userId: user.uid,
                mode: newMode,
                summary: '',
                messages: [
                  { role: 'user', content: userText, timestamp: new Date().toISOString(), uiTrigger: null, quickReplies: [] },
                  { role: 'ori', content: starterText, timestamp: new Date().toISOString(), uiTrigger: null, quickReplies: quickReplies }
                ],
                createdAt: serverTimestamp()
             });
           }
         } else {
           // Case 2: Replacing/Resetting (no userText)
           if (sessionDoc.exists()) {
               await updateDoc(sessionRef, {
                  mode: newMode,
                  messages: [{ role: 'ori', content: starterText, timestamp: new Date().toISOString(), uiTrigger: null, quickReplies: quickReplies }],
                  updatedAt: serverTimestamp()
               });
           } else {
               await setDoc(sessionRef, {
                  userId: user.uid,
                  mode: newMode,
                  summary: '',
                  messages: [{ role: 'ori', content: starterText, timestamp: new Date().toISOString(), uiTrigger: null, quickReplies: quickReplies }],
                  createdAt: serverTimestamp()
               });
           }
         }
      } catch (e) {
         console.error("Failed to sync mode switch to session DB", e);
      }
    }
  };

  const handleNewConversation = async () => {
    console.log('[NEW CONV] Starting, current sessionId:', sessionId);
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    sessionIdRef.current = newSessionId;
    console.log('[NEW CONV] New sessionId set:', newSessionId);
    setMode('exploration');
    
    const initialContent = "Salut ! Je suis ORI, ton conseiller d'orientation personnel. Par où tu veux commencer ?";
    const initialQuickReplies = ["Explorons ensemble 🧭", "J'ai une idée 💡", "J'ai une question précise ❓"];
    
    setMessages([
      {
        id: '1',
        role: 'ori',
        content: initialContent,
        timestamp: new Date(),
        quickReplies: initialQuickReplies,
        isHistorical: false,
        uiTrigger: null,
        componentData: null
      }
    ]);
    setIsSidebarOpen(false);

    // Create session in Firestore with initial message so indices match RAM state
    if (user) {
      try {
        await setDoc(doc(db, 'sessions', newSessionId), {
          userId: user.uid,
          mode: 'exploration',
          messages: [
            {
              role: 'ori',
              content: initialContent,
              timestamp: new Date().toISOString(),
              quickReplies: initialQuickReplies,
              uiTrigger: null,
              componentData: null
            }
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          summary: null
        });
      } catch (e) {
        handleFirestoreError(e, 'create', `sessions/${newSessionId}`);
      }
    }
    console.log('[NEW CONV] Done');
  };

  const handleLoadSession = async (sId: string) => {
    if (sId === sessionId) {
      setIsSidebarOpen(false);
      return;
    }

    setMessages([]); // Clear previous session immediately

    try {
      const sessionDoc = await getDoc(doc(db, "sessions", sId));
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        setSessionId(sId);
        sessionIdRef.current = sId;
        setMode(data.mode || 'exploration');
        
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m: any, idx: number) => ({
            id: `${sId}_${idx}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            mythText: m.mythText,
            uiTrigger: m.uiTrigger || null,
            quickReplies: m.quickReplies || [],
            isHistorical: true,
            componentData: m.componentData || null
          })));
        }
      }
    } catch (e) {
      console.error("Failed to load session", e);
    }
    setIsSidebarOpen(false);
  };

  // Handle new conversation event from global sidebar
  useEffect(() => {
    const handler = () => {
      handleNewConversation();
    };
    window.addEventListener('new-conversation', handler);
    return () => window.removeEventListener('new-conversation', handler);
  }, [handleNewConversation]);

  // Handle prefilled text from dashboard
  useEffect(() => {
    if (location.state?.prefillText && sessionId && user) {
      const text = location.state.prefillText;
      // Clear state so we don't trigger again on reload
      window.history.replaceState({}, document.title);
      // Wait a tiny bit for the UI to settle then send
      setTimeout(() => {
        handleSend(text);
      }, 100);
    }
  }, [location.state?.prefillText, sessionId, user]);

  console.log('[Chat] messages count:', messages.length, 'sessionId:', sessionId);

  return (
    <div className="flex-1 flex h-[calc(100vh-64px)] md:h-screen overflow-hidden font-lexend bg-white">
      {/* Search/History Column (Inside main content area) */}
      <aside className={cn(
        "bg-[#f9f9f9] border-r border-gray-100 flex flex-col shrink-0 hidden lg:flex transition-all duration-200 ease-in-out relative",
        isHistoryCollapsed ? "w-0 overflow-hidden" : "w-80"
      )}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Historique</h2>
          <button 
            onClick={() => setIsHistoryCollapsed(true)}
            className="p-1 rounded-md hover:bg-gray-200 text-gray-400 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
          {pastSessions.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-xs italic">Aucune session passée</div>
          ) : (
            pastSessions.map((session) => {
              const firstUserMsgRaw = session.messages?.find((m: any) => m.role === 'user')?.content || 'Nouvelle discussion';
              const firstUserMsg = firstUserMsgRaw.length > 40 ? firstUserMsgRaw.substring(0, 40) + '...' : firstUserMsgRaw;
              const date = session.createdAt?.toDate ? session.createdAt.toDate() : new Date();
              const isActive = session.id === sessionId;

              return (
                <button
                  key={session.id}
                  onClick={() => handleLoadSession(session.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 border border-transparent",
                    isActive ? "bg-white shadow-sm border-gray-100" : "hover:bg-gray-200/50"
                  )}
                >
                  <span className={cn(
                    "material-symbols-outlined text-lg mt-0.5",
                    isActive ? "text-[#E8002D]" : "text-gray-400"
                  )} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "" }}>
                    chat_bubble
                  </span>
                  <div className="flex-1 overflow-hidden">
                    <p className={cn(
                      "text-[13px] font-bold truncate",
                      isActive ? "text-gray-900" : "text-gray-600"
                    )}>
                      {firstUserMsg}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
                      {date.toLocaleDateString([], { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="p-4 border-t border-gray-100 bg-[#f9f9f9]">
          <button 
            onClick={() => { handleNewConversation(); }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors font-bold text-xs"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {!isHistoryCollapsed && "Nouvelle discussion"}
          </button>
        </div>
      </aside>

      {/* Chat Column */}
      <main className="flex-1 flex flex-col bg-white relative overflow-hidden h-full">
        {/* Toggle Button when history is collapsed */}
        {isHistoryCollapsed && (
          <button 
            onClick={() => setIsHistoryCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-white border border-gray-200 border-l-0 p-1.5 pr-2 rounded-r-xl shadow-sm hover:bg-gray-50 text-gray-400 transition-all flex items-center justify-center mb-10"
            title="Afficher l'historique"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        )}

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-50 z-20">
          <div className="h-full bg-[#E8002D] transition-all duration-500 ease-in-out" style={{ width: '33%' }}></div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:px-[10%] xl:px-[15%] flex flex-col gap-8 pb-10">
          {/* Welcome/Memory Banner */}
          {showReturnBanner && (
            <div className="bg-[#ffe800]/20 border border-[#edc200]/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#ffe800] rounded-full flex items-center justify-center text-xl shrink-0">💡</div>
                <div>
                   <h3 className="text-sm font-bold text-gray-900 leading-none mb-1">Mémoire activée</h3>
                   <p className="text-xs text-gray-600 font-medium">On parlait de <strong>{lastSessionSummaryState}</strong>. On continue ?</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleReturnChoice(false)} className="px-4 py-2 rounded-xl text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:bg-black/5">Recommencer</button>
                <button onClick={() => handleReturnChoice(true)} className="px-5 py-2 rounded-xl text-[10px] font-bold bg-[#E8002D] text-white shadow-md uppercase tracking-widest hover:opacity-90">Oui, continuons !</button>
              </div>
            </div>
          )}

          <div className="flex justify-center my-2">
            <span className="bg-gray-50 text-gray-400 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border border-gray-100">Aujourd'hui</span>
          </div>

          {messages.map((m, idx) => (
            <div key={m.id} className={cn(
              "flex gap-4 max-w-[95%]",
              m.role === 'user' ? "self-end flex-row-reverse" : "self-start"
            )}>
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border",
                m.role === 'ori' ? "bg-[#E8002D] border-red-100 text-white font-bold" : "bg-[#325da4] border-blue-100"
              )}>
                {m.role === 'ori' ? 'O' : <span className="material-symbols-outlined text-white text-xl">person</span>}
              </div>

              <div className={cn(
                "flex flex-col gap-2 mt-1",
                m.role === 'user' ? "items-end" : "items-start"
              )}>
                {m.role === 'user' && <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">Vous</span>}
                
                {m.mythText && <MythBanner text={m.mythText} />}

                <div className={cn(
                  "p-4 shadow-sm text-sm leading-relaxed",
                  m.role === 'ori' 
                    ? "bg-white border border-gray-100 rounded-2xl rounded-tl-sm text-gray-800" 
                    : "bg-[#325da4] text-white rounded-2xl rounded-tr-sm"
                )}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>

                { (console.log('[Chat] rendering historical component', { uiTrigger: m.uiTrigger, componentData: m.componentData, messageId: m.id }), null) }
                {m.uiTrigger?.startsWith('DAY_IN_LIFE') && <div className="mt-4"><DayInLife key={m.id} formationId={m.uiTrigger.split(':')[1]} onComplete={async () => {
                    const formationId = m.uiTrigger?.split(':')[1];
                    if (formationId) {
                      const videoExists = VIDEO_DB.vismavie.some(v => v.formationIds.includes(formationId));
                      if (videoExists) {
                        await callOriAI(
                          "On a même une vidéo de 'Vis ma vie d'étudiant' pour cette formation ! Ça t'aidera à te projeter encore mieux.",
                          true,
                          null,
                          `VIDEO:vismavie:${formationId}`
                        );
                      }
                    }
                  }} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger?.startsWith('COMPARE') && <div className="mt-4"><ComparisonTable key={m.id} formationIds={m.uiTrigger.split(':')[1].split(',')} userId={user?.uid || ''} onComplete={async () => {}} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger?.startsWith('SIMULATOR') && <div className="mt-4"><AdmissionSimulator key={m.id} formationId={m.uiTrigger.split(':')[1]} onComplete={async () => {}} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger === 'MAP' && <div className="mt-3 mb-6 w-full"><SchoolMap key={m.id} userId={user?.uid || ''} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger?.startsWith('LINKEDIN') && <div className="mt-4 w-full"><LinkedInPathway key={m.id} formationId={m.uiTrigger.includes(':') ? m.uiTrigger.split(':')[1] : undefined} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger?.startsWith('FLASH_FORWARD') && <div className="mt-4"><FlashForward key={m.id} formationIds={m.uiTrigger.split(':')[1].split(',')} onComplete={async () => {}} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} /></div>}
                  {m.uiTrigger === 'PLAN_ACTION' && <div className="mt-4"><PlanActionHandler key={m.id} userId={user?.uid || ''} sessionId={sessionId} messageId={idx.toString()} initialData={m.componentData} onComplete={() => {}} /></div>}
                  {m.uiTrigger === 'VOEU_METRE' && (
                    <div className="mt-4">
                      <VoeuMetre 
                        key={m.id}
                        userId={user?.uid || ''}
                        sessionId={sessionId}
                        messageId={idx}
                        initialData={m.componentData}
                        onComplete={() => {}}
                      />
                    </div>
                  )}
                  {m.uiTrigger === 'BUDGET_COMPARATOR' && (
                    <div className="mt-4">
                      <BudgetComparator 
                        key={m.id}
                        sessionId={sessionId}
                        messageId={idx}
                        initialData={m.componentData}
                        onComplete={() => {}}
                      />
                    </div>
                  )}
                  {m.uiTrigger?.startsWith('REALITY_TEST:') && (
                    <div className="mt-4">
                      <RealityTest 
                        key={m.id}
                        formationId={m.uiTrigger.split(':')[1]}
                        formationName={m.uiTrigger.split(':').slice(2).join(':')}
                        sessionId={sessionId}
                        messageId={idx}
                        initialData={m.componentData}
                        onComplete={() => {}}
                      />
                    </div>
                  )}
                  {m.uiTrigger?.startsWith('CAMPUS_VIBE:') && (
                    <div className="mt-4">
                      {(() => {
                        const parts = m.uiTrigger.split(':');
                        const formationId = parts[1];
                        const formationName = parts[2];
                        const etablissementName = parts[3] || undefined;
                        return (
                          <CampusVibe 
                            key={m.id}
                            formationId={formationId}
                            formationName={formationName}
                            etablissementName={etablissementName}
                            sessionId={sessionId}
                            messageId={idx}
                            initialData={m.componentData}
                            onComplete={() => {}}
                          />
                        );
                      })()}
                    </div>
                  )}
                  {m.uiTrigger === 'SWIPE' && <div className="mt-4 w-full"><SwipeCards key={m.id} initialData={m.componentData} onComplete={async (naturalProfile, rawProfile) => {
                    if (user) {
                      await updateDoc(doc(db, 'users', user.uid), { 
                        swipeProfile: rawProfile,
                        updatedAt: serverTimestamp()
                      });
                    }
                    const currentId = sessionId || sessionIdRef.current;
                    if (currentId) {
                      const sessionRef = doc(db, 'sessions', currentId);
                      const sessionSnap = await getDoc(sessionRef);
                      if (sessionSnap.exists()) {
                        const msgs = [...sessionSnap.data().messages || []];
                        if (msgs[idx]) {
                          msgs[idx].componentData = { isFinished: true };
                          await updateDoc(sessionRef, { 
                            messages: msgs,
                            updatedAt: serverTimestamp()
                          });
                        }
                      }
                    }
                    await callOriAI(`Jeu Swipe terminé. Profil détecté : ${naturalProfile}`, true);
                  }} /></div>}
                  {m.uiTrigger === 'WORDCLOUD' && <div className="mt-4"><WordCloudGame key={m.id} initialData={m.componentData} onComplete={async (liked, disliked, desired, naturalText) => {
                    if (user) {
                      await updateDoc(doc(db, 'users', user.uid), { 
                        wordCloudResults: { liked, disliked, desired },
                        updatedAt: serverTimestamp()
                      });
                    }
                    const currentId = sessionId || sessionIdRef.current;
                    if (currentId) {
                      const sessionRef = doc(db, 'sessions', currentId);
                      const sessionSnap = await getDoc(sessionRef);
                      if (sessionSnap.exists()) {
                        const msgs = [...sessionSnap.data().messages || []];
                        if (msgs[idx]) {
                          msgs[idx].componentData = { isFinished: true };
                          await updateDoc(sessionRef, { 
                            messages: msgs,
                            updatedAt: serverTimestamp()
                          });
                        }
                      }
                    }
                    await callOriAI(`Jeu Nuage de mots terminé. Résumé : ${naturalText}`, true);
                  }} /></div>}
                  {m.uiTrigger === 'ELIMINATION' && <div className="mt-4"><EliminationGame key={m.id} initialData={m.componentData} onComplete={async (_eliminations: string[], eliminationProfile: string) => {
                    if (user) {
                      await updateDoc(doc(db, 'users', user.uid), { 
                        eliminationProfile,
                        updatedAt: serverTimestamp()
                      });
                    }
                    const currentId = sessionId || sessionIdRef.current;
                    if (currentId) {
                      const sessionRef = doc(db, 'sessions', currentId);
                      const sessionSnap = await getDoc(sessionRef);
                      if (sessionSnap.exists()) {
                        const msgs = [...sessionSnap.data().messages || []];
                        if (msgs[idx]) {
                          msgs[idx].componentData = { isFinished: true };
                          await updateDoc(sessionRef, { 
                            messages: msgs,
                            updatedAt: serverTimestamp()
                          });
                        }
                      }
                    }
                    await callOriAI(`Jeu terminé. Profil par exclusion: ${eliminationProfile}`, true);
                  }} /></div>}
                  {m.uiTrigger?.startsWith('VIDEO:') && (() => {
                    const parts = m.uiTrigger.split(':');
                    const type = parts[1] as 'procedural' | 'vismavie';
                    const id = parts[2];
                    let video = null;
                    
                    if (type === 'procedural') {
                      video = VIDEO_DB.procedural.find(v => v.keywords.includes(id));
                    } else if (type === 'vismavie') {
                      video = VIDEO_DB.vismavie.find(v => v.formationIds.includes(id));
                    }
                    
                    if (!video) return null;
                    return <div className="mt-4"><VideoCard videoId={video.id} title={video.title} type={type} /></div>;
                  })()}

                {/* LIVE quickReplies — last message only, unchanged */}
                {m.quickReplies && m.quickReplies.length > 0 
                  && idx === messages.length - 1 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.quickReplies.map((reply, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(reply)}
                        className="bg-[#ffe800] text-gray-900 px-4 py-2 rounded-full text-xs font-bold shadow-sm hover:brightness-95 transition-all active:scale-95 border border-[#edc200]/50 uppercase tracking-wider"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                {/* HISTORICAL quickReplies — all non-last ORI messages */}
                {m.quickReplies && m.quickReplies.length > 0 
                  && m.role === 'ori'
                  && idx < messages.length - 1 && (() => {
                    const nextMsg = messages[idx + 1];
                    const chosenReply = nextMsg?.role === 'user'
                      ? m.quickReplies.find((r: string) => 
                          r.trim().toLowerCase() === 
                          nextMsg.content.trim().toLowerCase())
                      : null;
                    return (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {m.quickReplies.map((reply: string, i: number) => (
                          <button
                            key={i}
                            disabled
                            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border cursor-default select-none shadow-sm ${
                                reply === chosenReply
                                ? 'bg-gray-100 text-gray-900 font-black border-gray-300'
                                : 'bg-gray-100 text-gray-400 border-gray-200'
                              }`}
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-4 max-w-[85%] self-start animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                 <span className="text-gray-300 font-bold">O</span>
              </div>
              <div className="bg-gray-50 border border-gray-100 p-4 rounded-2xl rounded-tl-sm w-32 h-14" />
            </div>
          )}

        <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="flex-shrink-0 p-4 bg-white border-t border-gray-100 z-30 pb-safe md:pb-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-2">
            <div className="relative flex items-end gap-2">
              <button className="w-12 h-12 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-50 transition-colors shrink-0 mb-1">
                <span className="material-symbols-outlined">attach_file</span>
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(inputMessage);
                    }
                  }}
                  className="w-full bg-white border-2 border-gray-100 focus:border-[#325da4] focus:ring-0 rounded-2xl py-3.5 pl-5 pr-14 text-sm text-gray-800 resize-none max-h-32 min-h-[56px] custom-scrollbar transition-all shadow-sm"
                  placeholder="Posez votre question à ORI..."
                  rows={1}
                />
                <button 
                  onClick={() => handleSend(inputMessage)}
                  disabled={!inputMessage.trim() || isTyping}
                  className="absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center rounded-xl bg-[#E8002D] text-white hover:opacity-90 transition-all shadow-md active:scale-95 disabled:bg-gray-300"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
              Propulsé par Google Gemini • l'Étudiant
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
