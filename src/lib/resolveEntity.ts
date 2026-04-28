import { GoogleGenAI, Type } from '@google/genai';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import { getGemini } from './gemini';

export interface ResolvedEntity {
  id: string;
  nom: string;
  type: string;
  description: string;
  duree: number;
  cout: number;
  alternance: boolean;
  debouches: string[];
  selectivite: number;
  salaireJunior: number;
  siteOfficiel?: string;
  source: 'firestore' | 'rag' | 'gemini';
  disclaimer?: string;
}

interface ClassifierOutput {
  type: 'formation' | 'etablissement' | 'metier' | 'certification' | 'autre';
  canonicalName: string;
  alternativeNames: string[];
  firestoreSearchTerms: string[];
}

const entityCache: Record<string, ResolvedEntity> = {};

export async function resolveEntity(queryStr: string): Promise<ResolvedEntity> {
  const normalizedQuery = queryStr.toLowerCase().trim();
  if (entityCache[normalizedQuery]) {
    return entityCache[normalizedQuery];
  }

  const gemini = getGemini();

  // STEP 1: Normalize and Classify
  const classificationPrompt = `Tu es un expert du système éducatif français. 
  L'utilisateur a mentionné : '${queryStr}'
  
  Identifie ce dont il parle et retourne UNIQUEMENT ce JSON:
  {
    "type": "formation"|"etablissement"|"metier"|"certification"|"autre",
    "canonicalName": "nom officiel complet en français",
    "alternativeNames": ["autres façons de l appeler"],
    "firestoreSearchTerms": ["terme1", "terme2"]
  }
  
  Exemples:
  - 'BUT MMI' → canonicalName: 'BUT Métiers du Multimédia et de l Internet'
  - 'psycho' → canonicalName: 'Licence Psychologie'
  - 'Sciences Po' → canonicalName: 'Institut d Études Politiques'
  - 'dev web' → canonicalName: 'Développeur Web', type: 'metier'
  
  JSON uniquement, sans markdown.`;

  let classification: ClassifierOutput;
  try {
    const result = await gemini.models.generateContent({
      model: "gemini-flash-latest",
      contents: classificationPrompt
    });
    const text = (result.text || "").replace(/```json|```/g, '').trim();
    classification = JSON.parse(text);
  } catch (err) {
    console.error("Classification error", err);
    classification = {
      type: 'formation',
      canonicalName: queryStr,
      alternativeNames: [],
      firestoreSearchTerms: [queryStr]
    };
  }

  // STEP 2: Search Firestore
  const collectionName = classification.type === 'etablissement' ? 'etablissements' : 'formations';
  for (const term of classification.firestoreSearchTerms) {
    const q = query(collection(db, collectionName), where("nom", ">=", term), where("nom", "<=", term + '\uf8ff'), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docData = snap.docs[0].data();
      const resolved: ResolvedEntity = {
        id: snap.docs[0].id,
        nom: docData.nom,
        type: classification.type,
        description: docData.description || '',
        duree: docData.duree || 3,
        cout: docData.cout || 0,
        alternance: docData.alternance || false,
        debouches: docData.debouches || [],
        selectivite: docData.selectivite || 3,
        salaireJunior: docData.salaireJunior || 2500,
        source: 'firestore' as const
      };
      entityCache[normalizedQuery] = resolved;
      return resolved;
    }
  }

  // STEP 3: RAG (Mocked as per user request to call "RAG ORI API")
  // In a real scenario, this would be an actual fetch. 
  // Let's simulate a call that misses for now.
  /*
  const ragResponse = await fetch(`https://api.example.com/rag?q=${encodeURIComponent(classification.canonicalName)}`);
  if (ragResponse.ok) { ... }
  */

  // STEP 4: Gemini Fallback
  const dataPrompt = `Informations réelles 2024-2025 sur '${classification.canonicalName}' pour l orientation scolaire en France. JSON uniquement:
  { 
    "description": "string",
    "duree": number, 
    "cout": number, 
    "alternance": boolean, 
    "debouches": ["string"], 
    "selectivite": number (1-5), 
    "salaireJunior": number, 
    "siteOfficiel": "string" 
  }
  JSON uniquement sans markdown.`;

  try {
    const result = await gemini.models.generateContent({
      model: "gemini-flash-latest",
      contents: dataPrompt
    });
    const text = (result.text || "").replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
    const resolved: ResolvedEntity = {
      id: classification.canonicalName,
      nom: classification.canonicalName,
      type: classification.type,
      ...data,
      source: 'gemini' as const,
      disclaimer: '⚠ Données estimées par IA'
    };
    entityCache[normalizedQuery] = resolved;
    return resolved;
  } catch (err) {
    console.error("Gemini fallback error", err);
    // STEP 5: Never return null
    const fallback: ResolvedEntity = {
      id: classification.canonicalName,
      nom: classification.canonicalName,
      type: classification.type,
      description: "Informations non disponibles pour le moment.",
      duree: 3,
      cout: 0,
      alternance: false,
      debouches: [],
      selectivite: 3,
      salaireJunior: 2500,
      source: 'gemini' as const,
      disclaimer: '⚠ Données non disponibles.'
    };
    // Don't cache total failures as long as it's a quota issue, maybe retry next time?
    // But if we want to be safe and avoid loops:
    entityCache[normalizedQuery] = fallback;
    return fallback;
  }
}
