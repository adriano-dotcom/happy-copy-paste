import { useState, useEffect } from 'react';

// Global cache to avoid re-generating thumbnails
const thumbnailCache = new Map<string, string>();

export function useVideoThumbnail(videoUrl: string | null): {
  thumbnail: string | null;
  isLoading: boolean;
  error: boolean;
} {
  const [thumbnail, setThumbnail] = useState<string | null>(
    videoUrl ? thumbnailCache.get(videoUrl) || null : null
  );
  const [isLoading, setIsLoading] = useState(!thumbnail && !!videoUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!videoUrl) {
      setThumbnail(null);
      setIsLoading(false);
      setError(false);
      return;
    }

    // Check cache first
    const cached = thumbnailCache.get(videoUrl);
    if (cached) {
      setThumbnail(cached);
      setIsLoading(false);
      setError(false);
      return;
    }

    setIsLoading(true);
    setError(false);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let isCleanedUp = false;

    const cleanup = () => {
      isCleanedUp = true;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };

    const handleError = () => {
      if (isCleanedUp) return;
      console.warn('[useVideoThumbnail] Failed to load video:', videoUrl);
      setError(true);
      setIsLoading(false);
      cleanup();
    };

    const handleSeeked = () => {
      if (isCleanedUp) return;
      
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 160;
        canvas.height = video.videoHeight || 90;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          
          // Cache the result
          thumbnailCache.set(videoUrl, dataUrl);
          
          // Limit cache size to prevent memory issues
          if (thumbnailCache.size > 100) {
            const firstKey = thumbnailCache.keys().next().value;
            if (firstKey) thumbnailCache.delete(firstKey);
          }
          
          setThumbnail(dataUrl);
        }
      } catch (e) {
        console.warn('[useVideoThumbnail] Canvas capture failed:', e);
        setError(true);
      }
      
      setIsLoading(false);
      cleanup();
    };

    const handleLoadedData = () => {
      if (isCleanedUp) return;
      // Seek to 0.1s to get a useful frame (not always black)
      video.currentTime = 0.1;
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);

    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      if (!isCleanedUp && isLoading) {
        handleError();
      }
    }, 5000);

    video.src = videoUrl;

    return () => {
      clearTimeout(timeout);
      cleanup();
    };
  }, [videoUrl]);

  return { thumbnail, isLoading, error };
}
