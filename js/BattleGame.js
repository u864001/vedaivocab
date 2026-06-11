function BattleGame({ onBack, wordDatabase, dbRef, user }) {
    const [view, setView] = useState('menu'); // 'menu' | 'waiting' | 'playing' | 'result'
    const [playerName, setPlayerName] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    useEffect(() => {
        if (!roomData?.id || !dbRef) return;
        const unsubscribe = dbRef.collection('rooms').doc(roomData.id).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                setRoomData({ id: doc.id, ...data });
                if (data.status === 'playing' && view === 'waiting') setView('playing');
                if (data.status === 'finished' && view === 'playing') setView('result');
            } else {
                alert('房間已關閉或解散！');
                onBack();
            }
        });
        return () => unsubscribe();
    }, [roomData?.id, dbRef, view, onBack]);

    const handleCreateRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入有效暱稱');
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');
        setErrorMsg('');
        const newCode = Math.floor(1000 + Math.random() * 9000).toString();
        const initialRoom = {
            code: newCode, status: 'waiting', createdAt: Date.now(), hostId: user.uid,
            players: { [user.uid]: { name: playerName, isHost: true, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 } }
        };
        try {
            const docRef = await dbRef.collection('rooms').add(initialRoom);
            setRoomData({ id: docRef.id, ...initialRoom });
            setView('waiting');
        } catch (e) { setErrorMsg('建立房間失敗'); }
    };

    const handleJoinRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入有效暱稱');
        if (roomCodeInput.length !== 4) return setErrorMsg('請輸入 4 位數房號');
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');
        setErrorMsg('');
        try {
            const snapshot = await dbRef.collection('rooms').where('code', '==', roomCodeInput).where('status', '==', 'waiting').get();
            if (snapshot.empty) return setErrorMsg('找不到該房間');
            const roomDoc = snapshot.docs[0];
            const data = roomDoc.data();
            if (Object.keys(data.players).length >= 4) return setErrorMsg('房間已滿 (上限 4 人)');
            
            await dbRef.collection('rooms').doc(roomDoc.id).update({
                [`players.${user.uid}`]: { name: playerName, isHost: false, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 }
            });
            setRoomData({ id: roomDoc.id, ...data });
            setView('waiting');
        } catch (e) { setErrorMsg('加入房間失敗'); }
    };

    const handleStartGame = async () => {
        if (roomData?.hostId === user?.uid && dbRef) {
            await dbRef.collection('rooms').doc(roomData.id).update({ status: 'playing', startTime: Date.now() });
        }
    };

    const handleLeaveRoom = async () => {
        if (roomData?.id && dbRef && user) {
            if (roomData.hostId === user.uid) await dbRef.collection('rooms').doc(roomData.id).delete();
            else await dbRef.collection('rooms').doc(roomData.id).update({ [`players.${user.uid}`]: firebase.firestore.FieldValue.delete() });
        }
        onBack();
    };

    if (view === 'menu') return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 animate-[fadeIn_0.5s_ease-out]">
            <div className="bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full border border-slate-700">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><i className="fa-solid fa-fire-flame-curved text-3xl"></i></div>
                    <h2 className="text-3xl font-black text-white">區域連線對戰</h2>
                    <p className="text-slate-400 text-sm mt-2">最多 4 人，3 分鐘地平線死鬥</p>
                </div>
                <div className="space-y-4">
                    <input type="text" value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="輸入您的稱呼" className="w-full p-4 rounded-xl bg-slate-900 border-2 border-slate-600 text-white font-bold text-center focus:border-red-500 outline-none" />
                    {errorMsg && <p className="text-red-400 font-bold text-sm text-center animate-bounce">{errorMsg}</p>}
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <button onClick={handleCreateRoom} className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black shadow-lg shadow-red-600/30 transition-transform hover:scale-105">創建房間</button>
                        <div className="flex flex-col gap-2">
                            <input type="text" maxLength="4" value={roomCodeInput} onChange={e=>setRoomCodeInput(e.target.value.replace(/\D/g, ''))} placeholder="4位數房號" className="w-full p-3 rounded-xl bg-slate-900 border-2 border-slate-600 text-white font-black text-center tracking-widest outline-none focus:border-blue-500" />
                            <button onClick={handleJoinRoom} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black shadow-lg shadow-blue-600/30 transition-transform hover:scale-105">加入房間</button>
                        </div>
                    </div>
                    <button onClick={onBack} className="w-full mt-4 p-3 text-slate-500 hover:text-slate-300 font-bold">返回大廳</button>
                </div>
            </div>
        </div>
    );

    if (view === 'waiting') {
        const playersList = roomData?.players ? Object.values(roomData.players) : [];
        const isHost = roomData?.hostId === user?.uid;
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 animate-[fadeIn_0.5s_ease-out]">
                <div className="bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full border border-slate-700 text-center">
                    <h2 className="text-2xl font-bold text-slate-300 mb-2">房間代碼</h2>
                    <div className="text-6xl font-black text-white tracking-[0.2em] mb-8 bg-slate-900 py-4 rounded-2xl border border-slate-700 shadow-inner">{roomData?.code}</div>
                    <h3 className="text-left font-bold text-slate-400 mb-3">已加入玩家 ({playersList.length}/4)</h3>
                    <div className="space-y-2 mb-8 min-h-[160px]">
                        {playersList.map((p, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-700 p-4 rounded-xl border border-slate-600">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xl">{p.isHost ? '👑' : '🚀'}</div>
                                    <span className="font-bold text-lg text-white">{p.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {isHost ? (
                        <button onClick={handleStartGame} disabled={playersList.length < 2} className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl font-black text-xl shadow-lg hover:scale-105 disabled:opacity-50 transition-all">{playersList.length < 2 ? '等待對手加入...' : '開始對戰！'}</button>
                    ) : (
                        <div className="w-full py-4 bg-slate-700 text-slate-300 rounded-xl font-black text-xl flex items-center justify-center gap-3"><i className="fa-solid fa-spinner fa-spin"></i> 等待房主開始</div>
                    )}
                    <button onClick={handleLeaveRoom} className="w-full mt-4 text-slate-500 hover:text-red-400 font-bold">離開房間</button>
                </div>
            </div>
        );
    }

    if (view === 'playing') return <BattleArena roomData={roomData} dbRef={dbRef} user={user} wordDatabase={wordDatabase} />;
    
    if (view === 'result') {
        const ranks = Object.values(roomData.players).sort((a, b) => {
            if (a.isDead !== b.isDead) return a.isDead ? 1 : -1; // 活著的優先
            if (b.lives !== a.lives) return b.lives - a.lives;   // 比血量
            return b.score - a.score;                            // 比分數
        });
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 animate-[fadeIn_0.5s_ease-out]">
                <div className="bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full border border-slate-700 text-center">
                    <i className="fa-solid fa-trophy text-yellow-500 text-6xl mb-6"></i>
                    <h2 className="text-3xl font-black text-white mb-6">對戰結算</h2>
                    <div className="space-y-3 mb-8">
                        {ranks.map((p, i) => (
                            <div key={i} className={`flex items-center justify-between p-4 rounded-xl font-bold ${i === 0 ? 'bg-yellow-500/20 border-2 border-yellow-500 text-yellow-400' : 'bg-slate-700 text-white border border-slate-600'}`}>
                                <div className="flex gap-4"><span>#{i+1}</span><span>{p.name}</span></div>
                                <div className="flex gap-4 text-sm">
                                    <span className={p.isDead ? 'text-red-500' : 'text-emerald-400'}><i className="fa-solid fa-heart"></i> {p.lives}</span>
                                    <span className="text-blue-400"><i className="fa-solid fa-star"></i> {p.score}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={onBack} className="w-full py-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl font-black">返回大廳</button>
                </div>
            </div>
        );
    }
}

// ==========================================
// 對戰引擎核心：星際地平線死鬥
// ==========================================
function BattleArena({ roomData, dbRef, user, wordDatabase }) {
    const [queue, setQueue] = useState([]);
    const [currentMeteor, setCurrentMeteor] = useState(null);
    const [options, setOptions] = useState([]);
    
    // 本地狀態
    const [timeLeft, setTimeLeft] = useState(180); // 3分鐘
    const [myState, setMyState] = useState({ score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 });
    const [prevTotalAttacks, setPrevTotalAttacks] = useState(0);
    
    const meteorRef = useRef(null);
    const containerRef = useRef(null);

    // 1. 初始化題庫 (英選中模式)
    useEffect(() => {
        let db = wordDatabase.sort(() => 0.5 - Math.random()).slice(0, 150); // 準備充足的題目
        setQueue(db);
    }, [wordDatabase]);

    // 2. 監聽對手攻擊信號，提升我的地平線
    useEffect(() => {
        if (!roomData?.players) return;
        let currentTotalAttacks = 0;
        Object.keys(roomData.players).forEach(uid => {
            if (uid !== user.uid) currentTotalAttacks += roomData.players[uid].attacks;
        });
        
        if (currentTotalAttacks > prevTotalAttacks && !myState.isDead) {
            // 被攻擊了！地平線上升 (最高 3)
            setMyState(prev => ({ ...prev, horizon: Math.min(3, prev.horizon + 1) }));
            soundEngine.explosion(); // 播放警報聲
            if(containerRef.current) {
                containerRef.current.classList.add('animate-[shake_0.5s_ease-in-out]');
                containerRef.current.style.boxShadow = 'inset 0 0 50px rgba(239,68,68,0.5)';
                setTimeout(() => {
                    containerRef.current?.classList.remove('animate-[shake_0.5s_ease-in-out]');
                    if(containerRef.current) containerRef.current.style.boxShadow = 'none';
                }, 500);
            }
        }
        setPrevTotalAttacks(currentTotalAttacks);
    }, [roomData, user.uid, myState.isDead]);

    // 3. 將我的狀態同步到 Firebase (節流處理：只在數值改變時同步)
    useEffect(() => {
        if (!dbRef || !user) return;
        dbRef.collection('rooms').doc(roomData.id).update({
            [`players.${user.uid}`]: myState
        }).catch(()=>{});
    }, [myState.score, myState.lives, myState.combo, myState.horizon, myState.attacks]); // 只依賴這些關鍵值的變化

    // 4. 倒數計時與結束判定
    useEffect(() => {
        if (timeLeft <= 0 || myState.isDead) return;
        const timer = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1 && roomData.hostId === user.uid) {
                    dbRef.collection('rooms').doc(roomData.id).update({ status: 'finished' });
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft, myState.isDead, roomData.hostId, roomData.id, dbRef, user.uid]);

    // 生成題目
    const generateOptions = (word) => {
        let pool = wordDatabase.map(w => w.zh).filter(a => a !== word.zh);
        pool = [...new Set(pool)].sort(() => 0.5 - Math.random()).slice(0, 3);
        const finalOptions = [...pool, word.zh].map(opt => ({ text: opt, isCorrect: opt === word.zh, id: Math.random() })).sort(() => 0.5 - Math.random());
        setOptions(finalOptions);
    };

    const spawnMeteor = (wordObj) => {
        // 地平線越高，掉落時間越短 (5秒 -> 4秒 -> 3秒 -> 2.5秒)
        const dropDuration = Math.max(2.5, 5 - (myState.horizon * 0.8)); 
        setCurrentMeteor({ wordObj, x: 10 + Math.random() * 80, duration: dropDuration, isExploding: false, startTime: performance.now() });
        playAudio(wordObj.en);
    };

    // 遊戲主迴圈 (初次發射)
    useEffect(() => {
        if (queue.length > 0 && !currentMeteor && !myState.isDead) {
            generateOptions(queue[0]);
            spawnMeteor(queue[0]);
        }
    }, [queue, currentMeteor, myState.isDead]);

    // 隕石掉落動畫
    useEffect(() => {
        if (!currentMeteor || currentMeteor.isExploding || myState.isDead) return;
        let animationFrameId;
        const drop = (now) => {
            const elapsed = (now - currentMeteor.startTime) / 1000;
            const progress = Math.min(elapsed / currentMeteor.duration, 1);
            
            // 地平線越高，底部終點就越高 (原本是跑到 100%，現在 horizon=3 時只跑到 70%)
            const bottomLimit = 100 - (myState.horizon * 10);
            const easeInProgress = progress * progress;
            const currentY = -15 + (easeInProgress * (bottomLimit + 15)); 

            if (meteorRef.current) meteorRef.current.style.top = `${currentY}%`;

            if (progress >= 1) handleMiss();
            else animationFrameId = requestAnimationFrame(drop);
        };
        animationFrameId = requestAnimationFrame(drop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [currentMeteor, myState.isDead, myState.horizon]);

    const handleMiss = () => {
        soundEngine.wrong();
        setCurrentMeteor(prev => ({ ...prev, isExploding: true }));
        setMyState(prev => {
            const newLives = prev.lives - 1;
            return { ...prev, lives: newLives, combo: 0, isDead: newLives <= 0 };
        });
        setTimeout(nextTurn, 500);
    };

    const handleShoot = (opt) => {
        if (!currentMeteor || currentMeteor.isExploding || myState.isDead) return;
        soundEngine.laser();
        
        if (opt.isCorrect) {
            soundEngine.explosion();
            setCurrentMeteor(prev => ({ ...prev, isExploding: true }));
            
            setMyState(prev => {
                let newCombo = prev.combo + 1;
                let newHorizon = prev.horizon;
                let newAttacks = prev.attacks;
                let extraScore = 0;
                
                // 發動陷害絕招！(Combo 3)
                if (newCombo >= 3) {
                    newCombo = 0; // 重新計算
                    newAttacks += 1; // 增加攻擊次數，送給對手
                    newHorizon = Math.max(0, prev.horizon - 1); // 自己的防線往下壓回一層！
                    extraScore = 5; // 攻擊額外加分
                }
                
                return { ...prev, score: prev.score + 1 + extraScore, combo: newCombo, horizon: newHorizon, attacks: newAttacks };
            });
            setTimeout(nextTurn, 400);
        } else {
            handleMiss();
        }
    };

    const nextTurn = () => {
        setQueue(prev => {
            const newQ = [...prev];
            newQ.shift();
            return newQ;
        });
        setCurrentMeteor(null);
    };

    // 觀戰模式與正常遊戲畫面
    const otherPlayers = Object.values(roomData.players || {}).filter(p => p.name !== myState.name);

    return (
        <div className="flex-1 flex flex-col w-full h-[100dvh] bg-slate-900 overflow-hidden no-select font-sans relative">
            {/* 頂部：對手狀態列 (非常適合互相觀察) */}
            <header className="bg-slate-950 border-b border-slate-800 p-2 flex justify-around items-center shrink-0 z-20">
                <div className="text-white font-mono font-black text-xl bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
                {otherPlayers.map((p, i) => (
                    <div key={i} className={`flex flex-col items-center px-3 ${p.isDead ? 'opacity-30 grayscale' : ''}`}>
                        <span className="text-xs font-bold text-slate-400 mb-1">{p.name}</span>
                        <div className="flex gap-1">
                            <span className="text-red-500 text-xs"><i className="fa-solid fa-heart"></i> {p.lives}</span>
                            <span className="text-orange-400 text-xs ml-1"><i className="fa-solid fa-fire"></i> {p.combo}</span>
                        </div>
                        {/* 對手的地平線視覺化小條 */}
                        <div className="w-full h-1 bg-slate-800 mt-1 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all" style={{ width: `${(p.horizon / 3) * 100}%` }}></div>
                        </div>
                    </div>
                ))}
            </header>

            {/* 中間：遊戲區 (含地平線特效) */}
            <main ref={containerRef} className="flex-1 relative w-full stars-bg overflow-hidden transition-all duration-300">
                {/* 地平線上升的特效區塊 (防線過載) */}
                <div className="absolute bottom-0 w-full bg-gradient-to-t from-red-600/80 to-transparent transition-all duration-500 z-10" style={{ height: `${myState.horizon * 15}%` }}>
                    {myState.horizon > 0 && <div className="absolute top-0 w-full text-center text-red-200 font-black tracking-widest text-sm opacity-50"><i className="fa-solid fa-triangle-exclamation animate-pulse"></i> 防線壓迫中</div>}
                </div>

                {myState.isDead && (
                    <div className="absolute inset-0 z-30 bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm">
                        <h2 className="text-6xl font-black text-red-600 mb-4 drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]">YOU LOSE</h2>
                        <p className="text-slate-300 text-lg font-bold animate-pulse">連線未中斷，進入觀戰模式...</p>
                    </div>
                )}

                {currentMeteor && !myState.isDead && (
                    <div ref={meteorRef} className="absolute transform -translate-x-1/2 flex flex-col items-center z-20" style={{ left: `${currentMeteor.x}%`, top: '-15%' }}>
                        {currentMeteor.isExploding ? (
                            <div className="text-6xl animate-[ping_0.3s_ease-out_forwards] text-orange-500"><i className="fa-solid fa-explosion"></i></div>
                        ) : (
                            <div className="relative group cursor-pointer" onClick={() => playAudio(currentMeteor.wordObj.en)}>
                                <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-60 animate-pulse"></div>
                                <div className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-4 shadow-2xl flex flex-col items-center">
                                    <i className="fa-solid fa-meteor text-blue-400 text-3xl mb-1 absolute -top-5"></i>
                                    <span className="text-3xl font-black text-white whitespace-nowrap">{currentMeteor.wordObj.en}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* 底部：我的狀態與砲台 */}
            <footer className="w-full bg-slate-950 p-4 shrink-0 z-20 border-t-4 border-slate-800 relative">
                {/* 狀態儀表板 */}
                <div className="absolute -top-12 left-0 w-full px-4 flex justify-between items-end pointer-events-none">
                    <div className="bg-slate-900/90 border border-slate-700 px-4 py-2 rounded-t-xl flex gap-3 shadow-lg">
                        <span className="text-red-500 font-bold"><i className="fa-solid fa-heart"></i> {myState.lives}</span>
                        <span className="text-blue-400 font-bold"><i className="fa-solid fa-star"></i> {myState.score}</span>
                    </div>
                    <div className={`px-4 py-2 rounded-t-xl font-black text-lg shadow-lg transition-colors ${myState.combo >= 2 ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-900/90 border border-slate-700 text-slate-400'}`}>
                        COMBO {myState.combo}/3
                    </div>
                </div>

                <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3 mt-2">
                    {options.map((opt) => (
                        <button key={opt.id} disabled={myState.isDead} onClick={() => handleShoot(opt)} className="relative overflow-hidden bg-slate-800 border-2 border-slate-700 hover:border-blue-500 rounded-xl p-5 active:scale-95 transition-all disabled:opacity-50">
                            <span className="relative text-2xl font-bold text-white block truncate">{opt.text}</span>
                        </button>
                    ))}
                </div>
            </footer>
            <style dangerouslySetInnerHTML={{__html: `@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-15px) rotate(-3deg); } 50% { transform: translateX(15px) rotate(3deg); } 75% { transform: translateX(-15px) rotate(-3deg); } }`}} />
        </div>
    );
}
