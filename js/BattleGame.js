function BattleGame({ onBack, wordDatabase, dbRef, user, settings }) {
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
                // 支援中途加入與正常轉場
                if (data.status === 'playing' && view !== 'playing') setView('playing');
                if (data.status === 'finished' && view !== 'result') setView('result');
            } else {
                alert('房間已關閉或解散！');
                onBack();
            }
        });
        return () => unsubscribe();
    }, [roomData?.id, dbRef, view, onBack]);

    const handleCreateRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入 1~6 字有效暱稱');
        if (!settings?.selectedUnits || settings.selectedUnits.length === 0) {
            return setErrorMsg('關主請先回到主畫面勾選對戰的單字範圍！');
        }
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');
        
        setErrorMsg('');
        const newCode = Math.floor(1000 + Math.random() * 9000).toString();
        const initialRoom = {
            code: newCode, status: 'waiting', createdAt: Date.now(), hostId: user.uid,
            selectedUnits: settings.selectedUnits, // 將關主選的範圍打包上雲端
            players: { [user.uid]: { name: playerName.trim(), isHost: true, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 } }
        };
        try {
            const docRef = await dbRef.collection('rooms').add(initialRoom);
            setRoomData({ id: docRef.id, ...initialRoom });
            setView('waiting');
        } catch (e) { setErrorMsg('建立房間失敗'); }
    };

    const handleJoinRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入 1~6 字有效暱稱');
        if (roomCodeInput.length !== 4) return setErrorMsg('請輸入 4 位數房號');
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');
        setErrorMsg('');
        
        try {
            // 尋找房間 (不論是 waiting 還是 playing 都能找，用以支援斷線重連)
            const snapshot = await dbRef.collection('rooms').where('code', '==', roomCodeInput).get();
            if (snapshot.empty) return setErrorMsg('找不到該房間代碼');
            const roomDoc = snapshot.docs[0];
            const data = roomDoc.data();
            
            // 檢查是否是「斷線重連」的情況 (名字相同)
            const playersArr = Object.entries(data.players || {});
            const existingPlayerKey = playersArr.find(([uid, p]) => p.name === playerName.trim());
            
            if (existingPlayerKey) {
                // 找到了同名玩家，允許繼承該玩家狀態重回戰場！
                const oldUid = existingPlayerKey[0];
                const oldStatus = existingPlayerKey[1];
                
                // 如果 UID 不同 (代表重新整理換了匿名帳號)，先刪除舊的，寫入新的
                if (oldUid !== user.uid) {
                    await dbRef.collection('rooms').doc(roomDoc.id).update({
                        [`players.${oldUid}`]: firebase.firestore.FieldValue.delete(),
                        [`players.${user.uid}`]: { ...oldStatus, isDead: false } // 給予重連復活容錯
                    });
                }
                setRoomData({ id: roomDoc.id, ...data });
                setView(data.status === 'playing' ? 'playing' : 'waiting');
                return;
            }

            // 正常加入新玩家流程
            if (data.status === 'playing') return setErrorMsg('該對戰已開始，無法加入新玩家');
            if (playersArr.length >= 4) return setErrorMsg('房間已滿 (上限 4 人)');
            
            await dbRef.collection('rooms').doc(roomDoc.id).update({
                [`players.${user.uid}`]: { name: playerName.trim(), isHost: false, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 }
            });
            setRoomData({ id: roomDoc.id, ...data });
            setView('waiting');
        } catch (e) { setErrorMsg('加入房間失敗'); }
    };

    const handleStartGame = async () => {
        if (roomData?.hostId === user?.uid && dbRef) {
            setView('playing'); // 關主先行轉場，防卡住
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
                    <p className="text-slate-400 text-sm mt-2">隨開隨玩，支援斷線刷新重連</p>
                </div>
                <div className="space-y-4">
                    <input type="text" value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="輸入名字" className="w-full p-4 rounded-xl bg-slate-900 border-2 border-slate-600 text-white font-bold text-center focus:border-red-500 outline-none" />
                    {errorMsg && <p className="text-red-400 font-bold text-sm text-center animate-bounce">{errorMsg}</p>}
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <button onClick={handleCreateRoom} className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black shadow-lg shadow-red-600/30 transition-transform hover:scale-105">創建房間</button>
                        <div className="flex flex-col gap-2">
                            <input type="text" maxLength="4" value={roomCodeInput} onChange={e=>setRoomCodeInput(e.target.value.replace(/\D/g, ''))} placeholder="4位數房號" className="w-full p-3 rounded-xl bg-slate-900 border-2 border-slate-600 text-white font-black text-center tracking-widest outline-none focus:border-blue-500" />
                            <button onClick={handleJoinRoom} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black shadow-lg shadow-blue-600/30 transition-transform hover:scale-105">加入/重連</button>
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
        const ranks = Object.values(roomData.players || {}).sort((a, b) => {
            if (a.isDead !== b.isDead) return a.isDead ? 1 : -1;
            if (b.lives !== a.lives) return b.lives - a.lives;
            return b.score - a.score;
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

function BattleArena({ roomData, dbRef, user, wordDatabase }) {
    const [queue, setQueue] = useState([]);
    const [currentMeteor, setCurrentMeteor] = useState(null);
    const [options, setOptions] = useState([]);
    
    const [timeLeft, setTimeLeft] = useState(180);
    const [myState, setMyState] = useState(() => {
        // 斷線重連時，優先承接雲端上原有的血量與分數！
        const existing = roomData?.players?.[user.uid];
        return existing ? { ...existing } : { score: 0, lives: 10, isDead: false, combo: 0, horizon: 0, attacks: 0 };
    });
    const [prevTotalAttacks, setPrevTotalAttacks] = useState(0);
    
    const meteorRef = useRef(null);
    const containerRef = useRef(null);

    // 精準過濾題庫：只抓取關主設定的單元範圍
    useEffect(() => {
        const allowedUnits = roomData?.selectedUnits || [];
        let filtered = wordDatabase.filter(w => allowedUnits.includes(`${w.book}-${w.lesson}`));
        if (filtered.length === 0) filtered = wordDatabase; // 保險防呆
        
        let repeatedDb = [];
        while (repeatedDb.length < 150) {
            repeatedDb = [...repeatedDb, ...[...filtered].sort(() => 0.5 - Math.random())];
        }
        setQueue(repeatedDb);
    }, [wordDatabase, roomData?.selectedUnits]);

    // 監聽對手陷害信號
    useEffect(() => {
        if (!roomData?.players) return;
        let currentTotalAttacks = 0;
        Object.keys(roomData.players).forEach(uid => {
            if (uid !== user.uid) currentTotalAttacks += (roomData.players[uid].attacks || 0);
        });
        
        if (currentTotalAttacks > prevTotalAttacks && !myState.isDead) {
            setMyState(prev => ({ ...prev, horizon: Math.min(3, prev.horizon + 1) }));
            soundEngine.wrong(); // 警報音效
            if(containerRef.current) {
                containerRef.current.classList.add('animate-[shake_0.5s_ease-in-out]');
                setTimeout(() => containerRef.current?.classList.remove('animate-[shake_0.5s_ease-in-out]'), 500);
            }
        }
        setPrevTotalAttacks(currentTotalAttacks);
    }, [roomData, user.uid, myState.isDead]);

    // 精簡版實時同步
    useEffect(() => {
        if (!dbRef || !user || !roomData?.id) return;
        dbRef.collection('rooms').doc(roomData.id).update({
            [`players.${user.uid}`]: myState
        }).catch(()=>{});
    }, [myState.score, myState.lives, myState.combo, myState.horizon, myState.attacks, myState.isDead]);

    // 計時器
    useEffect(() => {
        if (timeLeft <= 0 || myState.isDead) return;
        const timer = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1 && roomData.hostId === user.uid) {
                    dbRef.collection('rooms').doc(roomData.id).update({ status: 'finished' }).catch(()=>{});
                }
                return t - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft, myState.isDead, roomData.hostId, roomData.id, dbRef, user.uid]);

    const generateOptions = (word) => {
        let pool = wordDatabase.map(w => w.zh).filter(a => a !== word.zh);
        pool = [...new Set(pool)].sort(() => 0.5 - Math.random()).slice(0, 3);
        const finalOptions = [...pool, word.zh].map(opt => ({ text: opt, isCorrect: opt === word.zh, id: Math.random() })).sort(() => 0.5 - Math.random());
        setOptions(finalOptions);
    };

    const spawnMeteor = (wordObj) => {
        // 修慢自然掉落的基礎流速（從原本基礎 5 秒放慢到 6.5 秒），並隨地平線壓縮距離
        const baseDuration = 6.5; 
        const dropDuration = Math.max(2.2, baseDuration - (myState.horizon * 1.2)); 
        setCurrentMeteor({ wordObj, x: 10 + Math.random() * 80, duration: dropDuration, isExploding: false, startTime: performance.now() });
        playAudio(wordObj.en);
    };

    useEffect(() => {
        if (queue.length > 0 && !currentMeteor && !myState.isDead) {
            generateOptions(queue[0]);
            spawnMeteor(queue[0]);
        }
    }, [queue, currentMeteor, myState.isDead]);

    useEffect(() => {
        if (!currentMeteor || currentMeteor.isExploding || myState.isDead) return;
        let animationFrameId;
        const drop = (now) => {
            const elapsed = (now - currentMeteor.startTime) / 1000;
            const progress = Math.min(elapsed / currentMeteor.duration, 1);
            
            // 地平線越高，終點線越高。每級地平線實體上移 18%
            const bottomLimit = 82 - (myState.horizon * 18); // 修正：提早判定，讓隕石底部剛好貼齊紅線
            const easeInProgress = progress * progress; // 重力加速度
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
        
        if (opt.isCorrect) {
            soundEngine.laser();
            setCurrentMeteor(prev => ({ ...prev, isExploding: true }));
            
            // 計算擊殺速度加分 (越早擊碎分數越高)
            const elapsed = (performance.now() - currentMeteor.startTime) / 1000;
            const speedBonus = elapsed < (currentMeteor.duration * 0.4) ? 2 : 0; 
            
            setMyState(prev => {
                let newCombo = prev.combo + 1;
                let newHorizon = prev.horizon;
                let newAttacks = prev.attacks;
                let extraScore = 0;
                
                if (newCombo >= 3) {
                    newCombo = 0;
                    newAttacks += 1; // 廣播陷害
                    newHorizon = Math.max(0, prev.horizon - 1); // 努力自救推回防線！
                    extraScore = 5; // Combo 3 爆發大加分
                }
                
                return { ...prev, score: prev.score + 1 + speedBonus + extraScore, combo: newCombo, horizon: newHorizon, attacks: newAttacks };
            });
            setTimeout(nextTurn, 400);
        } else {
            handleMiss();
        }
    };

    const nextTurn = () => {
        setQueue(prev => { const newQ = [...prev]; newQ.shift(); return newQ; });
        setCurrentMeteor(null);
    };

    const otherPlayers = Object.values(roomData.players || {}).filter(p => p.name !== myState.name);

    return (
        <div className="flex-1 flex flex-col w-full h-[100dvh] bg-slate-900 overflow-hidden no-select font-sans relative">
            {/* 頂部：對手儀表板 */}
            <header className="bg-slate-950 border-b border-slate-800 p-2 flex justify-around items-center shrink-0 z-20">
                <div className="flex flex-col items-center bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                 <span className="text-white font-mono font-black text-xl leading-none">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                 <span className="text-yellow-400 font-black text-[10px] tracking-widest mt-1">ROOM {roomData?.code}</span>
             </div>
                {otherPlayers.map((p, i) => (
                    <div key={i} className={`flex flex-col items-center px-2 transition-all ${p.isDead ? 'opacity-30 grayscale' : ''}`}>
                        <span className="text-xs font-bold text-slate-300 truncate max-w-[70px]">{p.name}</span>
                        <div className="flex gap-2 mt-0.5">
                            <span className="text-red-500 text-xs font-bold"><i className="fa-solid fa-heart"></i> {p.lives}</span>
                            <span className="text-blue-400 text-xs font-bold"><i className="fa-solid fa-star"></i> {p.score}</span>
                        </div>
                        {/* 頂部同步觀看對手的危機條 */}
                        <div className="w-16 h-1.5 bg-slate-800 mt-1 rounded-full overflow-hidden border border-slate-700">
                            <div className="h-full bg-gradient-to-r from-orange-500 to-red-600 transition-all duration-300" style={{ width: `${((p.horizon || 0) / 3) * 100}%` }}></div>
                        </div>
                    </div>
                ))}
            </header>

            {/* 中間戰場 */}
            <main ref={containerRef} className="flex-1 relative w-full stars-bg overflow-hidden transition-all duration-300">
                
                {/* 🧱 實體地平線過載電網 (視覺大升級！) */}
                <div className="absolute bottom-0 w-full bg-red-950/40 border-t-4 border-red-500 flex flex-col items-center justify-start transition-all duration-500 z-10 overflow-hidden" style={{ height: `${myState.horizon * 18}%` }}>
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(239,68,68,0.1)_25%,transparent_25%,transparent_50%,rgba(239,68,68,0.1)_50%,rgba(239,68,68,0.1)_75%,transparent_75%,transparent)] bg-[length:40px_40px] animate-[pulse_1.5s_infinite]"></div>
                    {myState.horizon > 0 && (
                        <div className="relative pt-2 text-red-400 font-black text-xs tracking-widest animate-pulse flex items-center gap-1">
                            <i className="fa-solid fa-triangle-exclamation"></i> 防線縮短 LEVEL {myState.horizon}
                        </div>
                    )}
                </div>

                {myState.isDead && (
                    <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="w-20 h-20 bg-red-600/10 border border-red-600/30 text-red-500 rounded-full flex items-center justify-center mb-4 animate-spin"><i className="fa-solid fa-ghost text-4xl"></i></div>
                        <h2 className="text-5xl font-black text-red-600 mb-2 tracking-wider">戰敗出局</h2>
                        <p className="text-slate-400 text-sm font-bold tracking-widest">已啟動觀戰系統，正在監聽最終勝負...</p>
                    </div>
                )}

                {currentMeteor && !myState.isDead && (
                    <div ref={meteorRef} className="absolute transform -translate-x-1/2 flex flex-col items-center z-20" style={{ left: `${currentMeteor.x}%`, top: '-15%' }}>
                        {currentMeteor.isExploding ? (
                            <div className="text-6xl animate-[ping_0.3s_ease-out_forwards] text-orange-500"><i className="fa-solid fa-explosion"></i></div>
                        ) : (
                            <div className="relative cursor-pointer" onClick={() => playAudio(currentMeteor.wordObj.en)}>
                                <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-60 animate-pulse"></div>
                                <div className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col items-center">
                                    <i className="fa-solid fa-meteor text-blue-400 text-2xl mb-1 absolute -top-4"></i>
                                    <span className="text-2xl sm:text-3xl font-black text-white whitespace-nowrap">{currentMeteor.wordObj.en}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* 底部面板 */}
            <footer className="w-full bg-slate-950 p-4 shrink-0 z-20 border-t-4 border-slate-800 relative">
                <div className="absolute -top-12 left-0 w-full px-4 flex justify-between items-end pointer-events-none">
                    <div className="bg-slate-900/90 border border-slate-700 px-4 py-1.5 rounded-t-xl flex gap-4 shadow-lg text-sm">
                        <span className="text-red-500 font-bold"><i className="fa-solid fa-heart"></i> {myState.lives}</span>
                        <span className="text-blue-400 font-bold"><i className="fa-solid fa-star"></i> {myState.score}</span>
                    </div>
                    <div className={`px-4 py-1.5 rounded-t-xl font-black text-xs tracking-wider shadow-lg transition-colors ${myState.combo >= 2 ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-900/90 border border-slate-700 text-slate-400'}`}>
                        COMBO {myState.combo}/3
                    </div>
                </div>

                <div className="max-w-2xl mx-auto grid grid-cols-2 gap-3 mt-1">
                    {options.map((opt) => (
                        <button key={opt.id} disabled={myState.isDead} onClick={() => handleShoot(opt)} className="relative overflow-hidden bg-slate-800 border-2 border-slate-700 hover:border-blue-500 rounded-xl p-4 active:scale-95 transition-all disabled:opacity-30">
                            <span className="relative text-xl sm:text-2xl font-bold text-white block truncate">{opt.text}</span>
                        </button>
                    ))}
                </div>
            </footer>
        </div>
    );
}
