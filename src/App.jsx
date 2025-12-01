import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Toolbar from "./components/Toolbar.jsx";
import Grid from "./components/Grid.jsx";
import CreatePostDialog from "./components/CreatePostDialog.jsx";
import EditPostDialog from "./components/EditPostDialog.jsx";
import MessageDialog from "./components/MessageDialog.jsx";
import AuthDialog from "./components/RegisterDialog.jsx";
import ProfileDialog from "./components/ProfileDialog.jsx";
import ChatListDialog from "./components/ChatListDialog.jsx"; 
import { DICT, initialPosts as seed } from "./data.js";
import { API_BASE } from "./config"; 
import { io } from "socket.io-client";
import { SOCKET_URL } from "./config";

// --- ХЕЛПЕРИ ---
function useLocalFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify([...favorites]));
  }, [favorites]);
  return [favorites, setFavorites];
}

function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark"
  );
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

function formatAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "just now";
  const m = diff / 60,
    h = m / 60,
    d = h / 24;
  if (m < 60) return Math.floor(m) + "m ago";
  if (h < 24) return Math.floor(h) + "h ago";
  return Math.floor(d) + "d ago";
}

function parseURLState() {
  const p = new URLSearchParams(location.search);
  const tags = new Set((p.get("tags") || "").split(",").map((s) => s.trim()).filter(Boolean));
  const flt = {
    game: p.get("game") || "",
    level: p.get("level") || "",
    lang: p.get("lang") || "",
    platform: p.get("platform") || "",
    time: p.get("time") || "",
  };
  return {
    q: p.get("q") || "",
    selectedTags: tags,
    flt,
    sortBy: p.get("sort") || "score",
    savedOnly: p.get("saved") === "1",
  };
}

function pushURLState({ q, selectedTags, flt, sortBy, savedOnly }) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (selectedTags.size) p.set("tags", [...selectedTags].join(","));
  for (const k of Object.keys(flt)) if (flt[k]) p.set(k, flt[k]);
  if (sortBy !== "score") p.set("sort", sortBy);
  if (savedOnly) p.set("saved", "1");
  const qs = p.toString();
  const url = qs ? `?${qs}` : location.pathname;
  history.replaceState(null, "", url);
}

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function App() {
  const [theme, setTheme] = useTheme();
  
  // Стейт даних
  const [posts, setPosts] = useState([]);
  const [games, setGames] = useState(DICT.games);
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState("");
  
  // Рефи для діалогів
  const authDlgRef = useRef(null);
  const profileDlgRef = useRef(null);
  const chatListDlgRef = useRef(null);
  const msgDlgRef = useRef(null);
  const createDlgRef = useRef(null);
  const editDlgRef = useRef(null);

  // Стейт інтерфейсу
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  
  // Стейт чату
  const [messageTarget, setMessageTarget] = useState(null);
  const [currentChat, setCurrentChat] = useState(null);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- 1. ЗВУКОВЕ СПОВІЩЕННЯ ---
  useEffect(() => {
    if (!currentUser) return;

    const socket = io(SOCKET_URL, {
    transports: ["websocket"],
});
    const notificationChannel = `notification:${currentUser.id}`;

    socket.on(notificationChannel, (data) => {
        console.log("🔔 Отримано сповіщення:", data);
        
        // ВАЖЛИВО: Перевір, щоб файл у папці public називався саме так!
        const audio = new Audio("/notification_sound.wav"); 
        
        audio.volume = 0.6;
        audio.play().catch(err => console.log("Авто-звук заблоковано:", err));
    });

    return () => {
        socket.off(notificationChannel);
        socket.disconnect();
    };
  }, [currentUser]);

  // --- 2. ЗАВАНТАЖЕННЯ ПОСТІВ ---
  useEffect(() => {
    fetch(API_BASE + '/posts')
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                setPosts(data.map(p => ({
                    ...p, 
                    id: p._id, 
                    author: { 
                        name: p.author?.username || "Unknown", 
                        avatar: p.author?.profile?.avatarUrl 
                    }
                })));
            }
        })
        .catch(console.error);
  }, []);

  // --- 3. ПЕРЕВІРКА СЕСІЇ ---
  useEffect(() => {
    const storedId = localStorage.getItem("userId");
    const storedName = localStorage.getItem("username");
    
    if (storedId && storedName) {
        fetch(API_BASE + '/users/' + storedName)
            .then(res => res.json())
            .then(data => {
                setCurrentUser({ 
                    id: data._id || storedId, 
                    username: data.username, 
                    profile: data.profile, 
                    isAdmin: data.isAdmin 
                });
            })
            .catch(() => {
                // Якщо помилка мережі, беремо мінімальні дані
                setCurrentUser({ id: storedId, username: storedName });
            });
    }
  }, []);

  // --- ДІЇ КОРИСТУВАЧА ---
  const toggleToolbar = () => setIsToolbarOpen(!isToolbarOpen);
  
  const handleLogout = () => {
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    setCurrentUser(null);
    window.location.reload();
  };

  const openProfile = () => profileDlgRef.current?.showModal();
  
  const openInbox = () => {
      if (!currentUser) return;
      chatListDlgRef.current?.showModal();
  };

  const handleSelectChatFromList = (chat) => {
      setCurrentChat(chat);
      setMessageTarget(chat.relatedAd || { title: "Чат" });
      msgDlgRef.current?.showModal();
  };

  const handleSaveProfile = async (data) => {
    if (!currentUser) return;
    try {
      const res = await fetch(API_BASE + '/users/' + currentUser.id, { 
          method: 'PUT', 
          headers: {'Content-Type': 'application/json'}, 
          body: JSON.stringify(data) 
      });
      const json = await res.json();
      if (res.ok) { 
          setCurrentUser(prev => ({ ...prev, profile: json.user.profile })); 
          alert("Профіль оновлено!"); 
      }
    } catch (e) { alert("Помилка"); }
  };

  // --- РОБОТА З ПОСТАМИ ---
  const createPost = async (obj) => {
    if (!currentUser) { authDlgRef.current?.showModal(); return false; }
    
    const newPostData = {
        userId: currentUser.id, 
        title: obj.title.trim(), 
        game: obj.game.trim(), 
        level: obj.level, 
        lang: obj.lang, 
        platform: obj.platform, 
        time: obj.time, 
        tags: (obj.tags||"").split(",").map(t=>t.trim()).filter(Boolean), 
        desc: (obj.desc||"").trim()
    };

    try {
        const res = await fetch(API_BASE + '/posts', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(newPostData) 
        });
        if (res.ok) {
            const saved = await res.json();
            setPosts(prev => [{...saved, id: saved._id, author: {name: currentUser.username, avatar: currentUser.profile?.avatarUrl}}, ...prev]);
            closeCreate(); 
            return true;
        }
    } catch (e) { alert("Error"); } 
    return false;
  };

  const onLike = async (id) => {
    if (!currentUser) { authDlgRef.current?.showModal(); return; }
    try {
        const res = await fetch(API_BASE + '/posts/' + id + '/like', {
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (res.ok) {
            const updated = await res.json();
            const adapted = { 
                ...updated, 
                id: updated._id, 
                author: { name: updated.author?.username, avatar: updated.author?.profile?.avatarUrl } 
            };
            setPosts(l => l.map(p => p.id === id ? adapted : p));
        }
    } catch (e) { console.error(e); }
  };

  const onDelete = async (id) => {
    if (!confirm("Видалити це оголошення?")) return;
    try { 
        const res = await fetch(API_BASE + '/posts/' + id, { method: 'DELETE' }); 
        if (res.ok) { 
            setPosts(l => l.filter(p => p.id !== id)); 
        } else {
            alert("Не вдалося видалити");
        }
    } catch (e) { alert("Error"); }
  };

  // --- РОБОТА З ЧАТОМ ---
  const openMessage = async (post) => {
    if (!currentUser) { authDlgRef.current?.showModal(); return; }
    if (post.author.name === currentUser.username) { alert("Це ваш пост"); return; }
    
    setIsChatLoading(true);
    try {
        const res = await fetch(API_BASE + '/chats', {
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify({ adId: post.id, userId: currentUser.id }) 
        });
        const data = await res.json();
        if (res.ok) { 
            setCurrentChat(data); 
            setMessageTarget(post); 
            msgDlgRef.current?.showModal(); 
        }
    } catch (e) { alert("Error"); } 
    finally { setIsChatLoading(false); }
  };

  const sendMessage = async ({ text }) => {
      if (!currentChat || !currentUser) return;
      try { 
          await fetch(API_BASE + '/chats/' + currentChat._id + '/messages', {
              method: 'POST', 
              headers: {'Content-Type':'application/json'}, 
              body: JSON.stringify({ text, senderId: currentUser.id }) 
          }); 
      } catch (e) {}
  };

  // --- АВТОРИЗАЦІЯ ---
  const handleLogin = async () => {}; // Заглушка (логіка в AuthDialog)
  const handleRegister = async () => {}; // Заглушка
  
  const handleGoogleLogin = async (googleResponse) => {
    try {
        const response = await fetch(API_BASE + '/google-login', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ token: googleResponse.credential })
        });
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('userId', data.userId); 
            localStorage.setItem('username', data.username);
            
            setCurrentUser({ 
                id: data.userId, 
                username: data.username, 
                profile: data.profile, 
                isAdmin: data.isAdmin 
            });
            
            authDlgRef.current?.close(); 
            alert(`Вітаємо, ${data.username}!`); 
            window.location.reload();
        } else { 
            setAuthError(data.message); 
        }
    } catch (error) { setAuthError("Помилка"); }
  };

  // --- ФІЛЬТРАЦІЯ ТА РЕНДЕР ---
  const init = parseURLState();
  const [q, setQ] = useState(init.q);
  const [selectedTags, setSelectedTags] = useState(init.selectedTags);
  const [flt, setFlt] = useState(init.flt);
  const [sortBy, setSortBy] = useState(init.sortBy);
  const [savedOnly, setSavedOnly] = useState(init.savedOnly);

  useEffect(() => { pushURLState({ q, selectedTags, flt, sortBy, savedOnly }); }, [q, selectedTags, flt, sortBy, savedOnly]);
  
  const [favorites, setFavorites] = useLocalFavorites();
  const toggleFavorite = (id) => { const n = new Set(favorites); n.has(id)?n.delete(id):n.add(id); setFavorites(n); };
  
  const visible = useMemo(() => {
      return posts.filter(p => {
          if (savedOnly && !favorites.has(p.id)) return false;
          // ... фільтри ...
          if (q) { 
              const h = (p.title+" "+p.desc+" "+p.game).toLowerCase(); 
              if (!h.includes(q.toLowerCase())) return false; 
          }
          return true;
      });
  }, [posts, q, savedOnly, favorites]); 
  
  const closeCreate = () => createDlgRef.current?.close();
  const closeMessage = () => { msgDlgRef.current?.close(); setMessageTarget(null); setCurrentChat(null); };
  const onEdit = (p) => { setEditingPost(p); editDlgRef.current?.showModal(); };
  const onEditCancel = () => { editDlgRef.current?.close(); setEditingPost(null); };
  
  const onEditSave = async (id, obj) => { 
      const updatedData = {
        title: obj.title.trim(), game: obj.game.trim(), level: obj.level, lang: obj.lang, platform: obj.platform, time: obj.time,
        tags: (typeof obj.tags === 'string' ? obj.tags : "").split(",").map((t) => t.trim()).filter(Boolean), desc: (obj.desc || "").trim(),
      };
      try {
        const res = await fetch(API_BASE + '/posts/' + id, {
            method: 'PUT', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(updatedData)
        });
        if (res.ok) {
            const s = await res.json();
            const a = { ...s, id: s._id, author: { name: s.author?.username || "Unknown", avatar: s.author?.profile?.avatarUrl } };
            setPosts((list) => list.map((p) => (p.id === id ? a : p)));
            onEditCancel();
        }
      } catch (e) { alert("Error"); }
  };
  const onCopyLink = () => alert("Copied");

  return (
    <>
      <div className="animate-on-load">
        <Header 
            q={q} setQ={setQ} onClear={() => setQ("")} 
            onCreate={() => currentUser ? createDlgRef.current?.showModal() : authDlgRef.current?.showModal()} 
            count={visible.length} theme={theme} setTheme={setTheme} 
            toggleToolbar={() => setIsToolbarOpen(!isToolbarOpen)} 
            user={currentUser} onLogout={handleLogout} 
            onLoginClick={() => authDlgRef.current?.showModal()} 
            onProfileClick={openProfile} 
            onInboxClick={openInbox} 
        />
      </div>

      <main className="wrap main-layout">
        <Toolbar dict={{...DICT, games}} selectedTags={selectedTags} toggleTag={t => { const n=new Set(selectedTags); n.has(t)?n.delete(t):n.add(t); setSelectedTags(n); }} flt={flt} setFlt={setFlt} className={isToolbarOpen?"is-open":""} onClose={()=>setIsToolbarOpen(false)} />
        <div className="content-area">
            <Grid 
                items={visible} formatAgo={formatAgo} favorites={favorites} 
                onToggleFavorite={toggleFavorite} onMessage={openMessage} 
                onEdit={onEdit} onDelete={onDelete} onCopyLink={onCopyLink} 
                currentUser={currentUser} onLike={onLike} 
            />
        </div>
      </main>

      <CreatePostDialog ref={createDlgRef} dict={{...DICT, games}} onCancel={closeCreate} onSave={createPost} />
      <EditPostDialog ref={editDlgRef} dict={{...DICT, games}} post={editingPost} onCancel={onEditCancel} onSave={onEditSave} />
      
      <MessageDialog 
        ref={msgDlgRef} post={messageTarget} chat={currentChat} 
        currentUser={currentUser} isLoading={isChatLoading} 
        onCancel={closeMessage} onSend={sendMessage} 
      />
      
      <AuthDialog ref={authDlgRef} onLogin={handleLogin} onRegister={handleRegister} onGoogleLogin={handleGoogleLogin} error={authError} />
      <ProfileDialog ref={profileDlgRef} user={currentUser} onLogout={handleLogout} onSaveProfile={handleSaveProfile} />
      <ChatListDialog ref={chatListDlgRef} currentUser={currentUser} onSelectChat={handleSelectChatFromList} />
    </>
  );
}