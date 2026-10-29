import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, dt, fmtw, temArte } from "../regras";
import { useBusy } from "../ui";
import { miniDoUpload, urlsMini } from "../miniatura";
import { enviarArquivo } from "../upload";

export type Arquivo = { id: string; item_id: number; caminho: string; nome: string; tipo: string | null; tamanho: number; criado_em: string; removido_em: string | null; legenda?: string | null; ordem?: number | null; miniatura?: string | null; no_drive_em?: string | null };
const MAX = 50 * 1024 * 1024;
const BUCKET = "entregas";

export const tamanho = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const ext = (n: string) => (n.split(".").pop() || "").toUpperCase().slice(0, 4);
const ehVideo = (a: { tipo: string | null; nome: string }) => (a.tipo || "").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(a.nome);
const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);

export async function listarArquivos(itemId: number): Promise<Arquivo[]> {
  const r = await supabase.from("entrega_arquivos").select("*").eq("item_id", itemId).order("criado_em");
  // ordem escolhida na entrega (1, 2, 3…); sem ordem, pela hora do envio
  return ((r.data || []) as Arquivo[]).sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.criado_em.localeCompare(b.criado_em));
}

// envio retomável (aguenta oscilação da internet), com barra de progresso
function enviar(caminho: string, arq: File, _token: string, progresso: (p: number) => void): Promise<void> {
  return enviarArquivo(BUCKET, caminho, arq, arq.type, progresso);
}

// grava o arquivo no banco; se o banco ainda não tiver a coluna da miniatura, grava sem ela
async function inserirArquivo(dados: Record<string, unknown>, miniatura: string | null) {
  if (miniatura) {
    const r = await supabase.from("entrega_arquivos").insert({ ...dados, miniatura }).select("*").single();
    if (!r.error || !/miniatura/i.test(r.error.message)) return r;
    await supabase.storage.from(BUCKET).remove([miniatura]);
  }
  return supabase.from("entrega_arquivos").insert(dados).select("*").single();
}

type Envio = { chave: string; nome: string; tamanho: number; tipo: string; p: number; erro?: string; feito?: Arquivo };

/* ============ funcionário: entregar com arquivo e/ou link ============ */
export function EntregaForm({ d, i, fechar }: { d: Dados; i: Item; fechar: () => void }) {
  const [modo, setModo] = useState<"arq" | "link">(i.link && !i.n_arquivos ? "link" : "arq");
  const [link, setLink] = useState(i.link || "");
  const [antigos, setAntigos] = useState<Arquivo[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [legenda, setLegenda] = useState(i.legenda || "");
  const [legs, setLegs] = useState<Record<string, string>>({});
  const { busy, err, setErr, run } = useBusy();
  const galeria = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), troca = useRef<HTMLInputElement>(null);
  const [trocando, setTrocando] = useState<{ id: string; p: number; erro?: string } | null>(null);
  const alvoTroca = useRef<Arquivo | null>(null);

  useEffect(() => { listarArquivos(i.id).then(a => { const v = a.filter(x => !x.removido_em); setAntigos(v); setLegs(Object.fromEntries(v.map(x => [x.id, x.legenda || ""]))); }); }, [i.id]);
  const enviosRef = useRef<Envio[]>([]);
  useEffect(() => { enviosRef.current = envios; }, [envios]);
  const atualizar = (chave: string, p: Partial<Envio>) => setEnvios(l => l.map(e => e.chave === chave ? { ...e, ...p } : e));

  const escolher = async (lista: File[]) => {
    if (!lista.length) return;
    setErr(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setErr("Sua sessão expirou. Entre de novo."); return; }
    for (const arq of lista) {
      // mesmo arquivo escolhido duas vezes (clique duplo, arrastar + clicar): envia só uma vez
      const jaTem = (e: { nome: string; tamanho: number }) => e.nome === arq.name && e.tamanho === arq.size;
      if (enviosRef.current.some(e => jaTem(e) && !e.erro) || antigos.some(x => x.nome === arq.name && x.tamanho === arq.size)) continue;
      const chave = Math.random().toString(36).slice(2);
      const base: Envio = { chave, nome: arq.name, tamanho: arq.size, tipo: arq.type, p: 0 };
      if (!/^(image|video)\//.test(arq.type)) { setEnvios(l => [...l, { ...base, erro: "Só imagem ou vídeo." }]); continue; }
      if (arq.size > MAX) { setEnvios(l => [...l, { ...base, erro: "Passa de 50 MB. Envie pelo link do Drive." }]); continue; }
      setEnvios(l => [...l, base]); enviosRef.current = [...enviosRef.current, base];
      const caminho = `${i.id}/${Date.now()}-${nomeSeguro(arq.name)}`;
      try {
        await enviar(caminho, arq, token, p => atualizar(chave, { p }));
        const miniatura = await miniDoUpload(i.id, arq);
        const r = await inserirArquivo({ item_id: i.id, caminho, nome: arq.name, tipo: arq.type, tamanho: arq.size, enviado_por: d.me.id }, miniatura);
        if (r.error) { await supabase.storage.from(BUCKET).remove([caminho, ...(miniatura ? [miniatura] : [])]); throw new Error(r.error.message); }
        atualizar(chave, { p: 1, feito: r.data as Arquivo });
      } catch (e: any) { atualizar(chave, { erro: e.message || "Falhou o envio." }); }
    }
  };

  // troca um arquivo já enviado por outro, mantendo a posição e a legenda
  const trocar = async (arq: File | undefined) => {
    const velho = alvoTroca.current; alvoTroca.current = null;
    if (!arq || !velho) return;
    setErr(null);
    if (!/^(image|video)\//.test(arq.type)) { setErr("Só imagem ou vídeo."); return; }
    if (arq.size > MAX) { setErr("Passa de 50 MB. Envie pelo link do Drive."); return; }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setErr("Sua sessão expirou. Entre de novo."); return; }
    setTrocando({ id: velho.id, p: 0 });
    const caminho = `${i.id}/${Date.now()}-${nomeSeguro(arq.name)}`;
    try {
      await enviar(caminho, arq, token, p => setTrocando({ id: velho.id, p }));
      const miniatura = await miniDoUpload(i.id, arq);
      const r = await inserirArquivo({ item_id: i.id, caminho, nome: arq.name, tipo: arq.type, tamanho: arq.size, enviado_por: d.me.id }, miniatura);
      if (r.error) { await supabase.storage.from(BUCKET).remove([caminho, ...(miniatura ? [miniatura] : [])]); throw new Error(r.error.message); }
      const novo = r.data as Arquivo;
      await supabase.storage.from(BUCKET).remove([velho.caminho, ...(velho.miniatura ? [velho.miniatura] : [])]);
      await supabase.from("entrega_arquivos").delete().eq("id", velho.id);
      setLegs(x => ({ ...x, [novo.id]: x[velho.id] || "" }));
      setAntigos(l => l.map(x => x.id === velho.id ? novo : x));
      setEnvios(l => l.map(e => e.feito?.id === velho.id ? { ...e, feito: novo, nome: novo.nome, tamanho: novo.tamanho, tipo: novo.tipo || "" } : e));
      setTrocando(null);
      d.aviso("Arquivo trocado");
    } catch (e: any) { setTrocando({ id: velho.id, p: 0, erro: e.message || "Falhou a troca." }); }
  };
  const pedirTroca = (a: Arquivo) => { alvoTroca.current = a; troca.current?.click(); };
  const botTroca = (a: Arquivo) => trocando?.id === a.id && !trocando.erro
    ? <small className="muted">trocando · {Math.round(trocando.p * 100)}%</small>
    : <button type="button" className="btn sm" disabled={!!trocando && !trocando.erro} onClick={() => pedirTroca(a)} aria-label={"Trocar " + a.nome}>Trocar</button>;

  const tirar = async (a: Arquivo, chave?: string) => {
    await supabase.storage.from(BUCKET).remove([a.caminho, ...(a.miniatura ? [a.miniatura] : [])]);
    await supabase.from("entrega_arquivos").delete().eq("id", a.id);
    if (chave) setEnvios(l => l.filter(e => e.chave !== chave)); else setAntigos(l => l.filter(x => x.id !== a.id));
  };

  const enviando = envios.some(e => !e.erro && !e.feito) || (!!trocando && !trocando.erro);
  const novos = envios.filter(e => e.feito).length;
  const temAlgo = novos + antigos.length > 0 || !!link.trim();

  const variosArq = novos + antigos.length > 1;
  const legArq = (a: Arquivo, n: number) => (
    <label className="ent-leg">Legenda da imagem {n}
      <textarea rows={2} value={legs[a.id] || ""} onChange={ev => setLegs(x => ({ ...x, [a.id]: ev.target.value }))} placeholder="Se esta imagem for um post separado, escreva a legenda dela aqui (opcional)" />
    </label>
  );

  const entregar = async () => {
    if (enviando) return;
    if (!temAlgo) { setErr("Anexe a imagem ou o vídeo, ou cole o link da arte."); return; }
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) { setErr("O link precisa começar com https://"); return; }
    const ok = await run(async () => {
      // legenda de cada arquivo e a ordem em que aparecem (carrossel)
      const arqs = [...antigos, ...envios.filter(e => e.feito).map(e => e.feito!)];
      for (let k = 0; k < arqs.length; k++) {
        const a = arqs[k], nova = (legs[a.id] || "").trim() || null;
        if (nova !== (a.legenda || null) || a.ordem !== k + 1) {
          const r = await supabase.from("entrega_arquivos").update({ legenda: nova, ordem: k + 1 }).eq("id", a.id);
          if (r.error) return r;
        }
      }
      const r = await supabase.from("itens").update({ status: "Entregue", link: l || null, legenda: legenda.trim() || null }).eq("id", i.id);
      // trocou arquivos de uma entrega já feita: avisa o grupo dos donos de novo
      if (!r.error && i.status === "Entregue") await supabase.from("avisos_whatsapp").insert({ item_id: i.id, motivo: "atualizado" });
      return r as any;
    });
    if (ok) { fechar(); d.aviso(i.status === "Entregue" ? "Entrega atualizada. O dono já vê os arquivos novos." : "Entregue. Agora é com o dono."); d.recarregar(); }
  };

  return (
    <div className="form ent">
      <span className="ent-pega" aria-hidden="true" />
      <div>
        <h2>{i.status === "Ajustes" ? "Reenviar arte" : i.status === "Entregue" ? "Trocar arquivos da entrega" : "Entregar arte"}</h2>
        <p className="muted" style={{ margin: 0 }}>{d.cliente(i.cliente_id)?.nome} · {i.tema}</p>
      </div>
      <div className="ent-abas" role="tablist" aria-label="Como entregar">
        <button type="button" role="tab" aria-selected={modo === "arq"} onClick={() => setModo("arq")}>Enviar imagem ou vídeo</button>
        <button type="button" role="tab" aria-selected={modo === "link"} onClick={() => setModo("link")}>Colar link</button>
      </div>

      {modo === "arq" ? (
        <div className="ent-arq">
          <input ref={galeria} type="file" accept="image/*,video/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; escolher(fs); }} />
          <input ref={troca} type="file" accept="image/*,video/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; trocar(f); }} />
          <input ref={camera} type="file" accept="image/*,video/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; escolher(fs); }} />
          <button type="button" className={"ent-drop" + (arrastando ? " on" : "")} onClick={() => galeria.current?.click()}
            onDragOver={e => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
            onDrop={e => { e.preventDefault(); setArrastando(false); escolher(Array.from(e.dataTransfer.files || [])); }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            <b>Arraste aqui ou clique para escolher</b>
            <small>Imagens e vídeos · até 50 MB cada</small>
          </button>
          <div className="ent-cel">
            <button type="button" onClick={() => galeria.current?.click()}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16v12H4zM8 14l3-3 3 3 2-2 4 4M9 9h.01" /></svg>Galeria</button>
            <button type="button" onClick={() => camera.current?.click()}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z" /></svg>Câmera</button>
          </div>
          {(antigos.length > 0 || envios.length > 0) && (
            <ul className="ent-lista">
              {antigos.map(a => (
                <li key={a.id}><div className="ent-li"><span className={"ent-ic" + (ehVideo(a) ? " v" : "")}>{ext(a.nome)}</span>
                  <span className="ent-n"><b>{a.nome}</b>{trocando?.id === a.id && trocando.erro ? <small className="bad-t">{trocando.erro}</small> : <small className="ok-t">já enviado · {tamanho(a.tamanho)}</small>}</span>
                  {botTroca(a)}
                  <button type="button" className="ent-x" aria-label={"Remover " + a.nome} onClick={() => tirar(a)}>✕</button></div>
                  {variosArq && legArq(a, antigos.indexOf(a) + 1)}</li>
              ))}
              {envios.map(e => (
                <li key={e.chave}><div className="ent-li"><span className={"ent-ic" + (e.tipo.startsWith("video") ? " v" : "")}>{ext(e.nome)}</span>
                  <span className="ent-n"><b>{e.nome}</b>
                    {e.erro ? <small className="bad-t">{e.erro}</small>
                      : e.feito ? <small className="ok-t">enviado · {tamanho(e.tamanho)}</small>
                      : <><span className="ent-bar"><span style={{ width: Math.round(e.p * 100) + "%" }} /></span><small>enviando · {Math.round(e.p * 100)}% de {tamanho(e.tamanho)}</small></>}
                  </span>
                  {e.feito && botTroca(e.feito)}
                  {(e.feito || e.erro) && <button type="button" className="ent-x" aria-label={"Remover " + e.nome} onClick={() => e.feito ? tirar(e.feito, e.chave) : setEnvios(l => l.filter(x => x.chave !== e.chave))}>✕</button>}
                  </div>
                  {variosArq && e.feito && legArq(e.feito, antigos.length + envios.filter(x => x.feito).indexOf(e) + 1)}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setModo("link")}>{link ? "Link: " + link.slice(0, 40) : "+ Também colar um link (opcional)"}</button>
        </div>
      ) : (
        <div className="ent-arq">
          <label htmlFor="ent-link">Link da arte (Drive ou Canva)
            <input id="ent-link" type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://drive.google.com/..." />
          </label>
          <small className="muted">Confira se o link está aberto para a Agemax.</small>
          <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setModo("arq")}>{novos + antigos.length ? `${novos + antigos.length} arquivo(s) anexado(s)` : "+ Também enviar o arquivo (opcional)"}</button>
        </div>
      )}

      <label className="ent-leg ent-leg-post" htmlFor="ent-legenda">Legenda do Instagram
        <textarea id="ent-legenda" rows={4} value={legenda} onChange={e => setLegenda(e.target.value)} placeholder="O texto que vai junto do post, com hashtags e emojis" />
        <small className="muted">{variosArq ? "Carrossel: esta é a legenda do post. Se cada imagem for um post separado, use a legenda de cada uma acima." : "Opcional. O dono copia direto na hora de postar."}{legenda.length > 0 && ` · ${legenda.length}/2200`}</small>
      </label>

      {err && <div className="err">{err}</div>}
      <div className="acts ent-acts">
        <span className="muted">{enviando ? "Espere o envio terminar…" : temAlgo ? "" : "Precisa de pelo menos 1 arquivo ou 1 link."}</span>
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn gold" disabled={busy || enviando} onClick={entregar}>{i.status === "Ajustes" ? "Reenviar" : i.status === "Entregue" ? "Salvar" : "Entregar"}</button>
      </div>
    </div>
  );
}

/* ============ ver a entrega: prévia e download (dono e o próprio funcionário) ============ */
export function EntregaVer({ d, i, fechar, aprovar, ajuste }: { d: Dados; i: Item; fechar: () => void; aprovar?: () => void; ajuste?: () => void }) {
  const [arqs, setArqs] = useState<(Arquivo & { url?: string; mini?: string })[] | null>(null);
  const [baixando, setBaixando] = useState(false);
  useEffect(() => {
    (async () => {
      const lista = await listarArquivos(i.id);
      const vivos = lista.filter(a => !a.removido_em);
      const s = vivos.length ? await supabase.storage.from(BUCKET).createSignedUrls(vivos.map(a => a.caminho), 3600) : { data: [] as any[] };
      const mapa = new Map((s.data || []).map((x: any) => [x.path, x.signedUrl]));
      const minis = await urlsMini(lista.filter(a => a.removido_em && a.miniatura).map(a => a.miniatura!));
      setArqs(lista.map(a => ({ ...a, url: mapa.get(a.caminho) as string | undefined, mini: a.miniatura ? minis.get(a.miniatura) : undefined })));
    })();
  }, [i.id]);

  const baixar = async (a: Arquivo) => {
    const r = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 600, { download: a.nome });
    if (!r.data?.signedUrl) { d.aviso("Não consegui baixar " + a.nome); return; }
    const el = document.createElement("a"); el.href = r.data.signedUrl; el.rel = "noopener"; document.body.appendChild(el); el.click(); el.remove();
  };
  const baixarTudo = async () => {
    setBaixando(true);
    for (const a of (arqs || []).filter(x => !x.removido_em)) { await baixar(a); await new Promise(r => setTimeout(r, 700)); }
    setBaixando(false);
  };
  const vivos = (arqs || []).filter(a => !a.removido_em);
  const c = d.cliente(i.cliente_id);

  return (
    <div className="ev">
      <div className="ev-top">
        <button type="button" className="ev-voltar" aria-label="Fechar" onClick={fechar}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="ev-tit">
          <span className="ktag tg0">{c?.nome}</span>
          <h2>{i.tema}</h2>
          <small className="muted">{d.pessoa(i.responsavel_id)?.nome || "—"} · post {fmtw(dt(i.data_post))}{i.entregue_em ? " · entregue " + fmtw(dt(i.entregue_em)) : ""}</small>
        </div>
        {vivos.length > 1 && <button type="button" className="btn ev-tudo" disabled={baixando} onClick={baixarTudo}>{baixando ? "Baixando…" : `Baixar os ${vivos.length}`}</button>}
      </div>

      {arqs === null ? <div className="kvazio">Carregando arquivos…</div> : (
        <>
          {arqs.length === 0 && !i.link && <div className="kvazio">Nenhum arquivo nesta entrega.</div>}
          {arqs.length > 0 && (
            <div className="ev-grade">
              {arqs.map(a => (
                <figure key={a.id}>
                  <div className="ev-prev">
                    {a.removido_em ? (a.mini ? <img src={a.mini} alt={a.nome + " (miniatura)"} loading="lazy" /> : <span className="muted">Arquivo removido para liberar espaço</span>)
                      : !a.url ? <span className="muted">Sem prévia</span>
                      : ehVideo(a) ? <video src={a.url} controls preload="metadata" playsInline />
                      : <img src={a.url} alt={a.nome} loading="lazy" />}
                  </div>
                  <figcaption>
                    <span><b>{arqs.length > 1 ? (arqs.indexOf(a) + 1) + ". " : ""}{a.nome}</b><small className="muted">{ext(a.nome)} · {tamanho(a.tamanho)}</small></span>
                    {!a.removido_em ? <button type="button" className="btn sm" onClick={() => baixar(a)}>Baixar</button> : <small className="muted ev-nodrive">original no Drive</small>}
                  </figcaption>
                  {a.legenda && <Legenda texto={a.legenda} rotulo={"Legenda da imagem " + (arqs.indexOf(a) + 1)} d={d} />}
                </figure>
              ))}
            </div>
          )}
          {i.legenda && <Legenda texto={i.legenda} rotulo="Legenda do Instagram" d={d} grande />}
          {i.link && <a className="ev-link" href={i.link} target="_blank" rel="noopener noreferrer">Abrir o link da arte ↗</a>}
        </>
      )}

      {(aprovar || ajuste) && (
        <div className="ev-acts">
          {ajuste && <button type="button" className="btn" onClick={ajuste}>Pedir ajuste</button>}
          {aprovar && <button type="button" className="btn gold" onClick={aprovar}>Aprovar</button>}
        </div>
      )}
      {!temArte(i) && <p className="muted" style={{ margin: 0 }}>Sem arquivo e sem link.</p>}
    </div>
  );
}

function Legenda({ texto, rotulo, d, grande }: { texto: string; rotulo: string; d: Dados; grande?: boolean }) {
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); d.aviso("Legenda copiada"); } catch { d.aviso("Não consegui copiar. Selecione o texto e copie."); } };
  return (
    <div className={"ev-leg" + (grande ? " grande" : "")}>
      <div className="ev-leg-top"><span>{rotulo}</span><button type="button" className="btn sm" onClick={copiar}>Copiar</button></div>
      <p>{texto}</p>
    </div>
  );
}

/* ============ limpeza automática (roda quando um dono abre o site) ============
   Na virada do mês, o original pesado dos posts de meses passados que já foram aprovados/postados
   sai do sistema. Só apaga o que o robô já salvou no Google Drive e que já tem miniatura. */
const LIMITE = 800 * 1048576; // perto de 1 GB (plano grátis): apaga também os mais antigos do mês atual
const ALVO = 600 * 1048576;
export async function limparArquivos(): Promise<number> {
  const hoje = new Date();
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const r = await supabase.from("entrega_arquivos").select("id,caminho,tamanho,criado_em,item_id,miniatura,no_drive_em,itens(status,data_post)").is("removido_em", null).order("criado_em");
  if (r.error || !r.data) return 0; // banco ainda sem as colunas novas: não apaga nada
  const lista = r.data as any[];
  const pode = (a: any) => ["Aprovado", "Postado"].includes(a.itens?.status) && !!a.no_drive_em && a.miniatura !== null;
  let total = lista.reduce((s, a) => s + Number(a.tamanho || 0), 0);
  const apagar = new Set<string>();
  for (const a of lista) if (pode(a) && String(a.itens?.data_post || "") < inicioMes) { apagar.add(a.id); total -= Number(a.tamanho || 0); }
  if (total > LIMITE) for (const a of lista) { if (total <= ALVO) break; if (!apagar.has(a.id) && pode(a)) { apagar.add(a.id); total -= Number(a.tamanho || 0); } }
  const sel = lista.filter(a => apagar.has(a.id));
  for (let k = 0; k < sel.length; k += 100) {
    const lote = sel.slice(k, k + 100);
    const rm = await supabase.storage.from(BUCKET).remove(lote.map(a => a.caminho));
    if (rm.error) break;
    await supabase.from("entrega_arquivos").update({ removido_em: new Date().toISOString() }).in("id", lote.map(a => a.id));
  }
  if (sel.length) await supabase.from("manutencao").upsert({ chave: "limpeza_mes", valor: inicioMes.slice(0, 7), em: new Date().toISOString() });
  return sel.length;
}

/* ============ baixar as artes de vários posts de uma vez (ZIP) ============ */
const pasta = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
export function BaixarVarios({ d, itens, titulo, fechar }: { d: Dados; itens: Item[]; titulo: string; fechar: () => void }) {
  const [arqs, setArqs] = useState<Arquivo[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [prog, setProg] = useState<{ feito: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [robo, setRobo] = useState<{ versao?: string; estado?: string } | null>(null);
  const [mandando, setMandando] = useState(false);
  const comArte = itens.filter(i => temArte(i)).sort((a, b) => a.data_post.localeCompare(b.data_post));
  useEffect(() => {
    if (!d.ehDono) return;
    supabase.from("manutencao").select("valor").eq("chave", "robo_whatsapp").maybeSingle().then(m => { try { setRobo(JSON.parse(m.data?.valor || "null")); } catch { setRobo(null); } });
  }, [d.ehDono]);
  const roboFoto = !!robo && Number(robo.versao || 0) >= 1.1;
  const mandarFotos = async () => {
    const ids = escolhidos.filter(i => doPost(i.id).length).map(i => i.id);
    if (!ids.length) { setErro("Os posts marcados não têm imagem anexada."); return; }
    setMandando(true);
    const r = await supabase.from("avisos_whatsapp").insert(ids.map(item_id => ({ item_id, motivo: "fotos" })));
    setMandando(false);
    if (r.error) { setErro("Não consegui pedir o envio: " + r.error.message); return; }
    d.aviso(`${ids.length} post(s) na fila: o robô manda as fotos no grupo em instantes`);
    fechar();
  };

  useEffect(() => {
    const ids = comArte.filter(i => (i.n_arquivos || 0) > 0).map(i => i.id);
    if (!ids.length) { setArqs([]); setSel(new Set(comArte.map(i => i.id))); return; }
    supabase.from("entrega_arquivos").select("*").in("item_id", ids).is("removido_em", null).then(r => {
      const l = ((r.data || []) as Arquivo[]).sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.criado_em.localeCompare(b.criado_em));
      setArqs(l);
      // já vem marcado o que ainda não foi postado
      setSel(new Set(comArte.filter(i => i.status !== "Postado").map(i => i.id)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPost = (id: number) => (arqs || []).filter(a => a.item_id === id);
  const escolhidos = comArte.filter(i => sel.has(i.id));
  const nArq = escolhidos.reduce((s, i) => s + doPost(i.id).length, 0);
  const bytes = escolhidos.reduce((s, i) => s + doPost(i.id).reduce((t, a) => t + Number(a.tamanho || 0), 0), 0);
  const alternar = (id: number) => setSel(x => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const baixar = async () => {
    setErro(null);
    const lista = escolhidos.flatMap(i => doPost(i.id).map(a => ({ i, a })));
    if (!lista.length && !escolhidos.some(i => i.link || i.legenda)) { setErro("Os posts marcados não têm arquivo para baixar."); return; }
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    setProg({ feito: 0, total: lista.length });
    const assinadas = lista.length ? await supabase.storage.from(BUCKET).createSignedUrls(lista.map(x => x.a.caminho), 3600) : { data: [] as any[] };
    const url = new Map((assinadas.data || []).map((x: any) => [x.path, x.signedUrl as string]));
    let falhas = 0, feito = 0;
    for (const i of escolhidos) {
      const dir = zip.folder(`${i.data_post.slice(8, 10)}-${i.data_post.slice(5, 7)} ${pasta(d.cliente(i.cliente_id)?.nome || "")} - ${pasta(i.tema)}`)!;
      const leg = [i.legenda ? "LEGENDA DO POST\n" + i.legenda : "", ...doPost(i.id).map((a, k) => a.legenda ? `LEGENDA DA IMAGEM ${k + 1} (${a.nome})\n${a.legenda}` : ""), i.link ? "LINK DA ARTE\n" + i.link : ""].filter(Boolean).join("\n\n");
      if (leg) dir.file("legenda.txt", leg);
      const usados = new Set<string>();
      for (const [k, a] of doPost(i.id).entries()) {
        try {
          const u = url.get(a.caminho); if (!u) throw new Error();
          const r = await fetch(u); if (!r.ok) throw new Error();
          let nome = `${String(k + 1).padStart(2, "0")} - ${a.nome}`; while (usados.has(nome)) nome = "_" + nome; usados.add(nome);
          dir.file(nome, await r.blob());
        } catch { falhas++; }
        setProg({ feito: ++feito, total: lista.length });
      }
    }
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `Artes ${pasta(titulo)}.zip`;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 60000);
    setProg(null);
    d.aviso(falhas ? `ZIP baixado, mas ${falhas} arquivo(s) não vieram. Tente de novo.` : `ZIP baixado com ${escolhidos.length} post(s)`);
    if (!falhas) fechar();
  };

  return (
    <div className="form bx">
      <div><h2>Baixar artes</h2><p className="muted" style={{ margin: 0 }}>{titulo} · marque os posts e baixe tudo num arquivo ZIP, uma pasta por post (com a legenda junto).</p></div>
      {comArte.length === 0 ? <div className="kvazio">Nenhum post entregue neste mês ainda.</div> : arqs === null ? <div className="kvazio">Carregando…</div> : (
        <>
          <div className="bx-top">
            <button type="button" className="linkbtn" onClick={() => setSel(sel.size === comArte.length ? new Set() : new Set(comArte.map(i => i.id)))}>{sel.size === comArte.length ? "Desmarcar todos" : "Marcar todos"}</button>
            <span className="muted">{escolhidos.length} post(s) · {nArq} arquivo(s){bytes ? " · " + tamanho(bytes) : ""}</span>
          </div>
          <ul className="bx-lista">
            {comArte.map(i => {
              const fs = doPost(i.id);
              return (
                <li key={i.id}><label>
                  <input type="checkbox" checked={sel.has(i.id)} onChange={() => alternar(i.id)} />
                  <span className="bx-d">{i.data_post.slice(8, 10)}/{i.data_post.slice(5, 7)}</span>
                  <span className="bx-n"><b>{i.tema}</b><small className="muted">{d.cliente(i.cliente_id)?.nome} · {fs.length ? `${fs.length} arquivo${fs.length > 1 ? "s" : ""}` : "só link"}{i.legenda ? " · com legenda" : ""} · {i.status === "Entregue" ? "aguardando aprovação" : i.status.toLowerCase()}</small></span>
                </label></li>
              );
            })}
          </ul>
        </>
      )}
      {d.ehDono && robo && !roboFoto && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Para mandar no WhatsApp como foto, troque o arquivo robo.mjs do robô pela versão nova e abra o robô de novo.</p>}
      {erro && <div className="err">{erro}</div>}
      <div className="acts" style={{ flexWrap: "wrap" }}>
        {prog && <span className="muted" style={{ marginRight: "auto" }}>Baixando {prog.feito} de {prog.total}…</span>}
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        {d.ehDono && <button type="button" className="btn" disabled={!roboFoto || mandando || !nArq} title={roboFoto ? "Manda as imagens marcadas no grupo do WhatsApp como foto" : "Atualize o robô do WhatsApp para usar esta opção"} onClick={mandarFotos}>{mandando ? "Pedindo…" : `Mandar ${nArq || ""} no WhatsApp como foto`}</button>}
        <button type="button" className="btn gold" disabled={!!prog || !escolhidos.length} onClick={baixar}>{prog ? "Preparando ZIP…" : `Baixar ${escolhidos.length || ""} em ZIP`}</button>
      </div>
    </div>
  );
}
