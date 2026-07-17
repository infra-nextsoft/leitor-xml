import { useMemo, useState } from 'react';
import { XMLRecord } from '@/lib/db';
import { Hash, AlertCircle, Copy, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GapAnalysisProps {
  records: XMLRecord[];
}

export function GapAnalysis({ records }: GapAnalysisProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const analysis = useMemo(() => {
    if (records.length < 2) return { gaps: [], min: 0, max: 0, total: 0 };

    const numbers = records
      .map(r => parseInt(r.nNF, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    const min = numbers[0];
    const max = numbers[numbers.length - 1];
    const uniqueNumbers = Array.from(new Set(numbers));
    const gaps: number[] = [];

    // O(N) gap collection instead of O(Range) to prevent UI freezing on large gaps
    for (let i = 0; i < uniqueNumbers.length - 1; i++) {
      const current = uniqueNumbers[i];
      const next = uniqueNumbers[i + 1];
      if (next - current > 1) {
        for (let g = current + 1; g < next; g++) {
          gaps.push(g);
          if (gaps.length >= 2000) break;
        }
      }
      if (gaps.length >= 2000) break;
    }

    return { gaps, min, max, total: max - min + 1 };
  }, [records]);

  const totalPages = Math.ceil(analysis.gaps.length / pageSize);
  const paginatedGaps = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return analysis.gaps.slice(start, start + pageSize);
  }, [analysis.gaps, currentPage, pageSize]);

  const copyGaps = () => {
    navigator.clipboard.writeText(analysis.gaps.join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (records.length < 2) {
    return (
      <div className="p-12 text-center bg-brand-blue/5 border border-brand-blue/10 rounded-md">
        <AlertCircle className="w-8 h-8 text-brand-blue/40 mx-auto mb-4" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/40 italic">Importe pelo menos 2 XMLs para analisar lacunas na numeração.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Lacunas de Numeração</h2>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <span className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] block">Range Identificado</span>
            <span className="text-xs font-mono text-brand-blue font-bold tracking-tighter">{analysis.min} ➜ {analysis.max}</span>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase text-brand-navy/30 tracking-[0.2em]">Exibir:</span>
              <select 
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-white border border-slate-200 text-brand-navy text-[10px] font-bold py-1 px-1.5 rounded focus:outline-none focus:border-brand-blue transition-all"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={analysis.gaps.length || 9999}>Todos</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-1 hover:bg-brand-blue/5 rounded text-brand-blue/40 hover:text-brand-navy disabled:opacity-10 transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[10px] font-mono font-black text-brand-navy/40 min-w-[40px] text-center">
                {currentPage} / {totalPages || 1}
              </span>
              <button 
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-1 hover:bg-brand-blue/5 rounded text-brand-blue/40 hover:text-brand-navy disabled:opacity-10 transition-all font-bold"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-100" />
          <button 
            disabled={analysis.gaps.length === 0}
            onClick={copyGaps}
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] bg-white border border-brand-blue/10 hover:border-brand-blue/30 hover:text-brand-blue py-2 px-4 rounded text-brand-navy transition-all disabled:opacity-30 shadow-sm"
          >
            {isCopied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
            {isCopied ? "Copiado!" : "Copiar Lacunas"}
          </button>
        </div>
      </div>

      <div className="p-6">
        {analysis.gaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
               <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Sequência Inteira</h3>
            <p className="text-brand-navy/40 text-xs font-medium mt-1">Nenhum cupom faltando entre {analysis.min} e {analysis.max}.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-5 bg-brand-melon/5 border border-brand-melon/10 rounded">
              <AlertCircle className="text-brand-melon w-6 h-6 flex-shrink-0" />
              <p className="text-[11px] font-medium text-brand-navy/80 leading-relaxed italic">
                 Identificamos <b className="text-brand-melon">{analysis.gaps.length}</b> {analysis.gaps.length === 1 ? 'número faltante' : 'números faltantes'} na sequência.
                 {analysis.gaps.length > 2000 && <span className="block mt-1 opacity-60">(Limitado aos primeiros 2000 para performance)</span>}
              </p>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
               {paginatedGaps.map(num => (
                  <div key={num} className="bg-brand-blue/5 border border-brand-blue/10 p-1.5 rounded text-center transition-all hover:border-brand-melon shadow-sm group">
                     <span className="text-[10px] font-mono font-bold text-brand-blue/40 group-hover:text-brand-melon transition-colors">{num}</span>
                  </div>
               ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between">
         <span className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em]">Total no Range: <span className="text-brand-navy">{analysis.total}</span></span>
         <span className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em]">Presentes: <span className="text-brand-navy">{records.length}</span></span>
      </div>
    </div>
  );
}
