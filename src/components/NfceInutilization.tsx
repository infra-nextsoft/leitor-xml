import React, { useState, useRef, useMemo } from 'react';
import { UploadCloud, ShieldCheck, FileType, CheckCircle, XCircle, Loader2, AlertCircle, Trash2, Download, Copy, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSettings } from '../lib/settings';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

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

export default function NfceInutilization() {
  const settings = getSettings();
  const [activeSubTab, setActiveSubTab] = useState<'individual' | 'batch'>('individual');
  
  // Form/Emitente State
  const [formData, setFormData] = useState({
    cuf: settings.ufPadrao || '',
    tpAmb: '1',
    ano: '',
    cnpj: settings.cnpjPadrao || '',
    mod: '65',
    serie: '',
    nnfIni: '',
    nnfFin: '',
    xJust: '',
    senhaCertificado: settings.lembrarSenha ? settings.senhaCertificado : '' 
  });

  const [certificadoBase64, setCertificadoBase64] = useState<string>(settings.certificadoBase64 || '');
  const [certFileName, setCertFileName] = useState<string>(settings.certFileName || '');
  
  // Individual State
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Batch State
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchRows, setBatchRows] = useState<any[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchLogs, setBatchLogs] = useState<{ range: string; status: 'success' | 'error'; detail: string }[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (['ano', 'cnpj', 'serie', 'nnfIni', 'nnfFin'].includes(name)) {
      setFormData((prev) => ({ ...prev, [name]: value.replace(/\D/g, '') }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
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

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Normalize keys
        const rows = data.map((row, idx) => {
          const mod = String(row['modelo fiscal'] || row['modelo'] || '').replace(/\D/g, '').trim();
          const serie = String(row['série'] || row['serie'] || '').replace(/\D/g, '').trim();
          const nnfIni = String(row['nº inicial'] || row['numero inicial'] || row['inicial'] || '').replace(/\D/g, '').trim();
          const nnfFin = String(row['nº final'] || row['numero final'] || row['final'] || '').replace(/\D/g, '').trim();
          const xJust = String(row['Justificativa'] || row['justificativa'] || '').trim();

          return {
            rowIdx: idx + 2,
            mod,
            serie,
            nnfIni,
            nnfFin,
            xJust
          };
        });

        setBatchRows(rows);
      } catch (err) {
        alert("Erro ao ler arquivo excel.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "modelo fiscal": "65",
        "série": "1",
        "nº inicial": "8277",
        "nº final": "8281",
        "Justificativa": "Quebra de sequencia numerica devido a falha tecnica no concentrador local"
      },
      {
        "modelo fiscal": "55",
        "série": "1",
        "nº inicial": "8331",
        "nº final": "8331",
        "Justificativa": "Erro de conexao com a SEFAZ durante a transmissao da nota fiscal eletronica"
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Inutilizacao");
    XLSX.writeFile(wb, "modelo_inutilizacao_lote.xlsx");
  };

  const handleSubmit = async () => {
    if (!formData.cuf) return alert("Selecione a UF.");
    if (formData.cnpj.length !== 14) return alert("O CNPJ deve ter 14 dígitos exatos.");
    if (formData.ano.length !== 4) return alert("O ano deve possuir 4 dígitos (ex: 2024).");
    if (!formData.serie || !formData.nnfIni || !formData.nnfFin) return alert("Preencha a série fiscal e os números do cupom (Inicial e Final).");
    if (formData.xJust.length < 15) return alert("A justificativa deve conter no mínimo 15 caracteres para ser aceita pela Sefaz.");
    if (!certificadoBase64 || !formData.senhaCertificado) return alert("Forneça o arquivo e senha do seu certificado digital (.pfx).");

    setIsProcessing(true);
    setStatus('idle');
    setMessage('');

    const payload = formData.mod === '55'
      ? {
          versao: "string",
          TpAmb: String(formData.tpAmb),
          CUF: formData.cuf,
          Ano: formData.ano.slice(-2),
          CNPJ: formData.cnpj,
          Mod: formData.mod,
          Serie: formData.serie,
          NNumeroIncial: formData.nnfIni,
          NNumeroFinal: formData.nnfFin,
          XJust: formData.xJust,
          certificado: certificadoBase64,
          senhaCertificado: formData.senhaCertificado
        }
      : {
          ...formData,
          ano: formData.ano.slice(-2),
          tpAmb: Number(formData.tpAmb),
          certificado: certificadoBase64,
          idKeySistema: "9z8y7-wx65v-4utsr-3q21p"
        };

    try {
      const apiVersion = settings.apiVersion || '1.14';
      const endpoint = formData.mod === '55'
        ? `${settings.apiUrl}/api/nfe/Inutilizacao?api-version=${apiVersion}`
        : `${settings.apiUrl}/api/v1/nfce/Inutilizacao?api-version=${apiVersion}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro de comunicação ao enviar inutilização.');
      }

      if (Number(data.codStatus) === 102) {
        setStatus('success');
        setMessage(data.motivo || 'Requisição de Inutilização homologada com sucesso.');

        if (data.xmlInutilizacao) {
          const blob = new Blob([data.xmlInutilizacao], { type: 'application/xml;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `homologado_inut_${formData.cnpj}_${formData.serie}_${formData.nnfIni}_${formData.nnfFin}.xml`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } else {
        setStatus('error');
        setMessage(data.motivo || `Rejeição SEFAZ: código ${data.codStatus}`);
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Ocorreu um problema indefinido na comunicação.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchSubmit = async () => {
    if (!formData.cuf) return alert("Selecione a UF.");
    if (formData.cnpj.length !== 14) return alert("O CNPJ deve ter 14 dígitos exatos.");
    if (formData.ano.length !== 4) return alert("O ano deve possuir 4 dígitos (ex: 2024).");
    if (!certificadoBase64 || !formData.senhaCertificado) return alert("Forneça o arquivo e senha do seu certificado digital (.pfx).");
    if (batchRows.length === 0) return alert("Importe uma planilha com dados válidos.");

    setBatchProcessing(true);
    setBatchLogs([]);
    setBatchProgress({ current: 0, total: batchRows.length });

    const zip = new JSZip();
    let hasSuccessfulInutilization = false;

    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      const rangeStr = `Linh ${row.rowIdx} [Mod ${row.mod}, Série ${row.serie}, Faixa ${row.nnfIni}-${row.nnfFin}]`;

      setBatchProgress(p => ({ ...p, current: i + 1 }));

      if (row.mod !== '55' && row.mod !== '65') {
        setBatchLogs(prev => [...prev, { range: rangeStr, status: 'error', detail: 'Modelo inválido (deve ser 55 ou 65)' }]);
        continue;
      }
      if (!row.serie || !row.nnfIni || !row.nnfFin) {
        setBatchLogs(prev => [...prev, { range: rangeStr, status: 'error', detail: 'Preencha série e faixa corretamente' }]);
        continue;
      }
      if (row.xJust.length < 15) {
        setBatchLogs(prev => [...prev, { range: rangeStr, status: 'error', detail: 'Justificativa muito curta (mínimo 15 caracteres)' }]);
        continue;
      }

      const payload = row.mod === '55'
        ? {
            versao: "string",
            TpAmb: String(formData.tpAmb),
            CUF: formData.cuf,
            Ano: formData.ano.slice(-2),
            CNPJ: formData.cnpj,
            Mod: row.mod,
            Serie: row.serie,
            NNumeroIncial: row.nnfIni,
            NNumeroFinal: row.nnfFin,
            XJust: row.xJust,
            certificado: certificadoBase64,
            senhaCertificado: formData.senhaCertificado
          }
        : {
            cuf: formData.cuf,
            tpAmb: Number(formData.tpAmb),
            ano: formData.ano.slice(-2),
            cnpj: formData.cnpj,
            mod: row.mod,
            serie: row.serie,
            nnfIni: row.nnfIni,
            nnfFin: row.nnfFin,
            xJust: row.xJust,
            senhaCertificado: formData.senhaCertificado,
            certificado: certificadoBase64,
            idKeySistema: "9z8y7-wx65v-4utsr-3q21p"
          };

      try {
        const apiVersion = settings.apiVersion || '1.14';
        const endpoint = row.mod === '55'
          ? `${settings.apiUrl}/api/nfe/Inutilizacao?api-version=${apiVersion}`
          : `${settings.apiUrl}/api/v1/nfce/Inutilizacao?api-version=${apiVersion}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Erro de comunicação.');
        }

        if (Number(data.codStatus) === 102) {
          setBatchLogs(prev => [...prev, { range: rangeStr, status: 'success', detail: data.motivo || 'Homologado com sucesso.' }]);
          if (data.xmlInutilizacao) {
            zip.file(`inut_${formData.cnpj}_${row.mod}_${row.serie}_${row.nnfIni}_${row.nnfFin}.xml`, data.xmlInutilizacao);
            hasSuccessfulInutilization = true;
          }
        } else {
          setBatchLogs(prev => [...prev, { range: rangeStr, status: 'error', detail: data.motivo || `Rejeitado: código ${data.codStatus}` }]);
        }
      } catch (err: any) {
        setBatchLogs(prev => [...prev, { range: rangeStr, status: 'error', detail: err.message || 'Falha na comunicação.' }]);
      }

      if (i < batchRows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (hasSuccessfulInutilization) {
      try {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inutilizacoes_${formData.cnpj}_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (zipErr) {
        alert("Erro ao compilar arquivo ZIP.");
      }
    } else {
      alert("Nenhuma inutilização foi homologada para gerar arquivos XML.");
    }

    setBatchProcessing(false);
  };

  return (
    <div className="bg-white border border-brand-blue/5 rounded-md overflow-hidden shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] animate-in fade-in slide-in-from-bottom-4 duration-700">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleCertUpload}
        accept=".pfx"
        className="hidden"
      />
      {/* Header Unificado com Alternador de Abas */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trash2 className="text-brand-blue w-4 h-4" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy">Inutilização de Numeração</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('individual')}
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all active:scale-95",
              activeSubTab === 'individual' 
                ? "bg-brand-blue text-white" 
                : "bg-white border border-brand-blue/10 text-brand-navy/60 hover:bg-slate-100"
            )}
          >
            Inutilização Individual
          </button>
          <button
            onClick={() => setActiveSubTab('batch')}
            className={cn(
              "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded transition-all active:scale-95",
              activeSubTab === 'batch' 
                ? "bg-brand-blue text-white" 
                : "bg-white border border-brand-blue/10 text-brand-navy/60 hover:bg-slate-100"
            )}
          >
            Inutilização em Lote
          </button>
        </div>
      </div>

      <div className="p-8">
        <p className="text-brand-navy/60 text-[9px] uppercase tracking-[0.2em] font-medium leading-relaxed max-w-2xl mb-12">
          Este processo é irreversível perante a SEFAZ. Preencha cuidadosamente as faixas de recibos não utilizados (como falha técnica ou quebra de sequência).
        </p>

        {activeSubTab === 'individual' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Card 1: Emissor */}
            <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-4 flex items-center gap-2">
                <FileType className="w-4 h-4 text-brand-melon" />
                1. Dados do Emitente
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">UF Emitente</label>
                  <select
                    name="cuf"
                    value={formData.cuf}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  >
                    <option value="">Selecione o Estado</option>
                    {UFS.map(uf => (
                      <option key={uf.code} value={uf.code}>{uf.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">CNPJ</label>
                  <input
                    type="text"
                    name="cnpj"
                    placeholder="00.000.000/0000-00"
                    maxLength={14}
                    value={formData.cnpj}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Ano</label>
                    <input
                      type="text"
                      name="ano"
                      placeholder="2024"
                      maxLength={4}
                      value={formData.ano}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Ambiente</label>
                    <select
                      name="tpAmb"
                      value={formData.tpAmb}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    >
                      <option value="1">1 - Produção</option>
                      <option value="2">2 - Homologação</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Foco e Justificativa */}
            <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-4 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-brand-melon" />
                2. Foco e Justificativa
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Modelo Fiscal</label>
                  <select
                    name="mod"
                    value={formData.mod}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  >
                    <option value="65">65 - NFC-e</option>
                    <option value="55">55 - NF-e</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Série</label>
                    <input
                      type="text"
                      name="serie"
                      placeholder="0"
                      value={formData.serie}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Nº Inicial</label>
                    <input
                      type="text"
                      name="nnfIni"
                      placeholder="000"
                      value={formData.nnfIni}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Nº Final</label>
                  <input
                    type="text"
                    name="nnfFin"
                    placeholder="000"
                    value={formData.nnfFin}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Justificativa da Falha</label>
                  <textarea
                    name="xJust"
                    placeholder="Explicação do ocorrido (Mínimo de 15 caracteres)"
                    rows={3}
                    value={formData.xJust}
                    onChange={handleInputChange}
                    className="w-full bg-brand-blue/[0.02] border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs text-brand-navy focus:border-brand-blue outline-none transition-all shadow-inner resize-none"
                  />
                  <div className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/30 mt-2">
                    {formData.xJust.length}/15 {formData.xJust.length < 15 && <span className="text-brand-melon">Insuficiente</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Credenciais */}
            <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-melon" />
                3. Autenticação e Envio
              </h3>

              <div className="space-y-6">
                <div
                  className={cn(
                    "w-full border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center transition-all text-center active:scale-[0.98] cursor-pointer group",
                    certificadoBase64 ? "border-emerald-500/30 bg-emerald-500/5" : "border-brand-blue/10 hover:border-brand-blue/30 bg-slate-50/50"
                  )}
                  onClick={() => fileInputRef.current?.click()}
                >
                  
                  <div className="flex flex-col items-center">
                    {certificadoBase64 ? (
                      <>
                        <CheckCircle className="w-10 h-10 text-emerald-500 mb-4 animate-in zoom-in duration-300" />
                        <p className="font-black text-emerald-600 text-[10px] uppercase tracking-[0.2em]">Certificado Preparado</p>
                        <p className="text-[10px] text-emerald-600/60 truncate max-w-[180px] font-mono mt-2">{certFileName}</p>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-10 h-10 text-brand-blue/20 mb-4 group-hover:text-brand-blue transition-colors" />
                        <p className="font-black text-brand-navy/50 text-[10px] uppercase tracking-[0.2em] group-hover:text-brand-blue transition-colors">Upload Certificado (.pfx)</p>
                        <p className="text-[10px] text-brand-navy/30 mt-2 uppercase font-medium tracking-[0.2em]">Identidade Jurídica</p>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Senha do Certificado</label>
                  <input
                    type="password"
                    name="senhaCertificado"
                    placeholder="••••••••"
                    value={formData.senhaCertificado}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                  />
                </div>

                {status !== 'idle' && (
                  <div className={cn(
                    "p-5 rounded-md border flex items-start gap-4 animate-in zoom-in-95 duration-300 shadow-sm",
                    status === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" : "bg-brand-melon/5 border-brand-melon/20 text-brand-melon"
                  )}>
                    {status === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest leading-none italic">Resposta Sefaz</span>
                      <p className="text-xs font-bold leading-relaxed">{message}</p>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-6 border-t border-brand-blue/5">
                  <button
                    onClick={handleSubmit}
                    disabled={isProcessing}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 py-4 rounded-md font-black uppercase tracking-[0.2em] text-[10px] transition-all text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                      isProcessing 
                        ? "bg-slate-300 shadow-none"
                        : "bg-brand-blue hover:bg-brand-navy shadow-brand-blue/20"
                    )}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        Validar e Inutilizar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* LADO ESQUERDO: Dados Emitente + Certificado */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              {/* Emitente */}
              <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-4 flex items-center gap-2">
                  <FileType className="w-4 h-4 text-brand-melon" />
                  1. Dados do Emitente
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">UF Emitente</label>
                    <select
                      name="cuf"
                      value={formData.cuf}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    >
                      <option value="">Selecione o Estado</option>
                      {UFS.map(uf => (
                        <option key={uf.code} value={uf.code}>{uf.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">CNPJ</label>
                    <input
                      type="text"
                      name="cnpj"
                      placeholder="00.000.000/0000-00"
                      maxLength={14}
                      value={formData.cnpj}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-mono font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Ano</label>
                      <input
                        type="text"
                        name="ano"
                        placeholder="2024"
                        maxLength={4}
                        value={formData.ano}
                        onChange={handleInputChange}
                        className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Ambiente</label>
                      <select
                        name="tpAmb"
                        value={formData.tpAmb}
                        onChange={handleInputChange}
                        className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                      >
                        <option value="1">1 - Produção</option>
                        <option value="2">2 - Homologação</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Certificado */}
              <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 border-b border-brand-blue/5 pb-4 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-brand-melon" />
                  2. Certificado Digital
                </h3>

                <div className="space-y-4">
                  <div
                    className={cn(
                      "w-full border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center transition-all text-center active:scale-[0.98] cursor-pointer group",
                      certificadoBase64 ? "border-emerald-500/30 bg-emerald-500/5" : "border-brand-blue/10 hover:border-brand-blue/30 bg-slate-50/50"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="flex flex-col items-center">
                      {certificadoBase64 ? (
                        <>
                          <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                          <p className="font-black text-emerald-600 text-[9px] uppercase tracking-[0.2em]">Preparado</p>
                          <p className="text-[9px] text-emerald-600/60 truncate max-w-[150px] font-mono mt-1">{certFileName}</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-brand-blue/20 mb-2 group-hover:text-brand-blue transition-colors" />
                          <p className="font-black text-brand-navy/50 text-[9px] uppercase tracking-[0.2em] group-hover:text-brand-blue transition-colors">Upload Certificado (.pfx)</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] mb-2 block">Senha do Certificado</label>
                    <input
                      type="password"
                      name="senhaCertificado"
                      placeholder="••••••••"
                      value={formData.senhaCertificado}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-brand-blue/10 rounded-md px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-blue outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* LADO DIREITO: Upload de Planilha & Logs */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-white p-6 rounded-md shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)] border border-brand-blue/5 flex flex-col gap-6">
                <div className="flex justify-between items-center border-b border-brand-blue/5 pb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy/60 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-blue" />
                    3. Upload da Planilha e Inutilização em Lote
                  </h3>
                  <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-1.5 text-brand-blue hover:text-brand-navy text-[9px] font-black uppercase tracking-widest bg-white border border-brand-blue/10 py-1.5 px-3 rounded shadow-sm transition-all"
                  >
                    <Download size={10} />
                    Planilha Modelo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Dropzone */}
                  <label className={cn(
                    "border-2 border-dashed rounded-md p-8 flex flex-col items-center justify-center transition-all text-center cursor-pointer group",
                    batchFile ? "border-brand-blue/30 bg-brand-blue/5" : "border-brand-blue/10 bg-white"
                  )}>
                    <UploadCloud className="w-10 h-10 text-brand-blue/20 mb-3 group-hover:text-brand-blue transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-blue/50 group-hover:text-brand-blue">
                      {batchFile ? batchFile.name : "Selecionar Planilha (.xlsx)"}
                    </span>
                    <input
                      type="file"
                      ref={batchFileInputRef}
                      onChange={handleExcelImport}
                      accept=".xlsx"
                      className="hidden"
                    />
                  </label>

                  {/* Informações da planilha */}
                  <div className="bg-slate-50/50 border border-slate-100 p-4 rounded-md flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-black text-brand-navy/40 uppercase tracking-[0.2em] block mb-2">Colunas da Planilha</span>
                      <div className="flex flex-wrap gap-1.5">
                        {['modelo fiscal', 'série', 'nº inicial', 'nº final', 'Justificativa'].map(col => (
                          <code key={col} className="text-[9px] font-mono font-bold bg-white border border-brand-blue/5 text-brand-blue px-2 py-1 rounded shadow-sm">{col}</code>
                        ))}
                      </div>
                    </div>
                    <div className="text-[9px] text-brand-navy/60 font-medium leading-relaxed uppercase mt-4">
                      {batchRows.length > 0 ? (
                        <span className="text-brand-blue font-bold">{batchRows.length} faixas prontas para inutilização.</span>
                      ) : (
                        <span>Nenhum arquivo de lote carregado.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress / Status Bar */}
                {batchProcessing && (
                  <div className="space-y-2 p-4 bg-slate-50 rounded-md border border-slate-100 animate-in fade-in duration-300">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.15em] text-brand-navy">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue" />
                        Inutilizando Lote (Aguarde 5s de intervalo)...
                      </span>
                      <span>{batchProgress.current} / {batchProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded overflow-hidden">
                      <div 
                        className="bg-brand-blue h-full transition-all duration-300"
                        style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Envio button */}
                <button
                  onClick={handleBatchSubmit}
                  disabled={batchProcessing || batchRows.length === 0}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 py-4 rounded-md font-black uppercase tracking-[0.2em] text-[10px] transition-all text-white shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                    batchProcessing 
                      ? "bg-slate-300 shadow-none"
                      : "bg-brand-blue hover:bg-brand-navy shadow-brand-blue/20"
                  )}
                >
                  {batchProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando Faixas...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      Iniciar Inutilização em Lote
                    </>
                  )}
                </button>

                {/* Logs de Retorno */}
                {batchLogs.length > 0 && (
                  <div className="space-y-2.5 mt-4 border-t border-brand-blue/5 pt-6">
                    <span className="text-[10px] font-black text-brand-navy/60 uppercase tracking-[0.2em] block mb-2">Logs de Processamento</span>
                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {batchLogs.map((log, idx) => (
                        <div key={idx} className={cn(
                          "p-3 rounded border flex items-start gap-3 text-xs leading-relaxed font-bold animate-in slide-in-from-bottom-2 duration-300",
                          log.status === 'success' 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700" 
                            : "bg-brand-melon/5 border-brand-melon/20 text-brand-melon"
                        )}>
                          {log.status === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <div className="flex flex-col">
                            <span className="text-[9px] font-mono opacity-80">{log.range}</span>
                            <span className="mt-0.5">{log.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
