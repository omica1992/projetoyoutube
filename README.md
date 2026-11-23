# Studio Shorts

Estúdio local do FatoNexo para pesquisa, estratégia, roteiro, narração, animação e exportação de MP4 vertical (1080×1920).

## Como rodar

```powershell
cd "C:\Users\Michel Alves\Documents\Projeto 3d Youtube\studio"
npm start
```

Abra <http://localhost:5173>.

## Pesquisa e estratégia

1. Em **Pesquisa**, abra **Conectar chave do Google** e cole a chave do seu projeto com a [YouTube Data API v3](https://developers.google.com/youtube/v3/getting-started) ativada. Clique em **Validar e conectar** e pesquise um assunto ou canal dentro do Studio.
2. Salve referências de vídeos e canais com o que vale testar. Para observar desempenho relativo, registre as views públicas e a mediana de Shorts do mesmo canal comparados em idades próximas. Uma amostra inicial pode usar cinco Shorts semelhantes. O multiplicador depende da qualidade dessa comparação. Confira o formato no YouTube, pois a API pesquisa vídeos curtos em geral.
3. Cadastre a adaptação original como pauta, indique um pilar e marque as que quer produzir primeiro como **Prioridade**. Use **Usar no roteiro** para levar tema, promessa, contexto, entrega e referência à produção.
4. Depois de publicar, registre a idade da medição, as views engajadas, a parcela que continuou assistindo e a porcentagem média assistida. Compare Shorts em idades semelhantes, por exemplo 2 e 7 dias após a publicação. Registre qual mudança fará no próximo teste.
5. Em **Estratégia**, acompanhe inscritos e visualizações qualificadas da janela de 90 dias usando a aba Monetização no YouTube Studio. Os totais públicos de views servem à pesquisa. Acompanhe os [requisitos atuais](https://support.google.com/youtube/answer/72857?hl=pt-BR) e a [mudança anunciada para fevereiro de 2027](https://support.google.com/youtube/answer/12843009?hl=pt-BR).

Referências, pautas e metas ficam no armazenamento local do navegador para o endereço do estúdio. Projetos de produção ficam em `studio/data`.

O formulário verifica a chave com o Google antes de salvá-la em `studio/.youtube-key`. Esse arquivo fica fora da pasta pública e do controle de versão. Você também pode preencher `YOUTUBE_API_KEY` ou `GOOGLE_API_KEY` no ambiente do servidor. O valor salvo pelo formulário tem precedência.

Para configurar pela sessão atual do PowerShell, use:

```powershell
$env:YOUTUBE_API_KEY = "<sua chave da YouTube Data API v3>"
npm start
```

A chave fica no servidor. Se a API estiver indisponível ou sem cota, a pesquisa direta no YouTube continua disponível.

## O fluxo

| Etapa | O que acontece | Onde roda |
|---|---|---|
| 1. Roteiro | Usa a pauta escolhida e sinais de tendência, organiza promessa, contexto e entrega e lista pontos a verificar | `gemini-4-argon` via OpenCode Go |
| 2. Áudio | Você grava com sua voz no Google e sobe o arquivo. O app transcreve com **timestamp por palavra** | `faster-whisper` local (CPU) |
| 3. Direção/HTML | A IA escolhe emoção, ênfase, paleta e transições; o HTML é gerado e validado (com motor próprio de reserva) | `gemini-4-argon` + modelo escolhido na tela (`gpt-6-luna` por padrão) |
| 4. MP4 | Chrome captura quadro a quadro (determinístico) e o ffmpeg codifica H.264 + AAC | `puppeteer-core` + `ffmpeg-static` |

O resultado final é salvo em `studio/data/<projeto>/video.mp4` e uma cópia vai para `3d/`.

No preview (etapa 3) a animação roda muda em loop; clique no vídeo para ouvir com o áudio.

## Por que Whisper local para o áudio

O gateway do OpenCode Go não entrega anexos de áudio aos modelos (testado com `gemini-4-argon`, `mimo-v2.6-*` e `muse-spark`: todos responderam como se não houvesse áudio). O Whisper roda offline, é gratuito e devolve o tempo exato de cada palavra — o que garante legenda perfeitamente sincronizada.

## Ajustes

Variáveis de ambiente (ou edite `src/config.js`):

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `5173` | porta do estúdio |
| `MODEL_ROTEIRO` | `gemini-4-argon` | modelo do roteiro |
| `MODEL_DIRECAO` | `gemini-4-argon` | modelo da direção de cena |
| `MODEL_HTML` | `gpt-6-luna` | modelo que escreve o HTML/design (também dá para trocar na tela) |
| `MODEL_HTML_FALLBACK` | `gpt-6-luna,claude-haiku-5-5` | modelos usados se o principal devolver vazio |
| `WHISPER_MODEL` | `small` | `tiny`, `base`, `small`, `medium` (maior = mais preciso e lento) |
| `WHISPER_LANG` | `pt` | idioma da narração |
| `STUDIO_WORKERS` | `2` | navegadores paralelos na captura de quadros |
| `CHROME_PATH` | auto | caminho do Chrome/Edge |

Modelos precisam estar disponíveis no seu OpenCode (`opencode models`).

## Estrutura

```
studio/
├─ src/
│  ├─ server.js          API + UI (Express)
│  ├─ opencode.js        cliente do OpenCode (session.generate)
│  ├─ trends.js          Google Trends RSS + autocomplete + notícias
│  ├─ prompts.js         prompts de roteiro, direção e HTML
│  ├─ transcribe.js      ponte para o Whisper local
│  ├─ timeline.js        blocos de legenda + direção normalizada
│  ├─ direcao.js         direção por IA com fallback heurístico
│  ├─ htmlgen.js         HTML (IA + validação + motor próprio)
│  ├─ engine-template.js CSS/HTML do motor
│  └─ render.js          captura (puppeteer) + encode (ffmpeg)
├─ public/
│  ├─ index.html         interface
│  ├─ app.js             fluxo das 4 etapas
│  └─ engine/engine.js   motor de animação determinístico
├─ python/transcribe.py  faster-whisper
├─ data/                 projetos, áudios, frames e MP4
└─ scripts/              testes (e2e, smoke, benchmark)
```

## Contrato do HTML

Todo HTML gerado (pela IA ou pelo motor) precisa expor:

```js
window.__STUDIO__ = {
  duration: 42.3,
  ready: true,
  setTime(t),  // desenha o estado exato do instante t (segundos)
  play()
}
```

O renderizador chama `setTime(t)` quadro a quadro, por isso a animação nunca depende do relógio do navegador — o resultado é idêntico em qualquer máquina.

## Problemas comuns

- **`Chrome/Edge não encontrado`** → defina `CHROME_PATH`.
- **Whisper lento no primeiro uso** → ele baixa o modelo (~460 MB para `small`) uma única vez.
- **HTML da IA inválido** → o estúdio avisa no log e usa o design ou o motor próprio automaticamente; dá para tentar de novo em "Refazer com IA".
- **MiniMax M3.1 Flash** → neste gateway ele devolve resposta vazia para prompts longos. Está no seletor, mas o padrão é `gpt-6-luna` (13 s e estável). O fallback tenta o próximo modelo da lista antes de usar o motor.
- **Render demorado** → ~5 min para 60 s de vídeo com 2 workers. Aumente `STUDIO_WORKERS` se a máquina aguentar.
