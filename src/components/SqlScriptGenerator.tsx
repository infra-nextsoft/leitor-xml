import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { XMLRecord, CancellationRecord } from '@/lib/db';
import { FileUpload } from '@/components/FileUpload';
import { formatSqlDateTime, formatCNPJ, cn } from '@/lib/utils';
import { 
  Database, 
  Copy, 
  CheckCircle2, 
  Download, 
  Code2, 
  Settings2, 
  AlertCircle, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  FileArchive,
  Loader2,
  FileText,
  Clock,
  X
} from 'lucide-react';

interface SqlScriptGeneratorProps {
  records: XMLRecord[];
  cancellations?: CancellationRecord[];
  cnpjsList: { cnpj: string; name: string; count: number }[];
}

const FILE_CHUNK_SIZE = 1000; // 1.000 registros por arquivo
const DELAY_STEP = 100;       // WAITFOR a cada 100 registros

export function SqlScriptGenerator({ records, cancellations = [], cnpjsList }: SqlScriptGeneratorProps) {
  // Origem dos dados: base existente ou upload avulso
  const [sourceMode, setSourceMode] = useState<'existing' | 'upload'>('existing');
  const [uploadedRecords, setUploadedRecords] = useState<XMLRecord[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Filtros
  const [selectedCnpj, setSelectedCnpj] = useState<string>('all');
  const [selectedMod, setSelectedMod] = useState<'all' | '55' | '65'>('all');
  const [excludeCancelled, setExcludeCancelled] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Configurações do Script SQL
  const [tableName, setTableName] = useState('ComercioSaida');
  const [wrapTransaction, setWrapTransaction] = useState(true);
  const [batchDelaySeconds, setBatchDelaySeconds] = useState(1);

  // Estados de exportação e visualização
  const [isCopied, setIsCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [batchCompletedMessage, setBatchCompletedMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'preview'>('script');
  const [previewPage, setPreviewPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Conjunto de chaves canceladas para filtragem
  const cancelledKeys = useMemo(() => {
    return new Set(cancellations.map(c => c.chave.trim()));
  }, [cancellations]);

  // Lista de registros ativa baseada no modo selecionado
  const activeRecords = sourceMode === 'existing' ? records : uploadedRecords;

  // Filtragem dos registros
  const filteredRecords = useMemo(() => {
    return activeRecords.filter(rec => {
      // Filtro de cancelamento
      if (excludeCancelled && cancelledKeys.has(rec.chave.trim())) {
        return false;
      }

      // Filtro de modelo
      if (selectedMod !== 'all' && rec.mod !== selectedMod) {
        return false;
      }

      // Filtro de CNPJ
      if (selectedCnpj !== 'all') {
        let cnpj = rec.cnpjEmit;
        if (!cnpj && rec.chave && rec.chave.length === 44) {
          cnpj = rec.chave.slice(6, 20);
        }
        if (cnpj !== selectedCnpj) return false;
      }

      // Busca textual
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const cupom = String(rec.nNF).toLowerCase();
        const chave = String(rec.chave).toLowerCase();
        return cupom.includes(term) || chave.includes(term);
      }

      return true;
    });
  }, [activeRecords, excludeCancelled, cancelledKeys, selectedMod, selectedCnpj, searchTerm]);

  // Modo loteamento (> 1.000 registros)
  const isMultiFileMode = filteredRecords.length > FILE_CHUNK_SIZE;

  // Divisão em lotes de 1.000 para múltiplos arquivos
  const scriptParts = useMemo(() => {
    if (!isMultiFileMode) return [];
    const parts = [];
    for (let i = 0; i < filteredRecords.length; i += FILE_CHUNK_SIZE) {
      const chunk = filteredRecords.slice(i, i + FILE_CHUNK_SIZE);
      const partIndex = Math.floor(i / FILE_CHUNK_SIZE) + 1;
      const startNum = i + 1;
      const endNum = Math.min(i + FILE_CHUNK_SIZE, filteredRecords.length);
      const fileName = `script_grn_parte_${String(partIndex).padStart(2, '0')}_registros_${String(startNum).padStart(5, '0')}_a_${String(endNum).padStart(5, '0')}.sql`;
      parts.push({
        partIndex,
        startNum,
        endNum,
        count: chunk.length,
        fileName,
        chunk
      });
    }
    return parts;
  }, [filteredRecords, isMultiFileMode]);

  // Função geradora de SQL para um determinado lote de registros
  const generateSqlForChunk = (
    chunk: XMLRecord[], 
    partIndex: number = 1, 
    totalParts: number = 1, 
    startNum: number = 1
  ): string => {
    const lines: string[] = [];
    const now = new Date().toLocaleString('pt-BR');
    const delayFormatted = `00:00:${String(batchDelaySeconds).padStart(2, '0')}`;

    lines.push('-- ======================================================================');
    lines.push('-- SCRIPT DE ATUALIZAÇÃO DE VENDAS - SISTEMA GRN (MICROSOFT SQL SERVER)');
    if (totalParts > 1) {
      lines.push(`-- PARTE ${String(partIndex).padStart(2, '0')} DE ${String(totalParts).padStart(2, '0')} (Lote de 1.000)`);
      lines.push(`-- Registros nesta parte: ${chunk.length} (de ${startNum} a ${startNum + chunk.length - 1})`);
    } else {
      lines.push(`-- Total de registros: ${chunk.length}`);
    }
    lines.push(`-- Gerado em: ${now}`);
    lines.push(`-- Tabela alvo: ${tableName}`);
    lines.push(`-- Pausa programada: WAITFOR DELAY '${delayFormatted}' a cada 100 registros`);
    lines.push('-- ======================================================================\n');

    if (wrapTransaction) {
      lines.push('BEGIN TRANSACTION;\n');
    }

    chunk.forEach((rec, idx) => {
      const chave = rec.chave || '';
      const cStat = rec.cStat || '100';
      const nProt = rec.nProt || '';
      const dhRecbtoFormatted = formatSqlDateTime(rec.dhRecbto || rec.dhEmi);
      const versaoXml = rec.versaoXml || '4.00';
      const serie = rec.serie || (chave.length === 44 ? String(parseInt(chave.slice(22, 25), 10)) : '1');
      const mod = rec.mod || (chave.length === 44 ? chave.slice(20, 22) : '65');
      const nNF = rec.nNF || (chave.length === 44 ? String(parseInt(chave.slice(25, 34), 10)) : '');

      const whereClause = `WHERE NumeroCupomFiscal = '${nNF}' AND SerieNotaFiscal = '${serie}' AND ModeloDocFiscal = '${mod}'`;

      lines.push(`UPDATE ${tableName}`);
      lines.push(`SET NFeChaveAcesso = '${chave}',`);
      lines.push(`    NFeCodigoSEFAZ = '${cStat}',`);
      lines.push(`    NFeProtocoloAutorizacao = '${nProt}',`);
      lines.push(`    NFeDataAutorizacao = '${dhRecbtoFormatted}',`);
      lines.push(`    NFeVersaoXML = '${versaoXml}'`);
      lines.push(`${whereClause};\n`);

      // A cada 100 registros: commit intermediário e WAITFOR DELAY
      if ((idx + 1) % DELAY_STEP === 0 && idx + 1 < chunk.length) {
        lines.push(`-- [Pausa após 100 updates (item ${(startNum + idx).toLocaleString('pt-BR')}) para aliviar I/O do SQL Server]`);
        if (wrapTransaction) {
          lines.push('COMMIT;');
          lines.push(`PRINT 'Lote parcial de 100 registros concluído (${idx + 1} de ${chunk.length}). Aguardando pausa de alívio (${delayFormatted})...';`);
          lines.push(`WAITFOR DELAY '${delayFormatted}';`);
          lines.push('BEGIN TRANSACTION;\n');
        } else {
          lines.push(`PRINT 'Lote parcial de 100 registros concluído (${idx + 1} de ${chunk.length}). Aguardando pausa de alívio (${delayFormatted})...';`);
          lines.push(`WAITFOR DELAY '${delayFormatted}';\n`);
        }
      }
    });

    if (wrapTransaction) {
      lines.push('COMMIT;\n');
    }

    lines.push('-- ======================================================================');
    lines.push(`PRINT '>>> LOTE CONCLUÍDO COM SUCESSO! Total de ${chunk.length} registros atualizados neste script.';`);
    lines.push('-- ======================================================================\n');

    return lines.join('\n');
  };

  // SQL para exibição direta quando houver até 1.000 registros
  const singleFileSql = useMemo(() => {
    if (isMultiFileMode || filteredRecords.length === 0) return '';
    return generateSqlForChunk(filteredRecords, 1, 1, 1);
  }, [isMultiFileMode, filteredRecords, tableName, wrapTransaction, batchDelaySeconds]);

  // Copiar SQL para a área de transferência (modo arquivo único)
  const handleCopySql = () => {
    if (!singleFileSql) return;
    navigator.clipboard.writeText(singleFileSql);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Baixar arquivo único .sql (quando <= 1.000)
  const handleDownloadSingleSql = () => {
    if (!singleFileSql) return;
    const blob = new Blob([singleFileSql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.href = url;
    link.download = `script_correcao_grn_${filteredRecords.length}_regs_${dateStr}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBatchCompletedMessage(`Lote concluído com sucesso! Arquivo .sql com ${filteredRecords.length.toLocaleString('pt-BR')} registros baixado.`);
  };

  // Compactar e baixar pacote .ZIP (quando > 1.000)
  const handleDownloadZip = async () => {
    if (filteredRecords.length === 0 || scriptParts.length === 0) return;
    setIsZipping(true);
    setBatchCompletedMessage(null);
    try {
      const zip = new JSZip();
      const totalParts = scriptParts.length;

      scriptParts.forEach(part => {
        const sqlContent = generateSqlForChunk(part.chunk, part.partIndex, totalParts, part.startNum);
        zip.file(part.fileName, sqlContent);
      });

      // Adiciona arquivo de instruções no pacote
      const readmeContent = [
        '========================================================================',
        'PACOTE DE SCRIPTS DE ATUALIZAÇÃO - SISTEMA GRN (MICROSOFT SQL SERVER)',
        '========================================================================',
        `Data de Geração: ${new Date().toLocaleString('pt-BR')}`,
        `Total de Registros Atualizados: ${filteredRecords.length.toLocaleString('pt-BR')}`,
        `Total de Arquivos no Pacote: ${totalParts} arquivos .sql`,
        `Registros por Arquivo: 1.000`,
        `Pausa por Arquivo: WAITFOR DELAY '00:00:0${batchDelaySeconds}' a cada 100 registros`,
        `Tabela Alvo: ${tableName}`,
        `Critério WHERE: NumeroCupomFiscal + SerieNotaFiscal + ModeloDocFiscal`,
        '',
        'ORDEM DE EXECUÇÃO DOS ARQUIVOS:',
        ...scriptParts.map(p => `  ${String(p.partIndex).padStart(2, '0')}. ${p.fileName} (${p.count} registros)`),
        '',
        'Observação: Cada arquivo possui seu próprio controle de transação',
        'e pausas de alívio de I/O a cada 100 registros.',
        '========================================================================'
      ].join('\r\n');

      zip.file('LEIA-ME_ORDEM_EXECUCAO.txt', readmeContent);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.href = url;
      link.download = `scripts_grn_${filteredRecords.length}_regs_${totalParts}_arquivos_${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBatchCompletedMessage(`Lote concluído com sucesso! ${filteredRecords.length.toLocaleString('pt-BR')} registros foram processados e compactados em ${totalParts} arquivos .sql no pacote ZIP.`);
    } catch (err) {
      console.error('Erro ao gerar pacote ZIP:', err);
    } finally {
      setIsZipping(false);
    }
  };

  // Upload específico para o módulo
  const handleUploadProgress = (current: number, total: number, batch: XMLRecord[]) => {
    setUploadProgress({ current, total });
    if (batch && batch.length > 0) {
      setUploadedRecords(prev => [...prev, ...batch]);
    }
  };

  // Paginação da tabela de pré-visualização
  const totalPreviewPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedPreview = useMemo(() => {
    const start = (previewPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, previewPage, pageSize]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Banner Superior do Módulo */}
      <div className="bg-slate-50/50 border border-slate-200 p-6 rounded-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="text-brand-blue w-5 h-5" />
            <h2 className="text-[10px] font-black text-brand-blue uppercase tracking-[0.2em]">
              Automação de Banco de Dados
            </h2>
          </div>
          <h1 className="text-2xl font-black text-brand-navy tracking-tight mt-1">
            Gerador de Scripts SQL (Sistema GRN)
          </h1>
          <p className="text-[10px] text-brand-navy/60 max-w-3xl leading-relaxed uppercase tracking-[0.15em] font-medium mt-1">
            Extrai os dados de autorização dos XMLs e compõe os comandos UPDATE na tabela ComercioSaida do Microsoft SQL Server.
          </p>
        </div>

        {/* Botões Globais de Ação */}
        <div className="flex items-center gap-2 self-stretch md:self-auto">
          {isMultiFileMode ? (
            /* Botão quando > 1.000 registros (Pacote ZIP) */
            <button
              onClick={handleDownloadZip}
              disabled={isZipping || filteredRecords.length === 0}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-[10px] font-black uppercase tracking-[0.15em] rounded-md transition-all active:scale-95 disabled:opacity-30 shadow-md shadow-brand-blue/20"
            >
              {isZipping ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Compactando ZIP...</span>
                </>
              ) : (
                <>
                  <FileArchive size={14} />
                  <span>Baixar Pacote .ZIP ({scriptParts.length} arquivos)</span>
                </>
              )}
            </button>
          ) : (
            /* Botões quando <= 1.000 registros (Arquivo Único) */
            <>
              <button
                onClick={handleCopySql}
                disabled={!singleFileSql}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-brand-blue/20 hover:border-brand-blue text-brand-navy text-[10px] font-black uppercase tracking-[0.15em] rounded-md transition-all active:scale-95 disabled:opacity-30 shadow-xs"
              >
                {isCopied ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>Script Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-brand-blue" />
                    <span>Copiar SQL</span>
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadSingleSql}
                disabled={!singleFileSql}
                className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-[10px] font-black uppercase tracking-[0.15em] rounded-md transition-all active:scale-95 disabled:opacity-30 shadow-sm"
              >
                <Download size={14} />
                <span>Baixar .sql</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mensagem de Feedback: Lote Concluído */}
      {batchCompletedMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between gap-3 text-emerald-950 animate-in fade-in slide-in-from-top-2 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-800">
                Lote Concluído
              </p>
              <p className="text-xs font-semibold text-emerald-900 mt-0.5">
                {batchCompletedMessage}
              </p>
            </div>
          </div>
          <button
            onClick={() => setBatchCompletedMessage(null)}
            className="p-1 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-900 rounded transition-colors"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Seletor de Origem de Dados */}
      <div className="bg-white border border-brand-blue/10 p-5 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database className="text-brand-blue w-4 h-4" />
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">
              Origem dos XMLs para o Script
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSourceMode('existing')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                sourceMode === 'existing'
                  ? "bg-brand-blue text-white shadow-xs"
                  : "bg-slate-100 text-brand-navy/60 hover:text-brand-navy"
              )}
            >
              Usar XMLs da Base ({records.length})
            </button>
            <button
              onClick={() => setSourceMode('upload')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all",
                sourceMode === 'upload'
                  ? "bg-brand-blue text-white shadow-xs"
                  : "bg-slate-100 text-brand-navy/60 hover:text-brand-navy"
              )}
            >
              Importar Lote Específico ({uploadedRecords.length})
            </button>
          </div>
        </div>

        {sourceMode === 'upload' && (
          <div className="pt-2">
            <FileUpload
              onProcessingStart={() => {
                setIsProcessingUpload(true);
                setUploadedRecords([]);
              }}
              onProgress={handleUploadProgress}
              onComplete={() => {
                setIsProcessingUpload(false);
                setBatchCompletedMessage('Lote de arquivos XML importado e processado com sucesso!');
              }}
              onClear={uploadedRecords.length > 0 ? () => setUploadedRecords([]) : undefined}
            />
            {isProcessingUpload && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between text-[10px] font-mono text-brand-blue">
                <span>Processando arquivos para o script...</span>
                <span>{uploadProgress.current} / {uploadProgress.total}</span>
              </div>
            )}
          </div>
        )}

        {/* Barra de Filtros e Parâmetros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
          {/* Busca por cupom ou chave */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="BUSCAR CUPOM OU CHAVE..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-3 py-2 text-[10px] font-mono tracking-wider focus:outline-none focus:border-brand-blue focus:bg-white uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400"
            />
          </div>

          {/* Filtro por Modelo */}
          <div>
            <select
              value={selectedMod}
              onChange={(e) => {
                setSelectedMod(e.target.value as any);
                setPreviewPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider text-brand-navy focus:outline-none focus:border-brand-blue"
            >
              <option value="all">TODOS OS MODELOS (55 e 65)</option>
              <option value="65">MODELO 65 - NFC-E</option>
              <option value="55">MODELO 55 - NF-E</option>
            </select>
          </div>

          {/* Filtro por Empresa */}
          <div>
            <select
              value={selectedCnpj}
              onChange={(e) => {
                setSelectedCnpj(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider text-brand-navy focus:outline-none focus:border-brand-blue"
            >
              <option value="all">TODAS AS EMPRESAS</option>
              {cnpjsList.map(c => (
                <option key={c.cnpj} value={c.cnpj}>
                  {formatCNPJ(c.cnpj)} {c.name ? `- ${c.name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Opção Excluir Canceladas */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <input
              type="checkbox"
              id="excludeCancelled"
              checked={excludeCancelled}
              onChange={(e) => setExcludeCancelled(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <label htmlFor="excludeCancelled" className="text-[10px] font-black uppercase tracking-wider text-brand-navy select-none cursor-pointer">
              Excluir Canceladas ({cancelledKeys.size})
            </label>
          </div>
        </div>
      </div>

      {/* Painel de Customização da Sintaxe SQL */}
      <div className="bg-white border border-brand-blue/10 p-5 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Settings2 className="text-brand-blue w-4 h-4" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">
            Estrutura do Comando SQL
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-center">
          {/* Tabela Alvo */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-brand-navy/60 block mb-1">
              Tabela Alvo
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[10px] font-mono font-bold text-brand-navy focus:outline-none focus:border-brand-blue"
            />
          </div>

          {/* Critério WHERE Padrão */}
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-brand-navy/60 block mb-1">
              Critério WHERE (Padrão)
            </span>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-[10px] font-mono font-bold text-brand-blue truncate">
              NumeroCupomFiscal + Serie + Modelo
            </div>
          </div>

          {/* Transação BEGIN / COMMIT */}
          <div className="flex items-center gap-2 pt-4 sm:pt-0">
            <input
              type="checkbox"
              id="wrapTx"
              checked={wrapTransaction}
              onChange={(e) => setWrapTransaction(e.target.checked)}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <label htmlFor="wrapTx" className="text-[10px] font-black uppercase tracking-wider text-brand-navy cursor-pointer select-none">
              Wrap com BEGIN / COMMIT
            </label>
          </div>

          {/* Controle de Pausa WAITFOR */}
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-brand-navy/60 block mb-1">
              Pausa a cada 100 updates
            </label>
            <select
              value={batchDelaySeconds}
              onChange={(e) => setBatchDelaySeconds(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[10px] font-mono font-bold text-brand-navy focus:outline-none focus:border-brand-blue"
            >
              <option value={1}>1 segundo (WAITFOR)</option>
              <option value={2}>2 segundos (WAITFOR)</option>
              <option value={3}>3 segundos (WAITFOR)</option>
              <option value={5}>5 segundos (WAITFOR)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs de Visualização */}
      <div className="bg-white border border-brand-blue/10 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('script')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'script'
                  ? "bg-brand-blue text-white shadow-xs"
                  : "bg-white text-brand-navy/60 hover:text-brand-navy border border-slate-200"
              )}
            >
              {isMultiFileMode 
                ? `Pacote ZIP (${scriptParts.length} arquivos .sql)`
                : `Script SQL (${filteredRecords.length} comandos)`
              }
            </button>

            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'preview'
                  ? "bg-brand-blue text-white shadow-xs"
                  : "bg-white text-brand-navy/60 hover:text-brand-navy border border-slate-200"
              )}
            >
              Prévia dos Dados Extraídos
            </button>
          </div>

          <div className="text-[10px] font-mono text-brand-navy/60 font-bold hidden sm:block">
            {filteredRecords.length.toLocaleString('pt-BR')} registros selecionados
          </div>
        </div>

        {/* CONTEÚDO DA ABA 1: SCRIPT / PACOTE ZIP */}
        {activeTab === 'script' && (
          <div>
            {isMultiFileMode ? (
              /* CASO > 1.000: Painel de Download do Pacote ZIP (Sem renderizar o código no DOM) */
              <div className="p-8 space-y-6 text-center bg-white">
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="w-16 h-16 bg-brand-blue/10 text-brand-blue rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <FileArchive size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-brand-navy uppercase tracking-tight">
                      Loteamento de Arquivos Ativo (&gt; 1.000 Registros)
                    </h3>
                    <p className="text-[11px] text-brand-navy/60 leading-relaxed uppercase tracking-wider mt-1">
                      Foram detectados <strong>{filteredRecords.length.toLocaleString('pt-BR')} registros</strong>. Para não sobrecarregar o SQL Server e garantir a melhor performance do seu navegador, os scripts foram divididos em <strong>arquivos de 1.000 registros</strong> com pausas programadas (<code className="font-mono font-bold bg-slate-100 px-1 py-0.5 rounded">WAITFOR DELAY '00:00:0{batchDelaySeconds}'</code>) a cada <strong>100 comandos</strong>.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleDownloadZip}
                      disabled={isZipping}
                      className="inline-flex items-center gap-3 px-8 py-3.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-black uppercase tracking-[0.2em] rounded-md transition-all active:scale-95 shadow-md shadow-brand-blue/20 disabled:opacity-40"
                    >
                      {isZipping ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Gerando e Compactando Pacote ZIP...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>Baixar Pacote .ZIP ({scriptParts.length} Arquivos SQL)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {batchCompletedMessage && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-900 flex items-center justify-center gap-2 text-[11px] font-bold animate-in fade-in">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>{batchCompletedMessage}</span>
                    </div>
                  )}
                </div>

                {/* Lista dos arquivos contidos no ZIP */}
                <div className="max-w-3xl mx-auto text-left border border-slate-200 rounded-md overflow-hidden pt-1">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-brand-navy">
                    <span>Arquivos Inclusos no Pacote ZIP ({scriptParts.length})</span>
                    <span className="text-brand-blue">1.000 updates por arquivo • Pausa a cada 100</span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 text-[10px] font-mono custom-scrollbar">
                    {scriptParts.map(part => (
                      <div key={part.partIndex} className="p-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-brand-blue" />
                          <span className="font-bold text-brand-navy">{part.fileName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-brand-navy/60">
                          <span>Registros {part.startNum.toLocaleString('pt-BR')} a {part.endNum.toLocaleString('pt-BR')}</span>
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-brand-navy">
                            {part.count} updates
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* CASO <= 1.000: Exibição direta do script SQL */
              <div className="p-4 bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[600px] select-all custom-scrollbar">
                {filteredRecords.length > 0 ? (
                  <pre className="whitespace-pre">{singleFileSql}</pre>
                ) : (
                  <div className="p-12 text-center text-slate-500 uppercase tracking-widest font-sans text-xs">
                    Nenhum registro selecionado para gerar o script.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO DA ABA 2: PRÉVIA DOS DADOS EXTRAÍDOS */}
        {activeTab === 'preview' && (
          <div className="p-4 space-y-4">
            <div className="overflow-x-auto border border-slate-200 rounded-md custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[950px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[9px] font-black uppercase tracking-[0.2em] text-brand-navy">
                    <th className="p-3 whitespace-nowrap">Nº Cupom (NumeroCupomFiscal)</th>
                    <th className="p-3 whitespace-nowrap">Série (SerieNotaFiscal)</th>
                    <th className="p-3 whitespace-nowrap">Modelo (ModeloDocFiscal)</th>
                    <th className="p-3 whitespace-nowrap">Status (NFeCodigoSEFAZ)</th>
                    <th className="p-3 whitespace-nowrap">Protocolo (NFeProtocoloAutorizacao)</th>
                    <th className="p-3 whitespace-nowrap">Data Aut. (NFeDataAutorizacao)</th>
                    <th className="p-3 whitespace-nowrap">Versão (NFeVersaoXML)</th>
                    <th className="p-3 min-w-[300px]">Chave de Acesso (NFeChaveAcesso)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[10px]">
                  {paginatedPreview.map((rec) => {
                    const chave = rec.chave || '';
                    const cStat = rec.cStat || '100';
                    const nProt = rec.nProt || '---';
                    const dhRecbto = formatSqlDateTime(rec.dhRecbto || rec.dhEmi);
                    const versao = rec.versaoXml || '4.00';
                    const serie = rec.serie || (chave.length === 44 ? String(parseInt(chave.slice(22, 25), 10)) : '1');
                    const mod = rec.mod || (chave.length === 44 ? chave.slice(20, 22) : '65');
                    const nNF = rec.nNF || (chave.length === 44 ? String(parseInt(chave.slice(25, 34), 10)) : '---');

                    return (
                      <tr key={chave || rec.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-brand-navy">{nNF}</td>
                        <td className="p-3 font-mono text-brand-navy">{serie}</td>
                        <td className="p-3 font-medium text-brand-navy">{mod === '65' ? '65 (NFC-e)' : mod === '55' ? '55 (NF-e)' : mod}</td>
                        <td className="p-3 font-mono font-bold text-emerald-600">{cStat}</td>
                        <td className="p-3 font-mono text-brand-navy/70">{nProt}</td>
                        <td className="p-3 font-mono text-brand-navy">{dhRecbto}</td>
                        <td className="p-3 font-mono text-brand-navy/60">{versao}</td>
                        <td className="p-3 font-mono font-bold text-brand-blue">{chave}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação da Prévia */}
            {filteredRecords.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-[10px] text-brand-navy/70 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-wider font-bold">Exibir</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPreviewPage(1);
                    }}
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-[10px] focus:outline-none focus:border-brand-blue"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span className="uppercase tracking-wider">por página • Total: {filteredRecords.length.toLocaleString('pt-BR')} registros</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">
                    Página {previewPage} de {totalPreviewPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                      disabled={previewPage === 1}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy disabled:opacity-20 transition-all font-bold"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                      disabled={previewPage === totalPreviewPages}
                      className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-brand-navy disabled:opacity-20 transition-all font-bold"
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
    </div>
  );
}
