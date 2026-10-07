import type React from "react";
import { useState } from "react";
import type { Dados } from "../App";
import { iso, mesLabel, noMes } from "../regras";
import { Head, MesNav } from "../ui";

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

export default function Calendarios({ d }: { d: Dados }) {
  let clis = d.clientes.filter(c => c.ativo);
  if (!d.ehDono) clis = clis.filter(c => c.responsavel_id === d.me.id || d.itens.some(i => i.cliente_id === c.id));
  const [sel, setSel] = useState(clis[0]?.id || "");
  const c = d.cliente(sel);
  const its = d.itens.filter(i => i.cliente_id === sel && noMes(i, d.mes));
  const [a, m] = d.mes.split("-").map(Number);
  const primeiro = new Date(a, m - 1, 1, 12), nd = new Date(a, m, 0).getDate(), off = primeiro.getDay();
  const semanas = Math.ceil((off + nd) / 7);
  const cel: React.ReactElement[] = [];
  for (let k = 0; k < semanas * 7; k++) {
    const dn = k - off + 1;
    if (dn < 1 || dn > nd) { cel.push(<div className="d off" key={k} />); continue; }
    const dia = iso(new Date(a, m - 1, dn, 12));
    const ps = its.filter(i => i.data_post === dia);
    cel.push(<div className="d" key={k}><span className="dn">{dn}</span>{ps.map(i => (
      <div className={"p" + (i.tipo === "Prazo do cliente" ? " pz" : "")} key={i.id}><b>{i.tipo.toUpperCase()}</b>{i.tema}</div>
    ))}</div>);
  }
  if (!clis.length) return <><Head eb="calendários" t="Cronograma de conteúdos" /><div className="panel empty">Nenhum cliente com você ainda.</div></>;
  return (
    <>
      <Head eb="calendários" t="Cronograma de conteúdos" sub={d.ehDono ? "Os posts lançados na produção, no formato do calendário do cliente." : "Os calendários dos clientes que estão com você."} />
      <div className="calhead">
        <div className="calbrand">
          <div className="lg">{c?.logo ? <img src={c.logo} alt={"Logo " + c.nome} /> : <b>{c?.nome}</b>}</div>
          <div><div className="caltitle">CRONOGRAMA DE CONTEÚDOS</div><div className="muted">{c?.nome} · {mesLabel(d.mes)} · {its.filter(i => i.tipo !== "Prazo do cliente").length} posts</div></div>
        </div>
        <div className="filters">
          <select aria-label="Cliente" value={sel} onChange={e => setSel(e.target.value)}>{clis.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          <MesNav mes={d.mes} setMes={d.setMes} />
        </div>
      </div>
      <div className="tablewrap" style={{ border: 0, background: "transparent" }}>
        <div className="calgrid">{DIAS.map(x => <div className="dh" key={x}>{x}</div>)}{cel}</div>
      </div>
    </>
  );
}
