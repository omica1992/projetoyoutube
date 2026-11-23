export const SYSTEM_PT =
  "Você é roteirista e diretor de vídeos curtos (YouTube Shorts) em português do Brasil. " +
  "Você escreve com ritmo, frases curtas e ganchos fortes. Nunca inventa dados: se não houver fonte, não cite números."

export function promptRoteiro({ nicho, tom, duracao, brief, extra, pauta }) {
  return `${SYSTEM_PT}

# TAREFA
Criar um roteiro de YouTube Shorts sobre o nicho "${nicho}".
${typeof pauta === "string" && pauta.trim() ? `Pauta escolhida pelo criador: ${pauta.trim().slice(0, 160)}. Mantenha o roteiro centrado nessa pauta.` : ""}
Tom desejado: ${tom || "curiosidade + revelação"}.
Duração alvo: ${duracao || 50} segundos (fala em ritmo natural, ~2,6 palavras/segundo).

# SINAIS DE TENDÊNCIA COLETADOS AGORA (${brief.geradoEm})
Buscas em alta no Google (${brief.geo}):
${brief.buscasDoDia.map((t, i) => `${i + 1}. ${t.title}${t.traffic ? ` (${t.traffic})` : ""}${t.news.length ? ` — ${t.news.join(" | ")}` : ""}`).join("\n") || "(sem dados)"}

O que as pessoas digitam no YouTube:
${brief.sugestoesYouTube.map((s) => `- ${s}`).join("\n") || "(sem dados)"}

Notícias recentes do nicho:
${brief.noticias.map((n) => `- ${n.title} (${n.source})`).join("\n") || "(sem dados)"}
${extra ? `\n# PEDIDO EXTRA DO CRIADOR\n${extra}\n` : ""}
# REGRAS DO ROTEIRO
1. Promessa nos primeiros 3 segundos: faça o público entender a pergunta concreta que será respondida. Alinhe título, primeira frase e primeira imagem. Comece direto.
2. Contexto: em uma ou duas frases, dê o mínimo necessário para a pergunta fazer sentido. Faça cada frase acrescentar uma pista, dado sustentado ou contraste.
3. Entrega: responda à promessa neste vídeo, com uma prova, demonstração ou explicação concreta. Mostre a primeira pista útil cedo. Evite alongar o suspense com frases vazias.
4. Se houver CTA, coloque-o depois da entrega. Use português do Brasil falado, com frases curtas.
5. Use referências de outros vídeos para estudar estrutura e ritmo. Crie narração e abordagem próprias. Um link de referência ou sinal de tendência sozinho não verifica uma afirmação. Use fatos sustentados pelo briefing, qualifique incertezas e registre o que precisa de verificação em pontos_a_checar.
6. Mire entre ${Math.max(10, (duracao || 50) - 5)} e ${(duracao || 50) + 5} segundos de fala. O texto narrado deve corresponder às cenas na mesma ordem.

# FORMATO DE SAÍDA
Responda APENAS com JSON válido, sem markdown, exatamente neste formato:
{
  "titulo": "título curto e clicável (máx 60 caracteres)",
  "tema": "tema em 1 linha",
  "tendencia_base": "qual sinal de tendência você usou e por quê",
  "gancho": "primeira frase, a que prende",
  "retencao": { "promessa": "o que o público vai descobrir", "contexto": "o essencial para entender", "entrega": "qual resposta o vídeo dá" },
  "pontos_a_checar": ["afirmações que precisam de fonte antes de publicar"],
  "roteiro": "texto corrido completo que será narrado",
  "cenas": [
    { "texto": "frase exata da narração", "intencao": "gancho|contexto|revelacao|prova|cta", "duracao": 3.5 }
  ],
  "cta": "chamada final",
  "hashtags": ["#short1", "#short2", "#short3"],
  "descricao_youtube": "2 linhas para a descrição, com espaço para créditos"
}`
}

export function promptDirecao({ chunks, estilo, tema }) {
  return `Você é diretor de arte de Shorts cinematográficos. Vou te entregar as legendas já sincronizadas com o áudio (tempos reais, não invente).

# TEMA
${tema || "(não informado)"}

# LEGENDAS SINCRONIZADAS (${chunks.length} blocos)
${chunks.map((c) => `${c.i}|${c.start.toFixed(2)}-${c.end.toFixed(2)}|${c.text}`).join("\n")}

# TAREFA
Criar a DIREÇÃO visual. Agrupe os blocos em cenas. Escolha emoção dominante, palavras de ênfase e descrição de fundo por cena.

# REGRAS
- Use SOMENTE os índices de bloco fornecidos, em ordem crescente, sem pular nenhum.
- "enfase" deve conter índices de PALAVRA dentro do bloco (0 = primeira palavra do bloco).
- Cada cena tem no mínimo 2 e no máximo 6 blocos.
- Paleta precisa ter contraste alto (texto legível sobre o fundo).
- Estilo geral: ${estilo || "cinematográfico, sombrio, elegante"}.

# FORMATO DE SAÍDA
Responda APENAS com JSON válido:
{
  "paleta": { "fundo": "#0A0A0F", "primaria": "#FFFFFF", "secundaria": "#9AA0B4", "destaque": "#FF3D5A" },
  "tipografia": { "familia": "Arial Black, Impact, sans-serif", "caixa": "uppercase", "peso": 900 },
  "cenas": [
    {
      "blocos": [0, 1, 2],
      "emocao": "choque|curiosidade|tensao|revelacao|cta",
      "fundo": { "tipo": "gradiente|particulas|grid|bokeh|solido", "cores": ["#101018", "#1B1030"], "movimento": "zoom|pan|pulse" },
      "transicao": "corte|zoom|flash|deslize",
      "enfase": { "0": [1], "2": [0, 2] },
      "elemento": { "tipo": "nenhum|numero|barra|icone", "valor": "" }
    }
  ]
}`
}

export function promptDesign({ chunks, direcao }) {
  return `Você é diretor de arte de YouTube Shorts. Você NÃO escreve HTML: você escreve a camada de estilo (CSS) que veste um player vertical 1080x1920 já pronto.

# ESTRUTURA EXISTENTE (não altere nomes)
#stage (palco 1080x1920) · #bg, #bg2 (fundos) · #fx (textura) · #grain · #vignette · #flash
#ghost (número/ícone gigante ao fundo) · #topbar (selo de emoção) · #pill (etiqueta)
#caption (bloco da legenda) · .line (linha) · .w (palavra) · .w.em (palavra de ênfase) · #progress (barra) · .badge

# DIREÇÃO
${JSON.stringify(direcao).slice(0, 2500)}

# LEGENDAS (amostra)
${chunks.slice(0, 12).map((c) => c.text).join(" | ")}

# TAREFA
Devolva um JSON com:
{
  "paleta": { "fundo": "#0A0A0F", "primaria": "#FFFFFF", "secundaria": "#9AA0B4", "destaque": "#FF3D5A" },
  "tipografia": { "familia": "Impact, 'Arial Black', sans-serif", "caixa": "uppercase", "peso": 900 },
  "css": "regras CSS que deixam o visual premium e cinematográfico"
}

# REGRAS DO CSS
- Máximo 4000 caracteres. Só CSS puro, sem <style>, sem @import, sem url(http...), sem fontes externas.
- Pode usar as variáveis --fundo, --primaria, --secundaria, --destaque, --familia, --peso.
- SELETORES PERMITIDOS (não estilize outros): #bg, #bg2, #fx, #grain, #vignette, #ghost, #pill, #caption, #caption .line, #caption .w, #caption .w.em, #progress
- PROIBIDO: #stage, #topbar, .badge, html, body, position:fixed, alterar tamanho/posição do #stage.
- Foque em: legenda gigante com contorno/sombra forte, palavra ativa vibrante, brilho suave, grão e vinheta, barra de progresso elegante.
- Use apenas transform/opacity/filter/color/background/text-shadow/-webkit-text-stroke/-webkit-text-fill-color.
- Não crie faixas, bordas de página, headers ou rodapés.

Responda APENAS com o JSON.`
}

export function promptHtml({ chunks, direcao, audioName, titulo }) {
  return `Você é um engenheiro front-end especialista em animação para YouTube Shorts.
Gere UM arquivo HTML único, auto-contido, que anima legendas sincronizadas com um áudio.

# DADOS
Título: ${titulo}
Áudio: "${audioName}" (mesma pasta do HTML). Duração total: ${chunks.at(-1)?.end?.toFixed(2)}s.
FPS de render: 30. Tamanho exato: 1080x1920.

Paleta: ${JSON.stringify(direcao.paleta)}
Tipografia: ${JSON.stringify(direcao.tipografia)}
Cenas: ${JSON.stringify(direcao.cenas)}

Legendas (índice | início-fim | texto):
${chunks.map((c) => `${c.i}|${c.start.toFixed(2)}-${c.end.toFixed(2)}|${c.text}`).join("\n")}

# CONTRATO OBRIGATÓRIO (se quebrar, o vídeo não renderiza)
1. Corpo com <div id="stage"> de 1080x1920 (transforme em escala se a janela for menor). Sem scroll, sem margem.
2. Um <audio id="audio" src="${audioName}" preload="auto">.
3. Legendas palavra por palavra: destaque a palavra atual com cor de destaque e leve escala.
4. Fundo animado por CSS (gradiente em movimento, grão, vinheta, luz). Sem imagens externas, sem CDN, sem Google Fonts — apenas fontes do sistema.
5. Nada de Date.now() nem requestAnimationFrame para o estado visual: o estado é função do tempo.
6. Exponha:
   window.__STUDIO__ = {
     duration: <número>,
     ready: true,
     setTime(t) { /* recebe segundos (0..duration) e desenha o estado exato daquele instante */ },
     play() { document.getElementById('audio').currentTime = 0; document.getElementById('audio').play(); }
   }
   setTime deve funcionar sem o áudio tocar (usado para captura quadro a quadro).
7. setTime também posiciona o áudio: document.getElementById('audio').currentTime = t (envolva em try/catch).
8. Transições entre cenas conforme a direção (zoom, flash, deslize). Elementos decorativos: linhas, barra de progresso, número grande quando indicado.
9. Sem texto de placeholder. Todo texto visível vem das legendas.
10. Não use bibliotecas. HTML+CSS+JS puro.

# QUALIDADE
Visual premium: contraste alto, sombra/outline forte na legenda, margem de segurança de 180px no topo e 320px embaixo, tipografia gigante (90-140px) com no máximo 4 palavras por linha.

Responda APENAS com o HTML completo, começando em <!DOCTYPE html>. Sem explicações, sem markdown.`
}

export function promptDirecionadorBusca({ objetivo, tipo, channelFilter = "all" }) {
  const filterNote =
    tipo === "channel" && channelFilter === "monetized"
      ? "Foque especificamente em canais que JÁ BATERAM as metas do YouTube (1.000+ inscritos, consistentes e monetizáveis)."
      : tipo === "channel" && channelFilter === "entry"
        ? "Foque em canais com 500+ inscritos que já atingiram a meta inicial do YPP."
        : tipo === "channel" && channelFilter === "growing"
          ? "Foque em canais em aceleração (500 a 50.000 inscritos)."
          : ""
  return `Você é o Direcionador Estratégico do canal de YouTube Shorts @fatonexocuri (FatoNexo: curiosidades verificáveis, ciência visual, objetos e mecanismos, histórias reais).
O criador pediu no painel: "${objetivo}"
Tipo de busca desejada: ${tipo === "channel" ? "canais com potencial de viralizar" : "vídeos/Shorts virais para modelar"}.
${filterNote}

Gere de 2 a 3 termos curtos de busca em português para pesquisar diretamente no YouTube (sem operadores complexos) e encontrar ${tipo === "channel" ? "canais de curiosidades/fatos em crescimento" : "Shorts de curiosidades/fatos com alto potencial"}.

Responda APENAS com JSON válido, sem markdown:
{
  "queries": ["termo 1", "termo 2", "termo 3"],
  "criterio": "1 frase explicando o que observar nos resultados para identificar potencial viral"
}`
}

export function promptDirecionadorAvaliar({ objetivo, tipo, resultados, canalInfo }) {
  const resumoCanal = canalInfo
    ? `Canal @fatonexocuri: ${canalInfo.subscribers ?? "?"} inscritos, ${canalInfo.videosCount ?? "?"} vídeos, média recente de ${canalInfo.stats?.avgViews ?? "?"} views/Short.`
    : "Canal @fatonexocuri (em crescimento inicial)."
  return `Você é o Direcionador Estratégico do canal @fatonexocuri (FatoNexo).
${resumoCanal}
Pedido do criador: "${objetivo}" (busca de ${tipo === "channel" ? "canais" : "Shorts"}).

Resultados reais encontrados no YouTube:
${JSON.stringify(resultados.slice(0, 15), null, 2)}

Analise esses resultados reais e indique quais têm maior potencial para o @fatonexocuri modelar ou acompanhar. Não invente números que não estejam acima.

Responda APENAS com JSON válido, sem markdown:
{
  "resumo": "diagnóstico direto em 2-3 frases sobre o que esses resultados mostram",
  "destaques": [
    { "id": "id exato do resultado", "motivo": "por que vale observar/modelar em 1 frase", "acao": "o que testar no FatoNexo" }
  ],
  "proximas_buscas": ["sugestão de busca 1", "sugestão de busca 2"]
}`
}

export function promptAnalisarVideo({ video, transcricaoManual }) {
  const textoBase = (transcricaoManual || video.transcript || "").trim()
  return `Você é o Direcionador Estratégico de YouTube Shorts do canal @fatonexocuri (FatoNexo).
Analise o vídeo abaixo para extrair o roteiro, a estrutura (Promessa, Contexto, Entrega) e as estratégias usadas.
Se não houver transcrição completa, deixe claro que a análise foi feita pelos metadados (título/descrição) e NÃO invente falas que não estejam no texto.

# DADOS DO VÍDEO
Título: ${video.title}
Canal: ${video.channel} (${video.channelSubscribersText || "inscritos não informados"})
Views: ${video.views ?? "não informado"} | Duração: ${video.durationSeconds ?? "?"}s | Publicado: ${video.publishDate || "?"}
Keywords: ${(video.keywords || []).join(", ") || "nenhuma"}
Descrição: ${(video.description || "").slice(0, 1200)}
Transcrição disponível: ${textoBase ? textoBase.slice(0, 8000) : "(não disponível automaticamente no YouTube)"}

Responda APENAS com JSON válido, sem markdown:
{
  "tem_transcricao": ${Boolean(textoBase)},
  "promessa": "qual promessa/gancho o vídeo faz nos primeiros 3 segundos",
  "contexto": "como ele dá contexto rápido sem enrolar",
  "entrega": "como ele entrega a resposta/prova/revelação",
  "estrategias": ["estratégia 1", "estratégia 2", "estratégia 3"],
  "por_que_retencao": "explicação curta de por que esse formato prende atenção",
  "adaptacao_fatonexo": {
    "titulo": "título sugerido para o FatoNexo (máx 60 chars)",
    "pauta": "pergunta central do vídeo",
    "promessa": "promessa adaptada (0-3s)",
    "contexto": "contexto adaptado",
    "entrega": "entrega adaptada"
  }
}`
}

export function promptRoteiroValidado({ pauta, promessa, contexto, entrega, referencia, duracao, tom }) {
  return `${SYSTEM_PT}

# TAREFA
Criar um roteiro VALIDADO para o canal @fatonexocuri (FatoNexo), estruturado estritamente em Promessa, Contexto e Entrega.
Pauta/Tema: ${pauta}
${promessa ? `Promessa base: ${promessa}` : ""}
${contexto ? `Contexto base: ${contexto}` : ""}
${entrega ? `Entrega base: ${entrega}` : ""}
${referencia ? `Referência estudada: ${referencia}` : ""}
Tom: ${tom || "curiosidade direta + revelação comprovável"}
Duração alvo: ${duracao || 45} segundos (~2,6 palavras/segundo).

# REGRAS
1. Promessa (0-3s): comece direto na pergunta/afirmação que gera curiosidade imediata. Sem "oi galera" ou enrolação.
2. Contexto (3-15s): apenas o mínimo necessário para a promessa fazer sentido, com pistas concretas.
3. Entrega (15-${duracao || 45}s): entregue a resposta real, mecanismo ou prova prometida. Não enrole.
4. Nunca invente números ou fatos sem fonte; liste afirmações que exigem checagem em pontos_a_checar.

Responda APENAS com JSON válido, sem markdown:
{
  "titulo": "título curto (máx 60 chars)",
  "promessa": "frase da promessa (0-3s)",
  "contexto": "resumo do contexto",
  "entrega": "resumo da entrega",
  "cta": "chamada final curta após a entrega",
  "roteiro": "texto corrido completo pronto para narrar em voz alta",
  "pontos_a_checar": ["ponto 1 para verificar antes de publicar"],
  "cenas": [
    { "parte": "promessa|contexto|entrega|cta", "texto": "frase exata", "duracao": 3.5 }
  ]
}`
}

export function promptDirecionadorChat({ pergunta, canalInfo }) {
  const resumo = canalInfo
    ? `Canal @fatonexocuri: ${canalInfo.subscribers ?? "?"} inscritos, ${canalInfo.videosCount ?? "?"} vídeos, média recente de ${canalInfo.stats?.avgViews ?? "?"} views/Short. Últimos títulos: ${(canalInfo.recentShorts || []).slice(0, 6).map((s) => `${s.title} (${s.views ?? "?"} views)`).join(" | ")}`
    : "Canal @fatonexocuri"
  return `Você é o Direcionador Estratégico do canal @fatonexocuri (FatoNexo) usando MiMo-V2.6-Flash.
Dados reais atuais do canal:
${resumo}

Pergunta/direcionamento do criador:
"${pergunta}"

Responda em português do Brasil, de forma objetiva, prática e acionável (máximo 10 linhas ou tópicos curtos), sem inventar métricas que não estejam acima.`
}
