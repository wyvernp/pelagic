import { useState, useEffect, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';

// LRU Cache for image data URLs
// Thumbnails are typically ~5-20KB each as base64
// With 500 entries and 150MB limit, we can cache multiple trips worth of thumbnails
const IMAGE_CACHE_MAX_SIZE = 500;
const imageCache = new Map<string, string>();

// Track approximate cache memory usage
let cacheMemoryBytes = 0;
const MAX_CACHE_MEMORY_BYTES = 150 * 1024 * 1024; // 150MB limit

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
  // Don't re-add if already cached
  if (imageCache.has(filePath)) {
    return;
  }
  
  const entrySize = dataUrl.length * 2; // Approximate bytes (UTF-16)
  
  // Evict entries if we're over memory limit or entry count limit
  while (
    (cacheMemoryBytes + entrySize > MAX_CACHE_MEMORY_BYTES || imageCache.size >= IMAGE_CACHE_MAX_SIZE) 
    && imageCache.size > 0
  ) {
    const firstKey = imageCache.keys().next().value;
    if (firstKey) {
      const evicted = imageCache.get(firstKey);
      if (evicted) {
        cacheMemoryBytes -= evicted.length * 2;
      }
      imageCache.delete(firstKey);
    }
  }
  
  imageCache.set(filePath, dataUrl);
  cacheMemoryBytes += entrySize;
}

// Export function to clear cache (only call on explicit user action or memory pressure)
export function clearImageCache(): void {
  imageCache.clear();
  cacheMemoryBytes = 0;
}

// Export cache stats for debugging
export function getImageCacheStats(): { size: number; memoryMB: number } {
  return {
    size: imageCache.size,
    memoryMB: Math.round(cacheMemoryBytes / 1024 / 1024 * 10) / 10,
  };
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
  // Initialize with cached value if available (synchronous, no loading state)
  const initialCached = filePath ? getCachedImage(filePath) : null;
  const [dataUrl, setDataUrl] = useState<string | null>(initialCached ?? null);
  const [loading, setLoading] = useState(!initialCached && !!filePath);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setDataUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    // Check cache first (in case filePath changed)
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
