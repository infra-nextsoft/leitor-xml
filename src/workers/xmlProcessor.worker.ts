import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
});

self.onmessage = async (e: MessageEvent) => {
  const { files } = e.data as { files: File[] };
  const totalFiles = files.length;
  const results: any[] = [];
  
  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];
    try {
      const text = await file.text();
      const jsonObj = parser.parse(text);
      
      // Localiza a tag infNFe (pode estar dentro de nfeProc ou ser a raiz NFe)
      const nfe = jsonObj.nfeProc?.NFe || jsonObj.NFe;
      const infNFe = nfe?.infNFe;
      
      if (!infNFe) {
        console.error(`XML inválido ou tag infNFe não encontrada: ${file.name}`);
        continue;
      }
      
      const record = {
        nNF: infNFe.ide?.nNF !== undefined && infNFe.ide?.nNF !== null ? String(infNFe.ide.nNF) : '---',
        chave: String(infNFe['@_Id'] || infNFe.Id || '').replace(/^NFe/i, ''),
        dhEmi: String(infNFe.ide?.dhEmi || ''),
        cpf: String(infNFe.dest?.CPF || 'Não informado'),
        vProd: parseFloat(infNFe.total?.ICMSTot?.vProd || 0),
        vDesc: parseFloat(infNFe.total?.ICMSTot?.vDesc || 0),
        vNF: parseFloat(infNFe.total?.ICMSTot?.vNF || 0),
        fileName: file.name,
        processedAt: Date.now(),
        mod: infNFe.ide?.mod !== undefined && infNFe.ide?.mod !== null ? String(infNFe.ide.mod) : '---',
        tpNF: infNFe.ide?.tpNF !== undefined && infNFe.ide?.tpNF !== null ? String(infNFe.ide.tpNF) : '---',
        serie: infNFe.ide?.serie !== undefined && infNFe.ide?.serie !== null ? String(infNFe.ide.serie) : '---'
      };
      
      results.push(record);
      
      // Envia progresso a cada 100 arquivos ou no final
      if (results.length >= 100 || i === totalFiles - 1) {
        self.postMessage({ 
          type: 'PROGRESS', 
          current: i + 1, 
          total: totalFiles, 
          batch: [...results] 
        });
        results.length = 0; // Limpa o lote
      }
    } catch (err) {
      console.error(`Erro ao processar arquivo ${file.name}:`, err);
    }
  }
  
  self.postMessage({ type: 'COMPLETE' });
};
