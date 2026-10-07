import type { Dados } from "../App";
import { alerta, ordenar, placar, noMes, hojeSP, iso } from "../regras";
import { Head } from "../ui";
import { TabelaProducao } from "./tabela";

export default function Minhas({ d }: { d: Dados }) {
  const minhas = d.itens.filter(i => i.responsavel_id === d.me.id);
  // pendências de qualquer mês + tudo do mês atual em diante
  const mesAtual = iso(hojeSP()).slice(0, 7);
  const visiveis = ordenar(minhas.filter(i => i.data_post.slice(0, 7) >= mesAtual || !["OK"].includes(alerta(i))));
  const p = placar(minhas.filter(i => noMes(i, mesAtual)));
  const al = minhas.map(i => alerta(i));
  const n = (a: string) => al.filter(x => x === a).length;
  return (
    <>
      <Head eb={"olá, " + d.me.nome.split(" ")[0]} t="Minhas demandas" sub="Terminou a arte? Clique em Entregar e cole o link do Drive ou do Canva." />
      <div className="kpis">
        <div className="kpi bad"><span className="n">{n("ATRASADO")}</span><span className="l">atrasadas</span></div>
        <div className="kpi warn"><span className="n">{n("VENCE HOJE")}</span><span className="l">vencem hoje</span></div>
        <div className="kpi"><span className="n">{n("VENCE EM BREVE") + n("AJUSTES")}</span><span className="l">vencem em breve ou com ajuste</span></div>
        <div className="kpi hl"><span className="n">{p.pct === null ? "—" : p.pct + "%"}</span><span className="l">sua pontualidade no mês</span></div>
      </div>
      {minhas.length === 0
        ? <div className="panel empty">Nenhuma demanda com você ainda. Quando o dono lançar os posts do mês, eles aparecem aqui.</div>
        : <TabelaProducao d={d} its={visiveis} comResp={false} />}
    </>
  );
}
