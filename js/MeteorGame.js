function MeteorGame({ subMode, onBack, settings, wordDatabase, qualifyingBook, onSaveScore }) {
    const [queue, setQueue] = useState([]);
    const [currentMeteor, setCurrentMeteor] = useState(null); 
    const [options, setOptions] = useState([]);
    const [lives, setLives] = useState(3);
    const [score, setScore] = useState(0);
    const [hasStarted, setHasStarted] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    
    const [playerName, setPlayerName] = useState('');
    const [nameError, setNameError] = useState('');
    const [scoreSaved, setScoreSaved] = useState(false);
    
    const containerRef = useRef(null);
    const meteorRef = useRef(null); 
    
    const gameStartTimeRef = useRef(null);
    const finalSurvivalTimeRef = useRef(0);

    useEffect(() => {
        let db = [];
        if (subMode === 'abc') {
            const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
            db = ALPHABET.map((letter, i) => ({
                id: `abc-${i}`, book: 'ABC', lesson: 0,
                en: letter, zh: letter.toLowerCase() 
            }));
        } else {
            db = wordDatabase.filter(w => settings.selectedUnits.includes(`${w.book}-${w.lesson}`));
        }

        let shuffled = [...db].sort(() => 0.5 - Math.random());
        if (settings.count !== 'all' && subMode !== 'abc') {
            shuffled = shuffled.slice(0, parseInt(settings.count, 10));
        }
        setQueue(shuffled);
    }, [settings, wordDatabase, subMode]);

    const generateOptions = (correctWord, fullDb) => {
        const ansKey = subMode === 'en-zh' ? 'zh' : (subMode === 'abc' ? 'zh' : 'en');
        const correctAns = correctWord[ansKey];
        
        let pool = fullDb.map(w => w[ansKey]).filter(a => a !== correctAns);
        pool = [...new Set(pool)].sort(() => 0.5 - Math.random()).slice(0, 3);
        
        const finalOptions = [...pool, correctAns].map(opt => ({
            text: opt,
            isCorrect: opt === correctAns,
            id: Math.random().toString()
        })).sort(() => 0.5 - Math.random());
        
        setOptions(finalOptions);
    };

    const spawnMeteor = (wordObj) => {
        const dropDuration = Math.max(1.5, 5 - (score * 0.15)); 
        const xPos = 10 + Math.random() * 80; 

        setCurrentMeteor({
            wordObj,
            x: xPos,
            duration: dropDuration,
            isExploding: false,
            id: Date.now()
        });
        
        if (subMode !== 'zh-en' && subMode !== 'abc') playAudio(wordObj.en);
    };

    const handleStart = () => {
        if (queue.length === 0) return onBack();
        setHasStarted(true);
        setLives(3);
        setScore(0);
        gameStartTimeRef.current = performance.now(); 
        
        const firstWord = queue[0];
        generateOptions(firstWord, subMode === 'abc' ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('').map(l => ({zh: l.toLowerCase()})) : wordDatabase);
        spawnMeteor(firstWord);
    };

    useEffect(() => {
        if (!hasStarted || isFinished || !currentMeteor || currentMeteor.isExploding) return;

        let start = performance.now();
        let animationFrameId;

        const drop = (now) => {
            const elapsed = (now - start) / 1000; 
            const progress = Math.min(elapsed / currentMeteor.duration, 1);
            
            const easeInProgress = progress * progress;
            const currentY = -15 + (easeInProgress * 100); 

            if (meteorRef.current) {
                meteorRef.current.style.top = `${currentY}%`;
            }

            if (progress >= 1) {
                handleMiss();
            } else {
                animationFrameId = requestAnimationFrame(drop);
            }
        };

        animationFrameId = requestAnimationFrame(drop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [currentMeteor, hasStarted, isFinished]);

    const handleMiss = () => {
        soundEngine.wrong();
        if(containerRef.current) {
            containerRef.current.classList.add('animate-[shake_0.5s_ease-in-out]');
            setTimeout(() => containerRef.current?.classList.remove('animate-[shake_0.5s_ease-in-out]'), 500);
        }
        
        setCurrentMeteor(prev => ({ ...prev, isExploding: true }));
        
        setLives(l => {
            const newLives = l - 1;
            if (newLives <= 0) {
                finalSurvivalTimeRef.current = Math.floor((performance.now() - gameStartTimeRef.current) / 1000);
                setTimeout(() => setIsFinished(true), 1000);
            } else {
                setTimeout(() => nextTurn(), 1000);
            }
            return newLives;
        });
    };

    const handleShoot = (opt, e) => {
        if (!currentMeteor || currentMeteor.isExploding) return;

        soundEngine.laser(); 

        if (opt.isCorrect) {
            soundEngine.explosion(); 
            setScore(s => s + 1);
            setCurrentMeteor(prev => ({ ...prev, isExploding: true }));
            
            if(meteorRef.current && containerRef.current) {
                const rect = meteorRef.current.getBoundingClientRect();
                const x = (rect.left + rect.width / 2) / window.innerWidth;
                const y = (rect.top + rect.height / 2) / window.innerHeight;
                confetti({ particleCount: 40, spread: 60, origin: { x, y }, colors: ['#f87171', '#fbbf24', '#facc15'] });
            }

            setTimeout(() => nextTurn(), 800);
        } else {
            handleMiss();
        }
    };

    const nextTurn = () => {
        const newQueue = [...queue];
        newQueue.shift();
        if (newQueue.length > 0) {
            setQueue(newQueue);
            const nextWord = newQueue[0];
            generateOptions(nextWord, subMode === 'abc' ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('').map(l => ({zh: l.toLowerCase()})) : wordDatabase);
            spawnMeteor(nextWord);
        } else {
            finalSurvivalTimeRef.current = Math.floor((performance.now() - gameStartTimeRef.current) / 1000);
            setIsFinished(true);
            soundEngine.win();
        }
    };

    const submitToLeaderboard = () => {
        if (!isValidName(playerName)) { setNameError('請輸入正確的姓名格式'); return; }
        if (containsProfanity(playerName)) { setNameError('請勿使用不雅字眼'); return; }
        const realBook = subMode === 'abc' ? 'ABC' : qualifyingBook;
        onSaveScore({ book: realBook, mode: `meteor-${subMode}`, name: playerName.trim(), score: score, time: finalSurvivalTimeRef.current, week: getWeekNumber(), timestamp: Date.now() });
        setScoreSaved(true);
    };

    if (!hasStarted) return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900"><div className="bg-slate-800 rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-700"><div className="w-20 h-20 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6"><i className="fa-solid fa-meteor text-4xl"></i></div><h2 className="text-3xl font-bold mb-4 text-white">太空隕石防衛戰</h2><p className="text-slate-400 mb-8 font-medium">看準掉落的隕石單字，<br/>在下方炮台選擇正確翻譯擊碎它！<br/><br/><span className="text-orange-400 font-bold text-sm block"><i className="fa-solid fa-volume-high"></i> 請開啟聲音體驗最佳效果！</span></p><button onClick={handleStart} className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold text-lg shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-transform hover:scale-105">發射升空</button><button onClick={onBack} className="w-full mt-4 py-3 text-slate-500 hover:text-slate-300 font-semibold">返回基地</button></div></div>
    );

    if (isFinished) {
        const canRank = subMode === 'abc' || qualifyingBook !== null;
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900"><div className="bg-slate-800 rounded-3xl shadow-xl p-10 max-w-md w-full text-center relative overflow-hidden border border-slate-700"><i className="fa-solid fa-trophy text-yellow-400 mb-6 text-6xl drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]"></i><h2 className="text-3xl font-bold mb-2 text-white">防衛結束！</h2><p className="text-slate-400 mb-4">成功擊毀：<span className="font-bold text-indigo-400 text-xl">{score} 顆隕石</span></p><p className="text-slate-500 text-sm mb-6">總生存時間：{finalSurvivalTimeRef.current} 秒</p>{canRank && !scoreSaved ? (<div className="mt-4 mb-8 p-5 bg-slate-900/50 rounded-2xl border border-yellow-500/30"><h3 className="font-black text-yellow-500 mb-3"><i className="fa-solid fa-crown"></i> 獲得銀河榜單資格！</h3><input type="text" value={playerName} onChange={e => {setPlayerName(e.target.value); setNameError('');}} placeholder="輸入指揮官姓名" className="w-full p-3 rounded-xl border-2 border-slate-600 bg-slate-800 text-white outline-none focus:border-yellow-500 text-center mb-2 font-bold" onKeyDown={e => e.key === 'Enter' && submitToLeaderboard()} />{nameError && <p className="text-red-400 text-sm mb-3 font-bold">{nameError}</p>}<button onClick={submitToLeaderboard} className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-yellow-950 font-black rounded-xl shadow-md hover:scale-105">登錄戰績</button></div>) : scoreSaved ? (<div className="mb-8 p-4 bg-emerald-900/30 text-emerald-400 rounded-2xl font-bold border border-emerald-800"><i className="fa-solid fa-circle-check text-xl"></i> 戰績已同步！</div>) : null}<button onClick={onBack} className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors">返回大廳</button></div></div>
        );
    }

    return (
        <div className="flex-1 flex flex-col w-full h-[100dvh] bg-slate-900 overflow-hidden no-select">
            <header className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur z-20 text-white border-b border-slate-800 shrink-0">
                <button onClick={onBack} className="text-slate-400 hover:text-white"><i className="fa-solid fa-chevron-left"></i> 撤退</button>
                <div className="font-black text-xl text-indigo-400 tracking-wider">SCORE: {score}</div>
                <div className="flex gap-1 text-red-500">
                    {[...Array(3)].map((_, i) => <i key={i} className={`fa-solid fa-heart ${i < lives ? '' : 'text-slate-700'}`}></i>)}
                </div>
            </header>
            <main ref={containerRef} className="flex-1 relative w-full stars-bg">
                {currentMeteor && (
                    <div 
                        ref={meteorRef}
                        className="absolute transform -translate-x-1/2 flex flex-col items-center justify-center" 
                        style={{ left: `${currentMeteor.x}%`, top: '-15%' }} 
                    >
                        {currentMeteor.isExploding ? (
                            <div className="text-5xl animate-[ping_0.3s_ease-out_forwards] text-orange-500"><i className="fa-solid fa-explosion"></i></div>
                        ) : (
                            <div className="relative group cursor-pointer" onClick={() => playAudio(currentMeteor.wordObj.en)}>
                                <div className="absolute inset-0 bg-orange-500 rounded-full blur-md opacity-50 animate-pulse"></div>
                                <div className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col items-center">
                                    <i className="fa-solid fa-meteor text-orange-400 text-2xl sm:text-3xl mb-2 absolute -top-4"></i>
                                    <span className="text-2xl sm:text-4xl font-black text-white whitespace-nowrap">
                                        {subMode === 'zh-en' ? currentMeteor.wordObj.zh : currentMeteor.wordObj.en}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className="absolute bottom-0 w-full h-8 bg-gradient-to-t from-indigo-500/20 to-transparent border-t border-indigo-500/30"></div>
            </main>
            <footer className="w-full bg-slate-950 p-4 pb-8 sm:p-6 shrink-0 z-20 border-t border-slate-800">
                <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3 sm:gap-4">
                    {options.map((opt) => (
                        <button key={opt.id} onClick={(e) => handleShoot(opt, e)} className="relative overflow-hidden group bg-slate-800 border-2 border-slate-700 hover:border-indigo-500 rounded-xl p-4 sm:p-6 active:scale-95 transition-all">
                            <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <span className="relative text-xl sm:text-2xl font-bold text-white block truncate">{opt.text}</span>
                        </button>
                    ))}
                </div>
            </footer>
            <style dangerouslySetInnerHTML={{__html: `@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px) rotate(-2deg); } 50% { transform: translateX(10px) rotate(2deg); } 75% { transform: translateX(-10px) rotate(-2deg); } }`}} />
        </div>
    );
}
