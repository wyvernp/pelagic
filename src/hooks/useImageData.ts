import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

/**
 * Hook to load image data via Tauri backend
 * Returns a base64 data URL that can be used as img src
 */
export function useImageData(filePath: string | null | undefined): {
  dataUrl: string | null;
  loading: boolean;
  error: string | null;
} {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setDataUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    invoke<string>('get_image_data', { filePath })
      .then((data) => {
        if (!cancelled) {
          setDataUrl(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load image:', err);
          setError(String(err));
          setDataUrl(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return { dataUrl, loading, error };
}
