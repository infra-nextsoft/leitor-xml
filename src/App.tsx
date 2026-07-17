import { useState, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { db, XMLRecord } from './lib/db'
import { FileUpload } from './components/FileUpload'
import { XMLTable } from './components/XMLTable'
import { ExcelComparison, type CompareItem } from './components/ExcelComparison'
import { GapAnalysis } from './components/GapAnalysis'
import { ApiDownloader } from './components/ApiDownloader'
import BatchDownloader from './components/BatchDownloader'
import NfceInutilization from './components/NfceInutilization'
import { XmlGenerator } from './components/XmlGenerator'
import { SettingsPanel } from './components/SettingsPanel'
import { SefazSpSaeDownloader } from './components/SefazSpSaeDownloader'
import { formatCurrency, cn } from './lib/utils'
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
  DownloadCloud
} from 'lucide-react'


function App() {
  const [records, setRecords] = useState<XMLRecord[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeModule, setActiveModule] = useState<'home' | 'analyze' | 'homologate' | 'inutilize' | 'generate_xml' | 'settings' | 'sefaz_sp'>('home')
  const [activeTab, setActiveTab] = useState<'import' | 'compare' | 'gaps' | 'homologate' | 'batch_homologate' | 'inutilize' | 'generate_xml' | 'settings'>('import')
  const [selectedMod, setSelectedMod] = useState<'all' | '55' | '65'>('all')

  // Excel comparison state persistence
  const [missingInExcel, setMissingInExcel] = useState<CompareItem[]>([]);
  const [missingInXml, setMissingInXml] = useState<CompareItem[]>([]);
  const [compareDone, setCompareDone] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string>('');

  const filteredRecords = useMemo(() => {
    if (selectedMod === 'all') return records;
    return records.filter(rec => rec.mod === selectedMod);
  }, [records, selectedMod]);

  useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    const allRecords = await db.xmlRecords.toArray()
    const sorted = allRecords.sort((a, b) => b.dhEmi.localeCompare(a.dhEmi));
    setRecords(sorted)
  }

  const handleProcessingStart = () => {
    setIsProcessing(true)
    setProgress({ current: 0, total: 0 })
  }

  const handleProgress = async (current: number, total: number, batch: XMLRecord[]) => {
    setProgress({ current, total })
    await db.xmlRecords.bulkPut(batch)
  }

  const handleComplete = async () => {
    setIsProcessing(false)
    await loadRecords()
  }

  const clearDatabase = async () => {
    if (confirm('Tem certeza que deseja apagar todos os registros importados? Isso limpará seu banco de dados local.')) {
      await db.xmlRecords.clear()
      setRecords([])
    }
  }

  const exportToExcel = () => {
    const exportData = records.map(r => ({
      'Chave de Acesso': r.chave || '---',
      'Nº Cupom': r.nNF,
      'Data Emissão': r.dhEmi,
      'CPF Cliente': r.cpf,
      'Valor Bruto': r.vProd,
      'Valor Desconto': r.vDesc,
      'Valor Líquido': r.vNF,
      'Arquivo': r.fileName
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NFC-e Processadas");
    XLSX.writeFile(wb, `relatorio_nfce_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const totals = useMemo(() => {
    return filteredRecords.reduce((acc, rec) => ({
      count: acc.count + 1,
      bruto: acc.bruto + rec.vProd,
      desc: acc.desc + rec.vDesc,
      liquido: acc.liquido + rec.vNF
    }), { count: 0, bruto: 0, desc: 0, liquido: 0 })
  }, [filteredRecords])

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
                    onClear={records.length > 0 ? clearDatabase : undefined}
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
                    {records.length > 0 && (
                      <>
                        {/* Painel de Indicadores Globais na Tela de Análise */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <StatCard title="Total Cupons" value={totals.count.toLocaleString('pt-BR')} icon={<ReceiptText className="text-brand-blue" />} />
                          <StatCard title="Valor Bruto" value={formatCurrency(totals.bruto)} icon={<TrendingUp className="text-emerald-500" />} highlight />
                          <StatCard title="Total Descontos" value={formatCurrency(totals.desc)} icon={<TrendingUp className="text-brand-melon rotate-180" />} danger />
                          <StatCard title="Valor Líquido" value={formatCurrency(totals.liquido)} icon={<Database className="text-brand-navy" />} />
                        </div>

                        <XMLTable records={filteredRecords} selectedMod={selectedMod} onModChange={setSelectedMod} />
                        <GapAnalysis records={filteredRecords} />
                      </>
                    )}
                    {records.length === 0 && !isProcessing && (
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
                  missingInExcel={missingInExcel}
                  setMissingInExcel={setMissingInExcel}
                  missingInXml={missingInXml}
                  setMissingInXml={setMissingInXml}
                  compareDone={compareDone}
                  setCompareDone={setCompareDone}
                  excelFileName={excelFileName}
                  setExcelFileName={setExcelFileName}
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

            </div>

          </div>
        )}
      </main>

      <footer className="mt-20 pt-8 border-t border-slate-100 text-center">
        <p className="text-[10px] font-black text-brand-navy/30 uppercase tracking-[0.4em]">
          Copyright © NextSoft. Feito com 💙 pelos #Nexters
        </p>
      </footer>
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
