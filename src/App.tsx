import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { db, XMLRecord, CancellationRecord } from './lib/db'
import { FileUpload } from './components/FileUpload'
import { XMLTable } from './components/XMLTable'
import { CancelledSalesCard } from './components/CancelledSalesCard'
import { ExcelComparison, type CnpjCompareState } from './components/ExcelComparison'
import { GapAnalysis } from './components/GapAnalysis'
import { ApiDownloader } from './components/ApiDownloader'
import BatchDownloader from './components/BatchDownloader'
import NfceInutilization from './components/NfceInutilization'
import { XmlGenerator } from './components/XmlGenerator'
import { SettingsPanel } from './components/SettingsPanel'
import { SefazSpSaeDownloader } from './components/SefazSpSaeDownloader'
import { formatCurrency, formatCNPJ, cn } from './lib/utils'
import { 
  Database, 
  TrendingUp, 
  ReceiptText, 
  Download, 
  BarChart3, 
  Trash2, 
  FileCode, 
  Settings, 
  ChevronRight, 
  ArrowLeft,
  DownloadCloud,
  Building2,
  X,
  AlertCircle,
  Code2
} from 'lucide-react'
import { SqlScriptGenerator } from './components/SqlScriptGenerator'


function App() {
  const [records, setRecords] = useState<XMLRecord[]>([])
  const [cancellations, setCancellations] = useState<CancellationRecord[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeModule, setActiveModule] = useState<'home' | 'analyze' | 'homologate' | 'inutilize' | 'generate_xml' | 'settings' | 'sefaz_sp' | 'sql_generator'>('home')
  const [activeTab, setActiveTab] = useState<'import' | 'compare' | 'gaps' | 'homologate' | 'batch_homologate' | 'inutilize' | 'generate_xml' | 'settings'>('import')
  const [selectedMod, setSelectedMod] = useState<'all' | '55' | '65'>('all')
  const [selectedCnpj, setSelectedCnpj] = useState<string>('all')

  // Excel comparison state persistence per CNPJ
  const [compareStateByCnpj, setCompareStateByCnpj] = useState<Record<string, CnpjCompareState>>({});

  // Modal de exclusão por CNPJ
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [selectedClearCnpj, setSelectedClearCnpj] = useState<string>('all');

  const cnpjsList = useMemo(() => {
    const map = new Map<string, { cnpj: string; name: string; count: number; bruto: number }>();
    records.forEach(rec => {
      let cnpj = rec.cnpjEmit;
      if (!cnpj || cnpj === 'Não informado') {
        if (rec.chave && rec.chave.length === 44) {
          cnpj = rec.chave.slice(6, 20);
        } else {
          cnpj = 'Outros';
        }
      }
      const name = rec.xNomeEmit || '';
      const existing = map.get(cnpj);
      if (existing) {
        existing.count++;
        existing.bruto += rec.vProd;
        if (!existing.name && name) existing.name = name;
      } else {
        map.set(cnpj, { cnpj, name, count: 1, bruto: rec.vProd });
      }
    });

    // Inclui também CNPJs identificados a partir de eventos de cancelamento
    cancellations.forEach(c => {
      let cnpj = c.cnpjEmit;
      if (!cnpj || cnpj === 'Não informado') {
        if (c.chave && c.chave.length === 44) {
          cnpj = c.chave.slice(6, 20);
        } else {
          cnpj = 'Outros';
        }
      }
      if (cnpj && !map.has(cnpj)) {
        map.set(cnpj, { cnpj, name: '', count: 0, bruto: 0 });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [records, cancellations]);

  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      if (selectedMod !== 'all' && rec.mod !== selectedMod) return false;
      if (selectedCnpj !== 'all') {
        let cnpj = rec.cnpjEmit;
        if (!cnpj || cnpj === 'Não informado') {
          if (rec.chave && rec.chave.length === 44) {
            cnpj = rec.chave.slice(6, 20);
          } else {
            cnpj = 'Outros';
          }
        }
        if (cnpj !== selectedCnpj) return false;
      }
      return true;
    });
  }, [records, selectedMod, selectedCnpj]);

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    const allRecords = await db.xmlRecords.toArray()
    const sorted = allRecords.sort((a, b) => b.dhEmi.localeCompare(a.dhEmi));
    setRecords(sorted)

    const allCancels = await db.cancellations.toArray();
    // Limpeza automática de chaves truncadas/corrompidas (menos de 44 dígitos)
    const corrupted = allCancels.filter(c => !c.chave || c.chave.length !== 44);
    if (corrupted.length > 0) {
      await db.cancellations.bulkDelete(corrupted.map(c => c.chave));
    }
    const validCancels = allCancels.filter(c => c.chave && c.chave.length === 44);
    const sortedCancels = validCancels.sort((a, b) => {
      const dateA = a.dhRegEvento || a.dhEvento || '';
      const dateB = b.dhRegEvento || b.dhEvento || '';
      return dateB.localeCompare(dateA);
    });
    setCancellations(sortedCancels);
  }

  const handleProcessingStart = () => {
    setIsProcessing(true)
    setProgress({ current: 0, total: 0 })
  }

  const handleProgress = async (current: number, total: number, batch: XMLRecord[], cancellationsBatch?: CancellationRecord[]) => {
    setProgress({ current, total })
    if (batch && batch.length > 0) {
      await db.xmlRecords.bulkPut(batch)
    }
    if (cancellationsBatch && cancellationsBatch.length > 0) {
      await db.cancellations.bulkPut(cancellationsBatch)
    }
  }

  const handleComplete = async () => {
    setIsProcessing(false)
    await loadRecords()
  }

  const handleOpenClearModal = () => {
    setSelectedClearCnpj('all');
    setIsClearModalOpen(true);
  };

  const handleConfirmClear = async () => {
    if (selectedClearCnpj === 'all') {
      await db.xmlRecords.clear();
      await db.cancellations.clear();
      setCompareStateByCnpj({});
      setRecords([]);
      setCancellations([]);
      setSelectedCnpj('all');
    } else {
      const allRecs = await db.xmlRecords.toArray();
      const idsToDelete = allRecs
        .filter(rec => {
          let cnpj = rec.cnpjEmit;
          if (!cnpj || cnpj === 'Não informado') {
            if (rec.chave && rec.chave.length === 44) {
              cnpj = rec.chave.slice(6, 20);
            } else {
              cnpj = 'Outros';
            }
          }
          return cnpj === selectedClearCnpj;
        })
        .map(rec => rec.id)
        .filter((id): id is number => id !== undefined);

      await db.xmlRecords.bulkDelete(idsToDelete);

      const allCancels = await db.cancellations.toArray();
      const cancelKeysToDelete = allCancels
        .filter(c => {
          let cnpj = c.cnpjEmit;
          if (!cnpj || cnpj === 'Não informado') {
            if (c.chave && c.chave.length === 44) {
              cnpj = c.chave.slice(6, 20);
            } else {
              cnpj = 'Outros';
            }
          }
          return cnpj === selectedClearCnpj;
        })
        .map(c => c.chave);

      await db.cancellations.bulkDelete(cancelKeysToDelete);

      setCompareStateByCnpj(prev => {
        const copy = { ...prev };
        delete copy[selectedClearCnpj];
        return copy;
      });

      setSelectedCnpj('all');
    }

    setIsClearModalOpen(false);
    await loadRecords();
  };

  const cancelledKeysSet = useMemo(() => {
    return new Set(cancellations.map(c => c.chave.trim()));
  }, [cancellations]);

  const exportToExcel = () => {
    const exportData = records.map(r => {
      const isCancelled = cancelledKeysSet.has(r.chave.trim());
      return {
        'Chave de Acesso': r.chave || '---',
        'Nº Cupom': r.nNF,
        'Série': r.serie || '---',
        'Situação': isCancelled ? 'Cancelada' : 'Autorizada',
        'Data Emissão': r.dhEmi,
        'CPF Cliente': r.cpf,
        'Valor Bruto': r.vProd,
        'Valor Desconto': r.vDesc,
        'Valor Líquido': r.vNF,
        'Arquivo': r.fileName
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NFC-e Processadas");
    XLSX.writeFile(wb, `relatorio_nfce_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Exclui vendas canceladas dos totais financeiros
  const totals = useMemo(() => {
    return filteredRecords
      .filter(rec => !cancelledKeysSet.has(rec.chave.trim()))
      .reduce((acc, rec) => ({
        count: acc.count + 1,
        bruto: acc.bruto + rec.vProd,
        desc: acc.desc + rec.vDesc,
        liquido: acc.liquido + rec.vNF
      }), { count: 0, bruto: 0, desc: 0, liquido: 0 });
  }, [filteredRecords, cancelledKeysSet]);

  return (
    <div className="min-h-screen bg-white text-brand-navy p-4 md:p-8 selection:bg-brand-blue/10">
      <header className="mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-brand-blue/5 pb-8">
        <img src="/logo.png" alt="NextSoft Logo" className="h-8 w-auto self-start lg:self-end mb-4 lg:mb-0" />
        <div className="text-left lg:text-right">
        <h1 className="text-sm font-black text-brand-navy/60 tracking-tight uppercase">
          SISTEMA DE LEITURA E ANÁLISE DE XMLS NFCE
        </h1>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto">
        {/* VIEW: HOME PAGE (Página Inicial com Cards) */}
        {activeModule === 'home' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-12">
            
            {/* Mensagem de Boas-Vindas Premium */}
            <div className="bg-slate-50/50 border border-slate-200 p-8 rounded-md shadow-sm">
              <h2 className="text-[10px] font-black text-brand-blue uppercase tracking-[0.2em] mb-2">Painel de Controle</h2>
              <h1 className="text-2xl font-black text-brand-navy tracking-tight leading-none mb-3">
                Seja bem-vindo ao Leitor XML da NextSoft
              </h1>
              <p className="text-[10px] text-brand-navy/60 max-w-2xl leading-relaxed uppercase tracking-[0.15em] font-medium">
                Escolha uma das funcionalidades abaixo para gerenciar, homologar e inutilizar seus documentos fiscais de forma rápida e segura.
              </p>
            </div>

            {/* Grid dos Cards de Módulos (Bento Grid Style) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* Card 1: Análise de XMLs */}
              <div 
                onClick={() => { setActiveModule('analyze'); setActiveTab('import'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <BarChart3 className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Análise de XMLs</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Importação local de cupons, auditoria de lacunas de numeração e comparação com planilhas financeiras Excel.
                  </p>
                </div>
              </div>

              {/* Card 2: Homologar NFCe */}
              <div 
                onClick={() => { setActiveModule('homologate'); setActiveTab('homologate'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <Download className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Homologar NFCe</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Homologação e download de arquivos XML de forma individual ou em lote via chave de acesso e certificado digital.
                  </p>
                </div>
              </div>

              {/* Card 3: Inutilizar NFCe */}
              <div 
                onClick={() => { setActiveModule('inutilize'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-melon/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-melon/5 group-hover:border-brand-melon/20 transition-all">
                    <Trash2 className="text-brand-melon w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-melon transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Inutilizar NFCe</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Solicitação e validação de inutilização de faixas de cupons fiscais não utilizados direto perante a SEFAZ.
                  </p>
                </div>
              </div>

              {/* Card 4: Gerar XML */}
              <div 
                onClick={() => { setActiveModule('generate_xml'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <FileCode className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Gerar XML</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Geração e empacotamento em lote de arquivos XML a partir de colunas correspondentes em planilhas Excel.
                  </p>
                </div>
              </div>

              {/* Card 5: Configurações */}
              <div 
                onClick={() => { setActiveModule('settings'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <Settings className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Configurações</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Parametrização da API local do Concentrador, dados do emitente padrão e cache de certificados de segurança.
                  </p>
                </div>
              </div>

              {/* Card 6: Consulta SEFAZ-SP (SAE) */}
              <div 
                onClick={() => { setActiveModule('sefaz_sp'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <DownloadCloud className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Consulta SEFAZ-SP (SAE)</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Consulta do lote de chaves emitidas e download dos XMLs diretamente dos WebServices da SEFAZ-SP.
                  </p>
                </div>
              </div>

              {/* Card 7: Gerador de Script SQL (GRN) */}
              <div 
                onClick={() => { setActiveModule('sql_generator'); }}
                className="bg-white border border-brand-blue/5 p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] hover:border-brand-blue/30 cursor-pointer transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)] group flex flex-col justify-between min-h-[180px]"
              >
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-slate-50 rounded-md border border-slate-100 shadow-sm group-hover:bg-brand-blue/5 group-hover:border-brand-blue/20 transition-all">
                    <Code2 className="text-brand-blue w-5 h-5" />
                  </div>
                  <ChevronRight size={14} className="text-brand-navy/20 group-hover:text-brand-blue transition-colors" />
                </div>
                <div className="mt-4">
                  <h3 className="text-brand-navy text-[10px] font-black uppercase tracking-[0.2em] mb-1.5">Gerador de Script SQL</h3>
                  <p className="text-brand-navy/50 text-[10px] uppercase tracking-[0.1em] font-medium leading-relaxed">
                    Geração automatizada de comandos UPDATE para correção de vendas do sistema GRN no Microsoft SQL Server.
                  </p>
                </div>
              </div>


            </div>

          </div>
        )}

        {/* VIEW: COMPONENTES DOS MÓDULOS ATIVOS */}
        {activeModule !== 'home' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Cabeçalho do Módulo Ativo com Botão Voltar */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-brand-blue/5">
              <button 
                onClick={() => setActiveModule('home')}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] bg-white border border-brand-blue/10 hover:border-brand-blue hover:text-brand-blue py-2.5 px-5 rounded-md transition-all active:scale-95 shadow-sm"
              >
                <ArrowLeft size={12} />
                Voltar ao início
              </button>
              <div className="text-right">
                <span className="text-[9px] font-black text-brand-blue uppercase tracking-[0.2em] block mb-1">Módulo Ativo</span>
                <h2 className="text-xs font-black text-brand-navy uppercase tracking-widest leading-none">
                  {activeModule === 'analyze' && 'Análise de XMLs'}
                  {activeModule === 'homologate' && 'Homologação NFCe'}
                  {activeModule === 'inutilize' && 'Inutilização NFCe'}
                  {activeModule === 'generate_xml' && 'Geração de XML'}
                  {activeModule === 'settings' && 'Configurações'}
                  {activeModule === 'sefaz_sp' && 'Consulta SEFAZ-SP (SAE)'}
                  {activeModule === 'sql_generator' && 'Gerador de Script SQL (GRN)'}
                </h2>
              </div>
            </div>

            {/* Sub-abas contextuais para Módulos que possuem sub-navegação */}
            {activeModule === 'analyze' && (
              <nav className="flex flex-wrap gap-8 border-b border-brand-blue/5 mb-12 overflow-x-auto no-scrollbar">
                {[
                  { id: 'import', label: 'Importar XMLs' },
                  { id: 'compare', label: 'Comparar com Excel' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "relative pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                      activeTab === tab.id 
                        ? "text-brand-blue" 
                        : "text-brand-navy/30 hover:text-brand-navy"
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-blue shadow-[0_4px_10px_rgba(43,70,204,0.3)]" />
                    )}
                  </button>
                ))}
              </nav>
            )}

            {activeModule === 'homologate' && (
              <nav className="flex flex-wrap gap-8 border-b border-brand-blue/5 mb-12 overflow-x-auto no-scrollbar">
                {[
                  { id: 'homologate', label: 'Homologar NFCe' },
                  { id: 'batch_homologate', label: 'Homologar NFCe em Lote' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "relative pb-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                      activeTab === tab.id 
                        ? "text-brand-blue" 
                        : "text-brand-navy/30 hover:text-brand-navy"
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-brand-blue shadow-[0_4px_10px_rgba(43,70,204,0.3)]" />
                    )}
                  </button>
                ))}
              </nav>
            )}

            {/* Conteúdo Dinâmico */}
            <div className="space-y-12">
              
              {/* MÓDULO: Análise de XMLs */}
              {activeModule === 'analyze' && activeTab === 'import' && (
                <>
                  <FileUpload 
                    onProcessingStart={handleProcessingStart}
                    onProgress={handleProgress}
                    onComplete={handleComplete}
                    onClear={(records.length > 0 || cancellations.length > 0) ? handleOpenClearModal : undefined}
                  />

                  {isProcessing && (
                     <div className="mt-8 mb-4 bg-white border border-slate-100 p-8 rounded-md shadow-[0_10px_40px_-10px_rgba(1,6,36,0.05)]">
                       <div className="flex justify-between items-end mb-3">
                          <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-blue opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-blue"></span>
                            </span>
                            <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest italic">Processando Lote Local</span>
                          </div>
                          <span className="text-[10px] font-mono text-brand-blue font-bold">{progress.current} / {progress.total}</span>
                       </div>
                       <div className="w-full bg-slate-50 h-1.5 rounded-md overflow-hidden border border-slate-100/50">
                          <div 
                            className="bg-brand-blue h-full transition-all duration-300 shadow-[0_0_15px_rgba(43,70,204,0.4)]" 
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                          />
                       </div>
                    </div>
                  )}

                  <div className="space-y-12 mt-8">
                    {(records.length > 0 || cancellations.length > 0) && (
                      <>
                        {/* Painel de CNPJs / Empresas Identificadas */}
                        {cnpjsList.length > 1 && (
                          <div className="bg-white border border-brand-blue/10 p-5 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] space-y-3 animate-in fade-in duration-500">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="text-brand-blue w-4 h-4" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">
                                  Empresas / CNPJs Identificados ({cnpjsList.length})
                                </h3>
                              </div>
                              <span className="text-[9px] text-brand-navy/60 uppercase font-medium">Clique em uma empresa para filtrar a análise</span>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                onClick={() => setSelectedCnpj('all')}
                                className={cn(
                                  "px-3.5 py-2.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 active:scale-95",
                                  selectedCnpj === 'all'
                                    ? "bg-brand-blue text-white shadow-md shadow-brand-blue/20"
                                    : "bg-slate-50 text-brand-navy/70 hover:bg-slate-100 border border-slate-200/60"
                                )}
                              >
                                <span>Todos os CNPJs</span>
                                <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono font-bold", selectedCnpj === 'all' ? "bg-white/20 text-white" : "bg-slate-200 text-brand-navy")}>
                                  {records.length}
                                </span>
                              </button>

                              {cnpjsList.map(item => (
                                <button
                                  key={item.cnpj}
                                  onClick={() => setSelectedCnpj(item.cnpj)}
                                  className={cn(
                                    "px-3.5 py-2.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 active:scale-95 text-left border",
                                    selectedCnpj === item.cnpj
                                      ? "bg-brand-blue border-brand-blue text-white shadow-md shadow-brand-blue/20"
                                      : "bg-slate-50 border-slate-200/60 text-brand-navy/80 hover:bg-slate-100"
                                  )}
                                >
                                  <div>
                                    <span className="font-mono font-bold block">{formatCNPJ(item.cnpj)}</span>
                                    {item.name && <span className={cn("text-[9px] block truncate max-w-[150px] font-medium", selectedCnpj === item.cnpj ? "text-white/80" : "text-brand-navy/60")}>{item.name}</span>}
                                  </div>
                                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0", selectedCnpj === item.cnpj ? "bg-white/20 text-white" : "bg-slate-200 text-brand-navy")}>
                                    {item.count}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Painel de Indicadores Globais na Tela de Análise */}
                        {records.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard 
                              title="Total Válidas" 
                              value={totals.count.toLocaleString('pt-BR')} 
                              icon={<ReceiptText className="text-brand-blue" />} 
                            />
                            <StatCard 
                              title="Valor Bruto Válido" 
                              value={formatCurrency(totals.bruto)} 
                              icon={<TrendingUp className="text-emerald-500" />} 
                              highlight 
                            />
                            <StatCard 
                              title="Total Descontos" 
                              value={formatCurrency(totals.desc)} 
                              icon={<TrendingUp className="text-brand-melon rotate-180" />} 
                              danger 
                            />
                            <StatCard 
                              title="Valor Líquido Válido" 
                              value={formatCurrency(totals.liquido)} 
                              icon={<Database className="text-brand-navy" />} 
                            />
                          </div>
                        )}

                        {/* CARD DE VENDAS CANCELADAS */}
                        <CancelledSalesCard 
                          cancellations={cancellations}
                          records={records}
                          selectedCnpj={selectedCnpj}
                        />

                        {records.length > 0 && (
                          <>
                            <XMLTable 
                              records={filteredRecords} 
                              allRecords={records}
                              selectedMod={selectedMod} 
                              onModChange={setSelectedMod}
                              selectedCnpj={selectedCnpj}
                              onCnpjChange={setSelectedCnpj}
                              cnpjsList={cnpjsList}
                              cancelledKeysSet={cancelledKeysSet}
                            />
                            <GapAnalysis records={filteredRecords} />
                          </>
                        )}
                      </>
                    )}
                    {records.length === 0 && cancellations.length === 0 && !isProcessing && (
                      <div className="p-12 text-center border border-dashed border-brand-blue/20 rounded-md text-brand-navy/50 bg-brand-blue/5 animate-in fade-in zoom-in duration-500">
                         <Database className="w-8 h-8 text-brand-blue/20 mx-auto mb-4" />
                         <p className="text-[10px] font-black uppercase tracking-[0.2em]">Nenhum registro importado ainda.</p>
                         <p className="text-[10px] text-brand-navy/30 mt-2 uppercase font-medium tracking-[0.2em]">Inicie a importação arrastando arquivos XML acima.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeModule === 'analyze' && activeTab === 'compare' && (
                <ExcelComparison 
                  xmlRecords={records} 
                  cnpjsList={cnpjsList}
                  compareStateByCnpj={compareStateByCnpj}
                  setCompareStateByCnpj={setCompareStateByCnpj}
                />
              )}
              
              {/* MÓDULO: Homologação NFCe */}
              {activeModule === 'homologate' && activeTab === 'homologate' && (
                <ApiDownloader />
              )}
              {activeModule === 'homologate' && activeTab === 'batch_homologate' && (
                <BatchDownloader />
              )}
              
              {/* OUTROS MÓDULOS */}
              {activeModule === 'inutilize' && (
                <NfceInutilization />
              )}
              {activeModule === 'generate_xml' && (
                <XmlGenerator />
              )}
              {activeModule === 'settings' && (
                <SettingsPanel />
              )}
              {activeModule === 'sefaz_sp' && (
                <SefazSpSaeDownloader />
              )}
              {activeModule === 'sql_generator' && (
                <SqlScriptGenerator 
                  records={records}
                  cancellations={cancellations}
                  cnpjsList={cnpjsList}
                />
              )}

            </div>

          </div>
        )}
      </main>

      <footer className="mt-20 pt-8 border-t border-slate-100 text-center">
        <p className="text-[10px] font-black text-brand-navy/30 uppercase tracking-[0.4em]">
          Copyright © NextSoft. Feito com 💙 pelos #Nexters
        </p>
      </footer>

      {/* Modal de Limpeza por CNPJ ou Banco Completo */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-brand-navy/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-100 rounded-md shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header do Modal */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="text-brand-melon w-5 h-5" />
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-navy">Excluir Registros</h3>
              </div>
              <button 
                onClick={() => setIsClearModalOpen(false)}
                className="text-slate-400 hover:text-brand-navy p-1 transition-colors rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-6 space-y-5">
              <p className="text-xs text-brand-navy/70 leading-relaxed font-medium">
                Selecione se deseja excluir os XMLs de <strong className="text-brand-navy font-bold">todos os CNPJs</strong> ou de uma <strong className="text-brand-navy font-bold">empresa específica</strong>:
              </p>

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {/* Opção: Todos os CNPJs */}
                <label 
                  onClick={() => setSelectedClearCnpj('all')}
                  className={cn(
                    "p-3.5 rounded-md border flex items-center justify-between cursor-pointer transition-all",
                    selectedClearCnpj === 'all'
                      ? "border-brand-melon bg-brand-melon/5 shadow-sm"
                      : "border-slate-200/70 hover:border-slate-300 bg-slate-50/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input 
                      type="radio" 
                      name="clearOption" 
                      checked={selectedClearCnpj === 'all'} 
                      onChange={() => setSelectedClearCnpj('all')}
                      className="accent-brand-melon"
                    />
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-brand-navy block">
                        Limpar Banco Completo (Todos os CNPJs)
                      </span>
                      <span className="text-[10px] text-brand-navy/60 font-medium">
                        Remove todos os {records.length} XMLs importados
                      </span>
                    </div>
                  </div>
                </label>

                {/* Opção por CNPJ individual */}
                {cnpjsList.map(item => (
                  <label 
                    key={item.cnpj}
                    onClick={() => setSelectedClearCnpj(item.cnpj)}
                    className={cn(
                      "p-3.5 rounded-md border flex items-center justify-between cursor-pointer transition-all",
                      selectedClearCnpj === item.cnpj
                        ? "border-brand-melon bg-brand-melon/5 shadow-sm"
                        : "border-slate-200/70 hover:border-slate-300 bg-slate-50/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <input 
                        type="radio" 
                        name="clearOption" 
                        checked={selectedClearCnpj === item.cnpj} 
                        onChange={() => setSelectedClearCnpj(item.cnpj)}
                        className="accent-brand-melon"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-brand-navy">
                            {formatCNPJ(item.cnpj)}
                          </span>
                          {item.name && (
                            <span className="text-[10px] text-brand-navy/60 font-medium truncate max-w-[180px]">
                              ({item.name})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-brand-navy/50 font-medium">
                          {item.count} cupons deste CNPJ
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 rounded text-[10px] font-bold flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-amber-600" />
                <span>Esta ação é irreversível e removerá os dados do seu navegador local.</span>
              </div>
            </div>

            {/* Ações do Modal */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-brand-navy/60 hover:text-brand-navy bg-white border border-slate-200 hover:bg-slate-100 rounded transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmClear}
                className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-brand-melon hover:bg-rose-600 rounded transition-all shadow-md shadow-brand-melon/20 active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 size={12} />
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, highlight = false, danger = false }: { title: string, value: string, icon: React.ReactNode, highlight?: boolean, danger?: boolean }) {
  return (
    <div className={cn(
      "bg-white border p-6 rounded-md shadow-[0_2px_10px_-2px_rgba(1,6,36,0.03)] transition-all hover:translate-y-[-2px] hover:shadow-[0_10px_25px_-5px_rgba(1,6,36,0.06)]",
      highlight ? "border-emerald-500/20" : danger ? "border-brand-melon/20" : "border-brand-blue/5"
    )}>
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-brand-navy/50 text-[10px] font-black uppercase tracking-[0.2em] leading-none">{title}</h3>
        <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100 shadow-sm">
          {icon}
        </div>
      </div>
      <p className={cn(
        "text-2xl font-black tracking-tighter leading-none", 
        highlight ? "text-emerald-500" : danger ? "text-brand-melon" : "text-brand-navy"
      )}>
        {value}
      </p>
    </div>
  )
}

export default App
