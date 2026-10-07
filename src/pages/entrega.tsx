import { useEffect, useRef, useState } from "react";
import { SUPA_KEY, SUPA_URL, supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, dt, fmtw, temArte } from "../regras";
import { useBusy } from "../ui";

export type Arquivo = { id: string; item_id: number; caminho: string; nome: string; tipo: string | null; tamanho: number; criado_em: string; removido_em: string | null };
const MAX = 50 * 1024 * 1024;
const BUCKET = "entregas";

export const tamanho = (b: number) => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const ext = (n: string) => (n.split(".").pop() || "").toUpperCase().slice(0, 4);
const ehVideo = (a: { tipo: string | null; nome: string }) => (a.tipo || "").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(a.nome);
const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);

export async function listarArquivos(itemId: number): Promise<Arquivo[]> {
  const r = await supabase.from("entrega_arquivos").select("*").eq("item_id", itemId).order("criado_em");
  return (r.data || []) as Arquivo[];
}

// envio com barra de progresso (a biblioteca do Supabase não informa o progresso)
function enviar(caminho: string, arq: File, token: string, progresso: (p: number) => void): Promise<void> {
  return new Promise((ok, erro) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${SUPA_URL}/storage/v1/object/${BUCKET}/${caminho}`);
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.setRequestHeader("apikey", SUPA_KEY);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("Content-Type", arq.type || "application/octet-stream");
    x.upload.onprogress = e => { if (e.lengthComputable) progresso(e.loaded / e.total); };
    x.onload = () => x.status < 300 ? ok() : erro(new Error(x.status === 413 ? "Arquivo maior que 50 MB." : "Não consegui enviar (" + x.status + ")."));
    x.onerror = () => erro(new Error("Sem conexão. Tente de novo."));
    x.send(arq);
  });
}

type Envio = { chave: string; nome: string; tamanho: number; tipo: string; p: number; erro?: string; feito?: Arquivo };

/* ============ funcionário: entregar com arquivo e/ou link ============ */
export function EntregaForm({ d, i, fechar }: { d: Dados; i: Item; fechar: () => void }) {
  const [modo, setModo] = useState<"arq" | "link">(i.link && !i.n_arquivos ? "link" : "arq");
  const [link, setLink] = useState(i.link || "");
  const [antigos, setAntigos] = useState<Arquivo[]>([]);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const { busy, err, setErr, run } = useBusy();
  const galeria = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);

  useEffect(() => { listarArquivos(i.id).then(a => setAntigos(a.filter(x => !x.removido_em))); }, [i.id]);
  const atualizar = (chave: string, p: Partial<Envio>) => setEnvios(l => l.map(e => e.chave === chave ? { ...e, ...p } : e));

  const escolher = async (lista: File[]) => {
    if (!lista.length) return;
    setErr(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setErr("Sua sessão expirou. Entre de novo."); return; }
    for (const arq of lista) {
      const chave = Math.random().toString(36).slice(2);
      const base: Envio = { chave, nome: arq.name, tamanho: arq.size, tipo: arq.type, p: 0 };
      if (!/^(image|video)\//.test(arq.type)) { setEnvios(l => [...l, { ...base, erro: "Só imagem ou vídeo." }]); continue; }
      if (arq.size > MAX) { setEnvios(l => [...l, { ...base, erro: "Passa de 50 MB. Envie pelo link do Drive." }]); continue; }
      setEnvios(l => [...l, base]);
      const caminho = `${i.id}/${Date.now()}-${nomeSeguro(arq.name)}`;
      try {
        await enviar(caminho, arq, token, p => atualizar(chave, { p }));
        const r = await supabase.from("entrega_arquivos").insert({ item_id: i.id, caminho, nome: arq.name, tipo: arq.type, tamanho: arq.size, enviado_por: d.me.id }).select("*").single();
        if (r.error) { await supabase.storage.from(BUCKET).remove([caminho]); throw new Error(r.error.message); }
        atualizar(chave, { p: 1, feito: r.data as Arquivo });
      } catch (e: any) { atualizar(chave, { erro: e.message || "Falhou o envio." }); }
    }
  };

  const tirar = async (a: Arquivo, chave?: string) => {
    await supabase.storage.from(BUCKET).remove([a.caminho]);
    await supabase.from("entrega_arquivos").delete().eq("id", a.id);
    if (chave) setEnvios(l => l.filter(e => e.chave !== chave)); else setAntigos(l => l.filter(x => x.id !== a.id));
  };

  const enviando = envios.some(e => !e.erro && !e.feito);
  const novos = envios.filter(e => e.feito).length;
  const temAlgo = novos + antigos.length > 0 || !!link.trim();

  const entregar = async () => {
    if (enviando) return;
    if (!temAlgo) { setErr("Anexe a imagem ou o vídeo, ou cole o link da arte."); return; }
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) { setErr("O link precisa começar com https://"); return; }
    const ok = await run(() => supabase.from("itens").update({ status: "Entregue", link: l || null }).eq("id", i.id) as any);
    if (ok) { fechar(); d.aviso("Entregue. Agora é com o dono."); d.recarregar(); }
  };

  return (
    <div className="form ent">
      <span className="ent-pega" aria-hidden="true" />
      <div>
        <h2>{i.status === "Ajustes" ? "Reenviar arte" : "Entregar arte"}</h2>
        <p className="muted" style={{ margin: 0 }}>{d.cliente(i.cliente_id)?.nome} · {i.tema}</p>
      </div>
      <div className="ent-abas" role="tablist" aria-label="Como entregar">
        <button type="button" role="tab" aria-selected={modo === "arq"} onClick={() => setModo("arq")}>Enviar imagem ou vídeo</button>
        <button type="button" role="tab" aria-selected={modo === "link"} onClick={() => setModo("link")}>Colar link</button>
      </div>

      {modo === "arq" ? (
        <div className="ent-arq">
          <input ref={galeria} type="file" accept="image/*,video/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; escolher(fs); }} />
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
                <li key={a.id}><span className={"ent-ic" + (ehVideo(a) ? " v" : "")}>{ext(a.nome)}</span>
                  <span className="ent-n"><b>{a.nome}</b><small className="ok-t">já enviado · {tamanho(a.tamanho)}</small></span>
                  <button type="button" className="ent-x" aria-label={"Remover " + a.nome} onClick={() => tirar(a)}>✕</button></li>
              ))}
              {envios.map(e => (
                <li key={e.chave}><span className={"ent-ic" + (e.tipo.startsWith("video") ? " v" : "")}>{ext(e.nome)}</span>
                  <span className="ent-n"><b>{e.nome}</b>
                    {e.erro ? <small className="bad-t">{e.erro}</small>
                      : e.feito ? <small className="ok-t">enviado · {tamanho(e.tamanho)}</small>
                      : <><span className="ent-bar"><span style={{ width: Math.round(e.p * 100) + "%" }} /></span><small>enviando · {Math.round(e.p * 100)}% de {tamanho(e.tamanho)}</small></>}
                  </span>
                  {(e.feito || e.erro) && <button type="button" className="ent-x" aria-label={"Remover " + e.nome} onClick={() => e.feito ? tirar(e.feito, e.chave) : setEnvios(l => l.filter(x => x.chave !== e.chave))}>✕</button>}
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

      {err && <div className="err">{err}</div>}
      <div className="acts ent-acts">
        <span className="muted">{enviando ? "Espere o envio terminar…" : temAlgo ? "" : "Precisa de pelo menos 1 arquivo ou 1 link."}</span>
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="button" className="btn gold" disabled={busy || enviando} onClick={entregar}>{i.status === "Ajustes" ? "Reenviar" : "Entregar"}</button>
      </div>
    </div>
  );
}

/* ============ ver a entrega: prévia e download (dono e o próprio funcionário) ============ */
export function EntregaVer({ d, i, fechar, aprovar, ajuste }: { d: Dados; i: Item; fechar: () => void; aprovar?: () => void; ajuste?: () => void }) {
  const [arqs, setArqs] = useState<(Arquivo & { url?: string })[] | null>(null);
  const [baixando, setBaixando] = useState(false);
  useEffect(() => {
    (async () => {
      const lista = await listarArquivos(i.id);
      const vivos = lista.filter(a => !a.removido_em);
      const s = vivos.length ? await supabase.storage.from(BUCKET).createSignedUrls(vivos.map(a => a.caminho), 3600) : { data: [] as any[] };
      const mapa = new Map((s.data || []).map((x: any) => [x.path, x.signedUrl]));
      setArqs(lista.map(a => ({ ...a, url: mapa.get(a.caminho) as string | undefined })));
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
                    {a.removido_em ? <span className="muted">Arquivo removido para liberar espaço</span>
                      : !a.url ? <span className="muted">Sem prévia</span>
                      : ehVideo(a) ? <video src={a.url} controls preload="metadata" playsInline />
                      : <img src={a.url} alt={a.nome} loading="lazy" />}
                  </div>
                  <figcaption>
                    <span><b>{a.nome}</b><small className="muted">{ext(a.nome)} · {tamanho(a.tamanho)}</small></span>
                    {!a.removido_em && <button type="button" className="btn sm" onClick={() => baixar(a)}>Baixar</button>}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
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

/* ============ limpeza automática (roda quando um dono abre o site) ============ */
const LIMITE = 800 * 1048576; // começa a limpar perto de 1 GB (plano grátis)
const ALVO = 600 * 1048576;
export async function limparArquivos(): Promise<number> {
  const hoje = new Date();
  const mes = (dd: Date) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const alvoMes = hoje.getDate() >= 28 ? mes(hoje) : mes(anterior);
  const m = await supabase.from("manutencao").select("valor").eq("chave", "limpeza_mes").maybeSingle();
  const r = await supabase.from("entrega_arquivos").select("id,caminho,tamanho,criado_em,item_id,itens(status)").is("removido_em", null).order("criado_em");
  if (r.error || !r.data) return 0;
  const lista = r.data as any[];
  const finalizado = (a: any) => ["Aprovado", "Postado"].includes(a.itens?.status);
  let total = lista.reduce((s, a) => s + Number(a.tamanho || 0), 0);
  const apagar = new Set<string>();
  // fim do mês: arquivos de posts aprovados/postados com mais de 30 dias
  const mensal = (m.data?.valor || "") < alvoMes;
  if (mensal) {
    const corte = Date.now() - 30 * 864e5;
    for (const a of lista) if (finalizado(a) && new Date(a.criado_em).getTime() < corte) { apagar.add(a.id); total -= Number(a.tamanho || 0); }
  }
  // perto de lotar: os mais antigos (só de posts já aprovados/postados) até sobrar folga
  if (total > LIMITE) for (const a of lista) { if (total <= ALVO) break; if (!apagar.has(a.id) && finalizado(a)) { apagar.add(a.id); total -= Number(a.tamanho || 0); } }
  const sel = lista.filter(a => apagar.has(a.id));
  for (let k = 0; k < sel.length; k += 100) {
    const lote = sel.slice(k, k + 100);
    const rm = await supabase.storage.from(BUCKET).remove(lote.map(a => a.caminho));
    if (rm.error) break;
    await supabase.from("entrega_arquivos").update({ removido_em: new Date().toISOString() }).in("id", lote.map(a => a.id));
  }
  if (mensal) await supabase.from("manutencao").upsert({ chave: "limpeza_mes", valor: alvoMes, em: new Date().toISOString() });
  return sel.length;
}
