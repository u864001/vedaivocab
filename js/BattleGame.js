function BattleGame({ onBack, wordDatabase, dbRef, user }) {
    const [view, setView] = useState('menu'); // 'menu' | 'waiting' | 'playing' | 'result'
    const [playerName, setPlayerName] = useState('');
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    
    // 監聽房間資料變化
    useEffect(() => {
        if (!roomData?.id || !dbRef) return;
        const unsubscribe = dbRef.collection('rooms').doc(roomData.id).onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                setRoomData({ id: doc.id, ...data });
                // 如果房主按下了開始，所有人切換到遊戲畫面
                if (data.status === 'playing' && view === 'waiting') {
                    setView('playing');
                }
            } else {
                // 房間被解散
                alert('房間已關閉或解散！');
                onBack();
            }
        });
        return () => unsubscribe();
    }, [roomData?.id, dbRef, view, onBack]);

    const handleCreateRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入 1~6 字的有效暱稱');
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');
        
        setErrorMsg('');
        const newCode = Math.floor(1000 + Math.random() * 9000).toString(); // 產生 4 位數房號
        
        const initialRoom = {
            code: newCode,
            status: 'waiting',
            createdAt: Date.now(),
            hostId: user.uid,
            players: {
                [user.uid]: { name: playerName, isHost: true, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0 }
            }
        };

        try {
            const docRef = await dbRef.collection('rooms').add(initialRoom);
            setRoomData({ id: docRef.id, ...initialRoom });
            setView('waiting');
        } catch (e) { setErrorMsg('建立房間失敗，請重試'); }
    };

    const handleJoinRoom = async () => {
        if (!isValidName(playerName)) return setErrorMsg('請輸入 1~6 字的有效暱稱');
        if (roomCodeInput.length !== 4) return setErrorMsg('請輸入 4 位數房間代碼');
        if (!dbRef || !user) return setErrorMsg('無法連接伺服器');

        setErrorMsg('');
        try {
            // 尋找對應房號且還在等待中的房間
            const snapshot = await dbRef.collection('rooms').where('code', '==', roomCodeInput).where('status', '==', 'waiting').get();
            if (snapshot.empty) return setErrorMsg('找不到該房間或遊戲已開始');
            
            const roomDoc = snapshot.docs[0];
            const data = roomDoc.data();
            
            // 檢查人數是否已滿 4 人
            if (Object.keys(data.players).length >= 4) return setErrorMsg('房間已滿 (上限 4 人)');
            
            // 加入玩家資料
            await dbRef.collection('rooms').doc(roomDoc.id).update({
                [`players.${user.uid}`]: { name: playerName, isHost: false, score: 0, lives: 10, isDead: false, combo: 0, horizon: 0 }
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
            // 如果是房主離開，直接刪除房間
            if (roomData.hostId === user.uid) {
                await dbRef.collection('rooms').doc(roomData.id).delete();
            } else {
                // 如果是普通玩家離開，移除自己的資料
                await dbRef.collection('rooms').doc(roomData.id).update({
                    [`players.${user.uid}`]: firebase.firestore.FieldValue.delete()
                });
            }
        }
        onBack();
    };

    // 畫面 1：輸入選單
    if (view === 'menu') return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 animate-[fadeIn_0.5s_ease-out]">
            <div className="bg-slate-800 rounded-3xl shadow-2xl p-8 max-w-md w-full border border-slate-700">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><i className="fa-solid fa-fire-flame-curved text-3xl"></i></div>
                    <h2 className="text-3xl font-black text-white">區域連線對戰</h2>
                    <p className="text-slate-400 text-sm mt-2">最多 4 人，3 分鐘地平線死鬥</p>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-slate-400 text-sm font-bold mb-1 block">指揮官暱稱</label>
                        <input type="text" value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="輸入您的稱呼" className="w-full p-4 rounded-xl bg-slate-900 border-2 border-slate-600 text-white font-bold text-center focus:border-red-500 outline-none" />
                    </div>
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

    // 畫面 2：等待室
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
                                {p.isHost && <span className="text-xs font-black text-yellow-500 bg-yellow-500/20 px-2 py-1 rounded-md">房主</span>}
                            </div>
                        ))}
                    </div>

                    {isHost ? (
                        <button onClick={handleStartGame} disabled={playersList.length < 2} className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-xl font-black text-xl shadow-lg hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all">
                            {playersList.length < 2 ? '等待對手加入...' : '開始對戰！'}
                        </button>
                    ) : (
                        <div className="w-full py-4 bg-slate-700 text-slate-300 rounded-xl font-black text-xl flex items-center justify-center gap-3"><i className="fa-solid fa-spinner fa-spin"></i> 等待房主開始</div>
                    )}
                    <button onClick={handleLeaveRoom} className="w-full mt-4 text-slate-500 hover:text-red-400 font-bold">離開房間</button>
                </div>
            </div>
        );
    }

    // 畫面 3：遊戲中 (下一階段再把引擎放進來)
    if (view === 'playing') return (
        <div className="flex-1 flex items-center justify-center bg-slate-900 text-white font-bold text-2xl">
            <i className="fa-solid fa-gear fa-spin mr-3"></i> 遊戲引擎啟動中...（下一階段載入）
        </div>
    );
}
