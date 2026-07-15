import { useState, useRef, useCallback, useEffect } from 'react';
import type { DragEvent } from 'react';

interface Options {
  onImages: (files: File[]) => void;
  onPdf: (file: File) => void;
  /** Dezactivează drag/drop + paste (ex. la trimitere) */
  enabled?: boolean;
}

// Împarte o listă de fișiere pe tipuri: imagini vs PDF (după MIME real).
function splitFiles(list: FileList | File[]) {
  const images: File[] = [];
  let pdf: File | null = null;
  for (const f of Array.from(list)) {
    if (f.type.startsWith('image/')) images.push(f);
    else if (f.type === 'application/pdf' && !pdf) pdf = f;
  }
  return { images, pdf };
}

/**
 * Drag & drop + paste pentru o zonă de upload (imagini + PDF).
 * Întoarce `dragActive` (pentru feedback vizual) și `dropHandlers` de pus pe container.
 * Paste-ul e ascultat global cât timp componenta e montată, dar acționează DOAR
 * dacă în clipboard există fișiere reale (imagini/PDF) — nu interferează cu paste de text.
 */
export function useFileDrop({ onImages, onPdf, enabled = true }: Options) {
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);

  const dispatch = useCallback((list: FileList | File[]) => {
    const { images, pdf } = splitFiles(list);
    if (images.length) onImages(images);
    if (pdf) onPdf(pdf);
  }, [onImages, onPdf]);

  const onDragEnter = useCallback((e: DragEvent) => {
    if (!enabled) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }, [enabled]);

  const onDragOver = useCallback((e: DragEvent) => {
    if (!enabled) return;
    if (!Array.from(e.dataTransfer?.types ?? []).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [enabled]);

  const onDragLeave = useCallback((e: DragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }, [enabled]);

  const onDrop = useCallback((e: DragEvent) => {
    if (!enabled) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (e.dataTransfer?.files?.length) dispatch(e.dataTransfer.files);
  }, [enabled, dispatch]);

  // Guard global: un fișier scăpat în afara zonei (pe restul paginii) ar face
  // browserul să-l deschidă și să piardă formularul. Prevenim asta DOAR pentru
  // drag-uri de fișiere — drag-drop de text în inputuri rămâne funcțional.
  useEffect(() => {
    if (!enabled) return;
    const guard = (e: globalThis.DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, [enabled]);

  // Paste global (imagini din screenshot / fișiere copiate)
  useEffect(() => {
    if (!enabled) return;
    const handlePaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const hasRelevant = Array.from(files).some(
        (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
      );
      if (!hasRelevant) return;
      e.preventDefault();
      dispatch(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled, dispatch]);

  return {
    dragActive,
    dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
