import type { Dados } from "../App";
import { dt, mesLabel, noMes, placar, pontual, prazoDe, uteisEntre, hojeSP } from "../regras";
import { Head, MesNav } from "../ui";

export default function Desempenho({ d }: { d: Dados }) {
  const its = d.itens.filter(i => i.responsavel_id === d.me.id && noMes(i, d.mes));
  const p = placar(its);
  const pend = its.filter(i => pontual(i) === "pendente");
  const atr = its.filter(i => pontual(i) === "atraso");
  return (
    <>
      <Head eb={mesLabel(d.mes)} t="Meu desempenho" sub="O mesmo número que o dono vê. Conta só o que já passou do prazo da arte." right={<MesNav mes={d.mes} setMes={d.setMes} />} />
      <div className="kpis">
        <div className="kpi hl"><span className="n">{p.pct === null ? "—" : p.pct + "%"}</span><span className="l">no prazo</span></div>
        <div className="kpi"><span className="n" style={{ color: "var(--ok)" }}>{p.prazo}</span><span className="l">entregues no prazo</span></div>
        <div className="kpi warn"><span className="n">{p.atraso}</span><span className="l">entregues com atraso</span></div>
        <div className="kpi bad"><span className="n">{p.pendente}</span><span className="l">pendentes</span></div>
      </div>
      <div className="two">
        <section className="panel"><h2>Pendentes</h2><div className="list">
          {pend.length ? pend.map(i => <div className="row" key={i.id}><div className="t"><span className="cli">{d.cliente(i.cliente_id)?.nome}</span> · {i.tema}</div><span className="muted">{uteisEntre(prazoDe(i), hojeSP())} dia(s) útil(eis)</span></div>) : <p className="muted">Nenhuma pendência.</p>}
        </div></section>
        <section className="panel"><h2>Entregues com atraso</h2><div className="list">
          {atr.length ? atr.map(i => <div className="row" key={i.id}><div className="t"><span className="cli">{d.cliente(i.cliente_id)?.nome}</span> · {i.tema}</div><span className="muted">{uteisEntre(prazoDe(i), dt(i.entregue_em!))} dia(s)</span></div>) : <p className="muted">Nenhuma.</p>}
        </div></section>
      </div>
    </>
  );
}
