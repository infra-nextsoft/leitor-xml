import { XMLParser } from 'fast-xml-parser';

export interface SefazConfig {
  ambiente: '1' | '2'; // '1' = Produção, '2' = Homologação
  cnpj: string;
  certificadoBase64: string;
  senhaCertificado: string;
  apiUrl?: string; // URL do concentrador/proxy local se rodando no browser
}

export interface SefazKeyResult {
  chave: string;
  dhEmi: string;
}

export interface SefazSaeError extends Error {
  code?: string;
  soapFault?: string;
}

// Endpoints da SEFAZ-SP
const ENDPOINTS = {
  listagem: {
    1: 'https://nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx',
    2: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx',
    action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFCeListagemChaves/nfeListagemChaves'
  },
  download: {
    1: 'https://nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx',
    2: 'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx',
    action: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFCeDownloadXML/nfeDownloadXML'
  }
};

/**
 * Cria o envelope SOAP 1.2 para a listagem de chaves de NFC-e
 */
export function buildListagemChavesEnvelope(cnpj: string, ambiente: '1' | '2', dataIni: string, dataFim: string): string {
  // O CNPJ é omitido no corpo da requisição porque a SEFAZ autentica e identifica o emitente
  // diretamente pelo certificado digital cliente (mTLS).
  // As datas devem seguir estritamente o formato YYYY-MM-DDThh:mm
  const formattedIni = dataIni.includes('T') ? dataIni.substring(0, 16) : `${dataIni}T00:00`;
  const formattedFim = dataFim.includes('T') ? dataFim.substring(0, 16) : `${dataFim}T23:59`;

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header/>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFCeListagemChaves"><nfceListagemChaves versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${ambiente}</tpAmb><dataHoraInicial>${formattedIni}</dataHoraInicial><dataHoraFinal>${formattedFim}</dataHoraFinal></nfceListagemChaves></nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Cria o envelope SOAP 1.2 para o download do XML da NFC-e
 */
export function buildDownloadEnvelope(chave: string, ambiente: '1' | '2'): string {
  const cleanChave = chave.replace(/\D/g, '');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header/>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFCeDownloadXML"><nfceDownloadXML versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>${ambiente}</tpAmb><chNFCe>${cleanChave}</chNFCe></nfceDownloadXML></nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Utilitário de atraso (sleep)
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa uma requisição HTTP via proxy local (Concentrador) ou diretamente (se Node.js)
 */
async function executeSoapRequest(
  url: string,
  soapAction: string,
  xmlPayload: string,
  config: SefazConfig,
  retries = 3,
  backoff = 1000
): Promise<string> {
  const isBrowser = typeof window !== 'undefined';
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (isBrowser) {
        // Chamada direta para o endpoint da SEFAZ (mTLS via certificado instalado no navegador/máquina)
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'SOAPAction': soapAction
          },
          body: xmlPayload
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Erro na SEFAZ (${response.status}): ${text || response.statusText}`);
        }

        return await response.text();
      } else {
        // Fallback Node.js (se executado fora do browser)
        const httpsModule = 'https';
        const https: any = await import(httpsModule);
        const buffer = (globalThis as any).Buffer.from(config.certificadoBase64, 'base64');
        
        const agent = new https.Agent({
          pfx: buffer,
          passphrase: config.senhaCertificado,
          rejectUnauthorized: false
        });

        const urlObj = new URL(url);

        return new Promise<string>((resolve, reject) => {
          const req = https.request({
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname,
            method: 'POST',
            agent,
            headers: {
              'Content-Type': 'application/soap+xml; charset=utf-8',
              'SOAPAction': soapAction,
              'Content-Length': (globalThis as any).Buffer.byteLength(xmlPayload)
            }
          }, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Erro HTTP SEFAZ (${res.statusCode}): ${data}`));
              } else {
                resolve(data);
              }
            });
          });

          req.on('error', (err: any) => {
            reject(err);
          });

          req.write(xmlPayload);
          req.end();
        });
      }
    } catch (err: any) {
      const isRateLimit = err.message?.includes('429') || err.message?.includes('137') || err.message?.includes('consumo indevido');
      const isExpired = err.message?.includes('expired') || err.message?.includes('expirado') || err.message?.includes('validation failed');

      if (isExpired) {
        throw new Error('Certificado digital inválido ou expirado.');
      }

      if (attempt === retries || !isRateLimit) {
        throw err;
      }

      // Espera antes de tentar novamente (Backoff Exponencial)
      const currentDelay = backoff * Math.pow(2, attempt - 1);
      await delay(currentDelay);
    }
  }
  throw new Error('Erro inesperado no fluxo de retentativas.');
}

/**
 * Helper para localizar chaves de forma recursiva e insensível a maiúsculas/minúsculas e namespaces.
 */
function findNodeCaseInsensitive(obj: any, targetKey: string): any {
  if (!obj || typeof obj !== 'object') return null;
  
  const keys = Object.keys(obj);
  // Busca exata, terminando com a chave alvo ou contendo a chave alvo (útil para retNfceListagemChaves vs retListagemChaves)
  const match = keys.find(k => {
    const cleanKey = k.toLowerCase();
    const cleanTarget = targetKey.toLowerCase();
    return cleanKey === cleanTarget || cleanKey.endsWith(':' + cleanTarget) || cleanKey.includes(cleanTarget);
  });
  
  if (match) return obj[match];

  // Busca recursiva profunda nos nós filhos
  for (const key of keys) {
    if (obj[key] && typeof obj[key] === 'object') {
      const child = findNodeCaseInsensitive(obj[key], targetKey);
      if (child) return child;
    }
  }
  return null;
}

/**
 * Consulta e lista as chaves de acesso no período especificado
 */
export async function listSefazKeys(
  config: SefazConfig,
  dataIni: string,
  dataFim: string
): Promise<SefazKeyResult[]> {
  const url = ENDPOINTS.listagem[config.ambiente];
  const soapAction = ENDPOINTS.listagem.action;
  const envelope = buildListagemChavesEnvelope(config.cnpj, config.ambiente, dataIni, dataFim);
  
  const responseXml = await executeSoapRequest(url, soapAction, envelope, config);
  console.log('SEFAZ-SP Listagem XML Response:', responseXml);
  
  // Tratar retorno com o fast-xml-parser
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(responseXml);
  
  // Acessa a estrutura de forma robusta
  const body = findNodeCaseInsensitive(parsed, 'Body') || parsed;
  const retListagem = findNodeCaseInsensitive(body, 'ListagemChaves');
  
  if (!retListagem) {
    // Verifica se houve SOAP Fault
    const fault = findNodeCaseInsensitive(body, 'Fault');
    if (fault) {
      const reason = findNodeCaseInsensitive(fault, 'Reason');
      const text = reason ? findNodeCaseInsensitive(reason, 'Text') : null;
      const error: SefazSaeError = new Error(text || 'Falha de comunicação SOAP com a SEFAZ.');
      error.soapFault = JSON.stringify(fault);
      throw error;
    }
    throw new Error('Formato de resposta inesperado da SEFAZ.');
  }

  const cStat = Number(findNodeCaseInsensitive(retListagem, 'cStat'));
  const xMotivo = findNodeCaseInsensitive(retListagem, 'xMotivo');

  if (cStat === 137 || cStat === 107) {
    // 137 / 107: Nenhum documento localizado / sem registros
    return [];
  }

  if (cStat !== 100 && cStat !== 138) { // 100/138 são status normais de sucesso
    const error: SefazSaeError = new Error(`Rejeição SEFAZ (Código ${cStat}): ${xMotivo}`);
    error.code = String(cStat);
    throw error;
  }

  const chavesNode = findNodeCaseInsensitive(retListagem, 'detChaves');
  if (!chavesNode) {
    return [];
  }

  // Se houver apenas 1 chave, o parser traz como objeto simples em vez de array
  const list = Array.isArray(chavesNode) ? chavesNode : [chavesNode];
  
  return list.map((item: any) => ({
    chave: String(findNodeCaseInsensitive(item, 'chNFe') || ''),
    dhEmi: String(findNodeCaseInsensitive(item, 'dhEmi') || '')
  }));
}

/**
 * Realiza o download do XML completo de uma determinada chave de acesso
 */
export async function downloadSefazXml(config: SefazConfig, chave: string): Promise<string> {
  const url = ENDPOINTS.download[config.ambiente];
  const soapAction = ENDPOINTS.download.action;
  const envelope = buildDownloadEnvelope(chave, config.ambiente);

  const responseXml = await executeSoapRequest(url, soapAction, envelope, config);
  console.log('SEFAZ-SP Download XML Response:', responseXml);

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(responseXml);

  const body = findNodeCaseInsensitive(parsed, 'Body') || parsed;
  const retDownload = findNodeCaseInsensitive(body, 'DownloadXML');

  if (!retDownload) {
    const fault = findNodeCaseInsensitive(body, 'Fault');
    if (fault) {
      const reason = findNodeCaseInsensitive(fault, 'Reason');
      const text = reason ? findNodeCaseInsensitive(reason, 'Text') : null;
      throw new Error(text || 'Falha de comunicação SOAP com a SEFAZ ao baixar XML.');
    }
    throw new Error('Formato de resposta inesperado da SEFAZ no download.');
  }

  const cStat = Number(findNodeCaseInsensitive(retDownload, 'cStat'));
  const xMotivo = findNodeCaseInsensitive(retDownload, 'xMotivo');

  if (cStat !== 100 && cStat !== 139) { // 100/139 ok
    throw new Error(`Erro SEFAZ ao baixar nota ${chave} (Código ${cStat}): ${xMotivo}`);
  }

  // O XML da NF-e compactado ou decodificado vem na tag xmlOut ou zipNFe
  const xmlOut = findNodeCaseInsensitive(retDownload, 'zipNFe') || findNodeCaseInsensitive(retDownload, 'xmlOut');
  if (!xmlOut) {
    throw new Error(`XML não disponível no retorno da chave ${chave}`);
  }

  return xmlOut;
}
