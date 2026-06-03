import { useState } from 'react';
import { extractScenePrompt, enhancePrompt, fetchGeneratedImage } from '../utils/imageGen';

export default function Message({ msg, onImageGenerate }) {
  const isUser = msg.type === 'user';
  const isSystem = msg.type === 'system';
  const isDice = msg.type === 'dice';
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgBlobUrl, setImgBlobUrl] = useState(null);

  const showImageBtn = !isUser && !isSystem && !isDice && msg.text && msg.text.length > 30;

  const handleGenerateImage = async () => {
    setImgLoading(true);
    setImgError(false);

    try {
      const scenePrompt = extractScenePrompt(msg.text);
      const enhanced = enhancePrompt(scenePrompt);
      const blobUrl = await fetchGeneratedImage(enhanced);

      setImgBlobUrl(blobUrl);
      setImgLoading(false);

      if (onImageGenerate) {
        onImageGenerate({
          url: blobUrl,
          prompt: enhanced,
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
    <div className={`message ${isUser ? 'message-user' : 'message-bot'} ${isDice ? 'message-dice' : ''} ${isSystem ? 'message-system' : ''}`}>
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

function formatMessage(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}
