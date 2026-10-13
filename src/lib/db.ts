import Dexie, { type Table } from 'dexie';

export interface XMLRecord {
  id?: number;
  nNF: string;
  chave: string;
  dhEmi: string;
  cpf: string;
  vProd: number;
  vDesc: number;
  vNF: number;
  fileName: string;
  processedAt: number;
  mod?: string;
  tpNF?: string;
  serie?: string;
  cnpjEmit?: string;
  xNomeEmit?: string;
  cStat?: string;
  nProt?: string;
  dhRecbto?: string;
  versaoXml?: string;
}

export interface CancellationRecord {
  chave: string;
  nNF?: string;
  mod?: string;
  serie?: string;
  cnpjEmit?: string;
  dhEvento: string;
  dhRegEvento?: string;
  nProt?: string;
  xJust?: string;
  cStat?: string;
  xMotivo?: string;
  fileName: string;
  processedAt: number;
}

export class AppDatabase extends Dexie {
  xmlRecords!: Table<XMLRecord>;
  cancellations!: Table<CancellationRecord>;

  constructor() {
    super('NFCeReaderDB');
    this.version(1).stores({
      xmlRecords: '++id, nNF, dhEmi, cpf, fileName, processedAt'
    });
    this.version(2).stores({
      xmlRecords: '++id, nNF, chave, dhEmi, cpf, fileName, processedAt'
    }).upgrade(tx => {
      return tx.table('xmlRecords').toCollection().modify(record => {
        if (record.chave === undefined) record.chave = '';
      });
    });
    this.version(3).stores({
      xmlRecords: '++id, nNF, chave, dhEmi, cpf, cnpjEmit, fileName, processedAt'
    }).upgrade(tx => {
      return tx.table('xmlRecords').toCollection().modify(record => {
        if (!record.cnpjEmit) {
          if (record.chave && record.chave.length === 44) {
            record.cnpjEmit = record.chave.slice(6, 20);
          } else {
            record.cnpjEmit = '';
          }
        }
        if (record.xNomeEmit === undefined) record.xNomeEmit = '';
      });
    });
    this.version(4).stores({
      xmlRecords: '++id, nNF, chave, dhEmi, cpf, cnpjEmit, fileName, processedAt',
      cancellations: 'chave, cnpjEmit, dhEvento, fileName, processedAt'
    });
  }
}

export const db = new AppDatabase();
