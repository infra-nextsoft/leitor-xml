import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileCode, FolderSearch, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';

interface FileUploadProps {
  onProcessingStart: () => void;
  onProgress: (current: number, total: number, batch: any[], cancellationsBatch?: any[]) => void;
  onComplete: () => void;
  onClear?: () => void;
}

export function FileUpload({ onProcessingStart, onProgress, onComplete, onClear }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    const directXmls = filesArray.filter(f => f.name.toLowerCase().endsWith('.xml'));
    const zipFiles = filesArray.filter(f => f.name.toLowerCase().endsWith('.zip'));

    if (directXmls.length === 0 && zipFiles.length === 0) return;

    setIsProcessing(true);
    onProcessingStart();

    const xmlFiles: File[] = [...directXmls];

    if (zipFiles.length > 0) {
      for (const zipFile of zipFiles) {
        try {
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(zipFile);
          
          for (const relativePath of Object.keys(zipContent.files)) {
            const zipEntry = zipContent.files[relativePath];
            if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.xml')) {
              const xmlText = await zipEntry.async('string');
              const baseName = relativePath.split(/[/\\]/).pop() || relativePath;
              const extractedFile = new File([xmlText], baseName, { type: 'text/xml' });
              xmlFiles.push(extractedFile);
            }
          }
        } catch (err) {
          console.error(`Erro ao descompactar arquivo ZIP ${zipFile.name}:`, err);
        }
      }
    }

    if (xmlFiles.length === 0) {
      setIsProcessing(false);
      onComplete();
      return;
    }

    // Determine optimal number of workers (max 4 to prevent CPU exhaustion)
    const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 4);
    const activeWorkersCount = xmlFiles.length < 50 ? 1 : numWorkers;

    // Distribute files round-robin among chunks
    const chunks: File[][] = Array.from({ length: activeWorkersCount }, () => []);
    xmlFiles.forEach((file, index) => {
      chunks[index % activeWorkersCount].push(file);
    });

    let completedWorkers = 0;
    const processedCounts = new Array(activeWorkersCount).fill(0);
    const workers: Worker[] = [];

    for (let i = 0; i < activeWorkersCount; i++) {
      const chunk = chunks[i];
      if (chunk.length === 0) {
        completedWorkers++;
        if (completedWorkers === activeWorkersCount) {
          setIsProcessing(false);
          onComplete();
        }
        continue;
      }

      const worker = new Worker(new URL('../workers/xmlProcessor.worker.ts', import.meta.url), {
        type: 'module'
      });
      workers.push(worker);

      worker.postMessage({ files: chunk });

      worker.onmessage = (e) => {
        const { type, current, batch, cancellationsBatch } = e.data;
        if (type === 'PROGRESS') {
          processedCounts[i] = current;
          const aggregatedCurrent = processedCounts.reduce((sum, count) => sum + count, 0);
          onProgress(aggregatedCurrent, xmlFiles.length, batch || [], cancellationsBatch || []);
        } else if (type === 'COMPLETE') {
          completedWorkers++;
          if (completedWorkers === activeWorkersCount) {
            setIsProcessing(false);
            onComplete();
            workers.forEach(w => w.terminate());
          }
        }
      };

      worker.onerror = (err) => {
        console.error(`Erro no worker ${i} do pool:`, err);
        completedWorkers++;
        if (completedWorkers === activeWorkersCount) {
          setIsProcessing(false);
          onComplete();
          workers.forEach(w => w.terminate());
        }
      };
    }
  }, [onProcessingStart, onProgress, onComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  return (
    <div 
      className={cn(
        "relative bg-slate-50/50 backdrop-blur-md border border-slate-200 transition-all p-8 rounded-md flex flex-col md:flex-row items-center gap-8 justify-between group",
        isDragging ? "border-brand-blue/50 bg-brand-blue/5 shadow-[0_0_30px_rgba(43,70,204,0.05)]" : "hover:border-brand-blue/20",
        isProcessing && "opacity-50 pointer-events-none"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input 
        type="file" 
        multiple 
        accept=".xml,.zip" 
        className="hidden" 
        ref={fileInputRef}
        onChange={(e) => e.target.files && processFiles(e.target.files)}
      />
      <input 
        type="file" 
        {...({ webkitdirectory: "", directory: "" } as any)} 
        className="hidden" 
        ref={folderInputRef}
        onChange={(e) => e.target.files && processFiles(e.target.files)}
      />

      <div className="flex items-center gap-6">
        <div className={cn(
          "w-12 h-12 rounded-md flex items-center justify-center transition-all",
          isDragging ? "bg-brand-blue/20 text-brand-blue" : "bg-white border border-brand-blue/10 text-brand-blue group-hover:text-brand-blue group-hover:border-brand-blue/40 shadow-sm"
        )}>
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Upload className="w-5 h-5" />
          )}
        </div>
        
        <div className="text-left">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy mb-1">
            {isProcessing ? "Executando Análise" : "Importação de Arquivos"}
          </h3>
          <p className="text-brand-navy/70 text-[11px] font-bold max-w-xs leading-relaxed">
            {isProcessing 
              ? "Aguarde enquanto processamos os XMLs localmente..." 
              : "Arraste seus arquivos (.xml, .zip) aqui ou use as opções ao lado."}
          </p>
        </div>
      </div>

      {!isProcessing && (
        <div className="flex gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-white border border-brand-blue/10 hover:border-brand-blue/30 text-brand-navy text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-md transition-all active:scale-95 shadow-sm"
          >
            <FileCode size={14} className="text-brand-blue" />
            Selecionar Arquivos
          </button>
          <button 
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-2 bg-white border border-brand-blue/10 hover:border-brand-blue/30 text-brand-navy text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-md transition-all active:scale-95 shadow-sm"
          >
            <FolderSearch size={14} className="text-brand-blue" />
            Pasta Completa
          </button>
          {onClear && (
             <button 
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="flex items-center gap-2 bg-brand-melon/5 border border-brand-melon/20 hover:bg-brand-melon/10 text-brand-melon text-[10px] font-black uppercase tracking-widest py-2.5 px-5 rounded-md transition-all active:scale-95"
              >
                <Trash2 size={14} />
                Limpar Banco
              </button>
          )}
        </div>
      )}
    </div>
  );
}
