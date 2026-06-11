function App() {
    const [currentView, setCurrentView] = useState('lobby');
    const [gameMode, setGameMode] = useState(null); 
    const [settings, setSettings] = useState({ selectedUnits: [], count: 20 });
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [wordDatabase, setWordDatabase] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [leaderboards, setLeaderboards] = useState([]);
    const [user, setUser] = useState(null);
    const [dbRef, setDbRef] = useState(null);
    const [firebaseInitialized, setFirebaseInitialized] = useState(false);

    useEffect(() => {
        try {
            const config = { apiKey: "AIzaSyCJorCKM0-YKFamjixDVjcRSeOdtgJ3zyM", authDomain: "wutaivocab.firebaseapp.com", projectId: "wutaivocab" };
            if (!firebase.apps.length) firebase.initializeApp(config);
            const auth = firebase.auth();
            setDbRef(firebase.firestore());
            auth.signInAnonymously().catch(()=>{});
            auth.onAuthStateChanged((currentUser) => { setUser(currentUser); setFirebaseInitialized(true); });
        } catch(e) { setFirebaseInitialized(true); }
    }, []);

    useEffect(() => {
        if (!user || !dbRef) return; 
        const unsubscribe = dbRef.collection('leaderboard').onSnapshot((snapshot) => {
            setLeaderboards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [user, dbRef]);

    useEffect(() => {
        const fetchWordData = async () => {
            try {
                const response = await fetch(`${GOOGLE_SHEET_CSV_URL}&t=${new Date().getTime()}`);
                if (!response.ok) throw new Error("Fetch failed");
                const parsedData = parseCSV(await response.text());
                setWordDatabase(parsedData.length > 0 ? parsedData : DEFAULT_WORD_DATABASE);
            } catch (error) {
                setWordDatabase(DEFAULT_WORD_DATABASE);
            } finally { setIsLoading(false); }
        };
        fetchWordData();
    }, []);

    const navigateTo = (view, mode = null) => {
        soundEngine.init(); 
        setGameMode(mode);
        setCurrentView(view);
    };

    const handleSaveScore = async (scoreData) => {
        if (dbRef && user) {
            try { await dbRef.collection('leaderboard').add({...scoreData, userId: user.uid}); } 
            catch(e) { setLeaderboards(prev => [...prev, scoreData]); }
        } else setLeaderboards(prev => [...prev, scoreData]); 
    };

    const groupedUnits = useMemo(() => {
        const groups = {};
        wordDatabase.forEach(w => {
            if (!groups[w.book]) groups[w.book] = new Set();
            groups[w.book].add(w.lesson);
        });
        return groups;
    }, [wordDatabase]);

    const qualifyingBook = useMemo(() => {
        const selectedBooks = [...new Set(settings.selectedUnits.map(u => parseInt(u.split('-')[0], 10)))];
        if (selectedBooks.length !== 1) return null; 
        const book = selectedBooks[0];
        const selectedUnitsCount = settings.selectedUnits.length;
        const selectedWordsCount = wordDatabase.filter(w => settings.selectedUnits.includes(`${w.book}-${w.lesson}`)).length;
        if (selectedWordsCount < 20 && selectedUnitsCount < 2) return null;
        const playCount = settings.count === 'all' ? selectedWordsCount : parseInt(settings.count, 10);
        if (playCount < 20 && settings.count !== 'all') return null;
        return book;
    }, [settings.selectedUnits, settings.count, wordDatabase]);

    if (isLoading || !firebaseInitialized) return <div className="min-h-screen flex flex-col items-center justify-center"><i className="fa-solid fa-spinner fa-spin text-blue-600 mb-4 text-5xl"></i></div>;

    return (
        <div className="min-h-screen flex flex-col pb-10">
            <div className="max-w-4xl mx-auto w-full p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xl tracking-wider text-slate-800 dark:text-slate-100">霧臺國小</span>
                    {user && dbRef ? <div className="ml-2 flex items-center gap-1 text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full"><i className="fa-solid fa-wifi text-[10px] animate-pulse"></i> 已連線</div> : <div className="ml-2 flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full"><i className="fa-solid fa-globe text-[10px]"></i> 單機版</div>}
                </div>
                <button onClick={() => { setIsDarkMode(!isDarkMode); document.documentElement.classList.toggle('dark'); }} className="p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{isDarkMode ? <i className="fa-solid fa-sun"></i> : <i className="fa-solid fa-moon"></i>}</button>
            </div>

            {currentView === 'lobby' && <Lobby onNavigate={navigateTo} settings={settings} setSettings={setSettings} wordDatabase={wordDatabase} groupedUnits={groupedUnits} qualifyingBook={qualifyingBook} />}
            {['zh-en', 'en-zh', 'listening', 'hard'].includes(currentView) && <StandardQuiz mode={currentView} onBack={() => navigateTo('lobby')} settings={settings} wordDatabase={wordDatabase} qualifyingBook={qualifyingBook} onSaveScore={handleSaveScore} />}
            {currentView === 'spelling' && <SpellingGame onBack={() => navigateTo('lobby')} settings={settings} wordDatabase={wordDatabase} qualifyingBook={qualifyingBook} onSaveScore={handleSaveScore} />}
            {currentView === 'meteor' && <MeteorGame subMode={gameMode} onBack={() => navigateTo('lobby')} settings={settings} wordDatabase={wordDatabase} qualifyingBook={qualifyingBook} onSaveScore={handleSaveScore} />}
            {currentView === 'leaderboard' && <LeaderboardView onBack={() => navigateTo('lobby')} leaderboards={leaderboards} groupedUnits={groupedUnits} />}
            {currentView === 'battle' && <BattleGame onBack={() => navigateTo('lobby')} wordDatabase={wordDatabase} dbRef={dbRef} user={user} settings={settings} />}
        </div>
    );
}

function Lobby({ onNavigate, settings, setSettings, wordDatabase, groupedUnits, qualifyingBook }) {
    const selectedWordCount = wordDatabase.filter(w => settings.selectedUnits.includes(`${w.book}-${w.lesson}`)).length;
    const isQuizDisabled = selectedWordCount === 0;
    const [expandedBooks, setExpandedBooks] = useState([]); 

    const toggleBookExpand = (book) => setExpandedBooks(prev => prev.includes(book) ? prev.filter(b => b !== book) : [...prev, book]);
    const toggleUnit = (book, lesson) => setSettings(prev => ({ ...prev, selectedUnits: prev.selectedUnits.includes(`${book}-${lesson}`) ? prev.selectedUnits.filter(u => u !== `${book}-${lesson}`) : [...prev.selectedUnits, `${book}-${lesson}`] }));
    const selectAllInBook = (book) => {
        const allUnits = Array.from(groupedUnits[book]).map(l => `${book}-${l}`);
        setSettings(prev => ({ ...prev, selectedUnits: allUnits.every(u => prev.selectedUnits.includes(u)) ? prev.selectedUnits.filter(u => !u.startsWith(`${book}-`)) : [...new Set([...prev.selectedUnits, ...allUnits])] }));
    };

    return (
        <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 animate-[fadeIn_0.5s_ease-out]">
            <header className="mb-6 sm:mb-8 text-center relative">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-600 dark:text-blue-400 mb-2">霧臺國小 英文學習平台</h1>
                <p className="text-sm text-slate-500">雲端題庫已載入：共 {wordDatabase.length} 個單字</p>
                <div className="mt-6 flex justify-center">
                    <button onClick={() => onNavigate('leaderboard')} className="group flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-yellow-950 font-black rounded-full shadow-lg transition-transform hover:scale-105">
                        <i className="fa-solid fa-trophy text-xl text-yellow-100"></i> <span className="text-lg">看全校英雄榜</span>
                    </button>
                </div>
            </header>

            <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-4 sm:p-6 mb-8">
                <div className="flex flex-col sm:flex-row justify-between mb-4 gap-4">
                    <h2 className="flex items-center gap-2 text-blue-600 font-bold text-lg"><i className="fa-solid fa-gear text-xl"></i> 1. 設定複習範圍</h2>
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSettings(s => ({ ...s, selectedUnits: wordDatabase.map(w => `${w.book}-${w.lesson}`) }))} className="text-sm font-bold text-slate-500 hover:text-blue-600">全選</button>
                        <button onClick={() => setSettings(s => ({ ...s, selectedUnits: [] }))} className="text-sm font-bold text-slate-500 hover:text-red-500">清空</button>
                        <div className={`text-sm font-bold px-3 py-1 rounded-full ${isQuizDisabled ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>已選 {selectedWordCount} 字</div>
                    </div>
                </div>

                <div className="space-y-3">
                    {Object.keys(groupedUnits).sort((a,b)=>a-b).map(book => {
                        const allUnits = Array.from(groupedUnits[book]).map(l => `${book}-${l}`);
                        const isFull = allUnits.every(u => settings.selectedUnits.includes(u));
                        const isPart = allUnits.some(u => settings.selectedUnits.includes(u)) && !isFull;
                        const isExp = expandedBooks.includes(book);
                        return (
                            <div key={book} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                                <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => toggleBookExpand(book)}>
                                    <div className="flex items-center gap-3"><i className={`fa-solid fa-chevron-${isExp ? 'up' : 'down'} text-slate-400 w-4`}></i><h3 className="font-bold text-lg">第 {book} 冊</h3>{(isFull || isPart) && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}</div>
                                    <button onClick={(e) => { e.stopPropagation(); selectAllInBook(book); }} className={`text-xs font-bold px-3 py-1.5 rounded-full ${isFull ? 'bg-indigo-100 text-indigo-700' : isPart ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{isFull ? '取消全冊' : '全選此冊'}</button>
                                </div>
                                {isExp && (
                                    <div className="p-3 pt-0 border-t border-slate-100 flex flex-wrap gap-2">
                                        {Array.from(groupedUnits[book]).sort((a,b) => getLessonWeight(a) - getLessonWeight(b)).map(lesson => (
                                            <button key={`${book}-${lesson}`} onClick={() => toggleUnit(book, lesson)} className={`px-4 py-2 rounded-xl text-sm font-bold border-2 ${settings.selectedUnits.includes(`${book}-${lesson}`) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{typeof lesson === 'number' ? `第 ${lesson} 課` : lesson}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="pt-4 flex flex-col lg:flex-row justify-between gap-4">
                        <div className="shrink-0">
                            <label className="text-sm font-semibold text-slate-500 mb-2 block">每次出題數量</label>
                            <select className="p-3 w-full sm:w-64 border rounded-xl bg-slate-50 font-semibold" value={settings.count} onChange={(e) => setSettings({...settings, count: e.target.value})}>
                                <option value="5">隨機 5 題</option><option value="10">隨機 10 題</option><option value="20">隨機 20 題</option><option value="all">範圍內全部題目</option>
                            </select>
                        </div>
                        <div className="flex-1 flex items-end justify-end">
                            {qualifyingBook !== null ? 
                                <div className="text-sm font-bold px-4 py-3 rounded-xl bg-yellow-50 text-yellow-600 border border-yellow-200 flex items-center gap-2"><i className="fa-solid fa-star"></i> 🎯 範圍達標！選擇「20題」或「全部」即可上榜</div> : 
                                <div className="text-xs sm:text-sm font-medium px-4 py-3 rounded-xl bg-slate-100 text-slate-500 border flex items-center gap-2"><i className="fa-solid fa-circle-info"></i> 須單冊選滿 2 個單元 (或 20 字) 才能挑戰榮譽榜。</div>
                            }
                        </div>
                    </div>
                </div>
            </section>

            <section className="mb-8">
                <div className="flex items-center gap-2 mb-4 px-2">
                    <i className="fa-solid fa-fire text-red-500 text-xl"></i>
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">2. 多人連線對戰</h2>
                </div>
                <div className="mb-8">
                    <button onClick={() => onNavigate('battle')} className="w-full rounded-3xl p-6 sm:p-8 flex items-center justify-between transition-all bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 hover:shadow-2xl hover:shadow-red-500/20 border border-slate-700 group">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all"><i className="fa-solid fa-swords text-3xl"></i></div>
                            <div className="text-left">
                                <h3 className="font-black text-2xl text-white mb-1 tracking-wide">星際地平線死鬥 <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full ml-2 align-middle">BETA</span></h3>
                                <p className="text-slate-400 font-medium text-sm">2~4 人區網對戰，支援陷害與防線拔河，活到最後即是贏家！</p>
                            </div>
                        </div>
                        <i className="fa-solid fa-chevron-right text-slate-500 text-2xl group-hover:text-red-400 group-hover:translate-x-2 transition-transform hidden sm:block"></i>
                    </button>
                </div>

                <div className="flex items-center gap-2 mb-4 px-2">
                    <i className="fa-solid fa-rocket text-indigo-500 text-xl"></i>
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">3. 單人挑戰模式</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <button onClick={() => onNavigate('meteor', 'zh-en')} disabled={isQuizDisabled} className={`rounded-2xl p-5 border-2 flex flex-col items-center text-center gap-3 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-slate-800 border-slate-700 hover:border-indigo-400 hover:shadow-lg text-white'}`}>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-indigo-500 text-white"><i className="fa-solid fa-meteor text-2xl"></i></div>
                        <div><h3 className="font-bold">看中文選英文</h3><p className="text-xs text-slate-300 mt-1">單機生存，挑戰排行榜</p></div>
                    </button>
                    <button onClick={() => onNavigate('meteor', 'en-zh')} disabled={isQuizDisabled} className={`rounded-2xl p-5 border-2 flex flex-col items-center text-center gap-3 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-slate-800 border-slate-700 hover:border-emerald-400 hover:shadow-lg text-white'}`}>
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-emerald-500 text-white"><i className="fa-solid fa-meteor text-2xl"></i></div>
                        <div><h3 className="font-bold">看英文選中文</h3><p className="text-xs text-slate-300 mt-1">單機生存，挑戰排行榜</p></div>
                    </button>
                    <button onClick={() => onNavigate('meteor', 'abc')} className="rounded-2xl p-5 border-2 flex flex-col items-center text-center gap-3 transition-all bg-gradient-to-br from-yellow-400 to-orange-500 hover:scale-105 hover:shadow-lg text-white border-transparent">
                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/20 text-white"><i className="fa-solid fa-font text-2xl"></i></div>
                        <div><h3 className="font-bold">ABC 大小寫防衛戰</h3><p className="text-xs text-orange-100 mt-1">一二年級專屬，直接玩</p></div>
                    </button>
                </div>

                <h2 className="text-lg font-bold text-slate-700 mb-4 px-2">3. 傳統測驗與遊戲</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button onClick={() => onNavigate('spelling')} disabled={isQuizDisabled} className={`rounded-2xl p-4 border-2 flex flex-col items-center text-center gap-2 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-pink-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isQuizDisabled ? 'bg-slate-200' : 'bg-pink-100 text-pink-600'}`}><i className="fa-solid fa-puzzle-piece"></i></div>
                        <div><h3 className="font-bold text-sm">拖曳拼字</h3></div>
                    </button>
                    <button onClick={() => onNavigate('zh-en')} disabled={isQuizDisabled} className={`rounded-2xl p-4 border-2 flex flex-col items-center text-center gap-2 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-blue-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isQuizDisabled ? 'bg-slate-200' : 'bg-blue-100 text-blue-600'}`}><i className="fa-solid fa-keyboard"></i></div>
                        <div><h3 className="font-bold text-sm">中翻英打字</h3></div>
                    </button>
                    <button onClick={() => onNavigate('en-zh')} disabled={isQuizDisabled} className={`rounded-2xl p-4 border-2 flex flex-col items-center text-center gap-2 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-emerald-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isQuizDisabled ? 'bg-slate-200' : 'bg-emerald-100 text-emerald-600'}`}><i className="fa-solid fa-language"></i></div>
                        <div><h3 className="font-bold text-sm">英翻中打字</h3></div>
                    </button>
                    <button onClick={() => onNavigate('listening')} disabled={isQuizDisabled} className={`rounded-2xl p-4 border-2 flex flex-col items-center text-center gap-2 transition-all ${isQuizDisabled ? 'bg-slate-100 opacity-50' : 'bg-white hover:border-purple-300'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isQuizDisabled ? 'bg-slate-200' : 'bg-purple-100 text-purple-600'}`}><i className="fa-solid fa-volume-high"></i></div>
                        <div><h3 className="font-bold text-sm">聽力測驗</h3></div>
                 </button>
             </div>
         </section>

         {/* 加入底部 QR Code 方便學生掃描 */}
         <footer className="mt-4 flex flex-col items-center justify-center text-slate-400 pb-8">
             <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-200 mb-2 transition-transform hover:scale-110">
                 <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://u864001.github.io/vedaivocab/" alt="Game QR Code" className="w-20 h-20 opacity-80" />
             </div>
             <p className="text-xs font-bold"><i className="fa-solid fa-qrcode"></i> 掃描 QR Code 快速加入遊戲</p>
         </footer>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
 root.render(<App />);
