import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, areaDe, mesLabel, veTipo } from "../regras";
import { Head, Modal } from "../ui";
import { EntregaVer } from "./entrega";
import { urlsMini } from "../miniatura";
import { ArtesExtras } from "./extras";

type Arq = { id: string; item_id: number; caminho: string; nome: string; tipo: string | null; ordem: number | null; criado_em: string; removido_em: string | null; miniatura?: string | null };
type Card = { i: Item; capa?: string; video: boolean; n: number; soMini: boolean };

const ehVideo = (a: Arq) => (a.tipo || "").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(a.nome);
const pastaDrive = (url: string) => url.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([\w-]{10,})/)?.[1] || null;

export default function Galeria({ d }: { d: Dados }) {
  const area = areaDe(d.me.funcao, d.ehDono);
  // posts com arte anexada que esta pessoa pode ver (funcionário: os dele)
  const comArte = d.itens.filter(i => (i.n_arquivos || 0) > 0 && i.tipo !== "Prazo do cliente" && veTipo(area, i.tipo) && (d.ehDono || i.responsavel_id === d.me.id));
  const clis = d.clientes.filter(c => c.ativo || comArte.some(i => i.cliente_id === c.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  const [cli, setCli] = useState<string>(() => { try { return localStorage.getItem("gal-cli") || ""; } catch { return ""; } });
  const [mes, setMes] = useState<string>("");
  const [arqs, setArqs] = useState<Arq[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [ver, setVer] = useState<Item | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [mandando, setMandando] = useState(false);
  const [links, setLinks] = useState<{ cliente_id: string | null; titulo: string; url: string }[]>([]);
  const [antigo, setAntigo] = useState(false);
  const cliOk = clis.some(c => c.id === cli) ? cli : "";
  useEffect(() => { try { localStorage.setItem("gal-cli", cliOk); } catch { /* sem armazenamento */ } }, [cliOk]);

  const doCli = comArte.filter(i => !cliOk || i.cliente_id === cliOk);
  const meses = [...new Set(doCli.map(i => i.data_post.slice(0, 7)))].sort().reverse();
  const mesOk = meses.includes(mes) ? mes : "";
  const mostra = doCli.filter(i => !mesOk || i.data_post.startsWith(mesOk)).sort((a, b) => b.data_post.localeCompare(a.data_post));
  const ids = mostra.map(i => i.id);
  const chave = ids.join(",") + "|" + mostra.map(i => i.n_arquivos).join(",");

  useEffect(() => { supabase.from("links").select("cliente_id,titulo,url").then(r => setLinks((r.data || []) as any)); }, []);

  useEffect(() => {
    let vivo = true;
    setArqs(null);
    (async () => {
      const lista: Arq[] = [];
      for (let k = 0; k < ids.length; k += 150) {
        const lote = ids.slice(k, k + 150);
        let r: any = await supabase.from("entrega_arquivos").select("id,item_id,caminho,nome,tipo,ordem,criado_em,removido_em,miniatura").in("item_id", lote);
        if (r.error) r = await supabase.from("entrega_arquivos").select("id,item_id,caminho,nome,tipo,ordem,criado_em,removido_em").in("item_id", lote);
        lista.push(...((r.data || []) as Arq[]));
      }
      lista.sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.criado_em.localeCompare(b.criado_em));
      // capa = miniatura da 1ª arte (ou o original, enquanto ainda não tem miniatura)
      const caps: string[] = [];
      const vistos = new Set<number>();
      for (const a of lista) if (!vistos.has(a.item_id) && (a.miniatura || !a.removido_em)) { vistos.add(a.item_id); caps.push(a.miniatura || a.caminho); }
      const u = await urlsMini(caps);
      if (vivo) { setArqs(lista); setUrls(u); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const cards: Card[] = useMemo(() => mostra.map(i => {
    const fs = (arqs || []).filter(a => a.item_id === i.id);
    const p = fs.find(a => a.miniatura || !a.removido_em);
    return { i, capa: p ? urls.get(p.miniatura || p.caminho) : undefined, video: !!p && ehVideo(p) && !p.miniatura, n: fs.length, soMini: fs.length > 0 && fs.every(a => a.removido_em) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [arqs, urls, chave]);

  const porMes = new Map<string, Card[]>();
  for (const c of cards) { const m = c.i.data_post.slice(0, 7); porMes.set(m, [...(porMes.get(m) || []), c]); }

  const alternar = (id: number) => setMarcados(x => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const mandarFotos = async () => {
    const lista = [...marcados].filter(id => ids.includes(id));
    if (!lista.length) return;
    setMandando(true);
    const r = await supabase.from("avisos_whatsapp").insert(lista.map(item_id => ({ item_id, motivo: "fotos" })));
    setMandando(false);
    if (r.error) { d.aviso("Não consegui pedir o envio: " + r.error.message); return; }
    d.aviso(`${lista.length} post(s) na fila: o robô manda as fotos no grupo em instantes`);
    setMarcados(new Set());
  };

  const c = d.cliente(cliOk);
  const pasta = cliOk ? links.filter(l => l.cliente_id === cliOk).map(l => pastaDrive(l.url)).find(Boolean) : null;
  const drivePosts = links.find(l => !l.cliente_id && /agemax - posts/i.test(l.titulo));

  return (
    <>
      <Head eb="galeria" t="Galeria" sub={d.ehDono ? "Todas as artes já entregues, por cliente e por mês. O original fica no Google Drive; aqui fica a miniatura." : "As artes que você já entregou, por cliente e por mês."} />

      <div className="gl-filtros hs-filtros">
        <label className="sr-only" htmlFor="gl-cli">Cliente</label>
        <select id="gl-cli" value={cliOk} onChange={e => { setCli(e.target.value); setMes(""); setAntigo(false); }}>
          <option value="">Todos os clientes</option>
          {clis.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <label className="sr-only" htmlFor="gl-mes">Mês</label>
        <select id="gl-mes" value={mesOk} onChange={e => setMes(e.target.value)}>
          <option value="">Todos os meses</option>
          {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <span className="muted">{mostra.length} post(s)</span>
        {drivePosts && d.ehDono && <a className="linkbtn" href={drivePosts.url} target="_blank" rel="noopener noreferrer">Abrir o Drive dos posts ↗</a>}
      </div>

      {d.ehDono && marcados.size > 0 && (
        <div className="gl-acao">
          <span>{marcados.size} marcado(s)</span>
          <button type="button" className="btn" onClick={() => setMarcados(new Set())}>Desmarcar</button>
          <button type="button" className="btn gold" disabled={mandando} onClick={mandarFotos}>{mandando ? "Pedindo…" : "Mandar no WhatsApp como foto"}</button>
        </div>
      )}

      {arqs === null ? <div className="panel empty">Carregando as artes…</div>
        : !mostra.length ? <div className="panel empty">{cliOk ? `Nenhuma arte entregue de ${c?.nome} ${mesOk ? "em " + mesLabel(mesOk).toLowerCase() : "ainda"}.` : "Nenhuma arte entregue ainda."}</div>
        : [...porMes.entries()].map(([m, cs]) => (
          <section key={m} className="gl-mes" aria-label={mesLabel(m)}>
            <h2>{mesLabel(m)} <small className="muted">· {cs.length}</small></h2>
            <div className="gl-grade">
              {cs.map(({ i, capa, video, n, soMini }) => (
                <figure key={i.id} className={"gl-card" + (marcados.has(i.id) ? " on" : "")}>
                  <button type="button" className="gl-img" onClick={() => setVer(i)} aria-label={`Ver ${i.tema}`}>
                    {capa ? (video ? <video src={capa} muted preload="metadata" /> : <img src={capa} alt="" loading="lazy" />) : <span className="muted">sem prévia</span>}
                    {n > 1 && <i>{n}</i>}
                    {video && <em>▶</em>}
                  </button>
                  <figcaption>
                    <b>{i.tema}</b>
                    <small className="muted">{i.data_post.slice(8, 10)}/{i.data_post.slice(5, 7)}{!cliOk ? " · " + (d.cliente(i.cliente_id)?.nome || "") : ""} · {i.tipo}{soMini ? " · original no Drive" : ""}</small>
                  </figcaption>
                  {d.ehDono && <label className="gl-marca"><input type="checkbox" checked={marcados.has(i.id)} onChange={() => alternar(i.id)} /><span className="sr-only">Marcar {i.tema}</span></label>}
                </figure>
              ))}
            </div>
          </section>
        ))}

      {cliOk && <ArtesExtras d={d} clienteId={cliOk} galeria />}

      {cliOk && pasta && (
        <section className="gl-antigo">
          <div className="gl-antigo-top">
            <div><h2>Arquivo antigo</h2><p className="muted">Pasta do Drive antigo de {c?.nome}. Fica no Google Drive, não pesa o sistema.</p></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!antigo && <button type="button" className="btn" onClick={() => setAntigo(true)}>Mostrar aqui</button>}
              <a className="btn" href={`https://drive.google.com/drive/folders/${pasta}`} target="_blank" rel="noopener noreferrer">Abrir no Drive ↗</a>
            </div>
          </div>
          {antigo && <iframe title={`Arquivo antigo de ${c?.nome}`} src={`https://drive.google.com/embeddedfolderview?id=${pasta}#grid`} loading="lazy" />}
        </section>
      )}

      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)} />}
      </Modal>
    </>
  );
}
