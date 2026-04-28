import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { doc, getDoc, collection, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { resolveEntity } from '../lib/resolveEntity';

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;

interface SchoolMapProps {
  userId: string;
  sessionId?: string;
  messageId?: string;
  initialData?: any;
}

interface EtablissementData {
  id: string;
  nom: string;
  formationId: string | string[];
  lat: number;
  lng: number;
  alternance: boolean;
  formationData?: any;
  score: number;
  matchedCriteria: { label: string; matched: boolean }[];
}

// Helper to handle map view changes
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Map Component using react-leaflet
function MapComponent({ 
  center, 
  zoom, 
  etablissements,
  onMarkerClick,
  activeEtabId,
  activeCount
}: { 
  center: [number, number]; 
  zoom: number; 
  etablissements: EtablissementData[];
  onMarkerClick: (e: EtablissementData) => void;
  activeEtabId: string | null;
  activeCount: number;
}) {
  return (
    <MapContainer 
      center={center} 
      zoom={zoom} 
      style={{ width: '100%', height: '100%', borderRadius: '8px' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <ChangeView center={center} zoom={zoom} />

      {etablissements.map((etab) => {
        let fillColor = '#9CA3AF'; // gray
        const ratio = activeCount > 0 ? etab.score / activeCount : 0;
        if (ratio >= 1) fillColor = '#22C55E'; // green
        else if (ratio >= 0.5) fillColor = '#F97316'; // orange

        return (
          <CircleMarker
            key={etab.id}
            center={[etab.lat, etab.lng]}
            pathOptions={{
              fillColor: fillColor,
              fillOpacity: 1,
              color: '#FFFFFF',
              weight: 2
            }}
            radius={10}
            eventHandlers={{
              click: () => onMarkerClick(etab)
            }}
          >
            <Popup>
              <div className="p-1 min-w-[170px] font-sans">
                <strong className="block text-[13px] text-gray-900 mb-1">{etab.nom}</strong>
                <div className="text-[11px] text-gray-600 mb-2">{etab.formationData?.nom || ''}</div>
                
                <div className="space-y-1 mb-2">
                  {etab.matchedCriteria?.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      {c.matched ? (
                        <span className="text-green-600 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300">○</span>
                      )}
                      <span className={cn(c.matched ? "text-gray-700" : "text-gray-400")}>{c.label}</span>
                    </div>
                  ))}
                </div>

                <div 
                  className="text-[11px] font-bold border-t border-gray-100 pt-1.5" 
                  style={{ color: fillColor }}
                >
                  {etab.score}/{activeCount} critères ✓
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export function SchoolMap({ userId, sessionId, messageId, initialData }: SchoolMapProps) {
  const [loading, setLoading] = useState(!initialData);
  const [data, setData] = useState<EtablissementData[]>(initialData?.data || []);
  const [filter, setFilter] = useState<'Toutes' | 'Public' | 'Alternance' | '< 30 min'>('Toutes');
  const [center, setCenter] = useState<[number, number]>(initialData?.center || [48.8566, 2.3522]);
  const [activeId, setActiveId] = useState<string | null>(initialData?.activeId || null);
  const [activeCount, setActiveCount] = useState(initialData?.activeCount || 4);

  useEffect(() => {
    if (initialData) return;
    async function loadMapData() {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        const profileStr = userDoc.exists() ? (userDoc.data().swipeProfile || '').toLowerCase() : '';
        
        let wantsAlternance = profileStr.includes('gratuit-alternance');
        let wantsPublic = profileStr.includes('gratuit-alternance') || profileStr.includes('public');
        let wantsLocal = profileStr.includes('local');
        let wantsBac23 = profileStr.includes('bac2-3');

        // Fallback if empty
        if (!wantsAlternance && !wantsPublic && !wantsLocal && !wantsBac23) {
          wantsAlternance = true;
          wantsPublic = true;
          wantsLocal = true;
          wantsBac23 = true;
        }

        const count = [wantsAlternance, wantsPublic, wantsLocal, wantsBac23].filter(Boolean).length;
        setActiveCount(count);

        const [etabSnap, formSnap] = await Promise.all([
          getDocs(collection(db, "etablissements")),
          getDocs(collection(db, "formations"))
        ]);

        const formsMap: Record<string, any> = {};
        for (const docObj of formSnap.docs) {
          formsMap[docObj.id] = docObj.data();
        }

        const loaded: EtablissementData[] = [];
        for (const docObj of etabSnap.docs) {
           const eInfo = docObj.data();
           
           // Use resolveEntity or existing map
           let fInfo = null;
           const primaryFormationId = Array.isArray(eInfo.formationIds) 
             ? eInfo.formationIds[0] 
             : eInfo.formationId;

           if (primaryFormationId) {
             fInfo = formsMap[primaryFormationId];
             if (!fInfo) {
               const resolved = await resolveEntity(primaryFormationId);
               fInfo = {
                 nom: resolved.nom,
                 cout: resolved.cout,
                 type: resolved.type,
                 duree: resolved.duree
               };
             }
           }
           
           let score = 0;
           const matchedCriteria: { label: string; matched: boolean }[] = [];

           if (wantsAlternance) {
              const matched = eInfo.alternance === true;
              if (matched) score++;
              matchedCriteria.push({ label: 'Alternance', matched });
           }
           if (wantsPublic) {
              const matched = fInfo.type?.includes('public');
              if (matched) score++;
              matchedCriteria.push({ label: 'Scolarité gratuite', matched });
           }
           if (wantsLocal) {
              const matched = eInfo.lat >= 48.1 && eInfo.lat <= 49.2 && eInfo.lng >= 1.4 && eInfo.lng <= 3.6;
              if (matched) score++;
              matchedCriteria.push({ label: 'Proche de chez moi', matched });
           }
           if (wantsBac23) {
              const matched = fInfo.duree <= 3;
              if (matched) score++;
              matchedCriteria.push({ label: 'Parcours court (Bac+2/3)', matched });
           }

           loaded.push({
             id: docObj.id,
             nom: eInfo.nom,
             formationId: Array.isArray(eInfo.formationIds) ? eInfo.formationIds : eInfo.formationId,
             lat: eInfo.lat,
             lng: eInfo.lng,
             alternance: eInfo.alternance,
             formationData: fInfo,
             score: score,
             matchedCriteria
           });
        }

        // Sort by score
        loaded.sort((a,b) => b.score - a.score);
        setData(loaded);

        // Persistence
        if (sessionId && messageId) {
          try {
            const sessionRef = doc(db, 'sessions', sessionId);
            const sessionSnap = await getDoc(sessionRef);
            if (sessionSnap.exists()) {
              const msgs = sessionSnap.data().messages || [];
              const msgIdx = Number(messageId);
              if (!isNaN(msgIdx) && msgs[msgIdx]) {
                msgs[msgIdx].componentData = { 
                  data: loaded, 
                  center: [48.8566, 2.3522], 
                  activeCount: count 
                };
                await updateDoc(sessionRef, { 
                  messages: msgs,
                  updatedAt: serverTimestamp()
                });
              }
            }
          } catch(e) {}
        }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadMapData();
  }, [userId]);

  const filteredData = data.filter(e => {
    if (filter === 'Public') return e.formationData?.cout === 0 || e.formationData?.type?.includes('public') || e.formationData?.type?.includes('universite');
    if (filter === 'Alternance') return e.alternance;
    if (filter === '< 30 min') return e.lat > 48.7 && e.lat < 49.0 && e.lng > 2.1 && e.lng < 2.5; 
    return true;
  });

  if (loading) {
     return (
       <div className="w-full h-48 flex items-center justify-center bg-white rounded-xl shadow-sm border border-gray-200">
         <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin" />
       </div>
     );
  }

  return (
    <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 mt-4 mb-4 overflow-hidden flex flex-col">
      {/* Filters Bar */}
      <div className="w-full overflow-x-auto p-3 flex gap-2 border-b border-gray-200 no-scrollbar">
        {['Toutes', 'Public', 'Alternance', '< 30 min'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={cn(
              "whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors border",
              filter === f 
                ? "bg-[#E8002D] text-white border-[#E8002D]" 
                : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
            )}
          >
            {f === '< 30 min' ? '< 30 min de Paris' : f}
          </button>
        ))}
      </div>

      {/* Legend and Info */}
      <div className="bg-white pt-2">
        <p className="text-[11px] text-gray-400 px-2 pb-1">
          Basé sur ton profil : public, alternance, IDF
        </p>
        <div className="flex items-center gap-4 px-2 pb-2 text-[11px] text-gray-500 overflow-x-auto no-scrollbar">
          <span className="font-medium text-gray-600 shrink-0">
            Légende :
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-green-500"/>
            <span>4/4 critères — correspond parfaitement</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-orange-400"/>
            <span>3/4 critères</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400"/>
            <span>2/4 ou moins</span>
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="w-full h-[320px] bg-gray-100 relative z-0">
        <MapComponent 
          center={center} 
          zoom={11} 
          etablissements={filteredData}
          activeEtabId={activeId}
          activeCount={activeCount}
          onMarkerClick={(e) => {
            setCenter([e.lat, e.lng]);
            setActiveId(e.id);
          }}
        />
      </div>

      {/* School List below map */}
      <div className="w-full h-[120px] overflow-y-auto p-2 bg-gray-50">
        {filteredData.length === 0 ? (
           <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">Aucun établissement ne correspond.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredData.map(etab => {
              let dotColor = 'bg-gray-400';
              const ratio = activeCount > 0 ? etab.score / activeCount : 0;
              if (ratio >= 1) dotColor = 'bg-green-500';
              else if (ratio >= 0.5) dotColor = 'bg-orange-500';

              return (
                <button
                  key={etab.id}
                  onClick={() => {
                    setCenter([etab.lat, etab.lng]);
                    setActiveId(etab.id);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full p-2 rounded-xl text-left transition-colors border border-transparent",
                    activeId === etab.id ? "bg-white border-gray-200 shadow-sm" : "hover:bg-gray-100/50"
                  )}
                >
                  <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[13px] text-gray-900 truncate">{etab.nom}</div>
                    <div className="text-[11px] text-gray-500 truncate">{etab.formationData?.nom || 'Formation'}</div>
                  </div>
                  <div className={cn(
                    "shrink-0 text-xs font-bold",
                    ratio >= 1 ? "text-green-600" : (ratio >= 0.5 ? "text-orange-600" : "text-gray-400")
                  )}>
                    {etab.score}/{activeCount} critères ✓
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

