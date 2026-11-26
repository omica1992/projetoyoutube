// Gerado por scripts/bundle-kit-guide.mjs. Não edite à mão.
// Fonte: kit-video-3d WillianIA (catalog/RESUMO.md, docs/processos.md, docs/storyboard.md).

export const KIT_GUIDE = {
  "resumo": "# Resumo do catálogo\n\n> Leia este arquivo primeiro (é curto). Detalhes de parâmetros, alturas de piso e exemplos: `CATALOG.md`. Gerado por `npm run catalog`.\n> Convenções: metros; `giro: 0` olha para +Z; adulto = 1.72 m; asfalto y=0.06, calçada y=0.20.\n\n## Motor: o que o storyboard sabe fazer (detalhes em docs/storyboard.md e docs/processos.md)\n- **Fundos reais (sempre um):** campo, cidade, floresta, deserto, litoral, industrial, interior. Chão: grama, terra, areia, concreto, asfalto, madeira, piso. Clima: limpo, chuva. Horário: dia, tarde, nublado.\n- **fluxos** (partículas do processo), materiais: pedra, brita, areia, terra, concreto, asfalto, agua, fumaca, vapor, poeira, ar, bolha, neve, eletricidade, luz, fagulha, fogo. Origem/destino por ponto ou `ancora`; `caminho` para canos/fios.\n- **rastros** (faixa atrás de máquina), **anim** (pos/giro/gira/escala/oscila/pulsa), **opacidade**, **etapa**, **aparece/some**, **movimentos**, **viraPara**.\n- **elementos** (seta, icone, etiqueta), **efeitos** (pretoebranco, zoom, tremor) e **textos** (titulo, destaque, pergunta).\n\n## Personagens (`preset`)\n- `construtor` (1.72 m): Protagonista / narrador\n- `engenheiro` (1.75 m): Especialista técnico\n- `engenheira` (1.65 m): Especialista técnica / supervisora de obra\n- `servente` (1.72 m): Ajudante de obra\n- `homem` (1.72 m): Morador / pessoa comum (dono da casa, passante, curioso fazendo a pergunta do vídeo)\n- `mulher` (1.63 m): Moradora / pessoa comum (vizinha, mãe, passageira)\n- `velhinho` (1.62 m): Idoso curioso ou sábio\n- `velhinha` (1.55 m): Idosa curiosa ou sábia\n- `crianca` (1.1 m): Criança curiosa (menino)\n- `menina` (1.07 m): Criança curiosa (menina)\n- `motorista` (1.72 m): Motorista (carro, ônibus, caminhão, metrô)\nOpções em `overrides`: skin, height, build, headScale, top{color,stripe,sleeves}, bottom{color,type}, shoes, hair{style,color}, hat{type,color}, face{glasses,mustache,beard}, held{R,L}, stoop.\nCabelos: bald, short, fringe, long, ponytail, bun, curly, sides. Chapéus: none, hardhat, cap. Itens: none, hammer, clipboard, shovel.\n\n## Animações (`clip` e `params`)\n- `idle` (loop, torso/head/arms/legs): Em pé parado, respirando e balançando de leve\n- `walk` (loop, torso/head/arms/legs): Andar em linha reta [desloca 0.943 m/s]\n- `run` (loop, torso/head/arms/legs): Correr [desloca 2.781 m/s]\n- `wave` (loop, armR/head/face) params: side=\"R\": Acenar com a mão (cumprimento)\n- `point` (segura a pose, armR/head) params: side=\"R\", dir=\"forward\": Apontar com o braço para mostrar algo\n- `talk` (loop, armR/armL/head/face/torso) params: mouthOpen=null, energy=1: Falar gesticulando: mão direita e esquerda acompanham a fala, cabeça mexe, boca abre e fecha\n- `hammer` (loop, armR/armL/torso/head/legs) params: side=\"R\": Martelar (bater prego, construir)\n- `carry` (loop, torso/head/arms/legs) params: walking=1: Carregar uma caixa/saco com os dois braços à frente [desloca 0.943 m/s]\n- `push` (loop, torso/head/arms/legs): Empurrar algo pesado à frente (carrinho de mão, parede, porta), inclinado e com passos curtos [desloca 0.597 m/s]\n- `dig` (loop, torso/head/arms/legs): Cavar com a pá (use o item \"shovel\")\n- `cheer` (loop, torso/head/arms/legs/face): Comemorar pulando com os braços para cima (sucesso, \"funcionou!\", final do vídeo)\n- `surprised` (segura a pose, torso/head/arms/face): Susto/surpresa: recua o corpo, abre os braços, olhos e boca arregalados\n- `think` (loop, torso/head/arms/face): Pensar: mão no queixo, cabeça inclinada, olhando para cima\n- `look_around` (loop, head/torso/face): Olhar ao redor, virando a cabeça e o corpo devagar para os lados\n- `nod` (segura a pose, head/face): Balançar a cabeça dizendo \"sim\"\n- `shake_head` (segura a pose, head/face): Balançar a cabeça dizendo \"não\"\n- `shrug` (segura a pose, arms/head/torso/face): Dar de ombros (\"não sei\" / \"talvez\"): braços abertos e cabeça inclinada\n- `crouch` (segura a pose, torso/head/arms/legs): Agachar para olhar/mexer em algo no chão (inspecionar fundação, fiação, encanamento)\n- `sit` (segura a pose, torso/head/arms/legs) params: seatHeight=0.34, arms=\"lap\": Sentar (cadeira, banco, banco do carro)\n- `read_clipboard` (loop, arms/head/torso/face): Ler/anotar na prancheta (use com engenheiro, que já tem prancheta na mão esquerda)\nExpressões: neutral, happy, laugh, sad, angry, surprised, worried, thinking, sleepy. Máscaras: torso, head, face, armL, armR, arms, legs, legL, legR.\n\n## Cenário (`asset`, `variante`, `params`)\n### Casas\n- `casa_simples` 6.8×8.3×5.2 m variantes: verde, azul, amarela | params: wall=\"#f2e2bf\", roof=\"#d2693a\", door=\"#7a4a2b\", trim=\"#ffffff\", chimney=true: Casa térrea de telhado de duas águas, porta central, duas janelas na frente e chaminé\n- `casa_colonial` 10×9.8×5.3 m variantes: rosa, azul | params: wall=\"#f6edd2\", roof=\"#c8593a\", shutter=\"#3f7f5a\", trim=\"#ffffff\": Casa grande de telhado de quatro águas com varanda de colunas, portas duplas e janelas com venezianas\n- `sobrado` 7.3×9.5×7.8 m variantes: cinza, salmao | params: wall=\"#e6dcc8\", roof=\"#a8402c\", garage=\"#9aa3ad\", trim=\"#ffffff\": Casa de dois andares com garagem, porta de entrada, sacada sobre a garagem e telhado de duas águas\n- `casa_moderna` 9.5×7.7×6.3 m variantes: escura, quente | params: wall=\"#f1f1ee\", accent=\"#8f9aa5\", wood=\"#a9743f\": Casa de linhas retas: dois volumes, laje plana, janelas grandes e garagem\n\n### Prédios e pontes\n- `predio_apartamentos` 14.3×11.4×20.4 m variantes: azul, rosa, alto | params: floors=6, wall=\"#e9d8b4\", accent=\"#b9855a\", balconies=true: Prédio residencial com térreo de entrada, janelas e sacadas em cada andar, platibanda e caixa d'água\n- `arranha_ceu` 22.1×22.2×71.8 m variantes: verde, escuro, alto | params: floors=14, glass=\"#5b8fb9\", band=\"#dfe7ee\": Torre de escritórios com fachada de vidro, faixas de laje a cada andar, base (pódio), coroa e antena\n- `loja` 8.4×9.6×4.3 m variantes: padaria, mercado | params: wall=\"#f0e6d2\", awning=\"#d9473a\", sign=\"#3d6fb6\": Loja de rua com vitrine grande, porta de vidro, toldo listrado e letreiro\n- `galpao` 25×15×15.5 m variantes: azul, verde | params: wall=\"#c9cdd2\", roof=\"#6d7783\", door=\"#d9473a\": Galpão industrial de telhado metálico, portão de enrolar, janelas altas e chaminé\n- `ponte_viga` 40.5×14×5.6 m variantes: longa, baixa | params: length=24, height=4.5, river=true: Ponte de concreto sobre um rio: tabuleiro com pista, guarda-corpo, dois pilares com travessa e encontros nas pontas\n\n### Em construção (animáveis)\n- `casa_obra` 6.8×7.9×5 m variantes: fundacao, paredes, madeiramento | params: progress=1, brick=\"#b8573b\", tile=\"#d2693a\" | ETAPAS (etapa): Casa sendo construída: setProgress(p) mostra fundação (0–0.12), pilares (–0.25), paredes de tijolo (–0.55), laje (–0.65), madeiramento (–0.82) e telhas (–1)\n- `predio_estrutura` 16.2×11.2×26.4 m variantes: baixo, meio | params: floors=8, progress=1, concrete=\"#b9b9b4\" | ETAPAS (etapa): Esqueleto de concreto (pilares e lajes) subindo andar por andar: setProgress(p) constrói de 0 a todos os andares\n- `rua_camadas` 8×8×1.4 m variantes: subleito, quase | params: progress=1 | ETAPAS (etapa): Bloco em corte mostrando as camadas de uma rua: solo compactado, sub-base de brita, base, asfalto base e capa de rolamento (+ faixa)\n- `corte_terreno` 8×6×2.4 m variantes: so_rocha | params: progress=1 | ETAPAS (etapa): Bloco de solo em corte com grama, terra, argila e rocha — para explicar fundações e muros de arrimo\n- `guindaste` 21×4×26.9 m variantes: baixo | params: height=22, jib=16, angle=0 | ETAPAS (etapa): Guindaste de torre com lança, contrapeso, cabo e gancho\n\n### Árvores e plantas\n- `arvore_redonda` 3.8×3.2×4.4 m variantes: clara, escura, grande, outono | params: height=5, leaf=\"#5fae4e\", trunk=\"#8a5a34\", seed=1: Árvore clássica de tronco marrom e copa arredondada de várias bolas\n- `arvore_frutifera` 3.7×2.8×4.1 m variantes: laranja, limao | params: fruit=\"#e8452c\", leaf=\"#4f9d4a\", seed=2: Árvore de copa redonda com frutas (bolinhas coloridas), tipo laranjeira ou macieira\n- `arvore_pinheiro` 3×3×6.2 m variantes: clara, alta, nevada | params: height=6, leaf=\"#2f7d4a\", layers=4: Árvore em forma de cone, feita de camadas empilhadas\n- `palmeira` 4.5×4.5×7.8 m variantes: baixa, alta | params: height=7, leaf=\"#4faa52\", seed=1: Palmeira de tronco levemente curvo em gomos e folhas compridas\n- `arbusto` 1.8×1.6×1.5 m variantes: florido, claro | params: leaf=\"#4f9d4a\", flowers=false, seed=1: Moita baixa de bolas verdes, para cercas vivas e jardins\n\n### Ruas e terreno\n- `rua_reta` 11.7×20×0.2 m variantes: larga, sem_calcada, com_faixa | params: length=20, lanes=2, laneWidth=3.4, sidewalk=2.2, crosswalk=false: Trecho de rua com asfalto, faixa central, meio-fio e calçadas dos dois lados\n- `cruzamento` 27×27×0.2 m variantes: longo | params: arm=8, lanes=2: Encontro de duas ruas em cruz, com faixas de pedestre nas quatro pontas e quarteirões de calçada nos cantos\n- `chao` 20×20×0.3 m variantes: terra, areia, concreto, asfalto | params: type=\"grama\", size=20, seed=1: Placa de chão quadrada com manchas de cor: grama, terra, areia, concreto ou asfalto\n- `campo_futebol` 30×44×2.8 m variantes: pequeno | params: length=40, width=26: Gramado listrado com linhas brancas (área, círculo central) e duas traves\n\n### Veículos\n- `carro_sedan` 2.1×4.5×1.5 m variantes: azul, branco, taxi, verde | params: color=\"#d9473a\", taxi=false | rodas giram ao mover: Carro de passeio com porta-malas\n- `carro_hatch` 2.1×3.9×1.5 m variantes: vermelho, amarelo, preto | params: color=\"#3d6fb6\" | rodas giram ao mover: Carro compacto de traseira alta\n- `onibus` 2.6×10.1×3.3 m variantes: vermelho, azul, verde | params: color=\"#f2c94c\", stripe=\"#3d6fb6\" | rodas giram ao mover: Ônibus urbano com janelões, letreiro e portas\n- `caminhao_cacamba` 2.6×9.1×2.9 m variantes: amarelo, azul, levantada | params: cab=\"#f28c28\", bed=\"#7b8794\", tilt=0 | ETAPAS (etapa) | rodas giram ao mover: Caminhão basculante para terra e entulho\n- `betoneira` 2.6×9.5×4.4 m variantes: verde, azul | params: cab=\"#f2f2f2\", drum=\"#f28c28\" | gira sozinho | rodas giram ao mover: Caminhão de concreto com tambor listrado que gira (updateScenery(obj, t))\n- `rolo_compressor` 1.7×4.4×3.1 m variantes: laranja, azul | params: color=\"#f2c94c\" | rodas giram ao mover: Máquina de compactar asfalto e solo, com dois tambores de aço e cabine aberta\n- `vibroacabadora` 3.4×6×3.2 m variantes: laranja, azul | params: color=\"#f2c94c\": Máquina que espalha o asfalto quente em camada uniforme: caçamba na frente (recebe a massa do caminhão), esteiras e a régua alisadora atrás\n- `espargidor` 2.9×17.3×3.3 m variantes: jorrando, vermelho | params: cab=\"#f2f2f2\", tank=\"#2f3338\", spraying=false | ETAPAS (etapa) | rodas giram ao mover: Caminhão-tanque que espalha o ligante asfáltico líquido (imprimação e pintura de ligação)\n\n### Objetos de rua e obra\n- `cone` 0.4×0.4×0.7 m variantes: amarelo | params: color=\"#f28c28\": Cone laranja com faixa branca e base quadrada\n- `barreira` 2×0.7×1.1 m variantes: longa | params: length=2: Cavalete com tábuas listradas vermelho/branco para isolar uma área\n- `pilha_tijolos` 1.2×0.9×0.8 m variantes: baixa, clara | params: brick=\"#b8573b\", rows=6: Pilha de tijolos sobre um pallet de madeira\n- `saco_cimento` 1.3×0.4×0.4 m variantes: um, muitos | params: count=6: Pilha de sacos de cimento com etiqueta azul\n- `carrinho_mao` 0.7×2.1×0.7 m variantes: azul, vermelho | params: color=\"#f2c94c\" | rodas giram ao mover: Carrinho de obra com caçamba, uma roda e dois cabos\n- `escada` 0.6×0.7×2.4 m variantes: alta | params: height=2.4: Escada de madeira inclinada (encostada)\n- `poste_luz` 0.3×1.5×6 m variantes: baixo | params: height=6, color=\"#7b8794\": Poste de rua com braço e lâmpada acesa\n- `semaforo` 0.4×0.5×3.9 m variantes: amarelo, verde | params: state=\"vermelho\": Semáforo de poste com três luzes; escolha qual está acesa\n- `placa_pare` 1.2×0.1×2.9 m: Placa octogonal vermelha em poste\n- `banco` 1.6×0.6×1 m variantes: verde | params: color=\"#a9743f\": Banco de madeira com pés de ferro\n- `cerca` 4.1×0.1×1 m variantes: branca | params: length=4, color=\"#a9743f\": Trecho de cerca de madeira com mourões e duas travas\n- `muro` 4.1×0.3×2.3 m variantes: tijolo, cinza | params: length=4, height=2.2, color=\"#e8dcc4\": Trecho de muro de alvenaria com capeamento\n- `hidrante` 0.4×0.3×0.8 m: Hidrante vermelho de calçada\n- `lixeira` 0.6×0.7×0.9 m variantes: azul, amarela | params: color=\"#4f9d5a\": Lixeira de rua com tampa\n- `caixa_madeira` 0.9×0.9×0.8 m variantes: grande | params: size=0.8: Caixote de madeira com travessas em X\n- `bueiro` 0.9×0.6×0.1 m: Grade de escoamento de água da chuva, ao nível do asfalto junto ao meio-fio\n\n### Formas e peças livres (para montar qualquer coisa)\n- `forma` 1×1×1 m variantes: tanque, bola, lampada | params: tipo=\"caixa\", tamanho=[1,1,1], cor=\"#8a95a3\", brilho=false, emissivo=false, apoiada=true: Peça básica para montar qualquer coisa (tanque, bloco, pilar, bola, lâmpada, quadro...)\n- `tubo` 3.3×0.3×2.3 m variantes: vermelho, azul, cobre | params: pontos=[[0,0,0],[0,2,0],[3,2,0]], raio=0.15, cor=\"#9aa7b5\": Tubulação por pontos [x,y,z] (cano, fio, mangueira, veia)\n\n### Máquinas e processos animados\n- `engrenagem` 2.4×0.4×2.4 m variantes: prata, vermelha | params: dentes=12, raio=1, cor=\"#c9a227\", velocidade=60, fase=0 | gira sozinho: Engrenagem que gira sozinha (eixo para a câmera, +Z)\n- `helice` 2.5×0.4×2.4 m variantes: turbina, ventilador | params: pas=4, raio=1.2, cor=\"#e8eef5\", velocidade=360 | gira sozinho: Hélice, pá de ventilador ou turbina que gira sozinha (eixo +Z)\n- `esteira` 6.4×1.1×1.1 m variantes: subindo, graos, areia | params: comprimento=6, largura=0.9, inclinacao=0, material=\"pedra\", velocidade=1 | gira sozinho: Esteira com material andando sobre ela (pedra, areia, grão, carvão...)\n- `monte` 3.2×3.1×1 m variantes: areia, terra, grao, pequeno | params: material=\"pedra\", raio=1.6, progress=1 | ETAPAS (etapa): Pilha de pedra, areia, terra, grão, carvão ou asfalto\n- `tanque` 2.6×2.6×3.1 m variantes: agua, leite, oleo, grao | params: raio=1.2, altura=3, liquido=\"#3fa5e0\", casca=\"#cfd8e3\", nivel=0.6 | ETAPAS (etapa): Reservatório (água, leite, grão, combustível) com casca transparente e o conteúdo visível\n- `misturador` 2.8×2.8×2.3 m variantes: tinta, concreto, massa | params: raio=1.4, conteudo=\"#9a8f7a\", pas=\"#f2c94c\", velocidade=90 | gira sozinho: Tanque aberto com pás girando e o conteúdo sendo misturado (massa, tinta, concreto, comida)\n- `escavadeira` 3.6×10.2×3.9 m variantes: laranja, rapida | params: cor=\"#f2c94c\", ciclo=6, fase=0 | gira sozinho: Escavadeira que cava, gira e despeja em ciclo (update)\n- `fabrica_processo` 25.2×15×22 m variantes: graos, areia | params: material=\"pedra\", carregando=true, velocidade=1 | gira sozinho: Linha de processamento animada: 3 silos de matéria-prima, esteira subindo até um tambor rotativo aquecido (com chama), chaminé soltando fumaça e torre com bica de descarga\n",
  "processos": "# Como mostrar o PROCESSO em animação (vale para qualquer tema)\n\nO vídeo é **100% animado**. Nenhuma cena pode ser \"um objeto parado + a câmera girando + o boneco falando\". Para **qualquer** assunto (obra, cozinha, corpo humano, máquina, finanças, ciência, história), toda ideia explicada precisa **acontecer na tela**: algo entra, se move, se transforma, flui, gira, cresce, sai. O espectador deve **ver** o que a narração diz.\n\n> **Regras de ouro**\n> 1. **Nunca escreva código de renderização/animação próprio nem outro motor.** O motor do pack faz tudo; se faltar um objeto, **componha** com `forma`, `tubo`, `fluxos` e `anim` (abaixo).\n> 2. **Sempre um cenário real ao fundo** (campo, cidade, floresta, deserto, litoral, indústria ou uma sala). Nunca cor sólida, nunca \"diorama flutuando\". O validador recusa.\n> 3. **Cada cena tem pelo menos 2 tipos de animação** entre: `movimento`, `fluxo`, `transformação`, `máquina`, `ação` do personagem. Câmera e fala não contam como processo.\n> 4. **Sempre alguém fazendo**: personagens executando a ação (cavar, martelar, empurrar, apontar, carregar) em mais da metade das cenas.\n> 5. O visual é **colorido e alegre**, no estilo desenho (céu azul, nuvens, árvores, casas). Nada técnico, escuro ou \"de laboratório\".\n\n## 1. Plano de animação (obrigatório, antes do storyboard)\n\nCrie `projects/<nome>/plano-animacao.md` com **uma linha por frase** da narração (use `frases.json`):\n\n| Frase | A ideia vira... | O que se MOVE | O que FLUI | O que se TRANSFORMA | Quem FAZ | Cenário e plano |\n|---|---|---|---|---|---|---|\n| \"Então você espalha pedra britada...\" | caminhão despeja brita | caminhão recua e levanta a caçamba | brita cai da caçamba no chão | o monte cresce | servente espalha com a pá | obra, plano geral → close |\n\nSe uma linha tiver as colunas vazias, **invente a ação**: toda frase tem um jeito de ser mostrada. Cada **substantivo e verbo** da frase é uma oportunidade de animação (o que é? de onde vem? para onde vai? o que acontece depois?).\n\n## 2. Vocabulário visual: o que você quer mostrar → qual recurso usar\n\n| Quero mostrar... | Use |\n|---|---|\n| Matéria caindo/fluindo (pedra, areia, terra, concreto, grão) | `fluxos` com `material` e `origem`→`destino` |\n| Líquido sendo espirrado/despejado (asfalto, água, tinta) | `fluxos` (`asfalto`, `agua`) com `jato` |\n| Algo passando dentro de um cano, fio ou veia | `tubo` (com `opacidade: 0.4`) + `fluxos` com `caminho` igual aos pontos do tubo |\n| Calor, fogo, fumaça, vapor, faíscas, poeira | `fluxos` (`fogo`, `fumaca`, `vapor`, `fagulha`, `poeira`) |\n| Ar, bolhas, neve, eletricidade, luz | `fluxos` (`ar`, `bolha`, `neve`, `eletricidade`, `luz`) |\n| Máquina trabalhando | `escavadeira`, `esteira`, `misturador`, `engrenagem`, `helice`, `fabrica_processo`, `betoneira`, `rolo_compressor`, `vibroacabadora`, `espargidor`, `caminhao_cacamba` |\n| Algo sendo construído/acumulado | `etapa` (casa_obra, predio_estrutura, rua_camadas...), `monte` crescendo, `rastro` atrás de uma máquina |\n| Reservatório enchendo/esvaziando | `tanque` com `etapa` (nível) |\n| Ver por dentro | `opacidade`, `tanque`, `rua_camadas`, `corte_terreno` |\n| Uma peça girando/balançando/subindo | `anim` (`gira`, `oscila`, `pos`, `escala`, `pulsa`) em qualquer objeto |\n| Algo aparecendo/sumindo | `aparece` / `some` |\n| Qualquer objeto que não existe no catálogo | `forma` (caixa, cilindro, esfera, cone, toro, cápsula) empilhadas, com cor/`brilho`/`emissivo` |\n| Certo × errado, antes × depois | dois objetos lado a lado + ícones `x`/`v` + `pretoebranco` no ruim |\n| Pessoas fazendo | personagens com `acoes` (`dig`, `hammer`, `push`, `carry`, `point`, `crouch`...) e `movimentos` |\n\n### Qual fundo usar (`ambiente.fundo`)\n\n| Tema | `fundo` (e `chao` padrão) |\n|---|---|\n| rua, casa, obra urbana, trânsito, comércio | `cidade` (concreto) ou `campo` (grama) |\n| natureza, agricultura, terraplenagem, rodovia | `campo` (grama) ou `floresta` |\n| cozinha, banheiro, geladeira, laboratório, eletrodoméstico | `interior` (madeira) |\n| fábrica, usina, mineração, siderurgia | `industrial` (concreto) |\n| praia, porto, mar, navio | `litoral` (areia) |\n| deserto, pirâmides, história antiga | `deserto` (areia) |\n\nDica: dentro de uma **sala** (`interior`) ou fábrica, o objeto principal costuma ficar no centro com `anim` e `fluxos`.\n\n## 3. Receitas (copie e adapte; coordenadas em metros)\n\n**Caminhão despejando pedra e o monte crescendo**\n```json\n\"objetos\": [\n  { \"id\": \"cam\", \"asset\": \"caminhao_cacamba\", \"pos\": [0,0,0], \"giro\": 90, \"etapa\": [[27,0],[29.6,1]] },\n  { \"id\": \"monte\", \"asset\": \"monte\", \"params\": { \"material\": \"pedra\" }, \"pos\": [-5.5,0,0], \"etapa\": [[27.5,0.05],[31,1]] }\n],\n\"fluxos\": [{ \"material\": \"pedra\", \"origem\": { \"ancora\": \"cam\", \"desloca\": [0,1.6,-4.6] }, \"destino\": { \"ancora\": \"monte\", \"desloca\": [0,1.2,0] }, \"taxa\": 45, \"de\": 28, \"ate\": 30.5 }]\n```\n\n**Espargidor espirrando líquido preto (e deixando a faixa molhada)**\n```json\n\"objetos\": [{ \"id\": \"esp\", \"asset\": \"espargidor\", \"pos\": [0,0,-14], \"movimentos\": [{ \"de\": 47, \"ate\": 51, \"para\": [0,10] }] }],\n\"fluxos\": [{ \"material\": \"asfalto\", \"origem\": { \"ancora\": \"esp\", \"desloca\": [0,0.6,-5.1] }, \"destino\": { \"ancora\": \"esp\", \"desloca\": [0,0.02,-6.5] }, \"taxa\": 60, \"dispersao\": 1.3, \"de\": 47, \"ate\": 51 }],\n\"rastros\": [{ \"seguir\": \"esp\", \"largura\": 2.9, \"cor\": \"#15161a\", \"recuo\": 6, \"de\": 47, \"ate\": 51 }]\n```\n\n**Vibroacabadora pavimentando (faixa nova crescendo + vapor)**\n```json\n\"objetos\": [\n  { \"id\": \"pav\", \"asset\": \"vibroacabadora\", \"pos\": [0,0,-8], \"movimentos\": [{ \"de\": 78, \"ate\": 84, \"para\": [0,6] }] },\n  { \"id\": \"cam\", \"asset\": \"caminhao_cacamba\", \"pos\": [0,0,0.2], \"movimentos\": [{ \"de\": 78, \"ate\": 84, \"para\": [0,14.2] }] }\n],\n\"rastros\": [{ \"seguir\": \"pav\", \"largura\": 3.2, \"altura\": 0.07, \"cor\": \"#222226\", \"recuo\": 2.6 }],\n\"fluxos\": [\n  { \"material\": \"vapor\", \"origem\": { \"ancora\": \"pav\", \"desloca\": [0,0.2,-3.2] }, \"taxa\": 14 },\n  { \"material\": \"asfalto\", \"origem\": { \"ancora\": \"cam\", \"desloca\": [0,1.8,-5.2] }, \"destino\": { \"ancora\": \"pav\", \"desloca\": [0,1.3,2.4] }, \"taxa\": 35 }\n]\n```\n\n**Água correndo por um cano até a torneira**\n```json\n\"objetos\": [\n  { \"id\": \"cano\", \"asset\": \"tubo\", \"pos\": [0,0,0], \"opacidade\": 0.4, \"params\": { \"pontos\": [[0,5,0],[0,1.2,0],[4,1.2,0],[4,1.2,2]], \"raio\": 0.18, \"cor\": \"#3d8ee0\" } }\n],\n\"fluxos\": [{ \"material\": \"agua\", \"caminho\": [[0,5,0],[0,1.2,0],[4,1.2,0],[4,1.2,2]], \"taxa\": 30, \"velocidade\": 3 }]\n```\n\n**Engrenagens se movendo juntas** (duas `engrenagem`, uma com `velocidade` negativa e `fase` diferente) · **Peça subindo e descendo** (`\"anim\": { \"oscila\": { \"eixo\": \"y\", \"amp\": 0.6, \"freq\": 0.5 } }`) · **Chama aquecendo** (`fluxos` `fogo` + `fumaca` na origem da panela/caldeira).\n\n**Escavadeira cavando e o monte de terra aumentando:** `escavadeira` (cava sozinha em ciclo; despeja à direita, +X) + `monte` (`material: terra`) à direita com `etapa` crescente + `fluxos` `poeira` na caçamba.\n\n**Fábrica/usina:** `fabrica_processo` (esteiras, tambor com chama, chaminé com fumaça e bica de carga, tudo animado) com um caminhão em [9.5, 0, 3.6]. Câmera em planos diferentes: geral, close na esteira, close na chaminé.\n\n## 4. Ritmo visual por cena (3–5 s)\n\n1. **Entra** (aparece, chega, cai) → 2. **acontece** (processo com fluxo/máquina/ação) → 3. **resultado** (etapa concluída, etiqueta com o nome do termo novo). Troque o ângulo a cada corte: plano geral para situar, **close no detalhe do processo**, vista em corte/transparente para o \"por dentro\".\n\n## 5. Verificação\n\n`node tools/validar.mjs projects/<nome>` calcula a densidade de animação de cada cena e **bloqueia** cenas paradas e fundos inválidos. Depois olhe os quadros (`--quadros`): se uma cena \"parece uma foto\", ela está errada: acrescente fluxo, movimento ou ação.\n",
  "storyboard": "# Referência do `storyboard.json`\n\nO storyboard é o **roteiro de cenas** do vídeo: um arquivo JSON em `projects/<nome>/storyboard.json`. O motor (`engine/`) lê esse arquivo e desenha cada quadro; você **não escreve código**, só descreve o que aparece e quando. Valide sempre com `node tools/validar.mjs projects/<nome>` antes de renderizar.\n\nTodos os tempos são em **segundos desde o início do vídeo** (não desde o início da cena).\n\n## Estrutura geral\n\n```json\n{\n  \"versao\": 1,\n  \"titulo\": \"Como uma casa fica de pé\",\n  \"formato\": { \"largura\": 1080, \"altura\": 1920, \"fps\": 30 },\n  \"duracao\": 32.5,\n  \"audio\": \"narracao.wav\",\n  \"palavras\": \"palavras.json\",\n  \"legendas\": { \"ativo\": true, \"palavrasPorBloco\": 3, \"corDestaque\": \"#ffd60a\" },\n  \"ambiente\": { \"horario\": \"dia\", \"chao\": \"grama\", \"nuvens\": true },\n  \"cenas\": [ ... ]\n}\n```\n\n| Campo | Valores |\n|---|---|\n| `duracao` | segundos; use a duração do áudio + 0,3 a 1 s de folga (`voz.json` e `frases.json` ajudam) |\n| `audio` / `palavras` | nomes dos arquivos gerados por `node tools/voz.mjs gerar` (ficam na pasta do projeto) |\n| `legendas` | padrão: **uma palavra por vez**, branca com contorno preto, pequena, no terço inferior (como nos Shorts de referência). Opções: `palavrasPorBloco` (1 a 3), `maiusculas` (false), `corDestaque` (cor da palavra falada; padrão branca), `posicaoY` (0.68), `tamanho` (1) |\n| `ambiente.horario` | `dia`, `tarde`, `nublado` |\n| `ambiente.chao` | `grama`, `terra`, `areia`, `concreto`, `asfalto`, `madeira`, `piso` (padrão pelo `fundo`; não existe chão vazio) |\n| `ambiente.clima` | `limpo` (padrão) ou `chuva` (céu escuro, riscos de chuva e menos luz) |\n| `ambiente.fundo` | **sempre existe um cenário de fundo** (nunca cor sólida): `campo` (padrão: colinas com pinheiros), `cidade` (prédios com janelas), `floresta`, `deserto`, `litoral`, `industrial`, `interior` (sala). Veja a tabela de escolha em `docs/processos.md` |\n| `ambiente.decoracao` | `false` desliga os tufos de grama e flores (já ficam desligados em cenas com `rua_reta`/`cruzamento`) |\n| `qualidade` | `alta` (padrão: sombra suave, oclusão de luz, brilho e correção de cor) ou `basica` (mais rápida, sem pós-processamento) |\n\nAs **cenas** devem cobrir o vídeo inteiro sem buracos: a primeira começa em `0`, cada uma começa onde a anterior termina e a última termina em `duracao`. Cada cena pode repetir `ambiente` para mudar o horário/chão só nela.\n\n## Cena\n\n```json\n{\n  \"inicio\": 0, \"fim\": 5.6,\n  \"transicao\": \"flash\",\n  \"objetos\":     [ ... ],\n  \"personagens\": [ ... ],\n  \"camera\":      { ... },\n  \"textos\":      [ ... ]\n}\n```\n\n`transicao` (opcional, vale no início da cena): `corte` (padrão), `flash` (clarão branco rápido), `fade` (vem do preto). Use `flash` em cortes de capítulo.\n\n**Cada cena é montada do zero**: o que não estiver listado nela não aparece. Para manter a continuidade (a mesma casa, as mesmas árvores), repita o objeto com o mesmo `asset`, `pos` e `params`.\n\n### Sistema de coordenadas\n\n- Metros. `x` para a direita, `y` para cima, `z` para perto da câmera padrão. O chão é `y = 0`.\n- Assets e personagens olham para `+Z` quando `giro = 0`. `giro` é em graus (positivo gira para a esquerda do personagem).\n- `pos` é `[x, z]` (no chão) ou `[x, y, z]` (ex.: em cima da calçada: `y = 0.2`; sobre o asfalto: `y = 0.06`).\n- Um quarteirão típico: casas a ~8 m umas das outras; personagens a ~2–4 m da fachada.\n\n### Objetos (cenário)\n\n```json\n{ \"id\": \"casa\", \"asset\": \"casa_obra\", \"pos\": [0, 0, 0], \"giro\": 0, \"escala\": 1,\n  \"variante\": \"verde\", \"params\": { \"progress\": 1 },\n  \"etapa\": [[8.3, 0], [13, 0.1]],\n  \"aparece\": 6.2, \"some\": 12,\n  \"movimentos\": [{ \"de\": 2, \"ate\": 6, \"para\": [10, 0] }] }\n```\n\n| Campo | O que faz |\n|---|---|\n| `id` | nome único **na cena** (a câmera e os personagens referenciam por ele) |\n| `asset`, `variante`, `params` | do catálogo (`catalog/RESUMO.md`) |\n| `escala` | multiplica o tamanho (use com moderação) |\n| `etapa` | `[[tempo, 0..1], ...]`: etapa de obra, só nos assets \"etapas\" (`casa_obra`, `predio_estrutura`, `rua_camadas`, `corte_terreno`, `guindaste`, `caminhao_cacamba`) |\n| `aparece` / `some` | o objeto surge com um \"pop\" no instante dado / desaparece. Ótimo para revelar um item junto da fala |\n| `movimentos` | desloca o objeto em linha reta de `de` a `ate` até `para: [x, z]`; vira na direção do movimento; as rodas dos veículos giram sozinhas |\n\n### Personagens\n\n```json\n{ \"id\": \"guia\", \"preset\": \"construtor\", \"pos\": [0, 0, 2], \"giro\": 0,\n  \"overrides\": { \"top\": { \"color\": \"#2d9cdb\" } },\n  \"viraPara\": [{ \"em\": 5.6, \"alvo\": \"camera\" }],\n  \"movimentos\": [{ \"de\": 6, \"ate\": 9, \"para\": [4, 2], \"clip\": \"walk\" }],\n  \"acoes\": [\n    { \"clip\": \"point\", \"de\": 6.3, \"ate\": 8.3, \"params\": { \"dir\": \"down\" } },\n    { \"clip\": \"talk\", \"de\": 5.6, \"ate\": 8.3, \"fala\": true, \"camada\": 1, \"mascara\": [\"head\", \"face\", \"armL\"] }\n  ] }\n```\n\n| Campo | O que faz |\n|---|---|\n| `preset` | um dos personagens do catálogo; `overrides` muda cores/chapéu/etc. (mesmos campos de `makePreset`) |\n| `viraPara` | `[{ \"em\": t, \"alvo\": \"camera\" \\| \"<id>\" \\| [x, z] \\| ângulo_em_graus }]`: o personagem gira suavemente para o alvo no instante `em`. **Use `camera` em quem fala para o público.** |\n| `movimentos` | andar/correr em linha reta: `{ de, ate, para: [x, z], clip: \"walk\" \\| \"run\" \\| \"push\" \\| \"carry\", velocidade }`. O motor ajusta a velocidade da passada para os pés não patinarem e vira o personagem na direção do movimento |\n| `acoes` | animações: `{ clip, de, ate, params, expressao, velocidade, mascara, camada, fala }` |\n| `acoes[].fala` | só com `clip: \"talk\"`: a boca abre e fecha **no ritmo das palavras da narração** (use no personagem que \"está falando\") |\n| `acoes[].camada` | `0` = corpo base (padrão). `1` ou mais sobrepõem só as partes da `mascara` (ex.: falar com a cabeça e uma mão enquanto o corpo faz outra coisa) |\n| `acoes[].mascara` | grupos: `head`, `face`, `arms`, `armL`, `armR`, `legs`, `torso` |\n| `acoes[].expressao` | `neutral`, `happy`, `laugh`, `sad`, `angry`, `surprised`, `worried`, `thinking`, `sleepy` |\n\nSem nenhuma ação num trecho, o personagem fica em `idle` (respirando). As animações disponíveis e seus parâmetros estão em `catalog/RESUMO.md`.\n\n### Câmera\n\nTrês tipos:\n\n**`enquadrar`** (o mais usado): a câmera se posiciona sozinha para enquadrar um objeto ou personagem.\n\n```json\n{ \"tipo\": \"enquadrar\", \"alvo\": \"casa\", \"plano\": \"geral\",\n  \"angulo\": 25, \"elevacao\": 14, \"deriva\": -18, \"aproxima\": 0.8, \"fov\": 38 }\n```\n\n| Campo | Significado |\n|---|---|\n| `alvo` | `id` de um objeto ou personagem da cena |\n| `plano` | `geral` (mostra tudo), `medio` (cintura para cima / metade do objeto), `close` (rosto / detalhe), `topo` (de cima) |\n| `angulo` | graus ao redor do alvo, **contados a partir da frente do alvo** (`giro`): `0` = de frente, `90` = lado, `180` = de costas |\n| `elevacao` | graus de altura da câmera (0 = na altura do alvo; 40 = de cima) |\n| `deriva` | quantos graus a câmera **gira em volta** do alvo durante a cena (movimento orbital suave) |\n| `aproxima` | `0.8` = termina a cena 20% mais perto (dolly-in); `1.2` = afasta |\n\n> **Cuidado com o `giro` do alvo.** Como `angulo: 0` é \"de frente para o alvo\", um personagem com `giro: 180` (olhando para a casa) fará a câmera ficar entre ele e a casa, possivelmente dentro da parede (tela cinza ou escura). Para mostrar um personagem de frente com o cenário atrás dele, use `giro: 0` e ponha-o à frente da casa (`z` maior que a casa). **Sempre confira com `node tools/render.mjs projects/<nome> --quadros`.**\n\n**`fixa`**: posição escolhida por você.\n\n```json\n{ \"tipo\": \"fixa\", \"pos\": [10, 4, 12], \"olha\": \"casa\", \"fov\": 40 }\n```\n\n**`travelling`**: a câmera vai de um ponto a outro durante a cena.\n\n```json\n{ \"tipo\": \"travelling\",\n  \"de\":   { \"pos\": [12, 3, 14], \"olha\": [0, 2, 0] },\n  \"para\": { \"pos\": [4, 2, 8],  \"olha\": \"casa\" } }\n```\n\n### Textos na tela\n\n```json\n{ \"texto\": \"POR QUE ELA NÃO AFUNDA?\", \"de\": 0.2, \"ate\": 5.3, \"estilo\": \"titulo\" }\n```\n\n| `estilo` | Onde | Para quê |\n|---|---|---|\n| `titulo` | alto (6–14%), pequeno | a pergunta/gancho dos primeiros segundos |\n| `destaque` | 16–24%, amarelo, levemente inclinado | uma ideia-chave (até ~30 caracteres) |\n| `pergunta` | 10–22%, painel amarelo | **a pergunta final** para comentar |\n| `rodape` | ~74% | informação curta (fonte, \"parte 2\") |\n\n**Use poucos textos**: o gancho no começo, no máximo uma ou duas ideias-chave e a pergunta final. A legenda já mostra o que é falado; o texto de destaque deve **acrescentar** (um número, um rótulo, uma provocação), nunca repetir. Quando há título/destaque na tela, a legenda desce um pouco sozinha.\n\n### Mostrar o processo: fluxos, rastros, animação livre e transparência\n\nReceitas prontas e o vocabulário completo estão em **`docs/processos.md`**. Aqui, o formato:\n\n**`fluxos`** (partículas que mostram matéria/energia em movimento) — dentro da cena:\n```json\n\"fluxos\": [{ \"material\": \"pedra\", \"origem\": { \"ancora\": \"cam\", \"desloca\": [0,1.6,-4.6] }, \"destino\": [-5,0.5,0],\n             \"taxa\": 45, \"de\": 28, \"ate\": 30.5, \"dispersao\": 0.3, \"espalha\": 0.6 }]\n```\n- `material`: `pedra`, `brita`, `areia`, `terra`, `concreto`, `asfalto`, `agua`, `fumaca`, `vapor`, `poeira`, `fogo`, `fagulha`, `ar`, `bolha`, `neve`, `eletricidade`, `luz`.\n- `origem`/`destino`: `[x,y,z]` no mundo **ou** `{ \"ancora\": \"id\", \"desloca\": [dx,dy,dz] }` (segue o objeto/personagem e gira junto com ele; `desloca` é relativo ao centro da base do objeto).\n- `caminho`: lista de pontos `[x,y,z]` (no lugar de origem/destino) para o fluxo **percorrer um cano, fio ou veia**; `velocidade` em m/s.\n- Opcionais: `taxa` (partículas/s), `tamanho`, `dispersao` (espalhamento na origem), `espalha` (no destino), `vida` (s), `arco` (curva do jato), `subida`/`vento` (fumaça, vapor).\n- Fumaça, vapor, poeira e fogo **sobem** da origem; sólidos e líquidos **caem/jorram** até o destino.\n\n**`rastros`** — faixa que cresce atrás de uma máquina que se move (asfalto novo, trilha molhada, linha pintada):\n```json\n\"rastros\": [{ \"seguir\": \"pav\", \"largura\": 3.2, \"altura\": 0.07, \"cor\": \"#222226\", \"recuo\": 2.6, \"de\": 78, \"ate\": 84 }]\n```\nO objeto seguido precisa ter `movimentos` (a faixa vai do ponto inicial até onde ele chegou, menos `recuo`).\n\n**`anim`** (em qualquer objeto) — animação livre, sempre em função do tempo:\n```json\n\"anim\": { \"pos\": [[0,[0,3,0]],[4,[0,0.5,0]]], \"gira\": 90, \"eixo\": \"z\", \"oscila\": { \"eixo\": \"y\", \"amp\": 0.4, \"freq\": 0.5 }, \"escala\": [[0,1],[3,1.4]], \"pulsa\": 0.05 }\n```\n`pos` (keyframes `[tempo,[x,y,z]]`, suaves), `giro` (keyframes em graus), `gira` (graus/s contínuo), `eixo` (`x`,`y`,`z` do giro), `escala` (keyframes), `oscila`, `pulsa`.\n\n**`opacidade`** (0 a 1, em qualquer objeto) — deixa transparente para ver por dentro (tubos, máquinas, tanques).\n\n**Assets que se mexem sozinhos** (tocam em qualquer cena sem configurar nada): `escavadeira`, `esteira`, `misturador`, `engrenagem`, `helice`, `fabrica_processo`, `betoneira`. **Assets com nível/crescimento** (`etapa`): `monte`, `tanque`, `casa_obra`, `predio_estrutura`, `rua_camadas`, `corte_terreno`, `guindaste`, `caminhao_cacamba`.\n\n### Elementos opcionais: setas, ícones e etiquetas\n\nSó use **quando o vídeo exigir** (mostrar direção ou força, contrastar certo/errado, destacar um dado). Em excesso, poluem.\n\n```json\n\"elementos\": [\n  { \"tipo\": \"seta\",     \"direcao\": \"baixo\", \"ancora\": \"casa\", \"alturaRel\": 0.55, \"tamanho\": 0.2, \"pulsa\": true, \"de\": 8.8, \"ate\": 12.6 },\n  { \"tipo\": \"icone\",    \"icone\": \"x\", \"pos\": [0.5, 0.4], \"tamanho\": 0.22 },\n  { \"tipo\": \"etiqueta\", \"texto\": \"meio mais alto\", \"pos\": [0.5, 0.3], \"ponto\": \"#ffd60a\" }\n]\n```\n\n| Campo | O que faz |\n|---|---|\n| `tipo` | `seta` (azul, contorno preto), `icone` (cartoon com contorno preto), `etiqueta` (pílula branca com bolinha colorida, para rótulos e dados) |\n| `direcao` (seta) | `direita`, `esquerda`, `cima`, `baixo`, `horizontal` (dupla), `vertical` (dupla) |\n| `icone` | `x` (vermelho: errado), `v` (verde: certo), `alerta`, `interrogacao`, `exclamacao`, `coracao`, `estrela`, `lampada`, `relogio`, `dinheiro`, `fogo`, `proibido`, `raio` |\n| `pos` | `[x, y]` em fração da tela (0 a 1); por exemplo `[0.5, 0.4]` é o centro, um pouco acima do meio |\n| `ancora` | **id** de um objeto/personagem da cena: o elemento acompanha esse item na tela. Ajuste com `alturaRel` (0 = pé, 1 = topo), `y` (metros), `dx`/`dy` (fração da tela) |\n| `tamanho` | fração da largura da tela (padrão 0.22; etiqueta 1 = tamanho normal do texto) |\n| `cor` | cor da seta/ícone (padrão por tipo); na etiqueta, `ponto` é a cor da bolinha |\n| `de` / `ate` | quando aparece (padrão: a cena inteira); entra com um \"pop\" e sai com fade |\n| `pulsa` | pulsa de leve (chama atenção); setas balançam sozinhas na direção que apontam (`\"balanca\": false` desliga) |\n\nEvite colocar elementos sobre o rosto de quem fala ou sobre a legenda (faixa ~62–74%).\n\n### Efeitos de imagem\n\n```json\n\"efeitos\": [\n  { \"tipo\": \"pretoebranco\", \"de\": 19.8, \"ate\": 22.2, \"zoom\": 1.1 },\n  { \"tipo\": \"zoom\", \"de\": 5, \"ate\": 8, \"para\": 1.2 },\n  { \"tipo\": \"tremor\", \"de\": 12, \"ate\": 12.8, \"intensidade\": 0.6 }\n]\n```\n\n- `pretoebranco`: a imagem 3D vai a preto e branco com um zoom lento (use em momentos **ruins, perigosos ou dramáticos**: o problema, o erro, o desastre). Combine com um ícone `x` ou `alerta`.\n- `zoom`: aproximação lenta (de 1 até `para`) para dar ênfase.\n- `tremor`: a imagem treme (impacto, explosão, queda).\nOs efeitos afetam só o 3D; legendas, textos e elementos continuam normais. Ao fim do intervalo voltam ao normal.\n\n### Zonas da tela (vertical 9:16)\n\nO topo (~8%) e a base (~20%) ficam cobertos pela interface do Shorts/Reels/TikTok. Por isso: título 6–14%, destaque 16–24%, pergunta final 10–22%, **legenda em ~68% (uma palavra por vez)**. Não coloque nada importante fora de ~8%–80%.\n\n## Ritmo (o que mantém as pessoas assistindo)\n\n- Uma cena nova a cada **3 a 5 segundos** (nunca mais que 7). Cada corte deve mudar algo: ângulo, plano, alvo ou cenário.\n- Cenas alinhadas com as **frases** da narração (`projects/<nome>/frases.json` dá o início e o fim de cada uma).\n- A cada cena, algo se **move ou muda**: uma etapa de obra, um personagem que anda/aponta, um objeto que aparece.\n- Os primeiros 3 segundos precisam ter o título/pergunta na tela.\n\n## Fluxo de trabalho\n\n```bash\nnode tools/validar.mjs projects/<nome>             # erros e avisos de qualidade\nnode tools/render.mjs projects/<nome> --quadros    # 2 imagens por cena para você olhar (rápido)\nnode tools/render.mjs projects/<nome> --previa     # vídeo rápido 540×960\nnode tools/render.mjs projects/<nome>              # render final 1080×1920\nnode tools/render.mjs projects/<nome> --capa 1.2   # capa.png do instante 1.2 s\n```\n\nPara ver no navegador com controles: `npm run preview` e abra `http://localhost:5173/engine/player.html?projeto=projects/<nome>`.\n",
  "assets": [
    "casa_simples",
    "casa_colonial",
    "sobrado",
    "casa_moderna",
    "predio_apartamentos",
    "arranha_ceu",
    "loja",
    "galpao",
    "ponte_viga",
    "arvore_redonda",
    "arvore_frutifera",
    "arvore_pinheiro",
    "palmeira",
    "arbusto",
    "rua_reta",
    "cruzamento",
    "chao",
    "campo_futebol",
    "carro_sedan",
    "carro_hatch",
    "onibus",
    "caminhao_cacamba",
    "betoneira",
    "rolo_compressor",
    "vibroacabadora",
    "espargidor",
    "cone",
    "barreira",
    "pilha_tijolos",
    "saco_cimento",
    "carrinho_mao",
    "escada",
    "poste_luz",
    "semaforo",
    "placa_pare",
    "banco",
    "cerca",
    "muro",
    "hidrante",
    "lixeira",
    "caixa_madeira",
    "bueiro",
    "casa_obra",
    "predio_estrutura",
    "rua_camadas",
    "corte_terreno",
    "guindaste",
    "forma",
    "tubo",
    "engrenagem",
    "helice",
    "esteira",
    "monte",
    "tanque",
    "misturador",
    "escavadeira",
    "fabrica_processo"
  ],
  "characters": [
    "construtor",
    "engenheiro",
    "engenheira",
    "servente",
    "homem",
    "mulher",
    "velhinho",
    "velhinha",
    "crianca",
    "menina",
    "motorista"
  ],
  "clips": [
    "idle",
    "walk",
    "run",
    "wave",
    "point",
    "talk",
    "hammer",
    "carry",
    "push",
    "dig",
    "cheer",
    "surprised",
    "think",
    "look_around",
    "nod",
    "shake_head",
    "shrug",
    "crouch",
    "sit",
    "read_clipboard"
  ],
  "assetCatalog": [
    {
      "id": "casa_simples",
      "category": "casas",
      "label": "Casa simples",
      "description": "Casa térrea de telhado de duas águas, porta central, duas janelas na frente e chaminé. 6 × 7 m.",
      "params": [
        "wall",
        "roof",
        "door",
        "trim",
        "chimney"
      ],
      "variants": [
        "verde",
        "azul",
        "amarela"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "casa_colonial",
      "category": "casas",
      "label": "Casa colonial",
      "description": "Casa grande de telhado de quatro águas com varanda de colunas, portas duplas e janelas com venezianas. 9 × 7 m (+2 m de varanda).",
      "params": [
        "wall",
        "roof",
        "shutter",
        "trim"
      ],
      "variants": [
        "rosa",
        "azul"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "sobrado",
      "category": "casas",
      "label": "Sobrado",
      "description": "Casa de dois andares com garagem, porta de entrada, sacada sobre a garagem e telhado de duas águas. 6,5 × 8 m, 5,6 m de parede.",
      "params": [
        "wall",
        "roof",
        "garage",
        "trim"
      ],
      "variants": [
        "cinza",
        "salmao"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "casa_moderna",
      "category": "casas",
      "label": "Casa moderna",
      "description": "Casa de linhas retas: dois volumes, laje plana, janelas grandes e garagem. 9 × 7 m, 6 m de altura.",
      "params": [
        "wall",
        "accent",
        "wood"
      ],
      "variants": [
        "escura",
        "quente"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "predio_apartamentos",
      "category": "predios",
      "label": "Prédio de apartamentos",
      "description": "Prédio residencial com térreo de entrada, janelas e sacadas em cada andar, platibanda e caixa d'água. 14 × 10 m; cada andar 3 m.",
      "params": [
        "floors",
        "wall",
        "accent",
        "balconies"
      ],
      "variants": [
        "azul",
        "rosa",
        "alto"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "arranha_ceu",
      "category": "predios",
      "label": "Arranha-céu",
      "description": "Torre de escritórios com fachada de vidro, faixas de laje a cada andar, base (pódio), coroa e antena. 16 × 16 m; cada andar 4 m.",
      "params": [
        "floors",
        "glass",
        "band"
      ],
      "variants": [
        "verde",
        "escuro",
        "alto"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "loja",
      "category": "predios",
      "label": "Loja",
      "description": "Loja de rua com vitrine grande, porta de vidro, toldo listrado e letreiro. 8 × 8 m, 4 m de altura.",
      "params": [
        "wall",
        "awning",
        "sign"
      ],
      "variants": [
        "padaria",
        "mercado"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "galpao",
      "category": "predios",
      "label": "Galpão / fábrica",
      "description": "Galpão industrial de telhado metálico, portão de enrolar, janelas altas e chaminé. 24 × 14 m, 6 m de parede.",
      "params": [
        "wall",
        "roof",
        "door"
      ],
      "variants": [
        "azul",
        "verde"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "ponte_viga",
      "category": "predios",
      "label": "Ponte de vigas",
      "description": "Ponte de concreto sobre um rio: tabuleiro com pista, guarda-corpo, dois pilares com travessa e encontros nas pontas. Vão de 24 m ao longo de X, 8 m de largura.",
      "params": [
        "length",
        "height",
        "river"
      ],
      "variants": [
        "longa",
        "baixa"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "arvore_redonda",
      "category": "arvores",
      "label": "Árvore de copa redonda",
      "description": "Árvore clássica de tronco marrom e copa arredondada de várias bolas. Altura padrão 5 m.",
      "params": [
        "height",
        "leaf",
        "trunk",
        "seed"
      ],
      "variants": [
        "clara",
        "escura",
        "grande",
        "outono"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "arvore_frutifera",
      "category": "arvores",
      "label": "Árvore frutífera",
      "description": "Árvore de copa redonda com frutas (bolinhas coloridas), tipo laranjeira ou macieira. 4 m.",
      "params": [
        "fruit",
        "leaf",
        "seed"
      ],
      "variants": [
        "laranja",
        "limao"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "arvore_pinheiro",
      "category": "arvores",
      "label": "Pinheiro",
      "description": "Árvore em forma de cone, feita de camadas empilhadas. Altura padrão 6 m.",
      "params": [
        "height",
        "leaf",
        "layers"
      ],
      "variants": [
        "clara",
        "alta",
        "nevada"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "palmeira",
      "category": "arvores",
      "label": "Palmeira",
      "description": "Palmeira de tronco levemente curvo em gomos e folhas compridas. 7 m.",
      "params": [
        "height",
        "leaf",
        "seed"
      ],
      "variants": [
        "baixa",
        "alta"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "arbusto",
      "category": "arvores",
      "label": "Arbusto",
      "description": "Moita baixa de bolas verdes, para cercas vivas e jardins. 1,2 m.",
      "params": [
        "leaf",
        "flowers",
        "seed"
      ],
      "variants": [
        "florido",
        "claro"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "rua_reta",
      "category": "ruas",
      "label": "Rua reta",
      "description": "Trecho de rua com asfalto, faixa central, meio-fio e calçadas dos dois lados. Corre ao longo de Z.",
      "params": [
        "length",
        "lanes",
        "laneWidth",
        "sidewalk",
        "crosswalk"
      ],
      "variants": [
        "larga",
        "sem_calcada",
        "com_faixa"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "cruzamento",
      "category": "ruas",
      "label": "Cruzamento",
      "description": "Encontro de duas ruas em cruz, com faixas de pedestre nas quatro pontas e quarteirões de calçada nos cantos. 7 m de pista, braços de 8 m.",
      "params": [
        "arm",
        "lanes"
      ],
      "variants": [
        "longo"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "chao",
      "category": "ruas",
      "label": "Chão (terreno)",
      "description": "Placa de chão quadrada com manchas de cor: grama, terra, areia, concreto ou asfalto.",
      "params": [
        "type",
        "size",
        "seed"
      ],
      "variants": [
        "terra",
        "areia",
        "concreto",
        "asfalto"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "campo_futebol",
      "category": "ruas",
      "label": "Campo de futebol",
      "description": "Gramado listrado com linhas brancas (área, círculo central) e duas traves. 40 × 26 m (reduzido).",
      "params": [
        "length",
        "width"
      ],
      "variants": [
        "pequeno"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "carro_sedan",
      "category": "veiculos",
      "label": "Carro sedã",
      "description": "Carro de passeio com porta-malas. 1,8 × 4,4 m. Rodas giram com rollWheels().",
      "params": [
        "color",
        "taxi"
      ],
      "variants": [
        "azul",
        "branco",
        "taxi",
        "verde"
      ],
      "setProgress": false,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "carro_hatch",
      "category": "veiculos",
      "label": "Carro hatch",
      "description": "Carro compacto de traseira alta. 1,8 × 3,8 m.",
      "params": [
        "color"
      ],
      "variants": [
        "vermelho",
        "amarelo",
        "preto"
      ],
      "setProgress": false,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "onibus",
      "category": "veiculos",
      "label": "Ônibus",
      "description": "Ônibus urbano com janelões, letreiro e portas. 2,5 × 10 m, 3,1 m de altura.",
      "params": [
        "color",
        "stripe"
      ],
      "variants": [
        "vermelho",
        "azul",
        "verde"
      ],
      "setProgress": false,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "caminhao_cacamba",
      "category": "veiculos",
      "label": "Caminhão caçamba",
      "description": "Caminhão basculante para terra e entulho. setProgress(0..1) levanta a caçamba. 2,5 × 10 m.",
      "params": [
        "cab",
        "bed",
        "tilt"
      ],
      "variants": [
        "amarelo",
        "azul",
        "levantada"
      ],
      "setProgress": true,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "betoneira",
      "category": "veiculos",
      "label": "Caminhão betoneira",
      "description": "Caminhão de concreto com tambor listrado que gira (updateScenery(obj, t)). 2,5 × 9 m.",
      "params": [
        "cab",
        "drum"
      ],
      "variants": [
        "verde",
        "azul"
      ],
      "setProgress": false,
      "update": true,
      "wheels": true,
      "animated": true
    },
    {
      "id": "rolo_compressor",
      "category": "veiculos",
      "label": "Rolo compressor",
      "description": "Máquina de compactar asfalto e solo, com dois tambores de aço e cabine aberta. 1,9 × 3,6 m. Os tambores giram com rollWheels().",
      "params": [
        "color"
      ],
      "variants": [
        "laranja",
        "azul"
      ],
      "setProgress": false,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "vibroacabadora",
      "category": "veiculos",
      "label": "Vibroacabadora",
      "description": "Máquina que espalha o asfalto quente em camada uniforme: caçamba na frente (recebe a massa do caminhão), esteiras e a régua alisadora atrás. 2,9 × 6 m.",
      "params": [
        "color"
      ],
      "variants": [
        "laranja",
        "azul"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "espargidor",
      "category": "veiculos",
      "label": "Caminhão espargidor",
      "description": "Caminhão-tanque que espalha o ligante asfáltico líquido (imprimação e pintura de ligação). setProgress(1) liga o jato e deixa a faixa escura atrás. 2,6 × 10 m.",
      "params": [
        "cab",
        "tank",
        "spraying"
      ],
      "variants": [
        "jorrando",
        "vermelho"
      ],
      "setProgress": true,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "cone",
      "category": "objetos",
      "label": "Cone de trânsito",
      "description": "Cone laranja com faixa branca e base quadrada. 0,6 m.",
      "params": [
        "color"
      ],
      "variants": [
        "amarelo"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "barreira",
      "category": "objetos",
      "label": "Barreira de obra",
      "description": "Cavalete com tábuas listradas vermelho/branco para isolar uma área. 2 × 1 m.",
      "params": [
        "length"
      ],
      "variants": [
        "longa"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "pilha_tijolos",
      "category": "objetos",
      "label": "Pilha de tijolos",
      "description": "Pilha de tijolos sobre um pallet de madeira. 1,2 × 0,8 m, 0,8 m de altura.",
      "params": [
        "brick",
        "rows"
      ],
      "variants": [
        "baixa",
        "clara"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "saco_cimento",
      "category": "objetos",
      "label": "Sacos de cimento",
      "description": "Pilha de sacos de cimento com etiqueta azul. 0,6 m de lado.",
      "params": [
        "count"
      ],
      "variants": [
        "um",
        "muitos"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "carrinho_mao",
      "category": "objetos",
      "label": "Carrinho de mão",
      "description": "Carrinho de obra com caçamba, uma roda e dois cabos. 0,7 × 1,5 m. A roda gira com rollWheels().",
      "params": [
        "color"
      ],
      "variants": [
        "azul",
        "vermelho"
      ],
      "setProgress": false,
      "update": false,
      "wheels": true,
      "animated": true
    },
    {
      "id": "escada",
      "category": "objetos",
      "label": "Escada de mão",
      "description": "Escada de madeira inclinada (encostada). 2,4 m.",
      "params": [
        "height"
      ],
      "variants": [
        "alta"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "poste_luz",
      "category": "objetos",
      "label": "Poste de luz",
      "description": "Poste de rua com braço e lâmpada acesa. 6 m.",
      "params": [
        "height",
        "color"
      ],
      "variants": [
        "baixo"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "semaforo",
      "category": "objetos",
      "label": "Semáforo",
      "description": "Semáforo de poste com três luzes; escolha qual está acesa.",
      "params": [
        "state"
      ],
      "variants": [
        "amarelo",
        "verde"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "placa_pare",
      "category": "objetos",
      "label": "Placa PARE",
      "description": "Placa octogonal vermelha em poste. 2,4 m.",
      "params": [],
      "variants": [],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "banco",
      "category": "objetos",
      "label": "Banco de praça",
      "description": "Banco de madeira com pés de ferro. 1,6 × 0,6 m.",
      "params": [
        "color"
      ],
      "variants": [
        "verde"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "cerca",
      "category": "objetos",
      "label": "Cerca de madeira",
      "description": "Trecho de cerca de madeira com mourões e duas travas. 4 m (ajustável).",
      "params": [
        "length",
        "color"
      ],
      "variants": [
        "branca"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "muro",
      "category": "objetos",
      "label": "Muro",
      "description": "Trecho de muro de alvenaria com capeamento. 4 m de comprimento, 2,2 m de altura.",
      "params": [
        "length",
        "height",
        "color"
      ],
      "variants": [
        "tijolo",
        "cinza"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "hidrante",
      "category": "objetos",
      "label": "Hidrante",
      "description": "Hidrante vermelho de calçada. 0,7 m.",
      "params": [],
      "variants": [],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "lixeira",
      "category": "objetos",
      "label": "Lixeira",
      "description": "Lixeira de rua com tampa. 0,9 m.",
      "params": [
        "color"
      ],
      "variants": [
        "azul",
        "amarela"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "caixa_madeira",
      "category": "objetos",
      "label": "Caixote de madeira",
      "description": "Caixote de madeira com travessas em X. 0,8 m.",
      "params": [
        "size"
      ],
      "variants": [
        "grande"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "bueiro",
      "category": "objetos",
      "label": "Bueiro (boca de lobo)",
      "description": "Grade de escoamento de água da chuva, ao nível do asfalto junto ao meio-fio. 0,9 × 0,5 m.",
      "params": [],
      "variants": [],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "casa_obra",
      "category": "obra",
      "label": "Casa em obra",
      "description": "Casa sendo construída: setProgress(p) mostra fundação (0–0.12), pilares (–0.25), paredes de tijolo (–0.55), laje (–0.65), madeiramento (–0.82) e telhas (–1). 6 × 7 m.",
      "params": [
        "progress",
        "brick",
        "tile"
      ],
      "variants": [
        "fundacao",
        "paredes",
        "madeiramento"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "predio_estrutura",
      "category": "obra",
      "label": "Estrutura de prédio",
      "description": "Esqueleto de concreto (pilares e lajes) subindo andar por andar: setProgress(p) constrói de 0 a todos os andares. 15 × 10 m, andares de 3,2 m.",
      "params": [
        "floors",
        "progress",
        "concrete"
      ],
      "variants": [
        "baixo",
        "meio"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "rua_camadas",
      "category": "obra",
      "label": "Corte da pavimentação",
      "description": "Bloco em corte mostrando as camadas de uma rua: solo compactado, sub-base de brita, base, asfalto base e capa de rolamento (+ faixa). setProgress(p) empilha as camadas. 8 × 8 m, 1,",
      "params": [
        "progress"
      ],
      "variants": [
        "subleito",
        "quase"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "corte_terreno",
      "category": "obra",
      "label": "Corte do terreno",
      "description": "Bloco de solo em corte com grama, terra, argila e rocha — para explicar fundações e muros de arrimo. setProgress(p) revela as camadas de baixo para cima. 8 × 6 m, 2,4 m de altura.",
      "params": [
        "progress"
      ],
      "variants": [
        "so_rocha"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "guindaste",
      "category": "obra",
      "label": "Guindaste de obra",
      "description": "Guindaste de torre com lança, contrapeso, cabo e gancho. setProgress(p) gira a lança uma volta. Torre de 22 m.",
      "params": [
        "height",
        "jib",
        "angle"
      ],
      "variants": [
        "baixo"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "forma",
      "category": "formas",
      "label": "Forma livre",
      "description": "Peça básica para montar qualquer coisa (tanque, bloco, pilar, bola, lâmpada, quadro...). Empilhe várias para criar máquinas, diagramas e cenários novos. Combine com \"anim\", \"opacid",
      "params": [
        "tipo",
        "tamanho",
        "cor",
        "brilho",
        "emissivo",
        "apoiada"
      ],
      "variants": [
        "tanque",
        "bola",
        "lampada"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "tubo",
      "category": "formas",
      "label": "Tubo / cano",
      "description": "Tubulação por pontos [x,y,z] (cano, fio, mangueira, veia). Use junto de um fluxo com \"caminho\" igual aos pontos para mostrar o que passa dentro, e \"opacidade\" 0.35 para enxergar o ",
      "params": [
        "pontos",
        "raio",
        "cor"
      ],
      "variants": [
        "vermelho",
        "azul",
        "cobre"
      ],
      "setProgress": false,
      "update": false,
      "wheels": false,
      "animated": false
    },
    {
      "id": "engrenagem",
      "category": "maquinas",
      "label": "Engrenagem",
      "description": "Engrenagem que gira sozinha (eixo para a câmera, +Z). Use duas lado a lado com velocidades opostas e \"fase\" diferente para mostrar transmissão. update(t).",
      "params": [
        "dentes",
        "raio",
        "cor",
        "velocidade",
        "fase"
      ],
      "variants": [
        "prata",
        "vermelha"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    },
    {
      "id": "helice",
      "category": "maquinas",
      "label": "Hélice / ventilador",
      "description": "Hélice, pá de ventilador ou turbina que gira sozinha (eixo +Z). update(t).",
      "params": [
        "pas",
        "raio",
        "cor",
        "velocidade"
      ],
      "variants": [
        "turbina",
        "ventilador"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    },
    {
      "id": "esteira",
      "category": "maquinas",
      "label": "Esteira transportadora",
      "description": "Esteira com material andando sobre ela (pedra, areia, grão, carvão...). Pode ser inclinada. update(t).",
      "params": [
        "comprimento",
        "largura",
        "inclinacao",
        "material",
        "velocidade"
      ],
      "variants": [
        "subindo",
        "graos",
        "areia"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    },
    {
      "id": "monte",
      "category": "maquinas",
      "label": "Monte de material",
      "description": "Pilha de pedra, areia, terra, grão, carvão ou asfalto. setProgress(0..1) faz o monte CRESCER (combine com um fluxo caindo em cima).",
      "params": [
        "material",
        "raio",
        "progress"
      ],
      "variants": [
        "areia",
        "terra",
        "grao",
        "pequeno"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "tanque",
      "category": "maquinas",
      "label": "Tanque / silo transparente",
      "description": "Reservatório (água, leite, grão, combustível) com casca transparente e o conteúdo visível. setProgress(0..1) muda o NÍVEL (encher/esvaziar).",
      "params": [
        "raio",
        "altura",
        "liquido",
        "casca",
        "nivel"
      ],
      "variants": [
        "agua",
        "leite",
        "oleo",
        "grao"
      ],
      "setProgress": true,
      "update": false,
      "wheels": false,
      "animated": true
    },
    {
      "id": "misturador",
      "category": "maquinas",
      "label": "Misturador / tambor",
      "description": "Tanque aberto com pás girando e o conteúdo sendo misturado (massa, tinta, concreto, comida). Visto de cima fica bonito. update(t).",
      "params": [
        "raio",
        "conteudo",
        "pas",
        "velocidade"
      ],
      "variants": [
        "tinta",
        "concreto",
        "massa"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    },
    {
      "id": "escavadeira",
      "category": "maquinas",
      "label": "Escavadeira",
      "description": "Escavadeira que cava, gira e despeja em ciclo (update). Para mostrar terraplenagem, mineração, obra. Cava na frente (+Z) e despeja à esquerda (-X, uns 5 m); ponha um \"monte\" lá. Us",
      "params": [
        "cor",
        "ciclo",
        "fase"
      ],
      "variants": [
        "laranja",
        "rapida"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    },
    {
      "id": "fabrica_processo",
      "category": "maquinas",
      "label": "Fábrica de processamento",
      "description": "Linha de processamento animada: 3 silos de matéria-prima, esteira subindo até um tambor rotativo aquecido (com chama), chaminé soltando fumaça e torre com bica de descarga. Serve p",
      "params": [
        "material",
        "carregando",
        "velocidade"
      ],
      "variants": [
        "graos",
        "areia"
      ],
      "setProgress": false,
      "update": true,
      "wheels": false,
      "animated": true
    }
  ],
  "characterCatalog": [
    {
      "id": "construtor",
      "role": "Protagonista / narrador. Mestre de obras: explica o passo a passo da construção.",
      "hat": "hardhat",
      "held": []
    },
    {
      "id": "engenheiro",
      "role": "Especialista técnico. Entra para explicar cálculo, projeto e normas. Já vem com prancheta na mão esquerda.",
      "hat": "hardhat",
      "held": [
        "L"
      ]
    },
    {
      "id": "engenheira",
      "role": "Especialista técnica / supervisora de obra. Voz de autoridade amigável.",
      "hat": "hardhat",
      "held": []
    },
    {
      "id": "servente",
      "role": "Ajudante de obra. Faz o trabalho braçal (cava, carrega, empurra). Já vem com pá na mão direita.",
      "hat": "hardhat",
      "held": [
        "R"
      ]
    },
    {
      "id": "homem",
      "role": "Morador / pessoa comum (dono da casa, passante, curioso fazendo a pergunta do vídeo).",
      "hat": "",
      "held": []
    },
    {
      "id": "mulher",
      "role": "Moradora / pessoa comum (vizinha, mãe, passageira).",
      "hat": "",
      "held": []
    },
    {
      "id": "velhinho",
      "role": "Idoso curioso ou sábio. Bom para perguntas (\"como isso se sustenta?\") e humor.",
      "hat": "",
      "held": []
    },
    {
      "id": "velhinha",
      "role": "Idosa curiosa ou sábia. Boa para reações e comentários simpáticos.",
      "hat": "",
      "held": []
    },
    {
      "id": "crianca",
      "role": "Criança curiosa (menino). Faz as perguntas ingênuas que puxam a explicação.",
      "hat": "cap",
      "held": []
    },
    {
      "id": "menina",
      "role": "Criança curiosa (menina). Faz perguntas e reage com surpresa.",
      "hat": "",
      "held": []
    },
    {
      "id": "motorista",
      "role": "Motorista (carro, ônibus, caminhão, metrô). Use com a animação sit (params: { arms: \"wheel\" }).",
      "hat": "cap",
      "held": []
    }
  ],
  "clipCatalog": [
    {
      "id": "idle",
      "description": "Em pé parado, respirando e balançando de leve. Pose padrão quando nada está acontecendo.",
      "loop": true,
      "params": []
    },
    {
      "id": "walk",
      "description": "Andar em linha reta. Mova o personagem à frente na velocidade certa (use walkSpeed) para os pés não \"patinarem\".",
      "loop": true,
      "params": []
    },
    {
      "id": "run",
      "description": "Correr. Mais rápido, braços dobrados, tronco inclinado e pequenos saltos.",
      "loop": true,
      "params": []
    },
    {
      "id": "wave",
      "description": "Acenar com a mão (cumprimento). Bom para apresentar o personagem ou se despedir.",
      "loop": true,
      "params": [
        "side"
      ]
    },
    {
      "id": "point",
      "description": "Apontar com o braço para mostrar algo. Pose de uma vez só: o braço sobe e fica apontando.",
      "loop": false,
      "params": [
        "side",
        "dir"
      ]
    },
    {
      "id": "talk",
      "description": "Falar gesticulando: mão direita e esquerda acompanham a fala, cabeça mexe, boca abre e fecha. Use enquanto toca a narraç",
      "loop": true,
      "params": [
        "mouthOpen",
        "energy"
      ]
    },
    {
      "id": "hammer",
      "description": "Martelar (bater prego, construir). Funciona melhor com o item \"hammer\" na mão direita.",
      "loop": true,
      "params": [
        "side"
      ]
    },
    {
      "id": "carry",
      "description": "Carregar uma caixa/saco com os dois braços à frente. Use walking=1 para andar carregando, 0 para ficar parado.",
      "loop": true,
      "params": [
        "walking"
      ]
    },
    {
      "id": "push",
      "description": "Empurrar algo pesado à frente (carrinho de mão, parede, porta), inclinado e com passos curtos.",
      "loop": true,
      "params": []
    },
    {
      "id": "dig",
      "description": "Cavar com a pá (use o item \"shovel\"). Abaixa, enfia, levanta.",
      "loop": true,
      "params": []
    },
    {
      "id": "cheer",
      "description": "Comemorar pulando com os braços para cima (sucesso, \"funcionou!\", final do vídeo).",
      "loop": true,
      "params": []
    },
    {
      "id": "surprised",
      "description": "Susto/surpresa: recua o corpo, abre os braços, olhos e boca arregalados. Pose de uma vez só.",
      "loop": false,
      "params": []
    },
    {
      "id": "think",
      "description": "Pensar: mão no queixo, cabeça inclinada, olhando para cima. Bom antes de uma explicação ou pergunta.",
      "loop": true,
      "params": []
    },
    {
      "id": "look_around",
      "description": "Olhar ao redor, virando a cabeça e o corpo devagar para os lados.",
      "loop": true,
      "params": []
    },
    {
      "id": "nod",
      "description": "Balançar a cabeça dizendo \"sim\".",
      "loop": false,
      "params": []
    },
    {
      "id": "shake_head",
      "description": "Balançar a cabeça dizendo \"não\".",
      "loop": false,
      "params": []
    },
    {
      "id": "shrug",
      "description": "Dar de ombros (\"não sei\" / \"talvez\"): braços abertos e cabeça inclinada. Pose de uma vez só.",
      "loop": false,
      "params": []
    },
    {
      "id": "crouch",
      "description": "Agachar para olhar/mexer em algo no chão (inspecionar fundação, fiação, encanamento).",
      "loop": false,
      "params": []
    },
    {
      "id": "sit",
      "description": "Sentar (cadeira, banco, banco do carro). Ajuste seatHeight à altura do assento e arms ao uso.",
      "loop": false,
      "params": [
        "seatHeight",
        "arms"
      ]
    },
    {
      "id": "read_clipboard",
      "description": "Ler/anotar na prancheta (use com engenheiro, que já tem prancheta na mão esquerda).",
      "loop": true,
      "params": []
    }
  ]
}
