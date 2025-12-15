import { useState, useEffect, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';

// LRU Cache for image data URLs to avoid re-fetching on scroll
const IMAGE_CACHE_MAX_SIZE = 300;
const imageCache = new Map<string, string>();

function getCachedImage(filePath: string): string | undefined {
  const cached = imageCache.get(filePath);
  if (cached) {
    // Move to end (most recently used)
    imageCache.delete(filePath);
    imageCache.set(filePath, cached);
  }
  return cached;
}

function setCachedImage(filePath: string, dataUrl: string): void {
  // Evict oldest entries if at capacity
  if (imageCache.size >= IMAGE_CACHE_MAX_SIZE) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) {
      imageCache.delete(firstKey);
    }
  }
  imageCache.set(filePath, dataUrl);
}

interface ImageLoaderProps {
  filePath: string | null | undefined;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}

/**
 * Component that loads images via Tauri backend
 * Displays a placeholder while loading
 */
export const ImageLoader = memo(function ImageLoader({
  filePath,
  alt,
  className,
  placeholderClassName,
}: ImageLoaderProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setDataUrl(null);
      setError(false);
      return;
    }

    // Check cache first
    const cached = getCachedImage(filePath);
    if (cached) {
      setDataUrl(cached);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    invoke<string>('get_image_data', { filePath })
      .then((data) => {
        if (!cancelled) {
          setCachedImage(filePath, data);
          setDataUrl(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to load image:', filePath, err);
          setError(true);
          setDataUrl(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (!filePath || error) {
    return (
      <div className={placeholderClassName || className}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
      </div>
    );
  }

  if (loading || !dataUrl) {
    return (
      <div className={placeholderClassName || className}>
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={className}
    />
  );
});
