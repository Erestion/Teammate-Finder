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
  
  // --- PAGINATION STATE ---
  const PAGE_SIZE = 9; // Скільки карток показувати за раз
  const [page, setPage] = useState(1);
  
  // Стейт чату
  const [messageTarget, setMessageTarget] = useState(null);
  const [currentChat, setCurrentChat] = useState(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  const clearAll = () => {
    setQ("");
    setSelectedTags(new Set());
    setFlt({ game: "", level: "", lang: "", platform: "", time: "" });
    setSortBy("score");
    setSavedOnly(false);
  };
    

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
  
Є дві помилки у коді логіки, який ти надіслав вище:

    Циклічна залежність: Ти намагаєшся створити змінну paginatedPosts всередині useMemo, використовуючи змінну visible, яку цей useMemo ще тільки створює. Це призведе до помилки.

    Scope (Область видимості): hasMore ти обчислюєш всередині useEffect, тому він недоступний для рендеру (JSX).

Ось виправлена логіка і приклад рендеру (Крок 4), який ти просив.
Частина 1: Виправлена Логіка (встав це перед return)

Заміни свій блок visible та useEffect на цей код. Тут чітко розділено: 1) фільтрацію всіх постів, 2) скидання сторінки, 3) нарізку для відображення.
JavaScript

// --- 1. ФІЛЬТРАЦІЯ ТА СОРТУВАННЯ (ПОВНИЙ СПИСОК) ---
// Цей useMemo обчислює повний, відсортований список
const visible = useMemo(() => {
    // Спочатку фільтруємо
    const filtered = posts.filter(p => {
        if (savedOnly && !favorites.has(p.id)) return false;
        if (selectedTags.size > 0) {
            const postTags = new Set(p.tags || []);
            for (const t of selectedTags) {
                if (!postTags.has(t)) return false;
            }
        }
        if (flt.game && p.game !== flt.game) return false;
        if (flt.level && p.level !== flt.level) return false;
        if (flt.lang && p.lang !== flt.lang) return false;
        if (flt.platform && p.platform !== flt.platform) return false;
        if (flt.time && p.time !== flt.time) return false;
        if (q) {
            const h = (p.title + " " + (p.desc || "") + " " + p.game).toLowerCase();
            if (!h.includes(q.toLowerCase())) return false;
        }
        return true;
    });

    // Потім сортуємо
    return filtered.sort((a, b) => {
        switch (sortBy) {
            case "date":
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            case "title":
                return a.title.localeCompare(b.title);
            case "score":
            default:
                const likesA = Array.isArray(a.likes) ? a.likes.length : 0;
                const likesB = Array.isArray(b.likes) ? b.likes.length : 0;
                if (likesB !== likesA) return likesB - likesA;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        }
    });

}, [posts, q, savedOnly, favorites, flt, selectedTags, sortBy]);

// ----------------------------------------------------------------------

// --- 2. СКИДАННЯ СТОРІНКИ ПРИ ЗМІНІ ФІЛЬТРІВ ---

useEffect(() => {
    setPage(1);
    // ❌ ВАЖЛИВО: Змінні пагінації (hasMore, paginatedPosts) не потрібні тут
}, [q, selectedTags, flt, sortBy, savedOnly]);

// ----------------------------------------------------------------------

// --- 3. НАРІЗКА (PAGINATION) ---

const paginatedPosts = visible.slice(0, page * PAGE_SIZE);
const hasMore = visible.length > paginatedPosts.length;
  
  useEffect(() => {
    // Чекаємо, поки завантажаться пости
    if (posts.length === 0) return;

    // Перевіряємо, чи є хеш в URL (наприклад, #post123)
    const hash = window.location.hash.slice(1);
    
    if (hash) {
      // Робимо паузу, щоб React встиг відмалювати Grid з новими постами
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Опціонально: блимнути, щоб привернути увагу (якщо є CSS для цього)
          el.style.transition = "background 0.5s";
          const oldBg = el.style.backgroundColor;
          el.style.backgroundColor = "rgba(255, 255, 0, 0.3)"; // Жовта підсвітка
          setTimeout(() => { el.style.backgroundColor = oldBg; }, 1500);
        }
      }, 500);
    }
  }, [posts]); // Цей ефект спрацює щоразу, коли оновиться список постів
  
  
  const onCopyLink = async (id) => {
    // Формуємо повне посилання з ID в кінці
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
    
    try {
      await navigator.clipboard.writeText(url);
      alert("Посилання на пост скопійовано в буфер обміну!");
    } catch (err) {
      console.error("Не вдалося скопіювати:", err);
      // Запасний варіант, якщо буфер недоступний
      prompt("Ваш браузер не дозволив авто-копіювання. Скопіюйте вручну:", url);
    }
  };
  
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
        <Toolbar 
            dict={{...DICT, games}} 
            selectedTags={selectedTags} 
            toggleTag={t => { const n=new Set(selectedTags); n.has(t)?n.delete(t):n.add(t); setSelectedTags(n); }} 
            flt={flt} 
            setFlt={setFlt} 
            className={isToolbarOpen?"is-open":""} 
            onClose={()=>setIsToolbarOpen(false)} 
        />

        <div className="content-area">
            {/* --- ПАНЕЛЬ СОРТУВАННЯ ТА ФІЛЬТРІВ (Перенесено вгору для зручності) --- */}
            <div className="resultbar" style={{ gap: 12, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            checked={savedOnly}
                            onChange={(e) => setSavedOnly(e.target.checked)}
                        />
                        <span>Saved only</span>
                    </label>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>Sort by</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        id="sortBy"
                    >
                        <option value="score">Best match</option>
                        <option value="date">Newest</option>
                        <option value="title">Title A–Z</option>
                    </select>
                </div>
                {/* Показуємо кількість знайденого */}
                <div style={{marginLeft: "auto", color: "#888", fontSize: "0.9em"}}>
                    Found: {visible.length}
                </div>
            </div>

            {/* --- СПИСОК ПОСТІВ АБО EMPTY STATE --- */}
            {visible.length === 0 ? (
                <div className="empty">No results. Try removing some filters.</div>
            ) : (
                <>
                    {/* ТУТ ПЕРЕДАЄМО paginatedPosts ЗАМІСТЬ visible */}
                    <Grid 
                        items={paginatedPosts} 
                        formatAgo={formatAgo} 
                        favorites={favorites} 
                        onToggleFavorite={toggleFavorite} 
                        onMessage={openMessage} 
                        onEdit={onEdit} 
                        onDelete={onDelete} 
                        onCopyLink={onCopyLink} 
                        currentUser={currentUser} 
                        onLike={onLike} 
                    />

                    {/* --- КНОПКА LOAD MORE --- */}
                    {hasMore && (
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 30, marginBottom: 30 }}>
                            <button 
                                className="btn btn--secondary"
                                onClick={() => setPage(p => p + 1)}
                                style={{ minWidth: 200 }}
                            >
                                Load More ({visible.length - paginatedPosts.length} left)
                            </button>
                        </div>
                    )}
                </>
            )}
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