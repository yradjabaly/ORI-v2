import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Handling __dirname in ES modules vs CommonJS
const __filename = fileURLToPath(import.meta.url).replace(/\\/g, '/');
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const mockAdmission = { moyenneMin: 11, moyenneMax: 16, bonusSpecialites: ['Maths','NSI','Physique','SES','Sciences','HLP'], tauxAdmission: 42 };

const formations = [
  { id:'F001', nom:'BUT Informatique', duree:3, cout:0, alternance:true, selectivite:4, salaireJunior:2400, type:'IUT_public', localisation:['IDF','Normandie','Bordeaux','Lyon'], ...mockAdmission },
  { id:'F002', nom:'BTS SIO Option SLAM', duree:2, cout:0, alternance:true, selectivite:2, salaireJunior:2100, type:'lycee_public', localisation:['IDF','National'], ...mockAdmission },
  { id:'F003', nom:'Licence Informatique', duree:3, cout:0, alternance:false, selectivite:2, salaireJunior:2000, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F004', nom:'BUT GEA (Gestion des Entreprises)', duree:3, cout:0, alternance:true, selectivite:3, salaireJunior:2200, type:'IUT_public', localisation:['IDF','National'], ...mockAdmission },
  { id:'F005', nom:'BTS Management Commercial', duree:2, cout:0, alternance:true, selectivite:2, salaireJunior:1900, type:'lycee_public', localisation:['National'], ...mockAdmission },
  { id:'F006', nom:'CPGE (Prépa Scientifique)', duree:2, cout:0, alternance:false, selectivite:5, salaireJunior:0, type:'prepa', localisation:['National'], ...mockAdmission },
  { id:'F007', nom:'Licence Droit', duree:3, cout:0, alternance:false, selectivite:2, salaireJunior:2100, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F008', nom:'BTS Comptabilité', duree:2, cout:0, alternance:true, selectivite:2, salaireJunior:1900, type:'lycee_public', localisation:['National'], ...mockAdmission },
  { id:'F009', nom:'Licence Psychologie', duree:3, cout:0, alternance:false, selectivite:2, salaireJunior:1800, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F010', nom:'BUT MMI (Métiers du Multimédia)', duree:3, cout:0, alternance:true, selectivite:3, salaireJunior:2000, type:'IUT_public', localisation:['IDF','National'], ...mockAdmission },
  { id:'F011', nom:'Ecole de Commerce (post-bac, privée)', duree:5, cout:8000, alternance:true, selectivite:4, salaireJunior:2800, type:'ecole_prive', localisation:['Paris','Lyon','Bordeaux'], ...mockAdmission },
  { id:'F012', nom:'Licence STAPS', duree:3, cout:0, alternance:false, selectivite:3, salaireJunior:1700, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F013', nom:'BTS Communication', duree:2, cout:0, alternance:true, selectivite:3, salaireJunior:1900, type:'lycee_public', localisation:['IDF','National'], ...mockAdmission },
  { id:'F014', nom:'BUT Génie Civil', duree:3, cout:0, alternance:true, selectivite:3, salaireJunior:2300, type:'IUT_public', localisation:['National'], ...mockAdmission },
  { id:'F015', nom:'Licence Sciences de l Education', duree:3, cout:0, alternance:false, selectivite:2, salaireJunior:1700, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F016', nom:'BTS Tourisme', duree:2, cout:0, alternance:true, selectivite:2, salaireJunior:1800, type:'lycee_public', localisation:['National'], ...mockAdmission },
  { id:'F017', nom:'BUT Réseaux & Télécommunications', duree:3, cout:0, alternance:true, selectivite:3, salaireJunior:2500, type:'IUT_public', localisation:['IDF','National'], ...mockAdmission },
  { id:'F018', nom:'IFSI (Infirmier)', duree:3, cout:0, alternance:false, selectivite:4, salaireJunior:2200, type:'sante', localisation:['National'], ...mockAdmission },
  { id:'F019', nom:'Licence LEA (Langues)', duree:3, cout:0, alternance:false, selectivite:2, salaireJunior:1800, type:'universite', localisation:['National'], ...mockAdmission },
  { id:'F020', nom:'Ecole d ingénieur (post-bac, publique)', duree:5, cout:500, alternance:true, selectivite:5, salaireJunior:3200, type:'ecole_ingenieur', localisation:['National'], ...mockAdmission }
];

const etablissements = [
  { id:'E001', nom:'IUT d Orsay', formationId:'F001', lat:48.7004, lng:2.1756, alternance:true, criteresMax:4 },
  { id:'E002', nom:'Lycee Camille See Paris 15e', formationId:'F002', lat:48.8431, lng:2.2981, alternance:true, criteresMax:4 },
  { id:'E003', nom:'IUT de Versailles', formationId:'F001', lat:48.8019, lng:2.1312, alternance:true, criteresMax:4 },
  { id:'E004', nom:'IUT Paris Rives de Seine', formationId:'F004', lat:48.8566, lng:2.3522, alternance:true, criteresMax:4 },
  { id:'E005', nom:'Universite Paris Cite', formationId:'F003', lat:48.8491, lng:2.3530, alternance:false, criteresMax:4 },
  { id:'E006', nom:'IUT Creteil', formationId:'F001', lat:48.7901, lng:2.4587, alternance:true, criteresMax:4 },
  { id:'E007', nom:'Lycee Voltaire Paris 11e', formationId:'F002', lat:48.8545, lng:2.3835, alternance:true, criteresMax:4 },
  { id:'E008', nom:'IUT de Massy', formationId:'F017', lat:48.7249, lng:2.2746, alternance:true, criteresMax:4 },
  { id:'E009', nom:'IUT Evry', formationId:'F014', lat:48.6315, lng:2.4477, alternance:true, criteresMax:4 },
  { id:'E010', nom:'Universite Paris Nanterre', formationId:'F007', lat:48.8990, lng:2.2035, alternance:false, criteresMax:4 },
  { id:'E011', nom:'IUT de Cergy', formationId:'F010', lat:49.0389, lng:2.0770, alternance:true, criteresMax:4 },
  { id:'E012', nom:'Universite Paris 8 Vincennes', formationId:'F009', lat:48.9452, lng:2.3644, alternance:false, criteresMax:4 },
  { id:'E013', nom:'Lycee Raspail Paris 14e', formationId:'F008', lat:48.8290, lng:2.3245, alternance:true, criteresMax:4 },
  { id:'E014', nom:'IUT de Bobigny', formationId:'F013', lat:48.9142, lng:2.4206, alternance:true, criteresMax:4 },
  { id:'E015', nom:'Universite Sorbonne Nord', formationId:'F015', lat:48.9567, lng:2.3421, alternance:false, criteresMax:4 }
];

async function seed() {
  console.log("Starting seeding process...");
  
  try {
    for (const form of formations) {
      // Remove id from the document since it's the doc key
      const { id, ...data } = form;
      await setDoc(doc(db, "formations", id), data);
      console.log(`Seeded formation: ${form.nom}`);
    }

    for (const etab of etablissements) {
      // Remove id from the document since it's the doc key
      const { id, ...data } = etab;
      await setDoc(doc(db, "etablissements", id), data);
      console.log(`Seeded etablissement: ${etab.nom}`);
    }

    console.log("Database successfully seeded!");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
  process.exit(0);
}

seed();
