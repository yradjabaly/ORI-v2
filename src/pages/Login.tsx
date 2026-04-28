import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/chat');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen w-full bg-[#f9f9f9] flex items-center justify-center p-6 font-lexend text-[#141414]">
      <div className="w-full max-w-[440px] flex flex-col items-center">
        {/* Logo */}
        <div className="w-20 h-20 bg-[#E8002D] rounded-3xl flex items-center justify-center text-white font-[900] text-3xl shadow-xl shadow-red-100 mb-8 tracking-tighter uppercase">
          ORI
        </div>
        
        <div className="bg-white rounded-[32px] p-8 md:p-10 w-full shadow-2xl shadow-black/5 border border-gray-100 text-center">
          <h1 className="text-2xl font-bold mb-2">Bienvenue sur ORI</h1>
          <p className="text-sm text-gray-500 mb-8 font-medium">L'assistant intelligent pour ton orientation by L'Étudiant</p>
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-[#E8002D] hover:bg-[#c40026] text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-red-100 active:scale-[0.98] group"
            >
              <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center p-1">
                <svg viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              Continuer avec Google
            </button>

            <div className="flex items-center gap-4 my-2">
              <div className="flex-1 h-[1px] bg-gray-100" />
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest leading-none">ou</span>
              <div className="flex-1 h-[1px] bg-gray-100" />
            </div>

            <button className="w-full py-4 rounded-xl border-2 border-gray-100 text-gray-400 font-bold text-sm bg-gray-50/50 cursor-not-allowed flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">family_restroom</span>
              Espace Parents (Bientôt)
            </button>
          </div>

          <div className="mt-10 pt-8 border-t border-gray-50 flex flex-col gap-4">
            <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
              En te connectant, tu acceptes nos <span className="underline cursor-pointer">Conditions d'Utilisation</span> et notre <span className="underline cursor-pointer">Politique de Confidentialité</span>.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-[#E8002D] text-white font-[900] text-[10px]">O</div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">ORI • L'ÉTUDIANT</span>
          </div>
        </div>
      </div>
    </div>
  );
}
