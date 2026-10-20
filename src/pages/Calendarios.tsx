import type React from "react";
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, areaDe, iso, mesLabel, noMes, veTipo, temArte } from "../regras";
import { Head, MesNav, Modal } from "../ui";
import { ItemForm } from "./tabela";
import { Renomear } from "./renomear";
import { cronogramaPDF } from "../pdfCalendario";
import { BaixarVarios, EntregaVer } from "./entrega";

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

export default function Calendarios({ d }: { d: Dados }) {
  let clis = d.clientes.filter(c => c.ativo);
  if (!d.ehDono) clis = clis.filter(c => c.responsavel_id === d.me.id || d.itens.some(i => i.cliente_id === c.id));
  const [sel, setSel] = useState(clis[0]?.id || "");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Partial<Item> | null>(null);
  const [renPost, setRenPost] = useState<Item | null>(null);
  const [renCli, setRenCli] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [ver, setVer] = useState<Item | null>(null);
  const [lote, setLote] = useState<null | "cli" | "todos">(null);
  const [capas, setCapas] = useState<Record<number, { url: string; video: boolean; n: number }>>({});
  const c = d.cliente(sel);
  const meuCli = !d.ehDono && c?.responsavel_id === d.me.id;
  const editar = (d.ehDono || meuCli) && editando;
  // funcionário mexe só nos posts dele, do cliente dele
  const mexe = (i: Item) => d.ehDono || (i.responsavel_id === d.me.id && i.tipo !== "Prazo do cliente");

  const area = areaDe(d.me.funcao, d.ehDono);
  const its = d.itens.filter(i => i.cliente_id === sel && noMes(i, d.mes) && veTipo(area, i.tipo));
  // dono: miniatura da primeira imagem entregue de cada post do mês
  const comArq = d.ehDono ? its.filter(i => (i.n_arquivos || 0) > 0).map(i => i.id) : [];
  const chaveArq = comArq.join(",") + "|" + its.map(i => (i.n_arquivos || 0)).join(",");
  useEffect(() => {
    if (!comArq.length) { setCapas({}); return; }
    let vivo = true;
    (async () => {
      const r = await supabase.from("entrega_arquivos").select("item_id,caminho,tipo,nome,ordem,criado_em").in("item_id", comArq).is("removido_em", null);
      const lista = (r.data || []) as any[];
      const prim = new Map<number, any>(), cont = new Map<number, number>();
      for (const x of lista.sort((p, q) => (p.ordem ?? 1e9) - (q.ordem ?? 1e9) || String(p.criado_em).localeCompare(q.criado_em))) {
        cont.set(x.item_id, (cont.get(x.item_id) || 0) + 1);
        if (!prim.has(x.item_id)) prim.set(x.item_id, x);
      }
      const arr = [...prim.values()];
      if (!arr.length) { if (vivo) setCapas({}); return; }
      const sg = await supabase.storage.from("entregas").createSignedUrls(arr.map(x => x.caminho), 3600);
      const urls = new Map((sg.data || []).map((x: any) => [x.path, x.signedUrl]));
      const out: Record<number, { url: string; video: boolean; n: number }> = {};
      for (const x of arr) { const u = urls.get(x.caminho); if (u) out[x.item_id] = { url: u as string, video: /^video/.test(x.tipo || "") || /\.(mp4|mov|m4v|webm)$/i.test(x.nome), n: cont.get(x.item_id) || 1 }; }
      if (vivo) setCapas(out);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveArq, sel, d.mes]);

  const aprovar = async (i: Item, status: "Aprovado" | "Ajustes") => {
    setVer(null);
    const r = await supabase.from("itens").update({ status }).eq("id", i.id);
    if (r.error) { d.aviso("Não deu certo: " + r.error.message); return; }
    d.aviso(status === "Aprovado" ? "Arte aprovada" : "Ajuste pedido. A pessoa vê na tela dela.");
    d.recarregar();
  };

  const [a, m] = d.mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1, 12), nd = new Date(a, m, 0).getDate(), off = primeiro.getDay();
  const semanas = Math.ceil((off + nd) / 7);

  const mover = async (id: string, dia: string) => {
    const it = d.itens.find(i => String(i.id) === id);
    if (!it || it.data_post === dia) return;
    const r = await supabase.from("itens").update({ data_post: dia }).eq("id", it.id);
    if (r.error) { d.aviso("Não deu certo: " + r.error.message); return; }
    d.aviso(`Post movido para ${dia.slice(8)}/${dia.slice(5, 7)}. A equipe já vê a nova data.`);
    d.recarregar();
  };

  const cel: React.ReactElement[] = [];
  for (let k = 0; k < semanas * 7; k++) {
    const dn = k - off + 1;
    if (dn < 1 || dn > nd) { cel.push(<div className="d off" key={k} />); continue; }
    const dia = iso(new Date(a, m - 1, dn, 12));
    const ps = its.filter(i => i.data_post === dia);
    const drop = editar ? {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (alvo !== dia) setAlvo(dia); },
      onDragLeave: () => setAlvo(x => (x === dia ? null : x)),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setAlvo(null); const id = e.dataTransfer.getData("text/plain"); setArrastando(null); if (id) mover(id, dia); },
    } : {};
    cel.push(
      <div className={"d" + (editar ? " ed" : "") + (alvo === dia ? " alvo" : "")} key={k} {...drop}>
        <span className="dn">{dn}</span>
        {ps.map(i => {
          const cp = capas[i.id];
          const st = d.ehDono && i.tipo !== "Prazo do cliente" && ["Entregue", "Aprovado", "Postado", "Ajustes"].includes(i.status) ? i.status : null;
          const conteudo = <>{d.ehDono && cp && !editar && <span className="p-capa">{cp.video ? <video src={cp.url} muted preload="metadata" /> : <img src={cp.url} alt="" loading="lazy" />}{cp.video && <em>▶</em>}{cp.n > 1 && <i>{cp.n}</i>}</span>}
            <b>{i.tipo.toUpperCase()}</b>{i.tema}{editar && i.tipo !== "Prazo do cliente" && <small>{d.pessoa(i.responsavel_id)?.nome || "sem responsável"}</small>}
            {st && !editar && <span className={"p-st st-" + (st === "Entregue" ? "aprovar" : st === "Ajustes" ? "ajuste" : "ok")}>{st === "Entregue" ? "Aprovar" : st}</span>}</>;
          const cls = "p" + (i.tipo === "Prazo do cliente" ? " pz" : "") + (arrastando === String(i.id) ? " drag" : "");
          return editar && mexe(i)
            ? <button type="button" className={cls} key={i.id} draggable title="Clique para editar ou arraste para outro dia"
                onDragStart={e => { e.dataTransfer.setData("text/plain", String(i.id)); e.dataTransfer.effectAllowed = "move"; setArrastando(String(i.id)); }}
                onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                onClick={() => setForm(i)}>{conteudo}</button>
            : d.ehDono && temArte(i)
              ? <button type="button" className={cls + " com-arte"} key={i.id} title="Ver a entrega, baixar e aprovar" onClick={() => setVer(i)}>{conteudo}</button>
            : !d.ehDono && i.responsavel_id === d.me.id && i.tipo !== "Prazo do cliente"
              ? <button type="button" className={cls} key={i.id} title="Clique para trocar o nome do post" onClick={() => setRenPost(i)}>{conteudo}</button>
              : <div className={cls} key={i.id}>{conteudo}</div>;
        })}
        {editar && <button type="button" className="add" aria-label={`Adicionar post no dia ${dn}`}
          onClick={() => setForm({ cliente_id: sel, data_post: dia, responsavel_id: d.ehDono ? (c?.responsavel_id || null) : d.me.id })}>+ post</button>}
      </div>
    );
  }

  if (!clis.length) return <><Head eb="calendários" t="Cronograma de conteúdos" /><div className="panel empty">Nenhum cliente com você ainda.</div></>;
  return (
    <>
      <Head eb="calendários" t="Cronograma de conteúdos"
        sub={d.ehDono && !editar ? "Os posts do cliente no formato do calendário. Clique num post entregue para ver a arte, baixar e aprovar." : editar && !d.ehDono ? "Clique num post seu para mudar nome, data ou excluir. Arraste para trocar o dia ou use “+ post”." : !d.ehDono ? "Os calendários dos clientes que estão com você. Clique num post seu para trocar o nome dele. Nos clientes que são seus, use Editar para criar, mover ou excluir posts." : editar ? "Clique num post para editar, arraste para trocar o dia ou use “+ post”. A mudança aparece na hora para quem produz." : "Os posts lançados na produção, no formato do calendário do cliente."}
        right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button type="button" className="btn" disabled={gerando || !c} onClick={async () => {
            if (!c) return; setGerando(true);
            try { await cronogramaPDF({ cliente: c, mes: d.mes, itens: its, responsavel: d.pessoa(c.responsavel_id) || undefined }); d.aviso("PDF baixado com os posts de agora"); }
            catch { d.aviso("Não consegui gerar o PDF. Tente de novo."); }
            finally { setGerando(false); }
          }}>{gerando ? "Gerando PDF…" : "Baixar PDF"}</button>
          {d.ehDono && <button type="button" className="btn" onClick={() => setLote("cli")}>Baixar artes</button>}
          {(d.ehDono || meuCli) && <button type="button" className={"btn " + (editar ? "pri" : "gold")} aria-pressed={editar} onClick={() => setEditando(x => !x)}>{editar ? "Concluir edição" : "Editar"}</button>}
        </div>} />
      <div className="calhead">
        <div className="calbrand">
          <div className="lg">{c?.logo ? <img src={c.logo} alt={"Logo " + c.nome} /> : <b>{c?.nome}</b>}</div>
          <div><div className="caltitle">CRONOGRAMA DE CONTEÚDOS</div><div className="muted">{c?.nome} · {mesLabel(d.mes)} · {its.filter(i => i.tipo !== "Prazo do cliente").length} posts</div>
            {!d.ehDono && c?.responsavel_id === d.me.id && <button type="button" className="linkbtn" onClick={() => setRenCli(true)}>Trocar o nome do cliente</button>}</div>
        </div>
        <div className="filters">
          <select aria-label="Cliente" value={sel} onChange={e => setSel(e.target.value)}>{clis.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          <MesNav mes={d.mes} setMes={d.setMes} />
        </div>
      </div>
      <div className="tablewrap" style={{ border: 0, background: "transparent" }}>
        <div className={"calgrid" + (editar ? " editando" : "")}>{DIAS.map(x => <div className="dh" key={x}>{x}</div>)}{cel}</div>
      </div>
      <Modal open={!!renPost} onClose={() => setRenPost(null)}>
        {renPost && <Renomear titulo="Trocar o nome do post" rotulo="Nome do post" atual={renPost.tema} fechar={() => setRenPost(null)}
          salvar={async novo => { const r = await supabase.from("itens").update({ tema: novo }).eq("id", renPost.id); if (!r.error) { d.aviso("Nome do post atualizado"); d.recarregar(); } return r; }} />}
      </Modal>
      <Modal open={renCli} onClose={() => setRenCli(false)}>
        {renCli && c && <Renomear titulo="Trocar o nome do cliente" rotulo="Nome do cliente" atual={c.nome} fechar={() => setRenCli(false)}
          salvar={async novo => { const r = await supabase.from("clientes").update({ nome: novo }).eq("id", c.id); if (!r.error) { d.aviso("Nome do cliente atualizado"); d.recarregar(); } return r; }} />}
      </Modal>
      <Modal open={!!lote} onClose={() => setLote(null)}>
        {lote && c && <div>
          <div className="kfiltro" role="group" aria-label="Quais posts" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
            <button type="button" aria-pressed={lote === "cli"} onClick={() => setLote("cli")}>Só {c.nome}</button>
            <button type="button" aria-pressed={lote === "todos"} onClick={() => setLote("todos")}>Todos os clientes</button>
          </div>
          <BaixarVarios key={lote} d={d} fechar={() => setLote(null)}
            titulo={(lote === "cli" ? c.nome : "todos os clientes") + " · " + mesLabel(d.mes)}
            itens={lote === "cli" ? its : d.itens.filter(i => noMes(i, d.mes))} />
        </div>}
      </Modal>
      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)}
          aprovar={ver.status === "Entregue" ? () => aprovar(ver, "Aprovado") : undefined}
          ajuste={ver.status === "Entregue" ? () => aprovar(ver, "Ajustes") : undefined} />}
      </Modal>
      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && <ItemForm key={form.id || "novo-" + form.data_post} d={d} item={form} fechar={() => setForm(null)} />}
      </Modal>
    </>
  );
}
