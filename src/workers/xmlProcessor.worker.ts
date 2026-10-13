import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false, // Mantém chaves de 44 dígitos, CNPJs e campos numéricos como strings sem perda de precisão
});

self.onmessage = async (e: MessageEvent) => {
  const { files } = e.data as { files: File[] };
  const totalFiles = files.length;
  const results: any[] = [];
  const cancellations: any[] = [];
  
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    try {
      const text = await file.text();
      const jsonObj = parser.parse(text);
      
      // 1. Tenta localizar a tag infNFe (venda NFe/NFCe normal)
      const nfe = jsonObj.nfeProc?.NFe || jsonObj.NFe;
      const infNFe = nfe?.infNFe;
      const protNFe = jsonObj.nfeProc?.protNFe || jsonObj.protNFe;
      const infProt = protNFe?.infProt;
      
      // 2. Tenta localizar evento de cancelamento (procEventoNFe / evento)
      const procEvento = jsonObj.procEventoNFe || jsonObj.procEvento;
      const evento = procEvento?.evento || jsonObj.evento;
      const retEvento = procEvento?.retEvento || jsonObj.retEvento;
      const infEvento = evento?.infEvento || jsonObj.infEvento;
      const retInfEvento = retEvento?.infEvento;

      if (infNFe) {
        let chave = String(infProt?.chNFe || infNFe['@_Id'] || infNFe.Id || '').replace(/^NFe/i, '').trim();
        if (chave.length !== 44) {
          const match = file.name.match(/(\d{44})/);
          if (match) chave = match[1];
        }

        let cnpjEmit = String(infNFe.emit?.CNPJ || infNFe.emit?.CPF || '').replace(/\D/g, '');
        if (!cnpjEmit && chave.length === 44) {
          cnpjEmit = chave.slice(6, 20);
        }
        const xNomeEmit = String(infNFe.emit?.xNome || infNFe.emit?.xFant || '');

        // Dados de autorização SEFAZ para geração de scripts SQL GRN:
        const cStat = String(infProt?.cStat || '100');
        const nProt = String(infProt?.nProt || '');
        const dhRecbto = String(infProt?.dhRecbto || infNFe.ide?.dhEmi || '');
        const versaoXml = String(protNFe?.['@_versao'] || infProt?.['@_versao'] || jsonObj.nfeProc?.['@_versao'] || infNFe?.['@_versao'] || '4.00');
        
        const record = {
          nNF: infNFe.ide?.nNF !== undefined && infNFe.ide?.nNF !== null ? String(infNFe.ide.nNF) : (chave.length === 44 ? String(parseInt(chave.slice(25, 34), 10)) : '---'),
          chave,
          dhEmi: String(infNFe.ide?.dhEmi || ''),
          cpf: String(infNFe.dest?.CPF || 'Não informado'),
          vProd: parseFloat(infNFe.total?.ICMSTot?.vProd || 0),
          vDesc: parseFloat(infNFe.total?.ICMSTot?.vDesc || 0),
          vNF: parseFloat(infNFe.total?.ICMSTot?.vNF || 0),
          fileName: file.name,
          processedAt: Date.now(),
          mod: infNFe.ide?.mod !== undefined && infNFe.ide?.mod !== null ? String(infNFe.ide.mod) : (chave.length === 44 ? chave.slice(20, 22) : '---'),
          tpNF: infNFe.ide?.tpNF !== undefined && infNFe.ide?.tpNF !== null ? String(infNFe.ide.tpNF) : '---',
          serie: infNFe.ide?.serie !== undefined && infNFe.ide?.serie !== null ? String(infNFe.ide.serie) : (chave.length === 44 ? String(parseInt(chave.slice(22, 25), 10)) : '---'),
          cnpjEmit: cnpjEmit || 'Outros',
          xNomeEmit,
          cStat,
          nProt,
          dhRecbto,
          versaoXml
        };
        
        results.push(record);
      } else if (infEvento || retInfEvento) {
        const tpEvento = String(infEvento?.tpEvento || retInfEvento?.tpEvento || '');
        const descEvento = String(infEvento?.detEvento?.descEvento || retInfEvento?.xEvento || '').toLowerCase();
        
        // Verifica se é evento de Cancelamento (Código 110111)
        if (tpEvento === '110111' || descEvento.includes('cancelamento')) {
          let chave = String(infEvento?.chNFe || retInfEvento?.chNFe || '').replace(/\D/g, '').trim();
          if (chave.length !== 44 && infEvento?.['@_Id']) {
            const rawId = String(infEvento['@_Id']);
            const match = rawId.match(/(\d{44})/);
            if (match) chave = match[1];
          }
          if (chave.length !== 44) {
            const fileMatch = file.name.match(/(\d{44})/);
            if (fileMatch) chave = fileMatch[1];
          }

          let cnpjEmit = String(infEvento?.CNPJ || infEvento?.CPF || retInfEvento?.CNPJ || '').replace(/\D/g, '');
          if (!cnpjEmit && chave.length === 44) {
            cnpjEmit = chave.slice(6, 20);
          }

          let nNF = '';
          let mod = '';
          let serie = '';
          if (chave.length === 44) {
            nNF = String(parseInt(chave.slice(25, 34), 10));
            mod = chave.slice(20, 22);
            serie = String(parseInt(chave.slice(22, 25), 10));
          }

          const cancelRecord = {
            chave,
            nNF,
            mod,
            serie,
            cnpjEmit: cnpjEmit || 'Outros',
            dhEvento: String(infEvento?.dhEvento || ''),
            dhRegEvento: String(retInfEvento?.dhRegEvento || infEvento?.dhEvento || ''),
            nProt: String(retInfEvento?.nProt || infEvento?.detEvento?.nProt || ''),
            xJust: String(infEvento?.detEvento?.xJust || ''),
            cStat: String(retInfEvento?.cStat || ''),
            xMotivo: String(retInfEvento?.xMotivo || ''),
            fileName: file.name,
            processedAt: Date.now()
          };

          cancellations.push(cancelRecord);
        }
      } else {
        console.warn(`XML não reconhecido como NFe/NFCe nem Cancelamento: ${file.name}`);
      }
      
      // Envia progresso a cada 100 arquivos ou no final
      if (results.length >= 100 || cancellations.length >= 100 || i === totalFiles - 1) {
        if (results.length > 0 || cancellations.length > 0 || i === totalFiles - 1) {
          self.postMessage({ 
            type: 'PROGRESS', 
            current: i + 1, 
            total: totalFiles, 
            batch: [...results],
            cancellationsBatch: [...cancellations]
          });
          results.length = 0;
          cancellations.length = 0;
        }
      }
    } catch (err) {
      console.error(`Erro ao processar arquivo ${file.name}:`, err);
    }
  }
  
  self.postMessage({ type: 'COMPLETE' });
};
