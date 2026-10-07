import type { Dados } from "../App";
import { alerta, dt, fmtw, mesLabel, noMes, placar, pontual, prazoDe } from "../regras";
import { Chip, Head, MesNav } from "../ui";

export default function Painel({ d }: { d: Dados }) {
  const doMes = d.itens.filter(i => noMes(i, d.mes) && i.tipo !== "Prazo do cliente");
  const c = { prazo: 0, atraso: 0, pendente: 0 }; doMes.forEach(i => { const r = pontual(i); if (r) c[r]++; });
  const tot = c.prazo + c.atraso + c.pendente; const pct = tot ? Math.round(100 * c.prazo / tot) : null;
  const todos = d.itens.filter(i => i.tipo !== "Prazo do cliente");
  const cnt = (a: string) => todos.filter(i => alerta(i) === a).length;
  const equipe = d.pessoas.filter(p => p.ativo && p.papel === "funcionario")
    .map(p => ({ p, s: placar(doMes.filter(i => i.responsavel_id === p.id)) }))
    .sort((a, b) => (a.s.pct ?? 101) - (b.s.pct ?? 101));
  const urg = todos.filter(i => ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES"].includes(alerta(i))).sort((a, b) => prazoDe(a).getTime() - prazoDe(b).getTime()).slice(0, 10);
  const cli = d.itens.filter(i => i.tipo === "Prazo do cliente" && alerta(i) !== "NO PRAZO" && alerta(i) !== "OK").slice(0, 8);
  const semDono = d.clientes.filter(x => x.ativo && !x.responsavel_id);

  return (
    <>
      <Head eb="visão do dono" t={mesLabel(d.mes)[0].toUpperCase() + mesLabel(d.mes).slice(1)} sub="Quem está entregando, o que está atrasado e o que precisa da sua aprovação." right={<MesNav mes={d.mes} setMes={d.setMes} />} />
      <div className="kpis">
        <div className="kpi hl"><span className="n">{pct === null ? "—" : pct + "%"}</span><span className="l">pontualidade no mês</span></div>
        <div className="kpi bad"><span className="n">{cnt("ATRASADO")}</span><span className="l">artes atrasadas</span></div>
        <div className="kpi warn"><span className="n">{cnt("VENCE HOJE")}</span><span className="l">vencem hoje</span></div>
        <div className="kpi bad"><span className="n">{cnt("SEM LINK")}</span><span className="l">entregues sem link</span></div>
        <div className="kpi"><span className="n">{cnt("AGUARDA APROVAÇÃO")}</span><span className="l">aguardando sua aprovação</span></div>
      </div>
      {semDono.length > 0 && <div className="note"><b>{semDono.length} cliente(s) sem responsável:</b> {semDono.map(x => x.nome).join(", ")}. Defina quem cuida deles na aba Clientes.</div>}
      {d.itens.length === 0 && <div className="note">Ainda não há posts lançados. Comece pela aba <b>Produção</b>, em <b>+ Novo post</b>.</div>}
      <div className="two">
        <section className="panel"><h2>Equipe no mês</h2><p className="muted" style={{ margin: "4px 0 12px" }}>Entregas com prazo vencido até hoje. Quem precisa de atenção aparece primeiro.</p>
          <div className="tablewrap" style={{ border: 0 }}><table style={{ minWidth: 520 }}>
            <thead><tr><th>Pessoa</th><th className="num">No prazo</th><th className="num">Atraso</th><th className="num">Pendente</th><th>Pontualidade</th></tr></thead>
            <tbody>{equipe.map(({ p, s }) => (
              <tr key={p.id}><td><span className="cli">{p.nome}</span><div className="muted">{p.funcao}</div></td>
                <td className="num">{s.prazo}</td><td className="num">{s.atraso}</td><td className="num">{s.pendente}</td>
                <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="bar" style={{ flex: 1 }}><i style={{ width: (s.pct ?? 0) + "%" }} /></div><b style={{ minWidth: 40, textAlign: "right" }}>{s.pct === null ? "—" : s.pct + "%"}</b></div></td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="panel"><h2>Prazos dos clientes</h2><p className="muted" style={{ margin: "4px 0 8px" }}>Material que o cliente precisa mandar.</p><div className="list">
          {cli.length ? cli.map(i => <div className="row" key={i.id}><div className="t"><span className="cli">{d.cliente(i.cliente_id)?.nome}</span><div className="muted">{i.tema} · {fmtw(dt(i.data_post))}</div></div><Chip a={alerta(i)} /></div>)
            : <p className="muted">Nenhum prazo de cliente vencendo.</p>}
        </div></section>
      </div>
      <section className="panel"><h2>Precisa de atenção</h2><div className="list">
        {urg.length ? urg.map(i => <div className="row" key={i.id}><div className="t"><span className="cli">{d.cliente(i.cliente_id)?.nome}</span> · {i.tema}<div className="muted">{d.pessoa(i.responsavel_id)?.nome || "Sem responsável"} · prazo da arte {fmtw(prazoDe(i))}</div></div><Chip a={alerta(i)} /></div>)
          : <p className="muted">Nada urgente. Tudo no prazo.</p>}
      </div></section>
    </>
  );
}
