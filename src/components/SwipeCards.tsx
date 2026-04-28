import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Heart, X } from 'lucide-react';

const CARDS = [
  { title:"La Pédagogie", category:"Apprentissage", left:"Projets concrets, groupes, stages — apprendre en faisant", right:"Théorie en amphi, lectures, écouter des experts", leftValue:"pratique", rightValue:"theorique" },
  { title:"Le Timing", category:"Durée des études", left:"Entrer vite dans la vie active — Bac+2 ou Bac+3 max", right:"Faire de longues études pour viser un haut niveau — Bac+5", leftValue:"bac2-3", rightValue:"bac5" },
  { title:"Le Cadre", category:"Environnement", left:"Petites classes, profs qui me suivent de près", right:"Liberté totale, gérer mon emploi du temps seul", leftValue:"encadre", rightValue:"autonome" },
  { title:"La Pression", category:"Évaluation", left:"Contrôle continu toute l'année — pas de stress final", right:"Tout donner sur de gros concours ou examens finaux", leftValue:"controle-continu", rightValue:"concours" },
  { title:"Le Spectre", category:"Spécialisation", left:"Toucher à plein de matières très différentes — généraliste", right:"Devenir expert absolu sur un seul sujet précis", leftValue:"generaliste", rightValue:"specialiste" },
  { title:"L'Action", category:"Quotidien", left:"Fabriquer, coder, créer quelque chose de mes mains ou outils", right:"Gérer des idées, des mots, des chiffres ou des stratégies", leftValue:"technique", rightValue:"gestion" },
  { title:"L'Environnement", category:"Lieu de travail", left:"Un métier où ça bouge — terrain, extérieur, déplacements", right:"Un métier sédentaire avec mon bureau et mes collègues", leftValue:"terrain", rightValue:"bureau" },
  { title:"Le Secteur", category:"Domaine", left:"Travailler pour l'État, une asso, ou aider directement les gens", right:"Travailler en entreprise privée, faire du business, évoluer", leftValue:"public-social", rightValue:"prive-business" },
  { title:"Le Financement", category:"Budget", left:"Études gratuites ou publiques — ou alternance rémunérée", right:"Prêt à payer une école privée si ça en vaut la peine", leftValue:"gratuit-alternance", rightValue:"prive-payant" },
  { title:"La Géographie", category:"Mobilité", left:"Rester étudier près de chez moi — pas envie de déménager", right:"Prêt à bouger loin, voire à partir à l'étranger", leftValue:"local", rightValue:"mobile" }
];

const TRANSLATIONS: Record<string, string> = {
  "pratique": "tu préfères apprendre en faisant",
  "theorique": "tu aimes t'appuyer sur la théorie",
  "bac2-3": "tu veux entrer vite dans la vie active",
  "bac5": "tu vises des études longues",
  "encadre": "tu as besoin d'un cadre défini",
  "autonome": "tu aimes travailler en autonomie",
  "controle-continu": "tu préfères le contrôle continu",
  "concours": "tu n'as pas peur des grands examens finaux",
  "generaliste": "tu veux rester pluridisciplinaire",
  "specialiste": "tu souhaites te spécialiser sur une seule expertise",
  "technique": "tu aimes concevoir avec tes mains ou des outils techniques",
  "gestion": "tu te vois davantage gérer des idées ou des stratégies",
  "terrain": "tu as besoin de bouger sur le terrain",
  "bureau": "le confort d'un espace sédentaire te convient",
  "public-social": "l'impact social direct t'anime",
  "prive-business": "l'univers de l'entreprise privée te stimule",
  "gratuit-alternance": "le financement de tes études est un critère fort",
  "prive-payant": "tu es prêt à investir si l'école est la bonne",
  "local": "tu souhaites rester à proximité de chez toi",
  "mobile": "tu es prêt à déménager ou aller loin"
};

interface SwipeCardsProps {
  onComplete: (naturalLanguageProfile: string, rawProfileString: string) => void;
  initialData?: any;
}

export function SwipeCards({ onComplete, initialData }: SwipeCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(!!initialData?.isFinished);
  const [direction, setDirection] = useState(1);

  const handleChoice = (val: string, dir: number) => {
    setDirection(dir);
    const newAnswers = [...answers, val];
    setAnswers(newAnswers);
    
    if (currentIndex < CARDS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
      const naturalText = newAnswers.map(ans => TRANSLATIONS[ans]).join(', ');
      const rawText = newAnswers.join(',');
      onComplete(naturalText, rawText);
    }
  };

  if (isFinished) {
    return (
      <div className="w-full max-w-[420px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-5 flex flex-col items-center text-center mt-4 mb-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
        <h3 className="font-bold text-[20px] text-gray-900 mb-2">Profil détecté</h3>
        <p className="text-[14px] text-gray-700 leading-relaxed mb-1">
          Tes choix ont été enregistrés et sauvegardés dans ton profil. ORI s'en sert maintenant pour tes recommandations.
        </p>
      </div>
    );
  }

  const card = CARDS[currentIndex];

  return (
    <div className="w-full max-w-[420px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-4 mb-4 flex flex-col">
      {/* Progress Box */}
      <div className="p-4 bg-gray-50 flex items-center justify-between shrink-0">
        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div 
            className="bg-[#E8002D] h-full transition-all duration-300" 
            style={{ width: `${((currentIndex + 1) / CARDS.length) * 100}%` }} 
          />
        </div>
        <span className="text-[12px] font-bold text-[#E8002D] ml-4 whitespace-nowrap">
          {currentIndex + 1} / {CARDS.length}
        </span>
      </div>

      {/* Card Carousel Frame */}
      <div className="h-[280px] relative overflow-hidden bg-white">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentIndex}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 30 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex flex-col"
          >
            {/* Top 60% */}
            <div className="h-[60%] flex flex-col items-center justify-center p-5 text-center border-b border-gray-200 shrink-0 bg-white">
              <h3 className="text-[20px] font-bold text-gray-900 mb-3">{card.title}</h3>
              <span className="px-3 py-1 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-widest font-medium rounded-full">
                {card.category}
              </span>
            </div>

            {/* Bottom 40% */}
            <div className="h-[40%] flex">
              <div className="w-1/2 mb-0 bg-[#E8F5E9] p-4 flex flex-col items-center text-center justify-center">
                <span className="text-xs font-bold text-green-700 mb-1">Gauche ♥</span>
                <span className="text-[11px] text-green-900 leading-snug">{card.left}</span>
              </div>
              <div className="w-1/2 mb-0 bg-[#FFEBEE] p-4 flex flex-col items-center text-center justify-center">
                <span className="text-xs font-bold text-red-700 mb-1">Droite ✕</span>
                <span className="text-[11px] text-red-900 leading-snug">{card.right}</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="p-5 flex justify-center gap-12 bg-white flex-shrink-0 z-10 w-full shadow-[0_-5px_15px_-5px_rgba(0,0,0,0.05)]">
        {/* Left Action -> Green Heart mapping to Left Card segment */}
        <button 
          onClick={() => handleChoice(card.leftValue, -1)}
          className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors shadow-sm"
        >
          <Heart className="w-5 h-5 fill-current" />
        </button>
        
        {/* Right Action -> Red X mapping to Right Card segment */}
        <button 
          onClick={() => handleChoice(card.rightValue, 1)}
          className="w-12 h-12 rounded-full bg-red-50 text-[#E8002D] flex items-center justify-center hover:bg-red-100 transition-colors shadow-sm"
        >
          <X className="w-6 h-6 stroke-[3]" />
        </button>
      </div>
    </div>
  );
}
