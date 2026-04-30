import { useState, useEffect } from 'react';
import { CheckSquare, Printer, Calendar, Bell, ExternalLink, Loader2, Check } from 'lucide-react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { MoreVertical, Trash2, Edit3, X, Save } from 'lucide-react';

export default function Checklist() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  
  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formUrgence, setFormUrgence] = useState('PLUS_TARD');

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [expandedCount, setExpandedCount] = useState(4);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'checklist'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const printStyle = `
    @media print {
      body * { visibility: hidden; }
      #checklist-print, #checklist-print * { visibility: visible; }
      #checklist-print { position: fixed; top: 0; left: 0; width: 100%; }
      button, nav, aside { display: none !important; }
    }
  `;

  const handleExportPDF = () => {
    const style = document.createElement('style');
    style.innerHTML = printStyle;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  const toggleItem = async (id: string, isDone: boolean) => {
    try {
      const today = new Date().toLocaleDateString('fr-FR');
      await updateDoc(doc(db, 'checklist', id), {
        done: !isDone,
        updatedAt: serverTimestamp(),
        completedAt: !isDone ? today : null
      });
    } catch (err) {
      handleFirestoreError(err, 'update', `checklist/${id}`);
    }
  };

  const addTask = async () => {
    if (!formTitle.trim() || !formDeadline || !user) return;
    try {
      // Convert HTML date (YYYY-MM-DD) to FR format (DD/MM/YYYY)
      const [y, m, d] = formDeadline.split('-');
      const formattedDeadline = `${d}/${m}/${y}`;

      await addDoc(collection(db, 'checklist'), {
        userId: user.uid,
        title: formTitle,
        deadline: formattedDeadline,
        urgence: formUrgence,
        done: false,
        source: 'manual',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      resetForm();
    } catch (err) {
      handleFirestoreError(err, 'create', 'checklist');
    }
  };

  const updateTask = async (id: string) => {
    if (!formTitle.trim() || !formDeadline) return;
    try {
      const [y, m, d] = formDeadline.includes('-') ? formDeadline.split('-') : [null, null, null];
      const formattedDeadline = y ? `${d}/${m}/${y}` : formDeadline;

      await updateDoc(doc(db, 'checklist', id), {
        title: formTitle,
        deadline: formattedDeadline,
        urgence: formUrgence,
        updatedAt: serverTimestamp()
      });
      resetForm();
    } catch (err) {
      handleFirestoreError(err, 'update', `checklist/${id}`);
    }
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Supprimer cette tâche ?')) return;
    try {
      await deleteDoc(doc(db, 'checklist', id));
      setActiveDropdownId(null);
    } catch (err) {
      handleFirestoreError(err, 'delete', `checklist/${id}`);
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormDeadline('');
    setFormUrgence('PLUS_TARD');
    setIsAdding(false);
    setEditingId(null);
    setActiveDropdownId(null);
  };

  const startEdit = (item: any) => {
    setFormTitle(item.title);
    // Convert DD/MM/YYYY to YYYY-MM-DD for date input
    const [d, m, y] = item.deadline.split('/');
    setFormDeadline(`${y}-${m}-${d}`);
    setFormUrgence(item.urgence);
    setEditingId(item.id);
    setActiveDropdownId(null);
  };

  if (loading) {
     return (
       <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 h-full">
          <Loader2 className="w-8 h-8 text-[#E8002D] animate-spin mb-4" />
       </div>
     );
  }

  const doneCount = items.filter(i => i.done).length;
  const totalCount = items.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  const getUrgenceVal = (u: string) => {
     if (u === 'URGENT') return 1;
     if (u === 'BIENTOT') return 2;
     return 3;
  };

  const sortedItems = [...items].sort((a, b) => {
    if (a.done && !b.done) return 1;
    if (!a.done && b.done) return -1;
    return getUrgenceVal(a.urgence) - getUrgenceVal(b.urgence);
  });

  const todoItems = sortedItems.filter(i => !i.done);
  const visibleTodo = todoItems.slice(0, expandedCount);
  const remainingCount = Math.max(0, todoItems.length - expandedCount);

  const getMonthName = (deadline: string) => {
    try {
      const [day, month, year] = deadline.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } catch (e) {
      return 'Date inconnue';
    }
  };

  const itemsByMonth = sortedItems.reduce((acc: any, item) => {
    const month = getMonthName(item.deadline);
    if (!acc[month]) acc[month] = [];
    acc[month].push(item);
    return acc;
  }, {});

  const getUrgenceBadge = (done: boolean, urg: string) => {
     if (done) return null;
     if (urg === 'URGENT') return <span className="inline-flex items-center gap-1.5 bg-red-50 text-[#E8002D] text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest"><span className="material-symbols-outlined text-sm">error</span> URGENT</span>;
     if (urg === 'BIENTOT') return <span className="inline-flex items-center gap-1.5 bg-orange-50 text-orange-700 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest"><span className="material-symbols-outlined text-sm">schedule</span> BIENTÔT</span>;
     return null;
  };

  return (
    <div className="w-full h-full pb-24 print:bg-white print:h-auto font-lexend">
      <div className="max-w-[1000px] mx-auto px-6 pt-10 flex flex-col gap-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 print:hidden">
          <div>
            <h2 className="text-[32px] font-bold text-gray-900 tracking-tight leading-none mb-3">Mes tâches</h2>
            <p className="text-gray-500 font-medium tracking-tight">Suis l'avancement de ton projet pas à pas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
              <button 
                onClick={() => setViewMode('list')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-[11px] uppercase tracking-widest transition-all",
                  viewMode === 'list' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Liste
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-[11px] uppercase tracking-widest transition-all",
                  viewMode === 'calendar' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                Calendrier
              </button>
            </div>
            
            <button 
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 font-bold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-xs"
            >
              <Printer className="w-4 h-4" />
              Exporter PDF
            </button>

            <button 
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 font-bold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-xs"
            >
              <Bell className="w-4 h-4" />
              Alertes email
            </button>
            
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-[#E8002D] text-white font-bold px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-red-100 text-xs"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Ajouter une tâche
            </button>
          </div>
        </div>

        {/* PROGRESS BAR SECTION */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-center gap-8 print:hidden">
          <div className="flex-1 w-full">
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold text-gray-900">Progression orientation</span>
              <span className="font-bold text-[#E8002D]">{progressPercent}%</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#E8002D] transition-all duration-1000 ease-in-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="flex gap-8 items-center border-t md:border-t-0 md:border-l border-gray-100 pt-6 md:pt-0 md:pl-8 w-full md:w-auto">
            <div className="flex flex-col text-center md:text-left">
              <p className="text-2xl font-black text-gray-900">{totalCount - doneCount}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">À faire</p>
            </div>
            <div className="flex flex-col text-center md:text-left">
              <p className="text-2xl font-black text-[#E8002D]">{doneCount}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Terminées</p>
            </div>
          </div>
        </div>

        {/* INLINE ADD FORM */}
        {isAdding && (
          <div className="bg-white border-2 border-red-100 rounded-3xl p-6 shadow-xl animate-in slide-in-from-top-4 duration-300">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">add_task</span>
              Nouvelle tâche
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="md:col-span-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Titre de la tâche</label>
                <input 
                  autoFocus
                  type="text" 
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Envoyer ma lettre..."
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#E8002D] outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Échéance</label>
                <input 
                  type="date" 
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#E8002D] outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Urgence</label>
                <select 
                  value={formUrgence}
                  onChange={(e) => setFormUrgence(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-[11px] text-sm focus:ring-2 focus:ring-[#E8002D] outline-none transition-all appearance-none"
                >
                  <option value="URGENT">URGENT</option>
                  <option value="BIENTOT">BIENTÔT</option>
                  <option value="PLUS_TARD">PLUS TARD</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
              <button 
                onClick={resetForm}
                className="px-6 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-500 hover:bg-gray-50 transition-colors text-xs"
              >
                Annuler
              </button>
              <button 
                onClick={addTask}
                className="px-8 py-2.5 rounded-xl bg-[#E8002D] text-white font-bold hover:opacity-90 transition-opacity shadow-lg shadow-red-100 text-xs"
              >
                Ajouter
              </button>
            </div>
          </div>
        )}

        {viewMode === 'list' ? (
          <div id="checklist-print" className="flex flex-col gap-12">
            {/* TASKS TO DO SECTION */}
            <section className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-gray-900">Tâches à faire</h3>
                <span className="bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full font-bold">
                  {totalCount - doneCount}
                </span>
              </div>
              
              <div className="flex flex-col gap-4">
                {visibleTodo.map(item => (
                  <div key={item.id} className="relative">
                    {editingId === item.id ? (
                      <div className="checklist-item bg-white border-2 border-red-50 rounded-2xl p-6 shadow-md animate-in zoom-in-95 duration-200">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <input 
                             type="text" 
                             value={formTitle}
                             onChange={(e) => setFormTitle(e.target.value)}
                             className="md:col-span-3 w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#E8002D] outline-none"
                          />
                          <input 
                             type="date" 
                             value={formDeadline}
                             onChange={(e) => setFormDeadline(e.target.value)}
                             className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm"
                          />
                          <select 
                             value={formUrgence}
                             onChange={(e) => setFormUrgence(e.target.value)}
                             className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm"
                          >
                             <option value="URGENT">URGENT</option>
                             <option value="BIENTOT">BIENTÔT</option>
                             <option value="PLUS_TARD">PLUS TARD</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => updateTask(item.id)} className="flex-1 bg-[#E8002D] text-white rounded-xl py-2 font-bold text-xs flex items-center justify-center gap-1"><Save className="w-3.5 h-3.5" /> Enregistrer</button>
                            <button onClick={resetForm} className="bg-gray-100 text-gray-500 rounded-xl px-3 py-2 flex items-center justify-center"><X className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="checklist-item bg-white border border-gray-100 rounded-2xl p-6 flex items-center gap-5 hover:border-red-100 transition-all group shadow-sm">
                        <button 
                          onClick={() => toggleItem(item.id, item.done)}
                          className="w-7 h-7 rounded-full border-2 border-gray-200 bg-gray-50 hover:border-[#E8002D] transition-colors flex items-center justify-center shrink-0"
                        />
                        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                          <div>
                            <p className={cn(
                              "font-bold text-gray-900 transition-colors text-lg sm:text-base",
                              item.urgence === 'URGENT' && "text-red-600"
                            )}>{item.title}</p>
                            <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5 mt-1.5 uppercase tracking-widest">
                              <Calendar className="w-3.5 h-3.5" />
                              Échéance : {item.deadline}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            {item.urgence === 'URGENT' && (
                              <span className="inline-flex items-center bg-red-50 text-[#E8002D] text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">URGENT</span>
                            )}
                            {item.urgence === 'BIENTOT' && (
                              <span className="inline-flex items-center bg-yellow-50 text-yellow-700 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest leading-none">BIENTÔT</span>
                            )}
                            <div className="relative print-hidden-all">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdownId(activeDropdownId === item.id ? null : item.id);
                                }}
                                className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-gray-50 rounded-full shrink-0"
                              >
                                <MoreVertical className="w-5 h-5" />
                              </button>
                              {activeDropdownId === item.id && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                  <button onClick={() => startEdit(item)} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-gray-600 hover:bg-gray-50 border-b border-gray-50">
                                    <Edit3 className="w-4 h-4" /> Modifier
                                  </button>
                                  <button onClick={() => deleteTask(item.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50">
                                    <Trash2 className="w-4 h-4" /> Supprimer
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {remainingCount > 0 && (
                  <button 
                    onClick={() => setExpandedCount(prev => prev + 10)}
                    className="w-full py-4 rounded-2xl text-gray-400 font-bold text-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2 print:hidden"
                  >
                    Voir plus de tâches ({remainingCount})
                    <span className="material-symbols-outlined">expand_more</span>
                  </button>
                )}

                {todoItems.length === 0 && (
                   <div className="text-center p-16 text-gray-400 bg-gray-50 border-2 border-dashed border-gray-100 rounded-3xl print:hidden">
                      <div className="material-symbols-outlined text-5xl mb-4 text-green-500">task_alt</div>
                      <p className="font-bold text-gray-900 text-lg">Bravo ! Tout est accompli.</p>
                      <p className="text-sm">Tu es parfaitement à jour dans tes démarches.</p>
                   </div>
                )}
              </div>
            </section>

            {/* COMPLETED TASKS SECTION */}
            {doneCount > 0 && (
              <section className="flex flex-col gap-6 pt-6 border-t border-gray-50">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-gray-400">Tâches terminées</h3>
                  <span className="bg-gray-50 text-gray-400 text-xs px-2.5 py-1 rounded-full font-bold">
                    {doneCount}
                  </span>
                </div>
                
                <div className="flex flex-col gap-4">
                  {sortedItems.filter(i => i.done).map(item => (
                    <div 
                      key={item.id} 
                      className="print-visible bg-white border border-gray-100 rounded-2xl p-6 flex items-center gap-5 shadow-sm opacity-60"
                    >
                      <button 
                        onClick={() => toggleItem(item.id, item.done)}
                        className="w-7 h-7 rounded-full bg-[#E8002D]/10 border-2 border-[#E8002D] flex items-center justify-center shrink-0 transition-colors"
                      >
                        <Check className="w-4 h-4 text-[#E8002D]" />
                      </button>
                      <div className="flex-1">
                        <p className="font-bold text-gray-400 line-through decoration-1 decoration-gray-300">{item.title}</p>
                        <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5 mt-1.5 uppercase tracking-widest">
                          <Check className="w-3.5 h-3.5" />
                          Terminé le {item.completedAt || item.deadline}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div id="checklist-print" className="flex flex-col gap-16 pb-20">
            {Object.keys(itemsByMonth).map(month => (
              <section key={month} className="flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                   <h3 className="text-2xl font-black text-gray-900 capitalize">{month}</h3>
                   <span className="bg-gray-50 text-gray-400 text-xs px-2 px-1 rounded-full font-bold">
                      {itemsByMonth[month].length}
                   </span>
                </div>
                <div className="flex flex-col gap-3">
                  {itemsByMonth[month].map((item: any) => (
                    <div 
                      key={item.id}
                      className={cn(
                        "checklist-item bg-white border rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:border-red-100 transition-all group",
                        item.done ? "bg-gray-50 border-gray-100 opacity-60" : "border-gray-100"
                      )}
                    >
                      <button 
                        onClick={() => toggleItem(item.id, item.done)}
                        className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                          item.done 
                            ? "bg-[#E8002D] border-[#E8002D]" 
                            : "border-gray-300 hover:border-[#E8002D]"
                        )}
                      >
                        {item.done && <span className="text-white text-[10px]">✓</span>}
                      </button>

                      <div className="flex-1 min-w-0">
                        <h4 className={cn(
                          "font-bold text-gray-900 transition-colors text-base",
                          item.done && "line-through text-gray-400"
                        )}>
                          {item.title}
                        </h4>
                        <p className="text-[11px] font-bold text-gray-400 flex items-center gap-1.5 mt-1 uppercase tracking-widest">
                          <Calendar className="w-3.5 h-3.5" />
                          Échéance : {item.deadline}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.urgence === 'URGENT' && (
                          <span className="inline-flex items-center bg-red-50 text-[#E8002D] text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest">URGENT</span>
                        )}
                        {item.urgence === 'BIENTOT' && (
                          <span className="inline-flex items-center bg-yellow-50 text-yellow-700 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest">BIENTÔT</span>
                        )}
                        {item.urgence === 'PLUS_TARD' && (
                          <span className="inline-flex items-center bg-gray-50 text-gray-400 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest">PLUS TARD</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
