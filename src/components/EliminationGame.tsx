import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

const ROUND_1 = ["Mathématiques", "Rédiger", "Terrain", "Seul(e)", "Chiffres", "Parler en public", "Répétition", "Décisions", "Technique", "Réunions"];

const getWordsForRound = (round: number, eliminations: string[]) => {
  if (round === 1) return ROUND_1;
  if (round === 2) {
    const r1 = eliminations[0];
    if (["Mathématiques", "Chiffres"].includes(r1)) {
      return ["Statistiques", "Algorithmes", "Comptabilité", "Physique", "Formules", "Abstractions", "Modélisation", "Calcul", "Finances", "Quantitatif"];
    }
    if (["Terrain", "Technique"].includes(r1)) {
      return ["Chantier", "Atelier", "Maintenance", "Fabrication", "Installation", "Mécanique", "Électricité", "Réparation", "Travaux", "Manuel"];
    }
    if (["Seul(e)", "Réunions", "Parler en public"].includes(r1)) {
      return ["Travail d'équipe", "Management", "Coordination", "Animation", "Collaboration", "Reporting", "Hiérarchie", "Briefing", "Réseaux", "Clientèle"];
    }
    return ["Bureaucratie", "Contraintes", "Procédures", "Hiérarchie", "Réglementation", "Conformité", "Contrôle", "Vérification", "Validation", "Reporting"];
  }
  if (round === 3) {
    return ["Routine", "Horaires fixes", "Sédentarité", "Pression", "Stress", "Compétition", "Déplacements", "Imprévus", "Responsabilités", "Urgence"];
  }
  if (round === 4) {
    return ["Vente", "Négociation", "Prospection", "Marketing", "Communication", "Littérature", "Histoire", "Langues", "Théorie", "Recherche"];
  }
  return ["Droit", "Lois", "Contrats", "Normes", "Administration", "Sécurité", "Santé", "Médical", "Soins", "Patients"]; // Round 5
};

const inferPositiveTraits = (eliminations: string[]) => {
  let traits = "quelqu'un de polyvalent et adaptable";
  
  const allElims = eliminations.join(" ");
  if (allElims.includes("Mathématiques") || allElims.includes("Chiffres")) {
    traits = "quelqu'un qui préfère les lettres, la créativité ou les sciences humaines";
  } else if (allElims.includes("Terrain") || allElims.includes("Technique")) {
    traits = "quelqu'un fait pour la stratégie, le bureau ou les fonctions support";
  } else if (allElims.includes("Seul(e)")) {
    traits = "un profil qui a besoin d'interaction sociale et de travail d'équipe";
  } else if (allElims.includes("Routine")) {
    traits = "un esprit dynamique qui cherche le changement et l'innovation constante";
  }
  
  return traits;
};

interface EliminationGameProps {
  onComplete: (eliminated: string[], naturalLanguageProfile: string) => void;
  initialData?: any;
}

export function EliminationGame({ onComplete, initialData }: EliminationGameProps) {
  const [round, setRound] = useState(1);
  const [eliminations, setEliminations] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(!!initialData?.isFinished);

  const currentWords = getWordsForRound(round, eliminations);

  const toggleWord = (word: string) => {
    setSelectedWords(prev => 
      prev.includes(word) 
        ? prev.filter(w => w !== word) 
        : [...prev, word]
    );
  };

  const handleConfirm = () => {
    if (selectedWords.length === 0) return;
    
    // For round 2 logic, we need some representative elimination. 
    // If it's round 1, we determine the "most selected category" representative.
    let addedElims = [...selectedWords];
    
    // Custom logic for Round 1 to pick the most representative category for Round 2 branching
    if (round === 1) {
      const counts = {
        MATH: selectedWords.filter(w => ["Mathématiques", "Chiffres"].includes(w)).length,
        TECH: selectedWords.filter(w => ["Terrain", "Technique"].includes(w)).length,
        SOC: selectedWords.filter(w => ["Seul(e)", "Réunions", "Parler en public"].includes(w)).length
      };

      let maxCat = 'OTHER';
      let maxVal = 0;
      if (counts.MATH > maxVal) { maxVal = counts.MATH; maxCat = 'MATH'; }
      if (counts.TECH > maxVal) { maxVal = counts.TECH; maxCat = 'TECH'; }
      if (counts.SOC > maxVal) { maxVal = counts.SOC; maxCat = 'SOC'; }

      // We re-order eliminations so that the most representative word for the branch is at the front
      // or at least compatible with getWordsForRound expectation of index 0
      const representativeWord = 
        maxCat === 'MATH' ? "Mathématiques" :
        maxCat === 'TECH' ? "Terrain" :
        maxCat === 'SOC' ? "Seul(e)" : "Rédiger";
      
      addedElims = [representativeWord, ...selectedWords.filter(w => w !== representativeWord)];
    }

    const newEliminations = [...eliminations, ...addedElims];
    setEliminations(newEliminations);
    setSelectedWords([]);

    if (round < 5) {
      setRound(round + 1);
    } else {
      setIsFinished(true);
      const positiveInference = inferPositiveTraits(newEliminations);
      const naturalText = `Tu évites : ${newEliminations.join(", ")}. Donc tu corresponds plutôt à ${positiveInference}.`;
      onComplete(newEliminations, naturalText);
    }
  };

  if (isFinished) {
    return (
      <div className="w-full max-w-[420px] mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden p-5 flex flex-col items-center text-center mt-4 mb-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
        <h3 className="font-bold text-[20px] text-gray-900 mb-2">Profil détecté</h3>
        <p className="text-[14px] text-gray-700 leading-relaxed mb-1">
          Tes éliminations ont été enregistrées. ORI va s'en servir pour écarter ce qui ne te correspond pas.
        </p>
      </div>
    );
  }

  const getButtonText = () => {
    const count = selectedWords.length;
    if (count === 0) return "Sélectionne au moins un mot";
    if (count === 1) return "Je n'aime pas ce mot →";
    return `Je n'aime pas ces ${count} mots →`;
  };

  return (
    <div className="w-full mx-auto bg-white rounded-xl shadow-sm border border-l-4 border-l-[#E8002D] border-gray-200 overflow-hidden mt-4 mb-4">
      <div className="p-5 border-b border-gray-200 bg-white">
        <h3 className="font-bold text-gray-900 text-[20px] mb-1">Round {round}/5 — Clique sur les mots que tu n'aimes PAS (un ou plusieurs)</h3>
        <p className="text-[14px] text-gray-500">Ils seront écartés de tes propositions.</p>
      </div>

      <div className="p-6 bg-gray-50/50">
        <div className="flex flex-wrap gap-3 justify-center">
          {currentWords.map((word, idx) => (
            <button
              key={idx}
              onClick={() => toggleWord(word)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                selectedWords.includes(word)
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-[#E8002D]'
              }`}
            >
              {word}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 bg-white border-t border-gray-200 flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={selectedWords.length === 0}
          className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            selectedWords.length === 0 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-[#E8002D] text-white hover:opacity-90'
          }`}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  );
}
