import { useState } from 'react';

interface VideoCardProps {
  videoId: string;
  title: string;
  type: 'procedural' | 'vismavie';
}

export const VIDEO_DB = {
  procedural: [
    { id: 'ZuwkeXxLZg0', title: 'Comment trouver une alternance', keywords: ['alternance', 'trouver alternance'] },
    { id: 'K0fDWmA9KWc', title: "Une grande école, c'est quoi ?", keywords: ['grande école', 'école de commerce', 'ingénieur'] },
    { id: 'xSh56-ZP5Gk', title: 'Comment trouver son entreprise en alternance', keywords: ['entreprise alternance', 'contrat alternance'] },
    { id: 'SjhNPAZlOEU', title: "L'alternance — comment ça marche", keywords: ['alternance fonctionnement', 'apprentissage'] },
    { id: 'QNXwfhbE6sE', title: "Parcoursup — s'inscrire en 10 étapes", keywords: ['parcoursup', 'inscription', 'voeux'] },
    { id: 'rsEdvl-rljo', title: "Prêt étudiant garanti par l'État", keywords: ['prêt étudiant', 'financement', 'bourse'] },
  ],
  vismavie: [
    { id: 'ZRYAu4l6S6A', title: 'Vis ma vie de psychologue', formationIds: ['F009'] },
    { id: '_5wEvKE16-4', title: "Vis ma vie d'avocat", formationIds: ['F007'] },
    { id: 'ShHbQyeCExs', title: "Vis ma vie d'ophtalmologue", formationIds: ['F018'] },
    { id: 'gTe0f0wSIl4', title: 'Vis ma vie de graphiste', formationIds: ['F010', 'F013'] },
  ]
};

export default function VideoCard({ videoId, title, type }: VideoCardProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="mt-4 mb-2 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
      
      {/* Color top bar */}
      <div className={`h-1.5 w-full ${type === 'vismavie' ? 'bg-[#E8002D]' : 'bg-[#003D82]'}`} />
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-50">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            type === 'vismavie' 
              ? 'bg-red-50 text-[#E8002D]' 
              : 'bg-blue-50 text-[#003D82]'
          }`}>
            {type === 'vismavie' ? 'Vis ma vie' : 'Guide pratique'}
          </span>
          <span className="text-[12px] font-medium text-gray-800">{title}</span>
        </div>
        {/* YouTube logo */}
        <svg width="16" height="12" viewBox="0 0 24 17" fill="none">
          <path d="M23.5 2.6S23.2.8 22.4.1C21.4-.9 20.3-.9 19.8-.8 16.5 0 12 0 12 0S7.5 0 4.2-.8C3.7-.9 2.6-.9 1.6.1.8.8.5 2.6.5 2.6S.2 4.7.2 6.9v2c0 2.1.3 4.3.3 4.3s.3 1.8 1.1 2.5c1 1 2.3.9 2.9 1C6.5 17 12 17 12 17s4.5 0 7.8-.8c.5-.1 1.6-.1 2.6-1.1.8-.7 1.1-2.5 1.1-2.5s.3-2.1.3-4.3v-2C23.8 4.7 23.5 2.6 23.5 2.6zM9.7 11.5V5l6.5 3.3-6.5 3.2z" fill="#FF0000"/>
        </svg>
      </div>

      {/* Video area */}
      <div className="relative bg-black" style={{aspectRatio: '16/9'}}>
        {!playing ? (
          <>
            {/* Thumbnail */}
            <img 
              referrerPolicy="no-referrer"
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt={title}
              className="w-full h-full object-cover"
            />
            {/* Play button overlay */}
            <button
              onClick={() => setPlaying(true)}
              className="absolute inset-0 flex items-center justify-center 
                bg-black/20 hover:bg-black/30 transition-colors group"
            >
              <div className="w-14 h-14 bg-[#E8002D] rounded-full flex items-center 
                justify-center shadow-lg group-hover:scale-105 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </button>
          </>
        ) : (
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; 
              encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full"
            style={{border: 'none'}}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Proposé par l'Étudiant</span>
        <span className="text-[10px] text-gray-500 italic">
          {type === 'vismavie' 
            ? 'Découvre le quotidien de ce métier en vidéo'
            : 'Tout comprendre en quelques minutes'}
        </span>
      </div>
    </div>
  );
}
