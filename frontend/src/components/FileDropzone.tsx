import { useCallback, useRef, useState } from 'react';

export function FileDropzone({
  onFile,
  accept,
  helper,
}: {
  onFile: (file: File) => void;
  accept?: string;
  helper?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.item(0);
      if (!file) return;
      onFile(file);
    },
    [onFile],
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div
        className={`rounded-2xl border-2 border-dashed p-6 transition ${
          dragging ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-sm font-semibold text-slate-900">Arraste e solte a planilha aqui</div>
          <div className="text-xs text-slate-600">ou clique para selecionar</div>
          {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
          <button
            type="button"
            className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={pick}
          >
            Selecionar arquivo
          </button>
        </div>
      </div>
    </div>
  );
}
