import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { CancellationRecord, XMLRecord } from '@/lib/db';
import { formatDateTime, parseAccessKey } from '@/lib/utils';
import { 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Copy, 
  CheckCircle2, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

interface CancelledSalesCardProps {
  cancellations: CancellationRecord[];
  records: XMLRecord[];
  selectedCnpj: string;
}

export function CancelledSalesCard({ cancellations, records, selectedCnpj }: CancelledSalesCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isCopiedAll, setIsCopiedAll] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Mapeamento rápido de vendas importadas pela chave de acesso
  const salesMap = useMemo(() => {
    const map = new Map<string, XMLRecord>();
    for (const rec of records) {
      if (rec.chave) {
        map.set(rec.chave.trim(), rec);
      }
    }
    return map;
  }, [records]);

  // Filtra cancelamentos pelo CNPJ selecionado globalmente
  const filteredByCnpj = useMemo(() => {
    if (selectedCnpj === 'all') return cancellations;
    return cancellations.filter(c => {
      let cnpj = c.cnpjEmit || '';
      if (!cnpj && c.chave && c.chave.length === 44) {
        cnpj = c.chave.slice(6, 20);
      }
      return cnpj === selectedCnpj;
    });
  }, [cancellations, selectedCnpj]);

  // Lista cruzada com extração direta da chave e enriquecimento da venda
  const enrichedList = useMemo(() => {
    return filteredByCnpj.map(cancel => {
      const sale = salesMap.get(cancel.chave.trim());
      const parsedKey = parseAccessKey(cancel.chave);
      
      // Número da NF: prioriza da venda, depois do cancelamento ou posições 25..34 da chave
      let cupom = sale?.nNF || cancel.nNF || parsedKey?.nNF || '';
      if (!cupom && cancel.chave.length === 44) {
        cupom = String(parseInt(cancel.chave.slice(25, 34), 10));
      }
      if (!cupom) cupom = '---';

      // Modelo: 65 (NFC-e) ou 55 (NF-e)
      let mod = sale?.mod || cancel.mod || parsedKey?.mod || '';
      if (!mod && cancel.chave.length === 44) {
        mod = cancel.chave.slice(20, 22);
      }

      // Mês/Ano extraído da chave (posições 2..6)
      const mesAnoChave = parsedKey?.anoMesFormatado || '';

      return {
        chave: cancel.chave,
        cupom,
        mod,
        mesAnoChave,
        dataEmissao: sale?.dhEmi || '',
        dataCancelamento: cancel.dhRegEvento || cancel.dhEvento || '',
        fileName: cancel.fileName
      };
    });
  }, [filteredByCnpj, salesMap]);

  // Filtro de busca textual
  const searchedList = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return enrichedList;

    return enrichedList.filter(item => {
      return (
        item.cupom.toLowerCase().includes(term) ||
        item.chave.toLowerCase().includes(term) ||
        (item.mod && item.mod.includes(term))
      );
    });
  }, [enrichedList, searchTerm]);

  // Paginação
  const totalPages = Math.ceil(searchedList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchedList.slice(start, start + pageSize);
  }, [searchedList, currentPage, pageSize]);

  // Copiar todas as chaves
  const handleCopyAllKeys = () => {
    const keys = searchedList.map(i => i.chave).join('\n');
    navigator.clipboard.writeText(keys);
    setIsCopiedAll(true);
    setTimeout(() => setIsCopiedAll(false), 2000);
  };

  // Copiar chave individual
  const handleCopyIndividualKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // Exportar para Excel com as 4 colunas solicitadas
  const handleExportExcel = () => {
    const exportData = searchedList.map(item => ({
      'Nº NFC-e / NF-e': item.cupom,
      'Modelo': item.mod === '65' ? '65 - NFC-e' : item.mod === '55' ? '55 - NF-e' : item.mod,
      'Data Emissão': item.dataEmissao 
        ? formatDateTime(item.dataEmissao) 
        : item.mesAnoChave 
          ? `${item.mesAnoChave} (da chave)` 
          : '---',
      'Data Cancelamento (dhRegEvento)': item.dataCancelamento ? formatDateTime(item.dataCancelamento) : '---',
      'Chave de Acesso': item.chave
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas Canceladas");
    XLSX.writeFile(wb, `vendas_canceladas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (cancellations.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-brand-melon/30 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(246,113,79,0.08)] animate-in fade-in slide-in-from-bottom-3 duration-500">
      {/* Header do Card */}
      <div 
        className="p-5 bg-gradient-to-r from-rose-50/80 via-white to-rose-50/40 border-b border-rose-100/80 flex items-center justify-between gap-4 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand-melon/10 border border-brand-melon/20 rounded-md shadow-sm shrink-0">
            <XCircle className="w-5 h-5 text-brand-melon" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-navy">
                Vendas Canceladas
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-melon text-white shadow-sm">
                {enrichedList.length} {enrichedList.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            <p className="text-[10px] text-brand-navy/60 uppercase tracking-[0.1em] font-medium mt-0.5">
              Cruzamento de XMLs de venda com eventos de cancelamento
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 text-brand-navy/60 hover:text-brand-navy hover:bg-rose-100/50 rounded-md transition-colors"
          title={isExpanded ? "Recolher card" : "Expandir card"}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Conteúdo Expansível */}
      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* Barra de Ações: Busca + Exportação + Cópia em Lote */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="BUSCAR POR NÚMERO DO CUPOM OU CHAVE..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-slate-50 border border-slate-200/80 rounded-md pl-9 pr-4 py-2 text-[10px] font-mono tracking-wider focus:outline-none focus:border-brand-melon focus:bg-white transition-all uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={handleCopyAllKeys}
                disabled={searchedList.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] bg-white border border-slate-200 hover:border-brand-navy/40 text-brand-navy rounded-md transition-all active:scale-95 disabled:opacity-30 shadow-xs"
                title="Copiar todas as chaves de acesso filtradas"
              >
                {isCopiedAll ? (
                  <>
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    <span>Chaves Copiadas!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} className="text-brand-navy/60" />
                    <span>Copiar Chaves</span>
                  </>
                )}
              </button>

              <button
                onClick={handleExportExcel}
                disabled={searchedList.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all active:scale-95 disabled:opacity-30 shadow-xs"
                title="Exportar listagem para Excel"
              >
                <FileSpreadsheet size={12} />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>

          {/* Tabela de Cancelamentos: Estritamente as 4 colunas solicitadas */}
          <div className="overflow-x-auto border border-slate-200/70 rounded-md custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[9px] font-black uppercase tracking-[0.2em] text-brand-navy">
                  <th className="p-3 whitespace-nowrap">Nº NFC-e / NF-e</th>
                  <th className="p-3 whitespace-nowrap">Data Emissão</th>
                  <th className="p-3 whitespace-nowrap">Data Cancelamento (dhRegEvento)</th>
                  <th className="p-3 min-w-[320px]">Chave de Acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[10px]">
                {paginatedList.map(item => (
                  <tr key={item.chave} className="hover:bg-rose-50/20 transition-colors">
                    {/* 1. Nº NFC-e / NF-e */}
                    <td className="p-3 whitespace-nowrap">
                      <div className="font-mono font-bold text-brand-navy text-[11px]">
                        {item.cupom}
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-wider text-brand-navy/50 block">
                        {item.mod === '65' ? 'NFC-e' : item.mod === '55' ? 'NF-e' : item.mod ? `Mod. ${item.mod}` : ''}
                      </span>
                    </td>

                    {/* 2. Data Emissão */}
                    <td className="p-3 whitespace-nowrap font-medium text-brand-navy/80">
                      {item.dataEmissao ? (
                        formatDateTime(item.dataEmissao)
                      ) : item.mesAnoChave ? (
                        <span className="text-amber-700 text-[9px] font-semibold italic flex items-center gap-1" title="Mês e Ano extraídos dos dígitos da chave de acesso (AAMM)">
                          <AlertTriangle size={10} /> {item.mesAnoChave} (da chave)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[9px] italic">---</span>
                      )}
                    </td>

                    {/* 3. Data Cancelamento (dhRegEvento) */}
                    <td className="p-3 whitespace-nowrap font-mono font-bold text-brand-melon">
                      {item.dataCancelamento ? formatDateTime(item.dataCancelamento) : '---'}
                    </td>

                    {/* 4. Chave de Acesso com botão de copiar */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-brand-blue font-bold tracking-tight text-[10px]">
                          {item.chave}
                        </span>
                        <button
                          onClick={() => handleCopyIndividualKey(item.chave)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy transition-all"
                          title="Copiar chave de acesso"
                        >
                          {copiedKey === item.chave ? (
                            <CheckCircle2 size={12} className="text-emerald-500" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {searchedList.length === 0 && (
            <div className="p-8 text-center text-brand-navy/40 italic text-[10px] font-black uppercase tracking-[0.2em]">
              Nenhum cancelamento encontrado para a busca.
            </div>
          )}

          {/* Paginação */}
          {searchedList.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-[10px] text-brand-navy/70 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="uppercase tracking-wider font-bold">Exibir</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-brand-blue"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="uppercase tracking-wider">por página • Total: {searchedList.length} cancelamentos</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-bold">
                  Página {currentPage} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy disabled:opacity-20 transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy disabled:opacity-20 transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
