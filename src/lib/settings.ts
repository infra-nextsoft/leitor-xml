export interface AppSettings {
  apiUrl: string;
  apiVersion: string;
  cnpjPadrao: string;
  ufPadrao: string;
  lembrarSenha: boolean;
  senhaCertificado: string;
  certificadoBase64: string;
  certFileName: string;
}

const STORAGE_KEY = 'leitor-xml:settings';

export const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: 'http://localhost:8020',
  apiVersion: '1.14',
  cnpjPadrao: '',
  ufPadrao: '',
  lembrarSenha: false,
  senhaCertificado: '',
  certificadoBase64: '',
  certFileName: '',
};

export function getSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { 
        ...DEFAULT_SETTINGS, 
        ...parsed,
        apiVersion: parsed.apiVersion || DEFAULT_SETTINGS.apiVersion 
      };
    }
  } catch (e) {
    console.error('Erro ao ler configurações do localStorage:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Erro ao salvar configurações no localStorage:', e);
  }
}
