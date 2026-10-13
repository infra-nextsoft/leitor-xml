import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { XMLRecord } from '@/lib/db';
import { formatCurrency, formatDateTime, formatCNPJ, cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search, List, Building2, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';

interface XMLTableProps {
  records: XMLRecord[];
  allRecords?: XMLRecord[];
  selectedMod: 'all' | '55' | '65';
  onModChange: (mod: 'all' | '55' | '65') => void;
  selectedCnpj: string;
  onCnpjChange: (cnpj: string) => void;
  cnpjsList: { cnpj: string; name: string; count: number }[];
  cancelledKeysSet?: Set<string>;
}

export function XMLTable({ 
  records, 
  allRecords,
  selectedMod, 
  onModChange,
  selectedCnpj,
  onCnpjChange,
  cnpjsList,
  cancelledKeysSet
}: XMLTableProps) {
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Conjunto completo de registros da aplicação
  const totalAllRecords = useMemo(() => {
    return allRecords && allRecords.length > 0 ? allRecords : records;
  }, [allRecords, records]);

  const filteredRecords = useMemo(() => {
    const searchLow = searchTerm.toLowerCase().trim();
    if (!searchLow) return records;

    return records.filter(rec => {
      let cnpj = rec.cnpjEmit || '';
      if (!cnpj && rec.chave && rec.chave.length === 44) {
        cnpj = rec.chave.slice(6, 20);
      }

      const isCancelled = cancelledKeysSet?.has(rec.chave);
      if (searchLow === 'cancelada' || searchLow === 'canceladas' || searchLow === 'cancelado') {
        return isCancelled;
      }

      return (
        String(rec.nNF).toLowerCase().includes(searchLow) || 
        String(rec.cpf).toLowerCase().includes(searchLow) ||
        String(rec.chave).toLowerCase().includes(searchLow) ||
        String(rec.fileName).toLowerCase().includes(searchLow) ||
        String(cnpj).toLowerCase().includes(searchLow) ||
        formatCNPJ(cnpj).toLowerCase().includes(searchLow) ||
        (rec.xNomeEmit && rec.xNomeEmit.toLowerCase().includes(searchLow)) ||
        String(rec.vProd).includes(searchLow) ||
        String(rec.vNF).includes(searchLow) ||
        formatCurrency(rec.vProd).toLowerCase().includes(searchLow) ||
        formatCurrency(rec.vNF).toLowerCase().includes(searchLow) ||
        (rec.mod && (rec.mod === '55' ? '55 - nfe' : rec.mod === '65' ? '65 - nfce' : rec.mod.toLowerCase()).includes(searchLow)) ||
        (rec.tpNF && (rec.tpNF === '0' ? 'entrada' : rec.tpNF === '1' ? 'saída' : rec.tpNF.toLowerCase()).includes(searchLow)) ||
        (rec.serie && rec.serie.toLowerCase().includes(searchLow)) ||
        (isCancelled && 'cancelada'.includes(searchLow))
      );
    });
  }, [records, searchTerm, cancelledKeysSet]);

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

  const hasFilterActive = useMemo(() => {
    return searchTerm.trim().length > 0 || filteredRecords.length !== totalAllRecords.length;
  }, [searchTerm, filteredRecords.length, totalAllRecords.length]);

  const handleExportExcel = (exportAll: boolean = true) => {
    setIsExporting(true);
    try {
      const listToExport = exportAll ? totalAllRecords : filteredRecords;
      if (listToExport.length === 0) return;

      const exportData = listToExport.map(r => {
        let cnpj = r.cnpjEmit || '';
        if (!cnpj && r.chave && r.chave.length === 44) {
          cnpj = r.chave.slice(6, 20);
        }
        const isCancelled = cancelledKeysSet?.has(r.chave.trim());

        return {
          'Nº Cupom / NF': r.nNF || '---',
          'Série': r.serie || '---',
          'Modelo': r.mod === '65' ? '65 - NFC-e' : r.mod === '55' ? '55 - NF-e' : (r.mod || '---'),
          'Tipo Movimentação': r.tpNF === '0' ? 'Entrada' : r.tpNF === '1' ? 'Saída' : (r.tpNF || '---'),
          'Situação': isCancelled ? 'Cancelada' : 'Autorizada',
          'CNPJ Emitente': cnpj ? formatCNPJ(cnpj) : '---',
          'Razão Social Emitente': r.xNomeEmit || '---',
          'Data Emissão': r.dhEmi ? formatDateTime(r.dhEmi) : '---',
          'Data Autorização': r.dhRecbto ? formatDateTime(r.dhRecbto) : '---',
          'Protocolo': r.nProt || '---',
          'Status SEFAZ': r.cStat || '---',
          'Versão XML': r.versaoXml || '4.00',
          'Valor Bruto (R$)': Number(r.vProd) || 0,
          'Valor Desconto (R$)': Number(r.vDesc) || 0,
          'Valor Líquido (R$)': Number(r.vNF) || 0,
          'CPF Cliente': r.cpf || 'Não informado',
          'Chave de Acesso': r.chave || '---',
          'Nome do Arquivo': r.fileName || '---'
        };
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 14 }, // Nº Cupom / NF
        { wch: 8 },  // Série
        { wch: 14 }, // Modelo
        { wch: 18 }, // Tipo Movimentação
        { wch: 14 }, // Situação
        { wch: 20 }, // CNPJ Emitente
        { wch: 32 }, // Razão Social Emitente
        { wch: 20 }, // Data Emissão
        { wch: 20 }, // Data Autorização
        { wch: 18 }, // Protocolo
        { wch: 14 }, // Status SEFAZ
        { wch: 12 }, // Versão XML
        { wch: 16 }, // Valor Bruto (R$)
        { wch: 16 }, // Valor Desconto (R$)
        { wch: 16 }, // Valor Líquido (R$)
        { wch: 18 }, // CPF Cliente
        { wch: 48 }, // Chave de Acesso
        { wch: 35 }, // Nome do Arquivo
      ];

      const wb = XLSX.utils.book_new();
      const sheetName = exportAll ? "Todos os XMLs" : "XMLs Filtrados";
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = exportAll 
        ? `xmls_todos_registros_${listToExport.length}_docs_${dateStr}.xlsx`
        : `xmls_filtrados_${listToExport.length}_docs_${dateStr}.xlsx`;

      XLSX.writeFile(wb, fileName);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      console.error('Erro ao exportar para Excel:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Unificado */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <List className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Lista de Registros Importados</h2>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-200/80 text-brand-navy">
            {totalAllRecords.length.toLocaleString('pt-BR')} {totalAllRecords.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {/* Botões de Exportar para Excel */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {hasFilterActive && (
            <button
              onClick={() => handleExportExcel(false)}
              disabled={isExporting || filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-emerald-600/30 hover:border-emerald-600 hover:bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded transition-all active:scale-95 disabled:opacity-40 shadow-2xs"
              title="Exportar apenas os registros que atendem aos filtros atuais"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" />
              <span>Exportar Filtrados ({filteredRecords.length.toLocaleString('pt-BR')})</span>
            </button>
          )}

          <button
            onClick={() => handleExportExcel(true)}
            disabled={isExporting || totalAllRecords.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[10px] font-black uppercase tracking-wider rounded transition-all shadow-xs disabled:opacity-40"
            title="Exportar todos os XMLs importados na aplicação para uma planilha Excel (.xlsx)"
          >
            {isExporting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Exportando...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle2 size={13} className="text-white" />
                <span>Planilha Gerada!</span>
              </>
            ) : (
              <>
                <FileSpreadsheet size={13} />
                <span>Exportar Todos para Excel ({totalAllRecords.length.toLocaleString('pt-BR')})</span>
              </>
            )}
          </button>
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
                placeholder="Buscar por cupom, chave, CNPJ, Razão Social, CPF ou valor..."
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

            {cnpjsList.length > 1 && (
              <select
                value={selectedCnpj}
                onChange={(e) => onCnpjChange(e.target.value)}
                className="w-full sm:w-auto px-3 py-2.5 bg-white border border-slate-200 rounded text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all truncate max-w-[240px]"
              >
                <option value="all">Todos os CNPJs ({cnpjsList.length} empresas)</option>
                {cnpjsList.map(item => (
                  <option key={item.cnpj} value={item.cnpj}>
                    {formatCNPJ(item.cnpj)} {item.name ? `- ${item.name}` : ''} ({item.count})
                  </option>
                ))}
              </select>
            )}
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
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Nº Cupom</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Série</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Modelo</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Emitente / CNPJ</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Data/Hora</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] text-right whitespace-nowrap">Bruto</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] text-right whitespace-nowrap">Desc.</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] text-right whitespace-nowrap">Líquido</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] text-center whitespace-nowrap">CPF</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] min-w-[300px]">Chave de acesso</th>
                <th className="p-4 text-[10px] font-black uppercase text-brand-navy uppercase tracking-[0.2em] whitespace-nowrap">Movimentação</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.map((rec) => {
                let cnpj = rec.cnpjEmit || '';
                if (!cnpj && rec.chave && rec.chave.length === 44) {
                  cnpj = rec.chave.slice(6, 20);
                }
                const isCancelled = cancelledKeysSet?.has(rec.chave);

                return (
                  <tr 
                    key={rec.chave} 
                    className={cn(
                      "border-b border-slate-100/60 transition-all",
                      isCancelled ? "bg-rose-50/30 hover:bg-rose-50/60" : "hover:bg-slate-50/30"
                    )}
                  >
                    <td className="p-4 text-[10px] font-mono font-bold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(isCancelled ? "text-brand-navy/60 line-through" : "text-brand-navy")}>
                          {highlightText(rec.nNF, searchTerm)}
                        </span>
                        {isCancelled && (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-brand-melon/15 text-brand-melon border border-brand-melon/30">
                            Cancelada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-[10px] font-mono text-brand-navy font-bold whitespace-nowrap">{highlightText(rec.serie || '---', searchTerm)}</td>
                    <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{highlightText(formatMod(rec.mod), searchTerm)}</td>
                    <td className="p-4 text-[10px] whitespace-nowrap">
                      <div className="font-mono font-bold text-brand-navy">{highlightText(formatCNPJ(cnpj), searchTerm)}</div>
                      {rec.xNomeEmit && (
                        <div className="text-[9px] text-brand-navy/60 font-medium truncate max-w-[160px]">{highlightText(rec.xNomeEmit, searchTerm)}</div>
                      )}
                    </td>
                    <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{formatDateTime(rec.dhEmi)}</td>
                    <td className={cn("p-4 text-[10px] font-mono font-bold text-right whitespace-nowrap", isCancelled ? "text-brand-navy/40 line-through" : "text-brand-navy")}>
                      {highlightText(formatCurrency(rec.vProd), searchTerm)}
                    </td>
                    <td className={cn("p-4 text-[10px] font-mono font-bold text-right whitespace-nowrap", isCancelled ? "text-brand-melon/40 line-through" : "text-brand-melon")}>
                      -{highlightText(formatCurrency(rec.vDesc), searchTerm)}
                    </td>
                    <td className={cn("p-4 text-[10px] font-mono font-black text-right whitespace-nowrap", isCancelled ? "text-brand-navy/40 line-through" : "text-brand-navy")}>
                      {highlightText(formatCurrency(rec.vNF), searchTerm)}
                    </td>
                    <td className="p-4 text-[10px] font-medium text-brand-navy/40 text-center whitespace-nowrap">{highlightText(rec.cpf || '---', searchTerm)}</td>
                    <td className="p-4 text-[10px] font-mono text-brand-blue font-bold whitespace-nowrap">{highlightText(rec.chave, searchTerm)}</td>
                    <td className="p-4 text-[10px] font-medium text-brand-navy/80 whitespace-nowrap">{highlightText(formatTpNF(rec.tpNF), searchTerm)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50/80 sticky bottom-0 backdrop-blur-sm border-t border-slate-100">
              <tr>
                 <td colSpan={5} className="p-4 text-[10px] font-black uppercase text-brand-navy/60 tracking-[0.2em]">
                   Subtotal Página {cancelledKeysSet && cancelledKeysSet.size > 0 && <span className="text-brand-melon text-[9px] font-bold lowercase tracking-normal">(excl. canceladas)</span>}
                 </td>
                 <td className="p-4 text-right text-[10px] font-mono font-bold text-brand-navy">
                    {formatCurrency(paginatedRecords.filter(r => !cancelledKeysSet?.has(r.chave)).reduce((s, r) => s + r.vProd, 0))}
                 </td>
                 <td className="p-4 text-right text-[10px] font-mono font-bold text-brand-melon">
                    -{formatCurrency(paginatedRecords.filter(r => !cancelledKeysSet?.has(r.chave)).reduce((s, r) => s + r.vDesc, 0))}
                 </td>
                 <td className="p-4 text-right text-[10px] font-mono font-black text-brand-navy">
                    {formatCurrency(paginatedRecords.filter(r => !cancelledKeysSet?.has(r.chave)).reduce((s, r) => s + r.vNF, 0))}
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
