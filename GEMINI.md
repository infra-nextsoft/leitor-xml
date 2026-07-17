# GEMINI.md - Antigravity Kit (Design System & Coding Standards)

> Este arquivo define os padrões de design e engenharia para o projeto **Leitor XML**.

---

## 🎨 Design System (NextSoft Premium)

### Cores Core
- **Navy (Principal)**: `#010624` (`text-brand-navy`) - Usado para textos e contrastes fortes.
- **Blue (Ação)**: `#2B46CC` (`text-brand-blue`) - Destaques, botões primários e links.
- **Melon (Alerta)**: `#F6714F` (`text-brand-melon`) - Erros, valores negativos e alertas.
- **Sun (Suporte)**: `#FFB448` (`text-brand-sun`) - Avisos e elementos secundários.
- **Emerald (Sucesso)**: `#10b981` (`text-emerald-500`) - Valores positivos e sucessos.

### Tipografia & Estética
- **Labels Técnicos (Headers)**: `text-[10px] font-black uppercase tracking-[0.2em] text-brand-navy`.
- **Status & Indicators**: `text-[10px] font-black uppercase tracking-widest`.
- **Instruções & Sublabels**: `text-[10px] text-brand-navy/60 uppercase tracking-[0.2em] font-medium`.
- **Valores Mono (Grid/Listas)**: `font-mono text-[11px] font-bold tracking-tighter`.
- **Bordas**: `rounded-md` é configurado como `2px` (estilo afiado/quadrado).
- **Sombras**: Uso de sombras leves com base em navy: `shadow-[0_2px_15px_-3px_rgba(1,6,36,0.04)]`.

### Padrões de UI Específicos

#### 📂 Excel Upload Pattern
Utilizado para importação de planilhas com feedback visual imediato.
- **Container Dropzone**: `border-2 border-dashed rounded-md transition-all hover:bg-brand-blue/[0.02] group`.
- **Estados**:
  - *Idle*: `border-brand-blue/10 bg-white`.
  - *Active/Done*: `border-brand-blue/30 bg-brand-blue/5`.
- **Ícone**: `w-10 h-10 mb-4 transition-colors`. Cor idle `text-brand-blue/20`, hover `text-brand-blue`.
- **Label**: `text-[10px] font-black uppercase tracking-[0.2em]`.

---

## 🛠️ Padrões de Código

### Componentes React
- **Estrutura**: Componentes funcionais com interfaces TypeScript explícitas.
- **Estilização**: Uso obrigatório do utilitário `cn(...)` para merge de classes Tailwind.
- **Performance**: Uso intensivo de `useMemo` para filtros/cálculos e `useCallback` para funções passadas via props.

### UX & Interação
- **Micro-interações**: Hover effects com `transition-all` e `active:scale-95`.
- **Animações**: Uso de `framer-motion` ou classes `animate-in` para entradas de página.
- **Feedback**: Sempre exibir loaders (`Loader2` do lucide) durante processamentos assíncronos.
- **Ícones**:
  - *Header*: `w-4 h-4 text-brand-blue`.
  - *Placeholders*: `w-8 h-8 text-brand-blue/20`.
  - *Ação Individual*: `size={12}` ou `14px`.

### Processamento de Dados
- **Off-loading**: Tarefas pesadas (ex: leitura de 1000+ XMLs) **DEVEM** ser feitas via Web Workers (`src/workers/`).
- **Persistence**: Dados locais salvos via Dexie (IndexedDB) para persistência entre sessões.
- **Excel**: Uso da biblioteca `xlsx` para leitura e exportação.

---

## 📁 Estrutura de Arquivos
- `src/components`: Componentes de UI reutilizáveis.
- `src/lib`: Utilitários, configurações de banco e helpers.
- `src/workers`: Lógica de processamento intensivo fora da thread principal.

---

## 🛑 Regras de Ouro
1. **No Placeholders**: Nunca use imagens ou textos genéricos. Use o design system.
2. **Performance First**: Se a operação puder durar mais de 100ms, use um Worker ou feedback visual imediato.
3. **Consistency**: Siga os tokens de cor e tipografia rigorosamente. Não use cores ad-hoc.
