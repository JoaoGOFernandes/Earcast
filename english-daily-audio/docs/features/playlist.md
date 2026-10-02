# Feature: Playlist Manager

## Conceito

Uma **Playlist** define o conjunto de textos cujo vocabulário será usado
para gerar um áudio diário. É a unidade central de geração do sistema.

---

## Estados de uma Playlist

```
active       → gerando áudio todo dia
consolidating → dominância atingida, aguardando mesclagem automática
archived     → não gera mais áudio (foi mesclada ou desativada)
```

---

## Comportamento ao liberar textos

### Regra base
- Cada texto liberado cria automaticamente uma Playlist individual
- A playlist herda o nome do texto

### Mesclagem manual
- Usuário seleciona 2+ playlists ativas e clica em "Mesclar"
- Uma nova Playlist é criada com `is_merged = true` e `merged_from_ids = [...]`
- As playlists originais ficam com `status = 'archived'`
- A mesclagem vira o novo padrão: próximos textos liberados criam playlists individuais normalmente

### Desfazer mesclagem
- Arquiva a playlist mesclada
- Reativa as playlists originais (volta para `active`)
- Histórico de gerações é preservado

### Exemplo visual

```
Dia 1: Texto A liberado
  → [Playlist A] ← ativa, gera áudio todo dia

Dia 3: Texto B liberado
  → [Playlist A] [Playlist B] ← ambas ativas

Dia 5: Usuário mescla A+B
  → [Playlist A+B] ← ativa
  → Playlist A, Playlist B → archived

Dia 7: Texto C liberado
  → [Playlist A+B] [Playlist C] ← ambas ativas

Usuário desfaz mesclagem de A+B:
  → [Playlist A] [Playlist B] [Playlist C] ← todas ativas
  → Playlist A+B → archived
```

---

## Módulo playlist-manager.ts

```ts
// modules/schedule/playlist-manager.ts

export interface PlaylistManager {
  // Cria playlist ao liberar um texto
  createFromText(userId: string, textId: string): Promise<Playlist>

  // Mescla playlists selecionadas
  mergePlaylists(userId: string, playlistIds: string[]): Promise<Playlist>

  // Desfaz mesclagem
  unmergePlaylists(userId: string, mergedPlaylistId: string): Promise<Playlist[]>

  // Lista playlists ativas do usuário
  getActivePlaylists(userId: string): Promise<Playlist[]>

  // Estado atual (o que vai gerar hoje)
  getCurrentSchedule(userId: string): Promise<PlaylistSchedule[]>
}
```

---

## Configuração por Playlist

Cada playlist tem uma `playlist_configs` associada com:

| Campo | Descrição | Padrão |
|---|---|---|
| `theme` | Tipo de conteúdo livre ("notícia de tecnologia") | null |
| `coverage_target` | % vocabulário conhecido no texto gerado | 85 |
| `complexity` | 1 (simples) a 10 (literário) | 5 |
| `voice` | Voz do Piper | `en_US-lessac-medium` |

Ao mesclar playlists, a config da nova playlist é criada com valores padrão
e o usuário pode customizar depois.

---

## UI — Schedule Screen

Mostra o estado atual das playlists e o que vai ser gerado hoje:

```
┌─────────────────────────────────────┐
│  Geração de hoje                    │
│                                     │
│  [A+B] Jack e o Pé de Feijão +     │
│        O Chapéuzinho Vermelho        │
│  Tema: storytelling clássico         │
│  Cobertura: 85%  Complexidade: 4    │
│  [Config] [Gerar agora]             │
│                                     │
│  [C] Goldilocks                     │
│  Tema: não definido                 │
│  [Config] [Gerar agora]             │
│                                     │
│  [+ Mesclar playlists]              │
└─────────────────────────────────────┘
```
