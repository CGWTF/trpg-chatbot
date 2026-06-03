export default function StorySidebar({
  stories,
  currentId,
  onSwitch,
  onDelete,
  onNew,
  isOpen,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="story-sidebar" onClick={e => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>📜 冒险记录</h3>
          <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        </div>

        <button className="new-story-btn" onClick={() => { onNew(); onClose(); }}>
          ✨ 开始新冒险
        </button>

        <div className="story-list">
          {stories.length === 0 && (
            <div className="story-empty">还没有冒险记录，开始你的第一段旅程吧！</div>
          )}

          {stories.map(story => (
            <div
              key={story.id}
              className={`story-item ${story.id === currentId ? 'story-item-active' : ''}`}
              onClick={() => { onSwitch(story.id); onClose(); }}
            >
              <div className="story-item-content">
                <div className="story-item-title">
                  {story.id === currentId && <span className="story-active-dot">●</span>}
                  {story.title}
                </div>
                <div className="story-item-meta">
                  <span>{formatDate(story.updatedAt)}</span>
                  <span>{story.messages.length} 条消息</span>
                </div>
              </div>
              <button
                className="story-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('确定要删除这个冒险记录吗？')) {
                    onDelete(story.id);
                  }
                }}
                title="删除"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
