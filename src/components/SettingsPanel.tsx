import React, { useState, useRef, useEffect } from 'react';
import { getSettings, saveSettings, AppSettings } from '../lib/settings';
import { ShieldCheck, Server, FileKey, CheckCircle2, AlertCircle, Save, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

const UFS = [
  { code: '11', label: '11 - RO' },
  { code: '12', label: '12 - AC' },
  { code: '13', label: '13 - AM' },
  { code: '14', label: '14 - RR' },
  { code: '15', label: '15 - PA' },
  { code: '16', label: '16 - AP' },
  { code: '17', label: '17 - TO' },
  { code: '21', label: '21 - MA' },
  { code: '22', label: '22 - PI' },
  { code: '23', label: '23 - CE' },
  { code: '24', label: '24 - RN' },
  { code: '25', label: '25 - PB' },
  { code: '26', label: '26 - PE' },
  { code: '27', label: '27 - AL' },
  { code: '28', label: '28 - SE' },
  { code: '29', label: '29 - BA' },
  { code: '31', label: '31 - MG' },
  { code: '32', label: '32 - ES' },
  { code: '33', label: '33 - RJ' },
  { code: '35', label: '35 - SP' },
  { code: '41', label: '41 - PR' },
  { code: '42', label: '42 - SC' },
  { code: '43', label: '43 - RS' },
  { code: '50', label: '50 - MS' },
  { code: '51', label: '51 - MT' },
  { code: '52', label: '52 - GO' },
  { code: '53', label: '53 - DF' }
];

export function SettingsPanel() {
  const [formData, setFormData] = useState<AppSettings>(getSettings());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked,
        // Limpa a senha se desmarcar lembrarSenha
        ...(name === 'lembrarSenha' && !checked ? { senhaCertificado: '' } : {})
      }));
    } else if (name === 'cnpjPadrao') {
      setFormData(prev => ({ ...prev, [name]: value.replace(/\D/g, '').slice(0, 14) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    setSaveStatus('idle');
  };

  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pfx')) {
      setSaveStatus('error');
      setErrorMessage('Por favor, envie um arquivo de certificado com extensão .pfx');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const base64Data = result.split('base64,')[1];
      if (base64Data) {
        setFormData(prev => ({
          ...prev,
          certificadoBase64: base64Data,
          certFileName: file.name
        }));
        setSaveStatus('idle');
      }
    };
    reader.onerror = () => {
      setSaveStatus('error');
      setErrorMessage('Falha ao ler o arquivo de certificado.');
    };
    reader.readAsDataURL(file);
  };

  const clearCertificate = () => {
    setFormData(prev => ({
      ...prev,
      certificadoBase64: '',
      certFileName: ''
    }));
    setSaveStatus('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('idle');

    if (!formData.apiUrl.trim()) {
      setSaveStatus('error');
      setErrorMessage('A URL Base da API é obrigatória.');
      return;
    }

    if (!formData.apiVersion || !formData.apiVersion.trim()) {
      setSaveStatus('error');
      setErrorMessage('A Versão da API é obrigatória (ex: 1.14).');
      return;
    }

    if (formData.cnpjPadrao && formData.cnpjPadrao.length !== 14) {
      setSaveStatus('error');
      setErrorMessage('O CNPJ Padrão deve conter exatamente 14 dígitos.');
      return;
    }

    try {
      saveSettings(formData);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage('Erro ao salvar as configurações.');
    }
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Configurações Gerais</h2>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Coluna 1: API e Emitente */}
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-3 mb-4 flex items-center gap-2">
                <Server className="w-4 h-4 text-brand-blue" />
                Conectividade & Emitente
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">
                  URL Base da API (Concentrador)
                </label>
                <input
                  type="text"
                  name="apiUrl"
                  value={formData.apiUrl}
                  onChange={handleInputChange}
                  placeholder="http://localhost:8020"
                  className="w-full bg-white border border-brand-blue/10 rounded px-3 py-2.5 text-xs font-mono text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                />
                <span className="text-[9px] text-brand-navy/40 mt-1 block uppercase font-medium tracking-[0.1em]">
                  Endpoint local onde a API do Gin6 Concentrador está rodando.
                </span>
              </div>

              <div>
                <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">
                  Versão da API do Concentrador
                </label>
                <input
                  type="text"
                  name="apiVersion"
                  value={formData.apiVersion || ''}
                  onChange={handleInputChange}
                  placeholder="1.14"
                  className="w-full bg-white border border-brand-blue/10 rounded px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                />
                <span className="text-[9px] text-brand-navy/40 mt-1 block uppercase font-medium tracking-[0.1em]">
                  Versão da API utilizada nos parâmetros das requisições do Concentrador (ex: 1.14, 1.12).
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">
                    CNPJ do Emitente Padrão
                  </label>
                  <input
                    type="text"
                    name="cnpjPadrao"
                    maxLength={14}
                    value={formData.cnpjPadrao}
                    onChange={handleInputChange}
                    placeholder="Somente números"
                    className="w-full bg-white border border-brand-blue/10 rounded px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">
                    UF do Emitente Padrão
                  </label>
                  <select
                    name="ufPadrao"
                    value={formData.ufPadrao}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  >
                    <option value="">Selecione a UF</option>
                    {UFS.map(uf => (
                      <option key={uf.code} value={uf.code}>{uf.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna 2: Certificado Digital */}
          <div className="space-y-6">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-3 mb-4 flex items-center gap-2">
                <FileKey className="w-4 h-4 text-brand-blue" />
                Certificado Digital (.PFX)
              </h3>
            </div>

            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="flex-1 w-full">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCertUpload}
                    accept=".pfx"
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "border-2 border-dashed rounded p-6 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-brand-blue/[0.02] group text-center",
                      formData.certificadoBase64 ? "border-emerald-500/30 bg-emerald-500/5" : "border-brand-blue/10 bg-slate-50/30"
                    )}
                  >
                    {formData.certificadoBase64 ? (
                      <>
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Certificado Carregado</span>
                        <span className="text-[9px] text-brand-navy/50 font-mono mt-1 max-w-[200px] truncate">{formData.certFileName}</span>
                      </>
                    ) : (
                      <>
                        <FileKey className="w-8 h-8 text-brand-blue/20 mb-2 group-hover:text-brand-blue transition-colors" />
                        <span className="text-[10px] font-black text-brand-blue/50 group-hover:text-brand-blue uppercase tracking-widest">Selecionar .PFX</span>
                        <span className="text-[9px] text-brand-navy/30 uppercase font-medium tracking-[0.1em] mt-1">Carregar certificado digital</span>
                      </>
                    )}
                  </div>
                </div>

                {formData.certificadoBase64 && (
                  <button
                    type="button"
                    onClick={clearCertificate}
                    className="px-4 py-3 border border-brand-melon/20 bg-brand-melon/5 hover:bg-brand-melon/10 text-brand-melon rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shrink-0 self-stretch justify-center"
                  >
                    <Trash2 size={12} />
                    Limpar
                  </button>
                )}
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="lembrarSenha"
                    checked={formData.lembrarSenha}
                    onChange={handleInputChange}
                    className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                  />
                  <span className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.1em] group-hover:text-brand-navy select-none">
                    Lembrar senha do certificado no navegador
                  </span>
                </label>

                {formData.lembrarSenha && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <input
                      type="password"
                      name="senhaCertificado"
                      value={formData.senhaCertificado}
                      onChange={handleInputChange}
                      placeholder="Senha do Certificado"
                      className="w-full bg-white border border-brand-blue/10 rounded px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                    <span className="text-[9px] text-brand-melon font-bold mt-1.5 block uppercase tracking-[0.1em] flex items-center gap-1 italic">
                      <AlertCircle size={10} /> Atenção: A senha será armazenada localmente de forma limpa. Use apenas em dispositivos seguros.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Feedback e Ação */}
        <div className="border-t border-brand-blue/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex-1 w-full">
            {saveStatus === 'success' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 rounded text-xs font-bold flex items-center gap-2 animate-in slide-in-from-left-4 duration-300">
                <CheckCircle2 size={14} />
                Configurações salvas com sucesso no banco local!
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="p-3 bg-brand-melon/5 border border-brand-melon/20 text-brand-melon rounded text-xs font-bold flex items-center gap-2 animate-in slide-in-from-left-4 duration-300">
                <AlertCircle size={14} />
                {errorMessage}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-blue hover:bg-brand-navy text-white font-black uppercase tracking-[0.2em] text-[10px] py-3.5 px-10 rounded transition-all shadow-lg shadow-brand-blue/10 active:scale-95"
          >
            <Save size={14} />
            Salvar Preferências
          </button>
        </div>
      </form>
    </div>
  );
}
