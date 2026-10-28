// Artes extras: peças fixas de cada cliente (Story bom dia, boa semana, dia chuvoso...).
// O funcionário anexa uma vez e reaproveita; o dono baixa pela Galeria.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { miniDoUpload, urlsMini } from "../miniatura";

type Extra = { id: number; cliente_id: string; nome: string; ordem: number };
type ArqE = { id: string; extra_id: number; caminho: string; nome: string; tipo: string | null; tamanho: number; miniatura: string | null; criado_em: string };

export const PADRAO = ["Story - Bom dia", "Story - Boa semana", "Story - Dia chuvoso", "Story - Promoção do dia", "Story - Bom final de semana"];
const BUCKET = "entregas";
const MAX = 50 * 1024 * 1024;
const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);
const ehVideo = (a: { tipo: string | null; nome: string }) => (a.tipo || "").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(a.nome);

export function ArtesExtras({ d, clienteId, galeria }: { d: Dados; clienteId: string; galeria?: boolean }) {
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [arqs, setArqs] = useState<ArqE[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [novo, setNovo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [apagar, setApagar] = useState<number | null>(null);
  const [zip, setZip] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const alvo = useRef<number | null>(null);
  const c = d.cliente(clienteId);

  const carregar = async () => {
    const e = await supabase.from("artes_extras").select("id,cliente_id,nome,ordem").eq("cliente_id", clienteId).order("ordem").order("id");
    if (e.error) { setSemTabela(true); setExtras([]); return; }
    const lista = (e.data || []) as Extra[];
    const a = lista.length ? await supabase.from("artes_extras_arquivos").select("*").in("extra_id", lista.map(x => x.id)).order("criado_em") : { data: [] as ArqE[] };
    const fs = (a.data || []) as ArqE[];
    setUrls(await urlsMini(fs.map(x => x.miniatura || x.caminho)));
    setArqs(fs); setExtras(lista);
  };
  useEffect(() => { setExtras(null); setNovo(null); carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clienteId]);

  const criar = async (nomes: string[]) => {
    setErro(null);
    const base = (extras || []).reduce((m, x) => Math.max(m, x.ordem), 0);
    const r = await supabase.from("artes_extras").insert(nomes.map((nome, k) => ({ cliente_id: clienteId, nome, ordem: base + k + 1 })));
    if (r.error) { setErro("Não consegui criar: " + r.error.message); return; }
    setNovo(null); carregar();
  };
  const excluir = async (x: Extra) => {
    const fs = arqs.filter(a => a.extra_id === x.id);
    if (fs.length) await supabase.storage.from(BUCKET).remove(fs.flatMap(a => [a.caminho, ...(a.miniatura ? [a.miniatura] : [])]));
    const r = await supabase.from("artes_extras").delete().eq("id", x.id);
    if (r.error) { setErro("Não consegui excluir: " + r.error.message); return; }
    setApagar(null); carregar();
  };
  const anexar = async (files: File[]) => {
    const id = alvo.current; alvo.current = null;
    if (!id || !files.length) return;
    setErro(null); setEnviando(id);
    for (const f of files) {
      if (!/^(image|video)\//.test(f.type)) { setErro(f.name + ": só imagem ou vídeo."); continue; }
      if (f.size > MAX) { setErro(f.name + ": passa de 50 MB."); continue; }
      const caminho = `extras/${id}/${Date.now()}-${nomeSeguro(f.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(caminho, f, { contentType: f.type });
      if (up.error) { setErro("Não consegui enviar " + f.name + ": " + up.error.message); continue; }
      const miniatura = await miniDoUpload(`extras/${id}`, f);
      const r = await supabase.from("artes_extras_arquivos").insert({ extra_id: id, caminho, nome: f.name, tipo: f.type, tamanho: f.size, miniatura });
      if (r.error) { await supabase.storage.from(BUCKET).remove([caminho, ...(miniatura ? [miniatura] : [])]); setErro("Não consegui salvar " + f.name + ": " + r.error.message); }
    }
    setEnviando(null); carregar(); d.aviso("Arte extra salva");
  };
  const tirar = async (a: ArqE) => {
    await supabase.storage.from(BUCKET).remove([a.caminho, ...(a.miniatura ? [a.miniatura] : [])]);
    await supabase.from("artes_extras_arquivos").delete().eq("id", a.id);
    carregar();
  };
  const baixar = async (a: ArqE) => {
    const r = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 600, { download: a.nome });
    if (!r.data?.signedUrl) { d.aviso("Não consegui baixar " + a.nome); return; }
    const el = document.createElement("a"); el.href = r.data.signedUrl; el.rel = "noopener"; document.body.appendChild(el); el.click(); el.remove();
  };
  const baixarTudo = async () => {
    if (!arqs.length) return;
    setZip(true);
    try {
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      const s = await supabase.storage.from(BUCKET).createSignedUrls(arqs.map(a => a.caminho), 3600);
      const u = new Map((s.data || []).map((x: any) => [x.path, x.signedUrl as string]));
      for (const x of extras || []) {
        const pasta = z.folder(x.nome.replace(/[\\/:*?"<>|]+/g, "-"))!;
        for (const a of arqs.filter(f => f.extra_id === x.id)) { const url = u.get(a.caminho); if (url) { const r = await fetch(url); if (r.ok) pasta.file(a.nome, await r.blob()); } }
      }
      const blob = await z.generateAsync({ type: "blob", compression: "STORE" });
      const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `Artes extras ${c?.nome || ""}.zip`;
      document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 60000);
    } catch { d.aviso("Não consegui montar o ZIP. Tente de novo."); }
    setZip(false);
  };

  return (
    <section className={"ax" + (galeria ? " ax-gal" : "")} aria-label="Artes extras">
      <div className="ax-top">
        <h2>Artes extras</h2>
        {galeria && arqs.length > 0 && <button type="button" className="btn sm" disabled={zip} onClick={baixarTudo}>{zip ? "Montando…" : "Baixar todas"}</button>}
      </div>
      <p className="muted ax-dica">Artes fixas de {c?.nome || "cliente"} para usar sempre que precisar. Anexe uma vez e reaproveite.</p>
      <input ref={input} type="file" accept="image/*,video/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; anexar(fs); }} />
      {semTabela ? <div className="kvazio">As artes extras ainda não foram liberadas no banco. Peça ao dono para rodar a atualização.</div>
        : extras === null ? <div className="kvazio">Carregando…</div>
        : (
          <>
            {extras.length === 0 && (
              <div className="ax-vazio">
                <span className="muted">Nenhuma arte extra ainda.</span>
                <button type="button" className="btn gold sm" onClick={() => criar(PADRAO)}>Criar as 5 de sempre</button>
                <small className="muted">{PADRAO.map(x => x.replace("Story - ", "")).join(" · ")}</small>
              </div>
            )}
            <ul className="ax-lista">
              {extras.map(x => {
                const fs = arqs.filter(a => a.extra_id === x.id);
                return (
                  <li key={x.id} className="ax-it">
                    <div className="ax-nome">
                      <b>{x.nome}</b>
                      {apagar === x.id
                        ? <span className="ax-conf"><button type="button" className="linkbtn bad-t" onClick={() => excluir(x)}>Excluir mesmo</button><button type="button" className="linkbtn" onClick={() => setApagar(null)}>Não</button></span>
                        : <button type="button" className="ax-x" aria-label={"Excluir " + x.nome} onClick={() => setApagar(x.id)}>✕</button>}
                    </div>
                    {fs.length > 0 && (
                      <div className="ax-arqs">
                        {fs.map(a => {
                          const u = urls.get(a.miniatura || a.caminho);
                          return (
                            <figure key={a.id}>
                              <button type="button" className="ax-img" title={"Baixar " + a.nome} onClick={() => baixar(a)}>
                                {u ? (ehVideo(a) && !a.miniatura ? <video src={u} muted preload="metadata" /> : <img src={u} alt={a.nome} loading="lazy" />) : <span>{a.nome.split(".").pop()}</span>}
                              </button>
                              <button type="button" className="ax-tira" aria-label={"Remover " + a.nome} onClick={() => tirar(a)}>✕</button>
                            </figure>
                          );
                        })}
                      </div>
                    )}
                    <button type="button" className="ax-anexar" disabled={enviando === x.id} onClick={() => { alvo.current = x.id; input.current?.click(); }}>
                      {enviando === x.id ? "Enviando…" : fs.length ? "+ anexar outra" : "+ anexar arte"}
                    </button>
                  </li>
                );
              })}
            </ul>
            {novo === null
              ? <button type="button" className="ax-novo" onClick={() => setNovo("")}>+ Nova arte extra</button>
              : (
                <form className="ax-form" onSubmit={e => { e.preventDefault(); if (novo.trim()) criar([novo.trim()]); }}>
                  <label className="sr-only" htmlFor="ax-novo">Nome da arte extra</label>
                  <input id="ax-novo" autoFocus value={novo} onChange={e => setNovo(e.target.value)} placeholder="Ex.: Story - Feliz aniversário" maxLength={60} />
                  <button type="submit" className="btn gold sm" disabled={!novo.trim()}>Criar</button>
                  <button type="button" className="btn sm" onClick={() => setNovo(null)}>Cancelar</button>
                </form>
              )}
          </>
        )}
      {erro && <div className="err">{erro}</div>}
    </section>
  );
}
