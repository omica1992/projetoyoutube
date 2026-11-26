const panel = "/api/painel"
let channel
const profilesKey = "studio-channel-profiles"
const profiles = () => JSON.parse(localStorage.getItem(profilesKey) || "[]")
const audio = new Map()

async function request(path, body, method, binary = false) {
  const res = await fetch(panel + path, body === undefined && !method ? {} : {
    method: method || "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw Error((await res.json().catch(()=>({}))).error || "O servidor retornou HTTP " + res.status)
  return binary ? res.blob() : res.json()
}

function project(row) {
  const recorded = audio.get(row.id)
  return {
    id: row.id, titulo:row.roteiro?.titulo || row.pauta || "Roteiro", roteiro:row.roteiro,
    duracaoAlvo:row.duracao, criadoEm:row.createdAt, channelId:row.channelId || channel?.id || null, pautaId:row.pautaId,
    urls:{audio:recorded?.url || null},voice:recorded?.voice, audio:recorded?.url || null,
    publicacao:row.publishedId ? {id:row.publishedId} : null,
  }
}

export async function cloudApi(path, body) {
  if (path === "/config" || path === "/vozes" || path.startsWith("/pautas")) return request("/studio" + path,body)
  if (path === "/canais") {
    if (!channel) {
      const info = (await request("/canal/live")).channel
      if (info?.channelId) channel = { id:info.channelId, title:info.title, handle:info.handle, logo:info.avatar }
    }
    const saved = profiles()
    return { channels: [...(channel ? [saved.find(p => p.id === channel.id) || channel] : []), ...saved.filter(p => p.id !== channel?.id)], originalId:channel?.id || null, configured:false }
  }
  if (path === "/perfil-canal") {
    const profile = await request("/studio/perfil-canal?canal=" + encodeURIComponent(body.ref))
    localStorage.setItem(profilesKey, JSON.stringify([...profiles().filter(p => p.id !== profile.id), profile]))
    return profile
  }
  if (path.startsWith("/projetos?")) {
    const id = new URLSearchParams(path.split("?")[1]).get("canal")
    return (await request("/acervo")).roteiros.filter(row => !row.archived && (row.channelId || channel?.id || "") === id).map(project)
  }
  if (path === "/projetos" && body) {
    const result = body.manual
      ? await request("/roteiro/rascunho",{pauta:body.idea, duracao:body.duration, pautaId:body.pautaId,channelId:body.channelId})
      : await request("/roteiro",{pauta:body.idea.slice(0,240), contexto:body.idea.slice(240),duracao:body.duration,model:body.model,pautaId:body.pautaId,channelId:body.channelId})
    return {project:project(result.saved)}
  }
  const match = /^\/projetos\/([\w-]+)(?:\/(roteiro|excluir|narracao))?$/.exec(path)
  if (match) {
    const [,id,action] = match
    if (action === "excluir") {
      await request("/acervo/roteiros/"+id,undefined,"DELETE")
      if (audio.has(id)) URL.revokeObjectURL(audio.get(id).url)
      audio.delete(id)
      return {excluded:id}
    }
    if (action === "roteiro") return {project:project((await request("/roteiro/rascunho",{id,pauta:body.titulo,roteiro:body.roteiro,duracao:body.duration,pautaId:body.pautaId,channelId:body.channelId})).saved)}
    const entry = (await request("/acervo")).roteiros.find(r=>r.id===id)
    if (!entry) throw Error("Projeto não encontrado no acervo.")
    if (action === "narracao") {
      const blob = await request("/narracao",{text:body.roteiro,voice:body.voice,confirmed:true},undefined,true)
      const saved = await request("/roteiro/rascunho",{id,pauta:body.titulo,roteiro:body.roteiro,duracao:entry.duracao,pautaId:entry.pautaId,channelId:entry.channelId})
      if (audio.has(id)) URL.revokeObjectURL(audio.get(id).url)
      audio.set(id,{voice:body.voice,url:URL.createObjectURL(blob)})
      return {project:project(saved.saved)}
    }
    return project(entry)
  }
  throw Error("Esta operação ainda não está disponível na hospedagem.")
}
