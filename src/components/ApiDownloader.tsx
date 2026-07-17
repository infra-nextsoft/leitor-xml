import React, { useState } from 'react';
import { DownloadCloud, KeyRound, ShieldCheck, FileKey, AlertCircle, Loader2, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSettings } from '../lib/settings';

export function ApiDownloader() {
  const settings = getSettings();
  const [formData, setFormData] = useState({
    ambiente: '1', // default production
    senhaCertificado: settings.lembrarSenha ? settings.senhaCertificado : '',
    chave: '',
    xmlAssinado: ''
  });
  
  const [certificadoBase64, setCertificadoBase64] = useState<string>(settings.certificadoBase64 || '');
  const [fileName, setFileName] = useState(settings.certFileName || '');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx')) {
      setError('Por favor, selecione um arquivo de certificado com a extensão .pfx');
      return;
    }

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const base64Data = result.split('base64,')[1];
      if (base64Data) {
        setCertificadoBase64(base64Data);
      }
    };
    reader.onerror = () => {
      setError('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleDownloadXML = (xmlContent: string, chave: string) => {
    let contentToDownload = xmlContent;
    try {
      const parsed = JSON.parse(xmlContent);
      if (parsed.xmlDFe) {
        contentToDownload = parsed.xmlDFe;
      } else if (parsed.xml) {
        contentToDownload = parsed.xml;
      }
    } catch {
    }

    const blob = new Blob([contentToDownload], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `homologado_${chave || 'nfce'}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!certificadoBase64) {
      setError('O upload do certificado .pfx é obrigatório.');
      return;
    }
    
    if (!formData.xmlAssinado || !formData.chave || !formData.senhaCertificado) {
      setError('Preencha os campos obrigatórios.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        chave: formData.chave,
        ambiente: formData.ambiente,
        certificado: certificadoBase64,
        senhaCertificado: formData.senhaCertificado,
        xmlAssinado: formData.xmlAssinado
      };

      const response = await fetch(`${settings.apiUrl}/api/v1/nfce/HomologarVendaXML?api-version=1.12`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/xml, text/plain, */*'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorMsg = response.statusText;
        try {
          const errorBody = await response.text();
          if (errorBody) errorMsg = errorBody;
        } catch {}
        throw new Error(`Erro na API (${response.status}): ${errorMsg}`);
      }

      const responseText = await response.text();
      handleDownloadXML(responseText, formData.chave);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro desconhecido ao tentar homologar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
         <div className="flex items-center gap-2">
            <DownloadCloud className="text-brand-blue w-4 h-4" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Download de XMLs</h2>
         </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50/5 border border-brand-melon/20 rounded flex items-start gap-3">
            <AlertCircle className="text-brand-melon w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-brand-melon">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-1/3 flex flex-col gap-5">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-4 flex items-center gap-2">
                <ShieldCheck size={14} className="text-brand-blue/60" />
                Configurações de acesso
              </h3>
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Ambiente</label>
               <select 
                 name="ambiente" 
                 value={formData.ambiente}
                 onChange={handleInputChange}
                 className="w-full bg-white border border-brand-blue/20 rounded p-2.5 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy font-bold"
               >
                 <option value="1">1 - Produção</option>
                 <option value="2">2 - Homologação</option>
               </select>
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] flex items-center gap-1">Certificado Digital</label>
               <div className="relative">
                 <input 
                   type="file" 
                   accept=".pfx"
                   onChange={handleFileChange}
                   className="hidden" 
                   id="pfx-upload"
                 />
                 <label 
                   htmlFor="pfx-upload" 
                   className={cn(
                     "flex items-center justify-between w-full px-4 py-3 border rounded transition-all cursor-pointer group active:scale-[0.98]",
                     certificadoBase64 
                       ? "border-emerald-500/20 bg-emerald-50 text-emerald-600 font-bold" 
                       : "bg-white border-brand-blue/10 text-brand-blue/40 hover:border-brand-blue/30"
                   )}
                 >
                   <span className="text-xs font-bold truncate pr-4">
                     {fileName ? fileName : 'Procurar arquivo...'}
                   </span>
                   {certificadoBase64 ? (
                     <ShieldCheck className="w-4 h-4 text-emerald-500" />
                   ) : (
                     <FileKey className="w-4 h-4 text-brand-blue/40 group-hover:text-brand-blue transition-colors" />
                   )}
                 </label>
               </div>
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Senha do Certificado</label>
                <div className="">
                 <input 
                   type="password" 
                   name="senhaCertificado"
                   value={formData.senhaCertificado}
                   onChange={handleInputChange}
                   placeholder="Digite a senha..."
                    className="w-full bg-white border border-brand-blue/20 rounded py-2.5 px-4 text-xs focus:border-brand-blue outline-none transition-all text-brand-navy"
                 />
               </div>
            </div>
          </div>

          <div className="hidden lg:block w-px bg-brand-blue/10 self-stretch" />

          <div className="flex-1 w-full flex flex-col gap-5">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-4 flex items-center gap-2">
                <Database size={14} className="text-brand-blue/60" />
                Dados da Transação
              </h3>
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">Chave de acesso</label>
               <input 
                 type="text" 
                 name="chave"
                 value={formData.chave}
                 onChange={handleInputChange}
                 placeholder="Insira a chave..."
                 className="w-full bg-white border border-brand-blue/20 rounded p-2.5 text-xs font-mono focus:border-brand-blue outline-none transition-all text-brand-blue font-bold shadow-sm"
               />
            </div>

            <div className="space-y-1 flex-1 flex flex-col min-h-[140px]">
               <label className="text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em]">XML Assinado</label>
               <textarea 
                 name="xmlAssinado"
                 value={formData.xmlAssinado}
                 onChange={handleInputChange}
                 placeholder='<NFe xmlns="http://www.portalfiscal.inf.br/nfe">...'
                 className="flex-1 w-full bg-brand-blue/5 border border-brand-blue/10 rounded p-4 text-[11px] font-mono leading-relaxed focus:border-brand-blue outline-none transition-all text-brand-navy resize-none whitespace-pre shadow-inner"
                 spellCheck={false}
               />
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                type="submit" 
                disabled={loading}
                className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-black uppercase tracking-widest text-[10px] py-3.5 px-10 rounded transition-all shadow-lg shadow-brand-blue/20 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
                {loading ? 'Processando...' : 'Homologar & Baixar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
