import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { XMLRecord } from '@/lib/db';
import { Search, Copy, CheckCircle2, AlertTriangle, FileSpreadsheet, Building2 } from 'lucide-react';
import { cn, formatDateTime, formatCNPJ } from '@/lib/utils';

export interface CompareItem {
  cupom: string;
  date: string;
}

export interface CnpjCompareState {
  missingInExcel: CompareItem[];
  missingInXml: CompareItem[];
  compareDone: boolean;
  excelFileName: string;
}

interface ExcelComparisonProps {
  xmlRecords: XMLRecord[];
  cnpjsList: { cnpj: string; name: string; count: number }[];
  compareStateByCnpj: Record<string, CnpjCompareState>;
  setCompareStateByCnpj: React.Dispatch<React.SetStateAction<Record<string, CnpjCompareState>>>;
}

export function ExcelComparison({ 
  xmlRecords,
  cnpjsList,
  compareStateByCnpj,
  setCompareStateByCnpj
}: ExcelComparisonProps) {
  const initialTab = cnpjsList.length > 1 ? cnpjsList[0].cnpj : 'all';
  const [activeCnpjTab, setActiveCnpjTab] = useState<string>(initialTab);
  const [resultTab, setResultTab] = useState<'missingInExcel' | 'missingInXml'>('missingInExcel');
  const [isCopied, setIsCopied] = useState(false);

  // Filtrar os XMLs referentes à aba ativa (CNPJ específico ou Todos)
  const targetXmlRecords = useMemo(() => {
    if (activeCnpjTab === 'all') return xmlRecords;
    return xmlRecords.filter(rec => {
      let cnpj = rec.cnpjEmit;
      if (!cnpj || cnpj === 'Não informado') {
        if (rec.chave && rec.chave.length === 44) {
          cnpj = rec.chave.slice(6, 20);
        } else {
          cnpj = 'Outros';
        }
      }
      return cnpj === activeCnpjTab;
    });
  }, [xmlRecords, activeCnpjTab]);

  // Estado da comparação referente ao CNPJ ativo
  const currentState: CnpjCompareState = compareStateByCnpj[activeCnpjTab] || {
    missingInExcel: [],
    missingInXml: [],
    compareDone: false,
    excelFileName: ''
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Identificar colunas do Excel (busca insensível a maiúsculas/minúsculas e acentos)
      const targetHeaders = [
        'cupom fiscal', 'cupom', 'nf', 'numero', 'número', 'cupons fiscais', 'numeros', 'números', 'cupom fiscal ecf'
      ];
      
      const dateHeaders = ['data', 'data e hora', 'data/hora'];

      const excelRowsMapped = data
        .map(row => {
          const rowKeys = Object.keys(row || {});
          
          // Encontra chave do cupom
          const matchedCupomKey = rowKeys.find(key => {
            const normalizedKey = key.toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();
            return targetHeaders.some(target => {
              const normalizedTarget = target.toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();
              return normalizedKey === normalizedTarget;
            });
          });

          // Encontra chave da data
          const matchedDateKey = rowKeys.find(key => {
            const normalizedKey = key.toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();
            return dateHeaders.some(target => {
              const normalizedTarget = target.toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim();
              return normalizedKey === normalizedTarget;
            });
          });

          const cupom = matchedCupomKey ? String(row[matchedCupomKey] || '').trim() : '';
          const rawDate = matchedDateKey ? String(row[matchedDateKey] || '').trim() : '';
          
          let dateStr = rawDate;
          if (rawDate && !isNaN(Number(rawDate)) && Number(rawDate) > 40000) {
            try {
              const dateObj = XLSX.SSF.parse_date_code(Number(rawDate));
              const d = dateObj.d < 10 ? `0${dateObj.d}` : dateObj.d;
              const m = dateObj.m < 10 ? `0${dateObj.m}` : dateObj.m;
              const y = dateObj.y;
              dateStr = `${d}/${m}/${y}`;
              if (dateObj.H || dateObj.M) {
                const H = dateObj.H < 10 ? `0${dateObj.H}` : dateObj.H;
                const M = dateObj.M < 10 ? `0${dateObj.M}` : dateObj.M;
                dateStr += ` ${H}:${M}`;
              }
            } catch (e) {
              dateStr = rawDate;
            }
          }

          return { cupom, date: dateStr || '---' };
        })
        .filter(item => item.cupom !== '');

      const excelCuponsSet = new Set(excelRowsMapped.map(item => item.cupom));

      // Encontrar cupons no XML que NÃO estão no Excel
      const missingExcel = targetXmlRecords
        .filter(rec => !excelCuponsSet.has(String(rec.nNF)))
        .map(rec => ({
          cupom: String(rec.nNF),
          date: rec.dhEmi ? formatDateTime(rec.dhEmi) : '---'
        }));

      // Encontrar cupons no Excel que NÃO estão no XML
      const xmlCuponsSet = new Set(targetXmlRecords.map(rec => String(rec.nNF)));
      const missingXml = excelRowsMapped
        .filter(item => !xmlCuponsSet.has(item.cupom));

      // Remover duplicatas
      const uniqueMissingExcelMap = new Map<string, CompareItem>();
      missingExcel.forEach(item => uniqueMissingExcelMap.set(item.cupom, item));

      const uniqueMissingXmlMap = new Map<string, CompareItem>();
      missingXml.forEach(item => uniqueMissingXmlMap.set(item.cupom, item));

      const newCompareState: CnpjCompareState = {
        missingInExcel: Array.from(uniqueMissingExcelMap.values()),
        missingInXml: Array.from(uniqueMissingXmlMap.values()),
        compareDone: true,
        excelFileName: fileName
      };

      setCompareStateByCnpj(prev => ({
        ...prev,
        [activeCnpjTab]: newCompareState
      }));
      setResultTab('missingInExcel');
    };
    reader.readAsBinaryString(file);
  };

  const handleClearData = () => {
    setCompareStateByCnpj(prev => {
      const copy = { ...prev };
      delete copy[activeCnpjTab];
      return copy;
    });
  };

  const copyToClipboard = () => {
    const activeList = resultTab === 'missingInExcel' ? currentState.missingInExcel : currentState.missingInXml;
    const textToCopy = activeList.map(item => `${item.cupom}\t${item.date}`).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const activeListCount = resultTab === 'missingInExcel' 
    ? currentState.missingInExcel.length 
    : currentState.missingInXml.length;

  const currentCnpjInfo = cnpjsList.find(c => c.cnpj === activeCnpjTab);

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header com Titulo e Botão Limpar */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Comparação com Excel</h2>
        </div>
        {currentState.compareDone && (
          <button
            onClick={handleClearData}
            className="text-[9px] font-black uppercase tracking-widest bg-white border border-brand-melon/20 hover:border-brand-melon hover:bg-brand-melon/5 py-1.5 px-3 rounded text-brand-melon transition-all shadow-sm active:scale-95"
          >
            Apagar Dados da Aba
          </button>
        )}
      </div>

      {/* Abas por CNPJ / Empresa */}
      {cnpjsList.length > 1 && (
        <div className="bg-slate-100/70 p-2.5 border-b border-slate-200 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCnpjTab('all')}
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-3.5 py-2 rounded-md transition-all flex items-center gap-2 active:scale-95",
              activeCnpjTab === 'all'
                ? "bg-brand-blue text-white shadow-sm"
                : "bg-white text-brand-navy/70 hover:bg-slate-50 border border-slate-200/60"
            )}
          >
            <span>Todos os CNPJs ({xmlRecords.length})</span>
            {compareStateByCnpj['all']?.compareDone && (
              <span className="flex items-center gap-1 text-emerald-300 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded text-[8px]">
                <CheckCircle2 size={10} /> OK
              </span>
            )}
          </button>

          {cnpjsList.map(item => {
            const isDone = compareStateByCnpj[item.cnpj]?.compareDone;
            return (
              <button
                key={item.cnpj}
                onClick={() => setActiveCnpjTab(item.cnpj)}
                className={cn(
                  "text-[9px] font-black uppercase tracking-widest px-3.5 py-2 rounded-md transition-all flex items-center gap-2 active:scale-95",
                  activeCnpjTab === item.cnpj
                    ? "bg-brand-blue text-white shadow-sm"
                    : "bg-white text-brand-navy/80 hover:bg-slate-50 border border-slate-200/60"
                )}
              >
                <Building2 size={12} className={activeCnpjTab === item.cnpj ? "text-white/80" : "text-brand-blue"} />
                <span>{formatCNPJ(item.cnpj)}</span>
                {item.name && <span className={cn("font-medium truncate max-w-[120px]", activeCnpjTab === item.cnpj ? "text-white/80" : "text-brand-navy/60")}>({item.name})</span>}
                {isDone ? (
                  <span className="flex items-center gap-1 text-emerald-300 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded text-[8px]">
                    <CheckCircle2 size={10} /> OK
                  </span>
                ) : (
                  <span className="opacity-50 text-[8px]">({item.count})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="w-full md:w-1/3">
             {currentState.compareDone ? (
               <div className="flex flex-col items-center justify-center p-8 border border-brand-blue/30 bg-brand-blue/5 rounded-md text-center">
                 <FileSpreadsheet className="w-10 h-10 mb-4 text-brand-blue" />
                 <span className="text-[10px] font-black uppercase tracking-[0.1em] text-brand-blue truncate max-w-full block px-2">{currentState.excelFileName || "Planilha Carregada"}</span>
                 <p className="text-[9px] text-brand-navy/60 mt-2 uppercase font-medium">
                   Comparação ativa com {targetXmlRecords.length} XMLs
                   {currentCnpjInfo?.name ? ` (${currentCnpjInfo.name})` : ''}
                 </p>
               </div>
             ) : (
               <label className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-brand-blue/10 bg-white hover:border-brand-blue/30 rounded-md cursor-pointer transition-all hover:bg-brand-blue/[0.02] group">
                  <FileSpreadsheet className="w-10 h-10 mb-4 text-brand-blue/20 group-hover:text-brand-blue transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-blue/50 group-hover:text-brand-blue">Selecionar Planilha (.xlsx, .xls)</span>
                  <span className="text-[9px] text-brand-navy/40 uppercase font-medium mt-1">
                    {activeCnpjTab === 'all' ? "Comparar todos os CNPJs" : `CNPJ: ${formatCNPJ(activeCnpjTab)}`}
                  </span>
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
               </label>
             )}
              <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-md mt-4 shadow-sm">
                <span className="text-[9px] font-black text-brand-navy/40 uppercase tracking-[0.2em] block mb-2 text-center">Cabeçalhos Aceitos</span>
                <div className="flex flex-wrap gap-1.5 justify-center mb-2">
                  {['Cupom Fiscal', 'Cupom', 'NF', 'Número', 'Cupons Fiscais', 'Números'].map(col => (
                    <code key={col} className="text-[9px] font-mono font-bold bg-white border border-brand-blue/5 text-brand-blue px-2 py-1 rounded shadow-sm">{col}</code>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {['cupom fiscal ecf', 'Data', 'Data/Hora', 'data e hora'].map(col => (
                    <code key={col} className="text-[9px] font-mono font-bold bg-white border border-brand-blue/5 text-brand-blue px-2 py-1 rounded shadow-sm">{col}</code>
                  ))}
                </div>
                <p className="text-[9px] text-brand-navy/60 mt-3 text-center uppercase tracking-[0.05em] font-medium leading-relaxed">
                  O arquivo deve conter pelo menos uma dessas colunas (valores não diferenciam maiúsculas/minúsculas ou acentos).
                </p>
              </div>
          </div>

          <div className="flex-1 w-full bg-brand-blue/[0.02] border border-brand-blue/5 rounded-md min-h-[160px] flex flex-col shadow-inner">
            {!currentState.compareDone ? (
               <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-brand-blue/5">
                 <Search className="w-8 h-8 text-brand-blue/20 mb-3" />
                 <p className="text-[10px] text-brand-navy/40 font-black uppercase tracking-widest">Aguardando upload para comparar cupons...</p>
               </div>
            ) : (
               <div className="flex-1 flex flex-col">
                 <div className="p-2 border-b border-brand-blue/5 flex flex-wrap justify-between items-center bg-white gap-2">
                   <div className="flex gap-2">
                     <button
                       onClick={() => setResultTab('missingInExcel')}
                       className={cn(
                         "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all",
                         resultTab === 'missingInExcel' 
                           ? "bg-brand-blue text-white" 
                           : "bg-slate-50 text-brand-navy/60 hover:bg-slate-100"
                       )}
                     >
                       Ausentes no Excel ({currentState.missingInExcel.length})
                     </button>
                     <button
                       onClick={() => setResultTab('missingInXml')}
                       className={cn(
                         "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all",
                         resultTab === 'missingInXml' 
                           ? "bg-brand-blue text-white" 
                           : "bg-slate-50 text-brand-navy/60 hover:bg-slate-100"
                       )}
                     >
                       Ausentes no XML ({currentState.missingInXml.length})
                     </button>
                   </div>
                   {activeListCount > 0 && (
                     <button 
                       onClick={copyToClipboard}
                       className="text-[9px] font-black uppercase tracking-widest bg-white border border-brand-blue/10 hover:border-brand-navy py-1.5 px-3 rounded text-brand-navy flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                     >
                       {isCopied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
                       {isCopied ? "Copiado!" : "Copiar Lista"}
                     </button>
                   )}
                 </div>

                 <div className="px-6 pt-4">
                   <p className="text-[9px] text-brand-navy/60 uppercase tracking-[0.15em] font-bold">
                     {resultTab === 'missingInExcel' 
                       ? "Legenda: Números importados nos XMLs que estão ausentes no EXCEL"
                       : "Legenda: Números importados no Excel que estão ausentes nos XMLs"}
                   </p>
                 </div>

                 <div className="p-6 max-h-[300px] overflow-y-auto">
                    {activeListCount === 0 ? (
                       <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5 flex-shrink-0" />
                          <p className="text-[11px] font-medium text-emerald-800 leading-relaxed italic">
                            {resultTab === 'missingInExcel' 
                              ? "Todos os cupons do XML foram encontrados na planilha com sucesso!"
                              : "Todos os cupons da planilha foram encontrados nos XMLs importados!"}
                          </p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {(resultTab === 'missingInExcel' ? currentState.missingInExcel : currentState.missingInXml).map(item => (
                            <div key={item.cupom} className="bg-white border border-brand-blue/5 p-3 rounded text-left text-brand-navy shadow-sm transition-transform hover:scale-[1.02] flex flex-col justify-between">
                              <div className="text-[9px] font-black uppercase text-brand-navy/40 tracking-wider">Cupom</div>
                              <div className="text-[13px] font-mono font-black text-brand-blue leading-none">{item.cupom}</div>
                              <div className="mt-2.5 pt-2 border-t border-slate-50 flex justify-between items-center text-[10px] text-brand-navy/60 font-medium">
                                <span>Data/Hora:</span>
                                <span className="font-mono font-bold text-brand-navy">{item.date}</span>
                              </div>
                            </div>
                          ))}
                       </div>
                    )}
                 </div>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
