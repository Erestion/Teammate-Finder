import { useState, memo } from "react";

// --- 1. ОКРЕМИЙ КОМПОНЕНТ КАРТКИ (Оптимізація рендеру) ---
const PostCard = memo(({ 
  p, 
  index, // для анімації появи
  formatAgo, 
  favorites, 
  onToggleFavorite, 
  onMessage, 
  onEdit, 
  onDelete, 
  onCopyLink, 
  currentUser, 
  onLike 
}) => {
  // Стейт "Read more" тепер локальний для кожної картки
  const [isExpanded, setIsExpanded] = useState(false);

  const isNew = (iso) => {
    if (!iso) return false;
    return Date.now() - new Date(iso).getTime() < 24 * 60 * 60 * 1000;
  };

  // Перевірки
  const fav = favorites.has(p.id);
  const canEdit = (currentUser && p.author && currentUser.username === p.author.name) || (currentUser?.isAdmin);
  
  // Аватар (Dicebear як фолбек)
  const avatarSrc = p.author?.avatar 
    ? p.author.avatar 
    : `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(p.author?.name || "anon")}`;

  // Лайки
  const isLiked = p.likes && currentUser && p.likes.includes(currentUser.id);
  const likesCount = p.likes ? p.likes.length : 0;

  return (
    <article
      id={p.id} // <--- КРИТИЧНО ВАЖЛИВО ДЛЯ СКРОЛУ
      className="card animate-stagger"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="card__head">
        <div className="card__head-left">
          <img
            className="avatar"
            src={avatarSrc}
            alt={p.author?.name || "User"}
            loading="lazy" // <--- Ліниве завантаження картинок
            style={{ objectFit: "cover", background: "#eee" }} 
          />
          
          <div>
            <div className="titleline">
              <h4 className="title" title={p.title}>{p.title}</h4>
              {isNew(p.createdAt) && (
                <span className="badge badge--new">NEW</span>
              )}
            </div>
            <div className="meta">
              <span className="author-name">{p.author?.name}</span> • {p.game} • {p.level} • {p.lang} • {p.platform} • {formatAgo(p.createdAt)}
            </div>
          </div>
        </div>

        <div className="card__actions">
          <button
            className="btn btn--icon"
            type="button"
            onClick={() => onCopyLink(p.id)}
            title="Copy Link"
          >
            🔗
          </button>

          {canEdit && (
            <>
              <button
                className="btn btn--icon"
                type="button"
                onClick={() => onEdit(p)}
                title="Edit Post"
              >
                ✎
              </button>
              <button
                className="btn btn--icon btn-icon--danger"
                type="button"
                onClick={() => onDelete(p.id)}
                title="Delete Post"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>

      <p className={`desc ${isExpanded ? "desc--open" : ""}`}>
        {p.desc}
      </p>
      
      {/* Показуємо кнопку тільки якщо текст довгий */}
      {p.desc && p.desc.length > 120 && (
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Read less" : "Read more"}
        </button>
      )}

      <div className="tags">
        {(p.tags || []).map((t) => (
          <span className="tag" key={t}>#{t}</span>
        ))}
      </div>

      <div className="card__foot" style={{ justifyContent: "flex-end" }}> 
        <div style={{ display: "flex", gap: 8 }}>
          
          <button
            className="btn"
            onClick={() => onLike(p.id)}
            type="button"
            style={{ 
                minWidth: '60px', 
                borderColor: isLiked ? '#ffd700' : 'var(--border)',
                color: isLiked ? '#d4af37' : 'var(--text-main)'
            }}
            title={isLiked ? "Unlike" : "Like"}
          >
            {isLiked ? "★" : "☆"} 
            <span style={{marginLeft: 6, fontWeight: 'bold'}}>
                {likesCount}
            </span>
          </button>

          <button
            className="btn"
            onClick={() => onToggleFavorite(p.id)}
            type="button"
            title={fav ? "Remove from saved" : "Save post"}
          >
            {fav ? "★ Saved" : "☆ Save"}
          </button>
          
          {(!currentUser || currentUser.username !== p.author?.name) && (
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => onMessage(p)}
            >
              Message
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

// --- 2. ГОЛОВНИЙ КОМПОНЕНТ GRID (Тепер чистий і легкий) ---
export default function Grid({ items, ...props }) {
  if (!items || items.length === 0) {
    return null; 
  }

  return (
    <section className="grid" id="grid">
      {items.map((p, index) => (
        <PostCard 
          key={p.id} 
          p={p} 
          index={index} 
          {...props} // Прокидаємо всі функції (onLike, onEdit...) вниз
        />
      ))}
    </section>
  );
}