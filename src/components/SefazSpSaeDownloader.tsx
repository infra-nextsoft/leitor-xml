import React, { useState, useRef } from 'react';
import { DownloadCloud, KeyRound, ShieldCheck, FileKey, AlertCircle, Loader2, Calendar, Building2, Server, Play, FileArchive, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSettings } from '../lib/settings';
import { listSefazKeys, downloadSefazXml, SefazConfig } from '../lib/sefazSpSae';
import JSZip from 'jszip';

interface ProcessLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export function SefazSpSaeDownloader() {
  const settings = getSettings();
  
  const [formData, setFormData] = useState({
    ambiente: '1', // '1' = Produção, '2' = Homologação
    cnpj: settings.cnpjPadrao || '',
    senhaCertificado: settings.lembrarSenha ? settings.senhaCertificado : '',
    dataIni: '',
    dataFim: '',
  });

  const [certificadoBase64, setCertificadoBase64] = useState<string>(settings.certificadoBase64 || '');
  const [certFileName, setCertFileName] = useState<string>(settings.certFileName || '');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' });
  const [logs, setLogs] = useState<ProcessLog[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, type, message }, ...prev]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setFormData(prev => ({ ...prev, cnpj: value.replace(/\D/g, '').slice(0, 14) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    setErrorMsg('');
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx') && !file.name.endsWith('.p12')) {
      setErrorMsg('Por favor, selecione um certificado válido (.pfx ou .p12)');
      return;
    }

    setCertFileName(file.name);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const base64Data = result.split('base64,')[1];
      if (base64Data) {
        setCertificadoBase64(base64Data);
        addLog('success', `Certificado ${file.name} carregado com sucesso.`);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Falha ao ler o arquivo de certificado.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const input = fileInputRef.current;
      if (input) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        input.files = dataTransfer.files;
        handleCertUpload({ target: input } as any);
      }
    }
  };

  const executeDownloadFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setZipBlob(null);
    setLogs([]);

    if (!certificadoBase64) {
      setErrorMsg('O certificado digital (.pfx) é obrigatório.');
      return;
    }
    if (!formData.senhaCertificado) {
      setErrorMsg('A senha do certificado é obrigatória.');
      return;
    }
    if (formData.cnpj.length !== 14) {
      setErrorMsg('CNPJ do emitente deve possuir 14 dígitos.');
      return;
    }
    if (!formData.dataIni || !formData.dataFim) {
      setErrorMsg('Selecione as datas inicial e final para consulta.');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: 0, label: 'Iniciando autenticação...' });
    addLog('info', `Iniciando consulta para o CNPJ ${formData.cnpj} no período ${formData.dataIni} a ${formData.dataFim}.`);

    const config: SefazConfig = {
      ambiente: formData.ambiente as '1' | '2',
      cnpj: formData.cnpj,
      certificadoBase64,
      senhaCertificado: formData.senhaCertificado,
      apiUrl: settings.apiUrl
    };

    try {
      // 1. Consultar Chaves
      addLog('info', 'Buscando lista de chaves de acesso na SEFAZ-SP (SAE)...');
      setProgress({ current: 0, total: 0, label: 'Consultando chaves...' });
      const chaves = await listSefazKeys(config, formData.dataIni, formData.dataFim);

      if (chaves.length === 0) {
        addLog('warning', 'Nenhuma chave de acesso de NFC-e localizada no período consultado.');
        setIsProcessing(false);
        setProgress({ current: 0, total: 0, label: '' });
        return;
      }

      addLog('success', `Sucesso! Encontradas ${chaves.length} chaves no período.`);
      
      // 2. Baixar XML de cada chave obtida
      const zip = new JSZip();
      let downloadedCount = 0;
      const totalKeys = chaves.length;

      setProgress({ current: 0, total: totalKeys, label: 'Baixando notas...' });

      for (let i = 0; i < totalKeys; i++) {
        const item = chaves[i];
        addLog('info', `[${i + 1}/${totalKeys}] Solicitando XML da chave: ${item.chave}...`);
        setProgress(p => ({ ...p, current: i + 1, label: `Baixando XML ${i + 1} de ${totalKeys}...` }));

        try {
          const xmlContent = await downloadSefazXml(config, item.chave);
          
          // Adiciona ao ZIP
          zip.file(`${item.chave}.xml`, xmlContent);
          downloadedCount++;
          addLog('success', `XML da chave ${item.chave} baixado e indexado.`);
        } catch (err: any) {
          addLog('error', `Falha ao baixar chave ${item.chave}: ${err.message}`);
        }

        // Delay amigável de 300ms entre as requisições para evitar rate limit de consumo indevido
        if (i < totalKeys - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      if (downloadedCount === 0) {
        throw new Error('Nenhum XML pôde ser baixado com sucesso das chaves listadas.');
      }

      addLog('info', 'Compactando arquivos XML em um pacote .ZIP...');
      const generatedBlob = await zip.generateAsync({ type: 'blob' });
      setZipBlob(generatedBlob);
      addLog('success', `Fluxo finalizado. ${downloadedCount} XMLs baixados e compactados com sucesso!`);
      setProgress({ current: downloadedCount, total: totalKeys, label: 'Concluído!' });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Ocorreu um erro inesperado no fluxo de download da SEFAZ.');
      addLog('error', `Erro crítico: ${err.message || 'Falha desconhecida.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = () => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sefaz_sp_sae_${formData.cnpj}_${formData.dataIni.replace(/-/g, '')}_${formData.dataFim.replace(/-/g, '')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DownloadCloud className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Consulta & Download SEFAZ-SP (SAE)</h2>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 border border-emerald-500/20 px-2 py-0.5 rounded-[2px]">
          Ativo
        </span>
      </div>

      {/* Main Body */}
      <div className="p-6">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50/5 border border-brand-melon/20 rounded flex items-start gap-3">
            <AlertCircle className="text-brand-melon w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-brand-melon">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={executeDownloadFlow} className="flex flex-col lg:flex-row gap-8">
          
          {/* Configurações e Certificado (Col 1) */}
          <div className="w-full lg:w-2/5 flex flex-col gap-5">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-4 flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-blue/60" />
                Certificado & Emitente
              </h3>
            </div>

            {/* Drag and Drop Certificado */}
            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Arquivo do Certificado (.pfx)</label>
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-md transition-all hover:bg-brand-blue/[0.02] group p-4 flex flex-col items-center justify-center cursor-pointer",
                  certificadoBase64 
                    ? "border-emerald-500/30 bg-emerald-500/[0.02]" 
                    : "border-brand-blue/10 bg-white"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".pfx,.p12"
                  onChange={handleCertUpload}
                  className="hidden"
                />
                {certificadoBase64 ? (
                  <ShieldCheck className="w-8 h-8 mb-2 text-emerald-500" />
                ) : (
                  <FileKey className="w-8 h-8 mb-2 text-brand-blue/20 group-hover:text-brand-blue transition-colors" />
                )}
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy text-center truncate max-w-xs">
                  {certFileName ? certFileName : 'Arraste ou clique para enviar'}
                </span>
                <span className="text-[9px] text-brand-navy/40 uppercase tracking-widest mt-1">Formato aceito: .pfx / .p12</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Senha do Certificado</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <KeyRound size={12} className="text-brand-blue/40" />
                </span>
                <input 
                  type="password" 
                  name="senhaCertificado"
                  value={formData.senhaCertificado}
                  onChange={handleInputChange}
                  placeholder="Digite a senha..."
                  className="w-full bg-white border border-brand-blue/20 rounded py-2 px-9 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">CNPJ do Emitente</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Building2 size={12} className="text-brand-blue/40" />
                </span>
                <input 
                  type="text" 
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleInputChange}
                  placeholder="00.000.000/0000-00"
                  className="w-full bg-white border border-brand-blue/20 rounded py-2 px-9 text-xs font-mono focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Ambiente</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Server size={12} className="text-brand-blue/40" />
                  </span>
                  <select 
                    name="ambiente" 
                    value={formData.ambiente}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/20 rounded py-2 pl-8 pr-2 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
                  >
                    <option value="1">1 - Produção</option>
                    <option value="2">2 - Homologação</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Data Inicial</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar size={12} className="text-brand-blue/40" />
                  </span>
                  <input 
                    type="date" 
                    name="dataIni"
                    value={formData.dataIni}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/20 rounded py-1.5 pl-8 pr-2 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Data Final</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar size={12} className="text-brand-blue/40" />
                </span>
                <input 
                  type="date" 
                  name="dataFim"
                  value={formData.dataFim}
                  onChange={handleInputChange}
                  className="w-full bg-white border border-brand-blue/20 rounded py-1.5 pl-8 pr-2 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
                />
              </div>
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={isProcessing}
                className="w-full flex items-center justify-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-black uppercase tracking-widest text-[10px] py-3.5 px-6 rounded transition-all shadow-md shadow-brand-blue/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {isProcessing ? 'Consultando...' : 'Consultar & Baixar XMLs'}
              </button>
            </div>
          </div>

          <div className="hidden lg:block w-px bg-brand-blue/10 self-stretch" />

          {/* Logs de Processamento e Ações (Col 2) */}
          <div className="flex-1 w-full flex flex-col gap-4">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-2 flex items-center gap-2">
                <FileArchive size={14} className="text-brand-blue/60" />
                Logs e Resultados do Processo
              </h3>
            </div>

            {/* Barra de Progresso */}
            {progress.total > 0 && (
              <div className="bg-brand-blue/[0.03] border border-brand-blue/10 rounded-[2px] p-4 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                  <span className="text-brand-blue">{progress.label}</span>
                  <span className="text-brand-navy">{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-brand-blue/10 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-brand-blue h-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Visualizador de Logs */}
            <div className="flex-1 min-h-[220px] max-h-[300px] overflow-y-auto border border-brand-blue/10 rounded-[2px] p-4 bg-brand-navy text-white font-mono text-[10px] space-y-2.5">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/30 uppercase tracking-widest text-center">
                  Aguardando início do processo de consulta...
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2 border-b border-white/5 pb-1">
                    <span className="text-brand-blue/60 flex-shrink-0 font-bold">[{log.timestamp}]</span>
                    <span className={cn(
                      "font-bold",
                      log.type === 'success' && 'text-emerald-400',
                      log.type === 'warning' && 'text-brand-sun',
                      log.type === 'error' && 'text-brand-melon',
                      log.type === 'info' && 'text-white/80'
                    )}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Ação de Download do ZIP Final */}
            {zipBlob && (
              <div className="p-4 bg-emerald-500/[0.03] border border-emerald-500/20 rounded-[2px] flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-brand-navy">XMLs prontos para download!</h4>
                    <p className="text-[9px] uppercase tracking-widest text-brand-navy/60 font-semibold">Tamanho total do pacote compactado</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[9px] py-2.5 px-6 rounded transition-all active:scale-95 shadow-sm shadow-emerald-500/10"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  Baixar arquivo .ZIP
                </button>
              </div>
            )}

          </div>

        </form>
      </div>
    </div>
  );
}
