import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  getDoc,
  arrayUnion,
  collection,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import {
  Users,
  Play,
  Eye,
  EyeOff,
  RefreshCw,
  Crown,
  AlertCircle,
  HelpCircle,
  Globe,
  Lock
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (TUS DATOS REALES) ---
const firebaseConfig = {
  apiKey: "AIzaSyDNEocz1CyZ6L96DBu4m-7Z-N3S_Oi86Fw",
  authDomain: "impostor-8e8dc.firebaseapp.com",
  projectId: "impostor-8e8dc",
  storageBucket: "impostor-8e8dc.firebasestorage.app",
  messagingSenderId: "593741311552",
  appId: "1:593741311552:web:9c715cfd880da85009b9a5",
  measurementId: "G-LFBPP3PXQD"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Nombre de la colección simplificado para tu versión web
const LOBBY_COLLECTION = 'lobbies';

// --- BANCO DE PALABRAS ---
const WORD_CATEGORIES = {
  "Lugares": ["Playa", "Hospital", "Escuela", "Submarino", "Estación Espacial", "Cine", "Cementerio", "Circo", "Prisión", "Biblioteca"],
  "Comida": ["Pizza", "Sushi", "Hamburguesa", "Tacos", "Helado", "Paella", "Chocolate", "Ensalada", "Ceviche", "Palomitas"],
  "Profesiones": ["Doctor", "Payaso", "Astronauta", "Bombero", "Profesor", "Futbolista", "Detective", "Cocinero", "Mago", "Mecánico"],
  "Animales": ["Elefante", "Pingüino", "León", "Jirafa", "Tiburón", "Águila", "Canguro", "Panda", "Murciélago", "Camaleón"],
  "Objetos": ["Espejo", "Teléfono", "Paraguas", "Reloj", "Llaves", "Zapatos", "Mochila", "Guitarra", "Cuchillo", "Lámpara"]
};

const COLORS = [
  "Rojo", "Azul", "Verde", "Amarillo", "Negro", "Blanco",
  "Rosa", "Naranja", "Violeta", "Gris", "Cian", "Lima"
];

// --- COMPONENTES ---

export default function App() {
  const [user, setUser] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(null); // null, 'lobby', 'playing', 'reveal'
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  // Nuevos estados
  const [isPublic, setIsPublic] = useState(true);
  const [publicRooms, setPublicRooms] = useState([]);

  // 1. Autenticación Anónima Simplificada y Nombre Aleatorio
  useEffect(() => {
    signInAnonymously(auth).catch((err) => {
      console.error("Auth error:", err);
      setError("Error de conexión. Recarga la página.");
    });

    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));

    // Asignar nombre de color aleatorio si no tiene
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const randomNum = Math.floor(Math.random() * 100);
    setPlayerName(`${randomColor}${randomNum}`);

    return () => unsubscribe();
  }, []);

  // 2. Escuchar cambios en la sala actual
  useEffect(() => {
    if (!user || !roomCode || gameState === null) return;

    // RUTA SIMPLIFICADA: lobbies/CODIGO
    const roomRef = doc(db, LOBBY_COLLECTION, roomCode.toUpperCase());

    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);

        // Sincronizar estado local con el estado de la sala
        if (data.status === 'PLAYING' && gameState === 'lobby') {
          setGameState('playing');
        } else if (data.status === 'WAITING' && gameState !== 'lobby') {
          setGameState('lobby');
          setIsRevealed(false);
        }
      } else {
        // Sala eliminada o no existe
        if (gameState !== null) {
          setError("La sala ha sido cerrada.");
          setGameState(null);
          setRoomData(null);
        }
      }
    }, (err) => {
      console.error("Error fetching room:", err);
      setError("Error de sincronización.");
    });

    return () => unsubscribe();
  }, [user, roomCode, gameState]);

  // 3. Escuchar salas públicas disponibles
  useEffect(() => {
    if (gameState !== null) return; // No escuchar si ya estamos en juego

    // NOTA: Quitamos orderBy para evitar requerir un índice compuesto en Firestore.
    // Ordenamos los resultados en el cliente.
    const q = query(
      collection(db, LOBBY_COLLECTION),
      where("isPublic", "==", true),
      where("status", "==", "WAITING"),
      limit(20) // Aumentamos un poco el límite ya que ordenamos localmente
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rooms = [];
      snapshot.forEach((doc) => {
        rooms.push(doc.data());
      });

      // Ordenar por fecha de creación (más reciente primero)
      rooms.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      setPublicRooms(rooms);
    }, (error) => {
      console.error("Error getting public rooms:", error);
      // No mostramos error UI para no molestar, pero logueamos
    });

    return () => unsubscribe();
  }, [gameState]);

  // 4. Manejar cierre de pestaña
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (gameState && roomCode) {
        leaveRoom();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gameState, roomCode, user]);


  // --- ACCIONES ---

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // LIMPIEZA DE SALAS VIEJAS
  const cleanupOldRooms = async () => {
    try {
      // Buscar salas públicas para limpiar
      const q = query(
        collection(db, LOBBY_COLLECTION),
        where("isPublic", "==", true)
      );

      const snapshot = await getDocs(q);
      const now = new Date();
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

      snapshot.forEach(async (docSnap) => {
        const data = docSnap.data();
        const createdAt = new Date(data.createdAt || 0);

        // Si tiene más de 2 horas O no tiene jugadores
        if ((now - createdAt > TWO_HOURS_MS) || (data.players && data.players.length === 0)) {
          await deleteDoc(docSnap.ref);
          console.log(`Sala ${data.code} eliminada por inactividad.`);
        }
      });
    } catch (err) {
      console.error("Error cleaning up rooms:", err);
    }
  };

  const createRoom = async () => {
    if (!playerName.trim()) return setError("¡Necesitas un nombre!");
    setLoading(true);

    // Ejecutar limpieza antes de crear
    await cleanupOldRooms();

    const newCode = generateRoomCode();

    try {
      // RUTA SIMPLIFICADA
      const roomRef = doc(db, LOBBY_COLLECTION, newCode);

      const initialData = {
        code: newCode,
        hostId: user.uid,
        status: 'WAITING',
        players: [{ uid: user.uid, name: playerName.trim(), isHost: true }],
        category: '',
        word: '',
        impostorId: '',
        createdAt: new Date().toISOString(),
        isPublic: isPublic // Nuevo campo
      };

      await setDoc(roomRef, initialData);
      setRoomCode(newCode);
      setGameState('lobby');
      setError('');
    } catch (err) {
      console.error(err);
      setError("No se pudo crear la sala.");
    }
    setLoading(false);
  };

  const joinRoom = async (codeToJoin) => {
    const targetCode = codeToJoin || roomCode;

    if (!playerName.trim()) return setError("¡Necesitas un nombre!");
    if (targetCode.length !== 4) return setError("El código debe tener 4 caracteres.");

    setLoading(true);
    const codeUpper = targetCode.toUpperCase();

    try {
      // RUTA SIMPLIFICADA
      const roomRef = doc(db, LOBBY_COLLECTION, codeUpper);
      const docSnap = await getDoc(roomRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.status === 'PLAYING') {
          setLoading(false);
          return setError("La partida ya ha comenzado.");
        }

        const isAlreadyIn = data.players.some(p => p.uid === user.uid);

        if (!isAlreadyIn) {
          await updateDoc(roomRef, {
            players: arrayUnion({ uid: user.uid, name: playerName.trim(), isHost: false })
          });
        }

        setRoomCode(codeUpper);
        setGameState('lobby');
        setError('');
      } else {
        setError("Sala no encontrada.");
      }
    } catch (err) {
      console.error(err);
      setError("Error al unirse.");
    }
    setLoading(false);
  };

  const leaveRoom = async () => {
    if (!roomCode || !user) return;

    // Limpiar estado local inmediatamente
    setGameState(null);
    setRoomCode('');
    setRoomData(null);

    try {
      const roomRef = doc(db, LOBBY_COLLECTION, roomCode);
      const docSnap = await getDoc(roomRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const updatedPlayers = data.players.filter(p => p.uid !== user.uid);

        if (updatedPlayers.length === 0) {
          // Si no quedan jugadores, eliminar la sala
          await deleteDoc(roomRef);
        } else {
          // Si quedan jugadores, actualizar
          let updates = { players: updatedPlayers };

          // Si el que se va era el host, asignar nuevo host
          if (data.hostId === user.uid) {
            updates.hostId = updatedPlayers[0].uid;
            // Actualizar el flag isHost en el array de jugadores
            updatedPlayers[0].isHost = true;
          }

          await updateDoc(roomRef, updates);
        }
      }
    } catch (err) {
      console.error("Error leaving room:", err);
    }
  };

  const startGame = async () => {
    if (!roomData) return;

    const categories = Object.keys(WORD_CATEGORIES);
    const randomCat = categories[Math.floor(Math.random() * categories.length)];
    const words = WORD_CATEGORIES[randomCat];
    const randomWord = words[Math.floor(Math.random() * words.length)];

    const players = roomData.players;
    const randomImpostor = players[Math.floor(Math.random() * players.length)];

    try {
      // RUTA SIMPLIFICADA
      const roomRef = doc(db, LOBBY_COLLECTION, roomCode);
      await updateDoc(roomRef, {
        status: 'PLAYING',
        category: randomCat,
        word: randomWord,
        impostorId: randomImpostor.uid
      });
    } catch (err) {
      console.error(err);
    }
  };

  const resetGame = async () => {
    try {
      // RUTA SIMPLIFICADA
      const roomRef = doc(db, LOBBY_COLLECTION, roomCode);
      await updateDoc(roomRef, {
        status: 'WAITING',
        category: '',
        word: '',
        impostorId: ''
      });
    } catch (err) {
      console.error(err);
    }
  };

  // --- VISTAS ---

  // 1. Pantalla de Inicio
  if (!gameState) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="bg-red-500 p-3 rounded-full shadow-lg shadow-red-500/50">
              <HelpCircle size={48} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black text-center mb-2 tracking-tighter">EL IMPOSTOR</h1>
          <p className="text-slate-400 text-center mb-8">Descubre quién miente entre tus amigos.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tu Nombre</label>
              <input
                type="text"
                maxLength={12}
                placeholder="Ej. Juan"
                className="w-full bg-slate-700 border-2 border-slate-600 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-red-500 transition-colors text-white placeholder-slate-500"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>

            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between bg-slate-700/50 p-2 rounded-lg cursor-pointer" onClick={() => setIsPublic(!isPublic)}>
                <span className="text-sm text-slate-300 ml-2 flex items-center gap-2">
                  {isPublic ? <Globe size={16} /> : <Lock size={16} />}
                  {isPublic ? 'Sala Pública' : 'Sala Privada'}
                </span>
                <div className={`w-12 h-6 rounded-full p-1 transition-colors ${isPublic ? 'bg-green-500' : 'bg-slate-600'}`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </div>
              </div>

              <button
                onClick={createRoom}
                disabled={loading}
                className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-2"
              >
                <Users size={20} />
                CREAR SALA {isPublic ? 'PÚBLICA' : 'PRIVADA'}
              </button>
            </div>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-600"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-sm">O ÚNETE</span>
              <div className="flex-grow border-t border-slate-600"></div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                placeholder="CÓDIGO"
                className="w-1/3 bg-slate-700 border-2 border-slate-600 rounded-xl px-2 py-3 text-center text-lg uppercase tracking-widest focus:outline-none focus:border-blue-500 text-white font-mono"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
              <button
                onClick={() => joinRoom(roomCode)}
                disabled={loading}
                className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg transform transition active:scale-95"
              >
                UNIRSE
              </button>
            </div>

            {/* LISTA DE SALAS PÚBLICAS */}
            {publicRooms.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Salas Públicas</p>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {publicRooms.map((room) => (
                    <button
                      key={room.code}
                      onClick={() => joinRoom(room.code)}
                      className="w-full bg-slate-700 hover:bg-slate-600 p-3 rounded-lg flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-blue-300">{room.code}</span>
                        <span className="text-sm text-slate-300">
                          {room.players.length}/10
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 group-hover:text-white transition-colors">Unirse &rarr;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/20 text-red-300 p-3 rounded-lg text-sm flex items-center gap-2 mt-4 animate-pulse">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Lobby de Espera
  if (gameState === 'lobby' && roomData) {
    const isHost = roomData.players.find(p => p.uid === user.uid)?.isHost;

    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 font-sans">
        <div className="max-w-md mx-auto space-y-6">

          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 text-center relative overflow-hidden">
            {roomData.isPublic && (
              <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                <Globe size={12} /> PÚBLICA
              </div>
            )}
            <p className="text-slate-400 text-xs font-bold uppercase mb-2">Código de Sala</p>
            <h2 className="text-6xl font-mono font-black tracking-widest text-blue-400 mb-2 select-all">{roomData.code}</h2>
            <p className="text-slate-500 text-sm">Comparte este código con tus amigos</p>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Users className="text-blue-400" />
                Jugadores ({roomData.players.length})
              </h3>
            </div>

            <div className="space-y-2">
              {roomData.players.map((p, idx) => (
                <div key={idx} className="bg-slate-700/50 p-3 rounded-lg flex items-center justify-between">
                  <span className="font-semibold text-lg">{p.name} {p.uid === user.uid && '(Tú)'}</span>
                  {p.isHost && <Crown size={20} className="text-yellow-400" />}
                </div>
              ))}
              {roomData.players.length < 3 && (
                <div className="text-center text-slate-500 py-4 italic text-sm">
                  Esperando a más jugadores... (Mínimo 3)
                </div>
              )}
            </div>
          </div>

          {isHost ? (
            <button
              onClick={startGame}
              disabled={roomData.players.length < 3}
              className={`w-full py-5 rounded-xl text-xl font-black shadow-lg flex items-center justify-center gap-3 transition-all ${roomData.players.length < 3
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-green-500 hover:bg-green-400 text-white transform active:scale-95'
                }`}
            >
              <Play fill="currentColor" />
              EMPEZAR PARTIDA
            </button>
          ) : (
            <div className="text-center text-slate-400 animate-pulse">
              Esperando a que el anfitrión inicie...
            </div>
          )}

          <button onClick={leaveRoom} className="w-full text-slate-500 py-4 hover:text-white">
            Salir de la sala
          </button>
        </div>
      </div>
    );
  }

  // 3. Juego Activo (Revelar Rol)
  if (gameState === 'playing' && roomData) {
    const isImpostor = user.uid === roomData.impostorId;
    const isHost = roomData.players.find(p => p.uid === user.uid)?.isHost;

    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 font-sans flex flex-col items-center">
        <div className="w-full max-w-md flex-grow flex flex-col gap-6">

          {/* Header */}
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="text-left">
              <p className="text-xs text-slate-400 uppercase">Categoría</p>
              <p className="text-lg font-bold text-blue-300">{roomData.category}</p>
            </div>
            <div className="h-8 w-[1px] bg-slate-600"></div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase">Jugadores</p>
              <p className="text-lg font-bold">{roomData.players.length}</p>
            </div>
          </div>

          {/* Tarjeta de Rol */}
          <div className="flex-grow flex items-center justify-center">
            <div
              className={`w-full aspect-[3/4] max-h-[500px] relative rounded-3xl cursor-pointer transition-all duration-500 transform ${isRevealed ? 'rotate-0' : 'rotate-1'
                }`}
              onClick={() => setIsRevealed(!isRevealed)}
            >
              {/* Cara Oculta */}
              <div className={`absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl shadow-2xl border-4 border-slate-600 flex flex-col items-center justify-center p-8 text-center transition-opacity duration-300 ${isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                <EyeOff size={64} className="text-slate-400 mb-4" />
                <h3 className="text-2xl font-bold text-slate-200 mb-2">TU IDENTIDAD SECRETA</h3>
                <p className="text-slate-400">Toca la tarjeta para revelar tu rol. ¡Asegúrate de que nadie más mire!</p>
              </div>

              {/* Cara Revelada */}
              <div className={`absolute inset-0 bg-slate-100 rounded-3xl shadow-2xl border-8 ${isImpostor ? 'border-red-500' : 'border-blue-500'} flex flex-col items-center justify-center p-8 text-center transition-opacity duration-300 ${!isRevealed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

                {isImpostor ? (
                  <>
                    <div className="bg-red-100 p-6 rounded-full mb-6 animate-bounce">
                      <HelpCircle size={64} className="text-red-600" />
                    </div>
                    <h2 className="text-4xl font-black text-red-600 mb-4 tracking-tight">¡ERES EL IMPOSTOR!</h2>
                    <p className="text-slate-600 text-lg leading-relaxed">
                      No sabes la palabra secreta. <br />
                      <strong className="text-slate-800">Escucha</strong> a los demás, <strong className="text-slate-800">miente</strong> y trata de encajar.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="bg-blue-100 p-6 rounded-full mb-6">
                      <div className="text-6xl">🤫</div>
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest mb-2">LA PALABRA ES</p>
                    <h2 className="text-5xl font-black text-slate-800 mb-8 break-words w-full">{roomData.word}</h2>
                    <p className="text-slate-600 text-sm">
                      Describe esto sutilmente para que los demás sepan que no eres el impostor, pero no seas muy obvio.
                    </p>
                  </>
                )}

 
