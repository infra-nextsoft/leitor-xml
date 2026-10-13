import React, { useState } from 'react';
import { FileDown, AlertCircle, CheckCircle2, Loader2, Calendar, Lock, Building2, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getSettings } from '../lib/settings';

export function XmlGenerator() {
  const settings = getSettings();
  
  const [formData, setFormData] = useState({
    tpAmb: '1', // default: 1 = Produção
    ini: '',
    fim: '',
    cnpj: settings.cnpjPadrao || '',
    senha: settings.lembrarSenha ? settings.senhaCertificado : '',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setFormData(prev => ({ ...prev, cnpj: value.replace(/\D/g, '').slice(0, 14) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.ini || !formData.fim) {
      setStatus({ type: 'error', message: 'Selecione as datas inicial e final para consulta.' });
      return;
    }
    if (formData.cnpj.length !== 14) {
      setStatus({ type: 'error', message: 'O CNPJ deve possuir 14 dígitos.' });
      return;
    }
    if (!formData.senha) {
      setStatus({ type: 'error', message: 'A senha do certificado digital é obrigatória.' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'idle', message: '' });

    const payload = {
      tpAmb: Number(formData.tpAmb),
      ini: formData.ini,
      fim: formData.fim,
      cnpj: formData.cnpj,
      senha: formData.senha
    };

    try {
      const apiVersion = settings.apiVersion || '1.14';
      const response = await fetch(`${settings.apiUrl}/api/v1/nfce/DownloadXML?api-version=${apiVersion}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, application/zip, application/xml, text/plain, */*'
        },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        let errorMsg = `Erro na API (${response.status})`;
        try {
          const errText = await response.text();
          if (errText) {
            try {
              const errJson = JSON.parse(errText);
              errorMsg = errJson.message || errJson.error || errText;
            } catch {
              errorMsg = errText;
            }
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Obter o nome do arquivo a partir dos cabeçalhos se possível
      const disposition = response.headers.get('content-disposition');
      let filename = `xml_download_${formData.cnpj}_${formData.ini.replace(/-/g, '')}_${formData.fim.replace(/-/g, '')}.zip`;
      
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      } else if (contentType.includes('xml')) {
        filename = `xml_download_${formData.cnpj}.xml`;
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setStatus({
        type: 'success',
        message: 'Download dos XMLs iniciado com sucesso!',
      });
    } catch (err: any) {
      console.error(err);
      setStatus({
        type: 'error',
        message: err.message || 'Erro ao tentar baixar XMLs do Concentrador.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileDown className="text-brand-blue w-4 h-4" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Gerar/Baixar XML</h2>
          </div>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-12">
            
            {/* Form Fields Column */}
            <div className="flex-1 space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-6 flex items-center gap-2">
                <SettingsIcon size={14} className="text-brand-blue/60" />
                Parâmetros de Consulta
              </h3>

              {/* Ambiente & CNPJ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Ambiente</label>
                  <select
                    name="tpAmb"
                    value={formData.tpAmb}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm"
                  >
                    <option value="1">1 - Produção</option>
                    <option value="2">2 - Homologação</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">CNPJ da Loja</label>
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/30" />
                    <input
                      type="text"
                      name="cnpj"
                      value={formData.cnpj}
                      onChange={handleInputChange}
                      placeholder="CNPJ com 14 dígitos..."
                      className="w-full pl-12 pr-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm placeholder:text-brand-blue/20"
                    />
                  </div>
                </div>
              </div>

              {/* Periodo de Consulta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Data Inicial</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/30" />
                    <input
                      type="date"
                      name="ini"
                      value={formData.ini}
                      onChange={handleInputChange}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Data Final</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/30" />
                    <input
                      type="date"
                      name="fim"
                      value={formData.fim}
                      onChange={handleInputChange}
                      className="w-full pl-12 pr-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Senha do Certificado */}
              <div>
                <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2">Senha do Certificado Digital</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-blue/30" />
                  <input
                    type="password"
                    name="senha"
                    value={formData.senha}
                    onChange={handleInputChange}
                    placeholder="Senha do certificado associado..."
                    className="w-full pl-12 pr-4 py-3 bg-white border border-brand-blue/10 rounded-md text-brand-navy text-xs font-bold focus:border-brand-blue outline-none transition-all shadow-sm placeholder:text-brand-blue/20"
                  />
                </div>
              </div>

              {/* Legenda de Localização do Certificado */}
              <div className="bg-brand-sun/10 border border-brand-sun/20 p-4 rounded-md flex items-start gap-3">
                <HelpCircle className="text-brand-sun w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-brand-navy uppercase tracking-widest leading-none mb-1">Nota importante</span>
                  <p className="text-[10px] text-brand-navy/70 font-medium leading-relaxed uppercase tracking-[0.05em]">
                    O certificado digital deve estar na pasta <code className="font-mono bg-white/80 border border-brand-blue/5 px-1 py-0.5 rounded text-brand-blue font-bold">C:\Gin6\Concentrador\Certificados</code> no servidor da API local.
                  </p>
                </div>
              </div>
            </div>

            <div className="hidden lg:block w-px bg-brand-blue/10 self-stretch" />

            {/* Status / Submit Column */}
            <div className="w-full lg:w-1/3 flex flex-col gap-6 justify-between">
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 mb-6 flex items-center gap-2">
                  <AlertCircle size={14} className="text-brand-blue/60" />
                  Status da Consulta
                </h3>

                {status.type === 'idle' && !isProcessing && (
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-md text-center">
                    <p className="text-[10px] font-black text-brand-navy/40 uppercase tracking-widest">
                      Preencha os campos e inicie a geração do ZIP.
                    </p>
                  </div>
                )}

                {isProcessing && (
                  <div className="p-6 bg-brand-blue/[0.02] border border-brand-blue/5 rounded-md space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 size={16} className="animate-spin text-brand-blue" />
                      <span className="text-[10px] font-black text-brand-navy uppercase tracking-[0.2em]">Consultando e gerando arquivo...</span>
                    </div>
                  </div>
                )}

                {status.type !== 'idle' && (
                  <div className={cn(
                    "p-6 rounded-md border flex items-start gap-3 shadow-sm animate-in fade-in duration-300",
                    status.type === 'success' ? "bg-emerald-50 border-emerald-500/20 text-emerald-700" : "bg-brand-melon/5 border-brand-melon/20 text-brand-melon"
                  )}>
                    {status.type === 'success' ? <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">
                        {status.type === 'success' ? 'Sucesso' : 'Erro'}
                      </span>
                      <span className="text-xs font-bold">{status.message}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={cn(
                    "w-full py-4 rounded-md text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                    isProcessing 
                      ? "bg-slate-100 text-slate-400 shadow-none" 
                      : "bg-brand-blue text-white hover:bg-brand-navy shadow-brand-blue/20"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <FileDown size={14} />
                      Consultar e Baixar ZIP
                    </>
                  )}
                </button>
              </div>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}

function SettingsIcon({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
