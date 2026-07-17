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
}

export class AppDatabase extends Dexie {
  xmlRecords!: Table<XMLRecord>;

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
  }
}

export const db = new AppDatabase();
