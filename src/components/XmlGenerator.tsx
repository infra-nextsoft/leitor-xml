import React, { useState } from 'react';
import { FileDown, AlertCircle, CheckCircle2, Loader2, Calendar, Lock, Building2, HelpCircle, ShieldCheck, FileKey } from 'lucide-react';
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

  const [certificadoBase64, setCertificadoBase64] = useState<string>(settings.certificadoBase64 || '');
  const [certFileName, setCertFileName] = useState<string>(settings.certFileName || '');

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

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx')) {
      setStatus({ type: 'error', message: 'Por favor, selecione um certificado válido (.pfx)' });
      return;
    }

    setCertFileName(file.name);
    setStatus({ type: 'idle', message: '' });

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

    const apiVersion = settings.apiVersion || '1.14';

    try {
      // 1. Se houver certificado em Base64, sincroniza previamente com a API do Concentrador
      if (certificadoBase64) {
        try {
          await fetch(`${settings.apiUrl}/api/v1/nfce/SalvarCertificado?api-version=${apiVersion}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cnpj: formData.cnpj,
              certificado: certificadoBase64
            })
          });
        } catch (saveErr) {
          console.warn('Aviso ao sincronizar certificado:', saveErr);
        }
      }

      // 2. Formata as datas estritamente no padrão exigido pela API: YYYY-MM-DDTHH:MM (início do dia 00:00 e fim do dia 23:59)
      const rawIni = formData.ini.split('T')[0];
      const rawFim = formData.fim.split('T')[0];
      const formattedIni = `${rawIni}T00:00`;
      const formattedFim = `${rawFim}T23:59`;

      // 3. Consulta e Download via GET com parâmetros na URL conforme especificação da API do Concentrador
      const queryParams = new URLSearchParams({
        'api-version': apiVersion,
        tpAmb: String(formData.tpAmb),
        ini: formattedIni,
        fim: formattedFim,
        cnpj: formData.cnpj,
        senha: formData.senha
      });

      const response = await fetch(`${settings.apiUrl}/api/v1/nfce/DownloadXML?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, application/zip, application/xml, application/octet-stream, */*'
        }
      });

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        let errorMsg = `Erro na API (${response.status})`;
        try {
          const errText = await response.text();
          if (errText) {
            try {
              const errJson = JSON.parse(errText);
              errorMsg = errJson.mensagem || errJson.message || errJson.xMotivo || errJson.error || errText;
            } catch {
              errorMsg = errText;
            }
          }
        } catch {}
        throw new Error(errorMsg);
      }

      // A API do Gin6 Concentrador retorna um JSON (ListarChavesSefazSPViewModel) contendo:
      // { cStat, xMotivo, chaves: [], zipBase64: "...", zipFileName: "..." }
      const responseText = await response.text();
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseText);
      } catch {
        // Resposta não é JSON (binário direto)
      }

      if (parsedJson && typeof parsedJson === 'object') {
        const cStat = String(parsedJson.cStat || '');
        const xMotivo = parsedJson.xMotivo || parsedJson.mensagem || parsedJson.message || '';
        const chaves = Array.isArray(parsedJson.chaves) ? parsedJson.chaves : [];
        const zipBase64 = parsedJson.zipBase64;
        const zipFileName = parsedJson.zipFileName || `xml_download_${formData.cnpj}_${formData.ini.replace(/-/g, '')}_${formData.fim.replace(/-/g, '')}.zip`;

        if (!zipBase64) {
          // Nenhum arquivo gerado (ex: cStat 137 ou sem notas autorizadas)
          setStatus({
            type: 'error',
            message: xMotivo ? `${xMotivo}${cStat ? ` (cStat ${cStat})` : ''}` : 'Nenhum XML localizado para o período e CNPJ informados.',
          });
          return;
        }

        // Converte o zipBase64 em Blob binário
        const byteCharacters = atob(zipBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/zip' });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        const countMsg = chaves.length > 0 ? `${chaves.length} XML(s) baixados com sucesso!` : 'Download concluído com sucesso!';
        setStatus({
          type: 'success',
          message: `${countMsg} (${xMotivo || 'Autorizado'})`,
        });
        return;
      }

      // Fallback para caso venha como stream binário direto
      const blob = new Blob([responseText], { type: contentType || 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `xml_download_${formData.cnpj}.zip`;
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

              {/* Upload Certificado Digital (.pfx) */}
              <div>
                <label className="block text-[10px] font-black text-brand-navy/50 uppercase tracking-[0.2em] mb-2 flex items-center justify-between">
                  <span>Certificado Digital (.pfx)</span>
                  {certFileName && (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <ShieldCheck size={12} />
                      {certFileName}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pfx"
                    id="pfx-upload"
                    onChange={handleCertUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="pfx-upload"
                    className="w-full flex items-center justify-between px-4 py-3 bg-white border border-brand-blue/10 hover:border-brand-blue/30 rounded-md cursor-pointer transition-all shadow-sm group"
                  >
                    <div className="flex items-center gap-2">
                      <FileKey className="w-4 h-4 text-brand-blue/40 group-hover:text-brand-blue transition-colors" />
                      <span className="text-xs font-bold text-brand-navy">
                        {certFileName ? certFileName : 'Selecionar arquivo .pfx (opcional se já salvo na API)...'}
                      </span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-brand-blue bg-brand-blue/5 px-2 py-1 rounded">
                      Procurar
                    </span>
                  </label>
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
                    Se o certificado já estiver salvo na pasta <code className="font-mono bg-white/80 border border-brand-blue/5 px-1 py-0.5 rounded text-brand-blue font-bold">C:\Gin6\Concentrador\Certificados</code>, basta informar a senha. Caso contrário, selecione o arquivo .pfx acima para sincronizá-lo automaticamente com a API.
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
