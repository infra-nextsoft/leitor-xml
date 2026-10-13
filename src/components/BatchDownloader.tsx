import React, { useState, useRef } from 'react';
import { Download, UploadCloud, FileType, CheckCircle, XCircle, Loader2, Play, AlertCircle, FileArchive, Layers, ShieldCheck, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import { getSettings } from '../lib/settings';

interface BatchLog {
  chave: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
}

export default function BatchDownloader() {
  const settings = getSettings();
  const [formData, setFormData] = useState({
    ambiente: '1',
    senhaCertificado: settings.lembrarSenha ? settings.senhaCertificado : '',
  });

  const [certificadoBase64, setCertificadoBase64] = useState<string>(settings.certificadoBase64 || '');
  const [certFileName, setCertFileName] = useState<string>(settings.certFileName || '');

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [rowsCount, setRowsCount] = useState<number>(0);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<BatchLog[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<boolean>(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCertFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const base64Data = result.split('base64,')[1];
      if (base64Data) {
        setCertificadoBase64(base64Data);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(firstSheet);
      setRowsCount(json.length);
      setLogs([]);
      setProgress(0);
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const exampleChave = '35260600000000000000650010000000011234567890';
    const exampleXml = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe35260600000000000000650010000000011234567890" versao="4.00"><ide><cUF>35</cUF><cNF>12345678</cNF><natOp>Venda</natOp><mod>65</mod><serie>1</serie><nNF>1</nNF><dhEmi>2026-06-19T13:00:00-03:00</dhEmi></ide><emit><CNPJ>00000000000000</CNPJ><xNome>EMITENTE EXEMPLO LTDA</xNome></emit><dest><CPF>00000000000</CPF></dest><total><ICMSTot><vProd>10.00</vProd><vDesc>0.00</vDesc><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>';

    const templateData = [
      {
        'chave': exampleChave,
        'xml': exampleXml
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Homologação");
    
    ws['!cols'] = [
      { wch: 50 },
      { wch: 100 }
    ];

    XLSX.writeFile(wb, "modelo_homologacao_lote.xlsx");
  };

  const startBatchProcess = async () => {
    if (!excelFile) {
      alert('Por favor, faça upload da planilha com as Chaves a serem homologadas.');
      return;
    }
    if (!certificadoBase64 || !formData.senhaCertificado) {
      alert('As credenciais do certificado (Arquivo .pfx e Senha) são obrigatórias.');
      return;
    }

    setIsProcessing(true);
    cancelRef.current = false;
    setLogs([]);
    setProgress(0);

    try {
      const arrayBuffer = await excelFile.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      
      const rows: any[] = XLSX.utils.sheet_to_json(firstSheet);
      if (rows.length === 0) {
        throw new Error('A planilha está vazia.');
      }

      const zip = new JSZip();
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        if (cancelRef.current) {
           setLogs(prev => [{ chave: 'SISTEMA', status: 'skipped', message: 'Processo interrompido pelo usuário.' }, ...prev]);
           break;
        }

        const row = rows[i];
        const rawChave = row['chaves'] || row['chave'] || row['CHAVE'] || row['CHAVES'] || row['Chave'] || row['Chaves'];
        const rawXml = row['xmlAssinado'] || row['xml'] || row['XML'] || row['XMLAssinado'] || row['xmlassinado'];

        if (!rawChave || !rawXml) {
          setLogs(prev => [{ chave: `Linha ${i+2}`, status: 'error', message: 'Falta coluna de chave ou xml' }, ...prev]);
          setProgress(Math.round(((i + 1) / rows.length) * 100));
          continue;
        }

        const payload = {
          chave: String(rawChave).trim(),
          ambiente: formData.ambiente,
          certificado: certificadoBase64,
          senhaCertificado: formData.senhaCertificado,
          xmlAssinado: String(rawXml).trim()
        };

        try {
          const apiVersion = settings.apiVersion || '1.14';
          const response = await fetch(`${settings.apiUrl}/api/v1/nfce/HomologarVendaXML?api-version=${apiVersion}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            let errorMsg = response.statusText;
            try {
              const errorBody = await response.text();
              if (errorBody) errorMsg = errorBody;
            } catch {}
            throw new Error(`[${response.status}]: ${errorMsg}`);
          }

          const responseText = await response.text();
          let finalXml = responseText;
          try {
            const parsed = JSON.parse(responseText);
            if (typeof parsed === 'string') {
               finalXml = parsed;
            } else if (parsed) {
               if (parsed.xmlDFe) finalXml = parsed.xmlDFe;
               else if (parsed.xml) finalXml = parsed.xml;
            }
          } catch (e) {}
          
          finalXml = finalXml.trim();
          if (!finalXml.startsWith('<')) {
             throw new Error(`Resposta não parece um XML válido.`);
          }

          zip.file(`${payload.chave}.xml`, finalXml);
          setLogs(prev => [{ chave: payload.chave, status: 'success', message: 'Sucesso. Injetado no Zip.' }, ...prev]);
          successCount++;
        } catch (error: any) {
          setLogs(prev => [{ chave: payload.chave, status: 'error', message: error.message || 'Falha de requisição' }, ...prev]);
        }
        setProgress(Math.round(((i + 1) / rows.length) * 100));
      }

      if (successCount > 0) {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Lote_Homologado_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      alert(`Erro fatal: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Unificado */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
         <div className="flex items-center gap-2">
            <Layers className="text-brand-blue w-4 h-4" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Download de XMLs em Lote</h2>
         </div>
      </div>

      <div className="p-6">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Pane: Credentials */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-6 flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-blue/60" />
                Configurações de Acesso
              </h3>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Ambiente</label>
                <select
                  name="ambiente"
                  value={formData.ambiente}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm"
                >
                  <option value="1">1 - Produção</option>
                  <option value="2">2 - Homologação</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Certificado Digital</label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pfx"
                    onChange={handleCertUpload}
                    ref={fileInputRef}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 border rounded-md transition-all group active:scale-[0.98]",
                      certFileName 
                        ? "border-emerald-500/20 bg-emerald-50/30 text-emerald-600" 
                        : "bg-white border-brand-blue/10 text-brand-blue/40 hover:border-brand-blue/30"
                    )}
                  >
                    <span className="text-xs font-bold truncate pr-4">{certFileName || 'Procurar arquivo...'}</span>
                    {certFileName ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <FileType className="w-4 h-4 text-brand-blue/40 group-hover:text-brand-blue transition-colors" />
                    )}
                  </button>
                </div>
                {certificadoBase64 && (
                  <p className="mt-2 text-[9px] text-emerald-600 font-bold flex items-center gap-1 italic">
                    <CheckCircle className="w-3 h-3"/> Certificado carregado com sucesso
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Senha do Certificado</label>
                <input
                  type="password"
                  name="senhaCertificado"
                  value={formData.senhaCertificado}
                  onChange={handleInputChange}
                  placeholder="Digite a senha..."
                  className="w-full px-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm placeholder:text-brand-blue/20"
                />
              </div>
            </div>
          </div>

          <div className="hidden lg:block w-px bg-brand-blue/10 self-stretch" />

          {/* Pane: Excel Operations and Console */}
          <div className="flex-1 w-full flex flex-col gap-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-6 flex items-center gap-2">
                <FileArchive size={14} className="text-brand-blue/60" />
                Processamento em Lote
              </h3>
            </div>

            <div className="p-6 rounded-md border border-slate-100 bg-slate-50/50 flex flex-col gap-5 mb-8">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleExcelUpload}
                    ref={excelInputRef}
                    className="hidden"
                  />
                  <button
                    disabled={isProcessing}
                    onClick={() => excelInputRef.current?.click()}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-md font-black uppercase tracking-[0.2em] transition-all active:scale-[0.98]",
                      excelFile 
                        ? "bg-brand-blue/10 text-brand-blue" 
                        : "bg-white border border-brand-blue/10 text-brand-blue/40 hover:border-brand-blue/30 dashed border-dashed border-2"
                    )}
                  >
                    <FileType className="w-4 h-4"/>
                    {excelFile ? excelFile.name : `Anexar Planilha Excel`}
                  </button>
                </div>

                {!excelFile ? (
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="flex items-center justify-center gap-2 bg-white border border-brand-blue/10 hover:border-brand-blue/30 text-brand-navy hover:text-brand-blue text-[10px] font-black uppercase tracking-[0.2em] py-3.5 px-6 rounded-md transition-all active:scale-95 shadow-sm"
                  >
                    <Download className="w-4 h-4 text-brand-blue" />
                    Baixar Modelo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setExcelFile(null);
                      setRowsCount(0);
                      setProgress(0);
                      setLogs([]);
                      if (excelInputRef.current) excelInputRef.current.value = '';
                    }}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-2 bg-brand-melon/5 border border-brand-melon/20 hover:bg-brand-melon/10 text-brand-melon text-[10px] font-black uppercase tracking-[0.2em] py-3.5 px-6 rounded-md transition-all active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    Limpar
                  </button>
                )}
                
                {excelFile && (
                  <div className="flex gap-2">
                    {isProcessing && (
                      <button
                        onClick={() => { cancelRef.current = true; }}
                        className="px-6 py-3.5 rounded-md text-[10px] font-black uppercase tracking-[0.2em] bg-brand-melon/10 hover:bg-brand-melon/20 text-brand-melon border border-brand-melon/20 transition-all active:scale-95"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={startBatchProcess}
                      disabled={isProcessing || !certificadoBase64 || !formData.senhaCertificado}
                      className={cn(
                        "px-10 py-3.5 rounded-md text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 flex items-center gap-2",
                        isProcessing 
                          ? "bg-brand-blue/5 text-brand-blue/20 cursor-not-allowed" 
                          : "bg-brand-blue text-white hover:bg-brand-blue/90 shadow-brand-blue/20"
                      )}
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                      {isProcessing ? 'Processando...' : 'Iniciar Lote'}
                    </button>
                  </div>
                )}
              </div>

              {/* Legenda de colunas suportadas */}
              <div className="border-t border-brand-blue/5 pt-4 mt-2">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy mb-3 flex items-center gap-1.5">
                  <AlertCircle size={12} className="text-brand-blue" />
                  Estrutura da Planilha Excel
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-brand-blue/5 p-4 rounded-md shadow-[0_1px_4px_rgba(1,6,36,0.02)]">
                  <div>
                    <span className="text-[9px] font-black text-brand-blue uppercase tracking-widest block mb-1">Coluna 1: Chave de Acesso</span>
                    <p className="text-[10px] text-brand-navy/60 font-medium tracking-tight">
                      Identificador único da nota (44 dígitos). Cabeçalhos aceitos:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['chave', 'chaves', 'Chave', 'Chaves', 'CHAVE', 'CHAVES'].map(h => (
                        <code key={h} className="text-[9px] font-mono font-bold bg-slate-50 border border-slate-100 text-brand-navy px-1 py-0.5 rounded-sm">{h}</code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-brand-blue uppercase tracking-widest block mb-1">Coluna 2: XML Assinado</span>
                    <p className="text-[10px] text-brand-navy/60 font-medium tracking-tight">
                      Conteúdo XML completo e assinado da nota. Cabeçalhos aceitos:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['xmlAssinado', 'xml', 'XML', 'XMLAssinado', 'xmlassinado'].map(h => (
                        <code key={h} className="text-[9px] font-mono font-bold bg-slate-50 border border-slate-100 text-brand-navy px-1 py-0.5 rounded-sm">{h}</code>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              {excelFile && (
                <div className="text-[9px] font-black text-brand-navy/60 uppercase tracking-[0.2em] flex items-center gap-2 italic">
                  <CheckCircle className="w-4 h-4 text-emerald-500"/> {rowsCount} linhas identificadas
                </div>
              )}
            </div>

            {/* Console */}
            {(logs.length > 0 || isProcessing) && (
              <div className="flex-1 flex flex-col min-h-0 bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-inner">
                {/* Progress Bar */}
                <div className="p-5 border-b border-brand-blue/5 flex items-center gap-10 bg-brand-blue/[0.02]">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] font-black uppercase text-brand-navy/50 tracking-[0.2em] mb-2">
                      <span>Progresso da Operação</span>
                      <span className="text-brand-blue">{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-brand-blue/5 rounded-full overflow-hidden border border-brand-blue/10 text-brand-blue">
                      <div 
                        className="h-full bg-brand-blue transition-all duration-300 shadow-[0_0_10px_rgba(43,70,204,0.3)]"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-2xl font-black font-mono tracking-tighter text-brand-navy">
                    {logs.length} <span className="text-xs font-bold text-brand-navy/20">/ {rowsCount}</span> 
                  </div>
                </div>

                {/* Output */}
                <div className="flex-1 overflow-y-auto p-4 bg-brand-blue/[0.02] font-mono text-xs space-y-1">
                  {logs.map((log, id) => (
                    <div key={id} className={cn(
                      "flex items-center gap-4 p-2.5 rounded transition-all",
                      log.status === 'success' ? "text-emerald-600 bg-emerald-50/50" : "text-brand-melon bg-brand-melon/5"
                    )}>
                      {log.status === 'success' ? <CheckCircle size={12}/> : <XCircle size={12}/>}
                      <span className="font-bold min-w-[120px]">{log.chave}</span>
                      <span className="opacity-60 text-[10px] truncate">{log.message}</span>
                    </div>
                  ))}
                  {logs.length === 0 && isProcessing && (
                    <div className="flex items-center justify-center h-full text-brand-blue/20 gap-3 italic">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Iniciando motor de lote...</span>
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
