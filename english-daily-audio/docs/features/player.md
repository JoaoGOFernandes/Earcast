# Feature: Player e Marcação

## Visão geral

Player de áudio com sincronização texto-áudio em tempo real (karaokê)
e sistema de marcação de palavras/frases difíceis que alimenta o LSR Engine.

---

## Modos de uso

### Modo 1: Só ouvir (padrão)
- Usuário abre o áudio e aperta play
- Texto não é exibido por padrão
- Pode ativar o texto a qualquer momento

### Modo 2: Leitura simultânea
- Texto EN e tradução PT exibidos lado a lado
- Palavra atual destacada em tempo real (via `word_timestamps`)
- Usuário acompanha o áudio lendo

### Modo 3: Marcação
- Ativado ao clicar em qualquer palavra durante os modos 1 ou 2
- Clique simples → marca palavra como `review`
- Clique e arrasta → seleciona frase inteira como `review`
- Palavra marcada fica destacada em vermelho/laranja
- Pode desmarcar clicando novamente

---

## Sincronização texto-áudio

Usa os `word_timestamps` armazenados na `generations`:

```ts
// hooks/usePlayerSync.ts
function usePlayerSync(
  audioRef: RefObject<HTMLAudioElement>,
  timestamps: WordTimestamp[]
) {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      const ms = audio.currentTime * 1000
      const idx = timestamps.findIndex(
        t => ms >= t.start_ms && ms <= t.end_ms
      )
      setCurrentWordIndex(idx)
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [timestamps])

  return currentWordIndex
}
```

---

## Marcação de palavras

```ts
// modules/library/actions.ts
'use server'

export async function markWordForReview(input: {
  generationId: string
  playlistId: string
  word: string
  phrase?: string
  mode: 'listening' | 'reading'
}): Promise<Result<void, string>> {
  // Insere em review_events
  // Edge Function processa e atualiza word_reviews via LSR Engine
}
```

---

## UI do Player

```
┌───────────────────────────────────────────────┐
│  Playlist C — Goldilocks                      │
│  Gerado hoje às 07:03                         │
│                                               │
│  [EN] [PT] [EN+PT]          velocidade: [1x▾] │
│                                               │
│  Once upon a time, a little girl named        │
│  Goldilocks wandered into the forest.         │
│  She found a house and decided to enter.      │
│  ▲ palavra atual destacada em azul            │
│  ▲ palavra marcada destacada em laranja       │
│                                               │
│  ──────────────●────────────────  02:14/05:30 │
│                                               │
│  [◀ 5s]  [▶▶ Play]  [5s ▶]     [0.75x] [1x] │
│                                               │
│  Palavras marcadas hoje: wandered, decided    │
│  [Ver no vocabulário]                         │
└───────────────────────────────────────────────┘
```

---

## Fim de sessão

Quando o áudio termina (ou usuário clica em "Concluir sessão"):

1. Palavras marcadas → `onDifficult()` no LSR Engine
2. Palavras do texto que NÃO foram marcadas → `onSuccess()` no LSR Engine
3. Generation fica com `reviewed = true`
4. Usuário vê resumo: "X palavras reforçadas, Y palavras dominadas"

```ts
// Disparado ao fim do áudio
export async function processSessionEnd(
  generationId: string
): Promise<Result<SessionSummary, string>>
```
