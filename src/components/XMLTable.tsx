import { useState, useMemo } from 'react';
import { XMLRecord } from '@/lib/db';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search, List } from 'lucide-react';

interface XMLTableProps {
  records: XMLRecord[];
  selectedMod: 'all' | '55' | '65';
  onModChange: (mod: 'all' | '55' | '65') => void;
}

export function XMLTable({ records, selectedMod, onModChange }: XMLTableProps) {
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRecords = useMemo(() => {
    const searchLow = searchTerm.toLowerCase().trim();
    if (!searchLow) return records;

    return records.filter(rec => 
      String(rec.nNF).toLowerCase().includes(searchLow) || 
      String(rec.cpf).toLowerCase().includes(searchLow) ||
      String(rec.chave).toLowerCase().includes(searchLow) ||
      String(rec.fileName).toLowerCase().includes(searchLow) ||
      String(rec.vProd).includes(searchLow) ||
      String(rec.vNF).includes(searchLow) ||
      formatCurrency(rec.vProd).toLowerCase().includes(searchLow) ||
      formatCurrency(rec.vNF).toLowerCase().includes(searchLow) ||
      (rec.mod && (rec.mod === '55' ? '55 - nfe' : rec.mod === '65' ? '65 - nfce' : rec.mod.toLowerCase()).includes(searchLow)) ||
      (rec.tpNF && (rec.tpNF === '0' ? 'entrada' : rec.tpNF === '1' ? 'saída' : rec.tpNF.toLowerCase()).includes(searchLow)) ||
      (rec.serie && rec.serie.toLowerCase().includes(searchLow))
    );
  }, [records, searchTerm]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const formatMod = (mod?: string) => {
    if (mod === '55') return '55 - NFe';
    if (mod === '65') return '65 - NFCe';
    return mod || '---';
  };

  const formatTpNF = (tpNF?: string) => {
    if (tpNF === '0') return 'Entrada';
    if (tpNF === '1') return 'Saída';
    return tpNF || '---';
  };

  const highlightText = (text: string, search: string) => {
    if (!search.trim()) return text;
    const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return (
      <>
        {parts.map((part, index) => 
          regex.test(part) 
            ? <span key={index} className="bg-yellow-300 text-brand-navy font-bold">{part}</span> 
            : part
        )}
      </>
    );
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Unificado */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Lista de Registros Importados</h2>
        </div>
      </div>

      <div className="flex flex-col h-full bg-white">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/10">
          <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto flex-1">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-blue/40 group-focus-within:text-brand-blue transition-colors" size={16} />
              <input
                type="text"
                placeholder="Buscar por cupom, chave, CPF, arquivo ou valor..."
                className="w-full bg-white border border-slate-200 text-brand-navy text-xs py-2.5 pl-10 pr-4 rounded focus:outline-none focus:border-brand-blue transition-all font-medium placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <select
              value={selectedMod}
              onChange={(e) => onModChange(e.target.value as any)}
              className="w-full sm:w-auto px-3 py-2.5 bg-white border border-slate-200 rounded text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all"
            >
              <option value="all">Todos os Modelos</option>
              <option value="65">65 - NFCe</option>
              <option value="55">55 - NFe</option>
            </select>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-brand-navy/50 tracking-[0.2em]">Exibir:</span>
              <select 
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-white border border-slate-200 text-brand-navy text-[10px] font-bold py-1 px-2 rounded focus:outline-none focus:border-brand-blue transition-all"
              >
                <option value={20}>20</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
                <option value={999999}>Todos</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-1.5 hover:bg-brand-blue/5 rounded text-brand-blue/40 hover:text-brand-navy disabled:opacity-20 transition-all font-bold"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[10px] font-mono font-black text-brand-navy/40 tracking-tighter">
                <span className="text-brand-navy">{currentPage}</span> / {totalPages || 1}
              </span>
              <button 
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy disabled:opacity-20 transition-all font-bold"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] whitespace-nowrap">Nº Cupom</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] whitespace-nowrap">Série</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] whitespace-nowrap">Modelo</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] whitespace-nowrap">Data/Hora</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] text-right whitespace-nowrap">Bruto</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] text-right whitespace-nowrap">Desc.</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] text-right whitespace-nowrap">Líquido</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] text-center whitespace-nowrap">CPF</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] min-w-[320px]">Chave de acesso</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy font-bold uppercase tracking-[0.2em] whitespace-nowrap">Movimentação</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((rec) => (
                <tr key={rec.chave} className="border-b border-slate-100/60 hover:bg-slate-50/30 transition-all">
                  <td className="p-4 text-[10px] font-mono text-brand-navy font-bold whitespace-nowrap">{highlightText(rec.nNF, searchTerm)}</td>
                  <td className="p-4 text-[10px] font-mono text-brand-navy font-bold whitespace-nowrap">{highlightText(rec.serie || '---', searchTerm)}</td>
                  <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{highlightText(formatMod(rec.mod), searchTerm)}</td>
                  <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{formatDateTime(rec.dhEmi)}</td>
                  <td className="p-4 text-[10px] font-mono font-bold text-brand-navy font-bold text-right whitespace-nowrap">{highlightText(formatCurrency(rec.vProd), searchTerm)}</td>
                  <td className="p-4 text-[10px] font-mono text-brand-melon font-bold text-right whitespace-nowrap">-{highlightText(formatCurrency(rec.vDesc), searchTerm)}</td>
                  <td className="p-4 text-[10px] font-mono font-black text-brand-navy text-right whitespace-nowrap">{highlightText(formatCurrency(rec.vNF), searchTerm)}</td>
                  <td className="p-4 text-[10px] font-medium text-brand-navy/40 text-center whitespace-nowrap">{highlightText(rec.cpf || '---', searchTerm)}</td>
                  <td className="p-4 text-[10px] font-mono text-brand-blue font-bold whitespace-nowrap">{highlightText(rec.chave, searchTerm)}</td>
                  <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{highlightText(formatTpNF(rec.tpNF), searchTerm)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50/80 sticky bottom-0 backdrop-blur-sm border-t border-slate-100">
              <tr>
                 <td colSpan={4} className="p-4 text-[10px] font-black uppercase text-brand-navy/60 tracking-[0.2em]">Subtotal Página</td>
                 <td className="p-4 text-right text-[10px] font-mono font-bold text-brand-navy">
                    {formatCurrency(paginatedRecords.reduce((s, r) => s + r.vProd, 0))}
                 </td>
                 <td className="p-4 text-right text-[10px] font-mono font-bold text-brand-melon">
                    -{formatCurrency(paginatedRecords.reduce((s, r) => s + r.vDesc, 0))}
                 </td>
                 <td className="p-4 text-right text-[10px] font-mono font-black text-brand-navy">
                    {formatCurrency(paginatedRecords.reduce((s, r) => s + r.vNF, 0))}
                 </td>
                 <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        {filteredRecords.length === 0 && (
          <div className="p-12 text-center text-brand-navy/30 italic text-[10px] font-black uppercase tracking-[0.2em]">
            Nenhum registro encontrado para sua busca.
          </div>
        )}
      </div>
    </div>
  );
}
