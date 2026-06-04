import { useState, useEffect, useRef } from 'react';
import { extractScenePrompt, enhancePrompt, fetchGeneratedImage } from '../utils/imageGen';

export default function Message({ msg, onImageGenerate }) {
  const isUser = msg.type === 'user';
  const isSystem = msg.type === 'system';
  const isDice = msg.type === 'dice';
  const isDiceContext = msg._isDiceContext; // 结构化检定上下文
  const hasRollRequest = !isUser && !isSystem && /【检定请求/.test(msg.text || ''); // AI 请求检定
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgBlobUrl, setImgBlobUrl] = useState(null);
  const blobRef = useRef(null);

  // 组件卸载或换图时 revoke 旧 blob URL
  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  const showImageBtn = !isUser && !isSystem && !isDice && msg.text && msg.text.length > 30;

  const handleGenerateImage = async () => {
    setImgLoading(true);
    setImgError(false);

    try {
      // 生成前先 revoke 旧图 blob
      if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
      if (imgBlobUrl?.startsWith('blob:')) URL.revokeObjectURL(imgBlobUrl);

      const scenePrompt = extractScenePrompt(msg.text);
      const enhanced = enhancePrompt(scenePrompt);
      const { blobUrl, engine } = await fetchGeneratedImage(enhanced);

      blobRef.current = blobUrl;
      setImgBlobUrl(blobUrl);
      setImgLoading(false);

      if (onImageGenerate) {
        onImageGenerate({
          url: blobUrl,
          prompt: enhanced,
          engine,
          messageIndex: msg._index,
        });
      }
    } catch (err) {
      setImgLoading(false);
      setImgError(err.message || '生成失败');
    }
  };

  // 优先用 blob url，其次用 message.image
  const imageUrl = imgBlobUrl || msg.image?.url;
  const engine = msg.image?.engine || 'AI';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-bot'} ${isDice ? 'message-dice' : ''} ${isSystem ? 'message-system' : ''} ${isDiceContext ? 'message-dice-context' : ''} ${hasRollRequest ? 'message-roll-request' : ''}`}>
      <div className="message-avatar">
        {isUser ? '🧑' : isSystem ? '⚙️' : isDice ? '🎲' : '🐉'}
      </div>
      <div className="message-content">
        <div className="message-sender">
          {isUser ? '你' : isSystem ? '系统' : isDice ? '骰子' : '跑团助手'}
          <span className="message-time">{msg.time}</span>
        </div>
        <div
          className="message-text"
          dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }}
        />

        {/* 图片展示 */}
        {imageUrl && !imgError && (
          <div className="message-image-wrapper">
            <img
              src={imageUrl}
              alt="AI 生成场景"
              className="message-image"
              onError={() => setImgError(true)}
              onClick={() => window.open(imageUrl, '_blank')}
            />
            <div className="message-image-hint">点击查看大图 | 由 {engine} 生成</div>
          </div>
        )}

        {imgError && (
          <div className="message-image-error">
            🖼️ {typeof imgError === 'string' ? imgError : '图片加载失败'}
            <button className="retry-img-btn" onClick={() => { setImgError(false); handleGenerateImage(); }}>重试</button>
          </div>
        )}

        {/* 生成配图按钮 */}
        {showImageBtn && !imageUrl && (
          <button
            className="generate-image-btn"
            onClick={handleGenerateImage}
            disabled={imgLoading}
          >
            {imgLoading ? '⏳ 生成中...' : '🖼️ 生成场景配图'}
          </button>
        )}
      </div>
    </div>
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMessage(text) {
  // 先转义 HTML 防止 XSS，再做 markdown 替换
  let html = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>');

  // 高亮 AI 检定请求: 【检定请求：STAT，DCn】...（在已转义的文本上匹配安全）
  html = html.replace(
    /(【检定请求[：:]\s*\w+\s*[，,]\s*DC\s*\d+】?[\s\S]*?检定)/g,
    '<span class="roll-request-tag">$1</span>'
  );

  // 高亮结构化检定结果块
  html = html.replace(
    /(━━━━━━[\s\S]*?━━━━━━━━━━━━━━━━━━━━)/g,
    '<div class="dice-context-block">$1</div>'
  );

  return html.replace(/\n/g, '<br/>');
}
