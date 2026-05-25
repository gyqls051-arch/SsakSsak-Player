import { useEffect, useRef, useState } from 'react';

const VIDEO_EXTS = /\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv|ts|mts|mpg|mpeg)$/i;

/**
 * Window-wide file drag & drop handler. Calls `onFile` with the absolute path
 * of the dropped video file; reports an error string for unsupported files
 * or when the path can't be resolved (Electron 32+ webUtils).
 */
export function useDragDrop(
  onFile: (path: string) => void,
  onError: (msg: string) => void,
) {
  const [dragOver, setDragOver] = useState(false);
  const counterRef = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      counterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      counterRef.current--;
      if (counterRef.current <= 0) {
        counterRef.current = 0;
        setDragOver(false);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      counterRef.current = 0;
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const path = window.offcut.files.pathForFile(file);
      if (!path) {
        onError('파일 경로를 가져올 수 없습니다');
        return;
      }
      if (!VIDEO_EXTS.test(path)) {
        onError('지원하지 않는 파일 형식입니다');
        return;
      }
      onFile(path);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [onFile, onError]);

  return dragOver;
}
