import type React from "react";
import { useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, iso, mesLabel, noMes } from "../regras";
import { Head, MesNav, Modal } from "../ui";
import { ItemForm } from "./tabela";
import { Renomear } from "./renomear";

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
  const c = d.cliente(sel);
  const meuCli = !d.ehDono && c?.responsavel_id === d.me.id;
  const editar = (d.ehDono || meuCli) && editando;
  // funcionário mexe só nos posts dele, do cliente dele
  const mexe = (i: Item) => d.ehDono || (i.responsavel_id === d.me.id && i.tipo !== "Prazo do cliente");

  const its = d.itens.filter(i => i.cliente_id === sel && noMes(i, d.mes));
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
          const conteudo = <><b>{i.tipo.toUpperCase()}</b>{i.tema}{editar && i.tipo !== "Prazo do cliente" && <small>{d.pessoa(i.responsavel_id)?.nome || "sem responsável"}</small>}</>;
          const cls = "p" + (i.tipo === "Prazo do cliente" ? " pz" : "") + (arrastando === String(i.id) ? " drag" : "");
          return editar && mexe(i)
            ? <button type="button" className={cls} key={i.id} draggable title="Clique para editar ou arraste para outro dia"
                onDragStart={e => { e.dataTransfer.setData("text/plain", String(i.id)); e.dataTransfer.effectAllowed = "move"; setArrastando(String(i.id)); }}
                onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                onClick={() => setForm(i)}>{conteudo}</button>
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
        sub={editar && !d.ehDono ? "Clique num post seu para mudar nome, data ou excluir. Arraste para trocar o dia ou use “+ post”." : !d.ehDono ? "Os calendários dos clientes que estão com você. Clique num post seu para trocar o nome dele. Nos clientes que são seus, use Editar para criar, mover ou excluir posts." : editar ? "Clique num post para editar, arraste para trocar o dia ou use “+ post”. A mudança aparece na hora para quem produz." : "Os posts lançados na produção, no formato do calendário do cliente."}
        right={d.ehDono || meuCli ? <button type="button" className={"btn " + (editar ? "pri" : "gold")} aria-pressed={editar} onClick={() => setEditando(x => !x)}>{editar ? "Concluir edição" : "Editar"}</button> : undefined} />
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
      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && <ItemForm key={form.id || "novo-" + form.data_post} d={d} item={form} fechar={() => setForm(null)} />}
      </Modal>
    </>
  );
}
