import { useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, alerta, ordenar, placar, noMes, hojeSP, iso, dt, fmt, fmtw, prazoDe } from "../regras";
import { Head, Modal, useBusy } from "../ui";
import { EntregaForm } from "./tabela";

type Col = { chave: string; nome: string; dica: string; cor: string; status: string[] };
const COLUNAS: Col[] = [
  { chave: "fazer", nome: "A fazer", dica: "Ordem: prazo da arte mais perto primeiro.", cor: "var(--mute)", status: ["A fazer"] },
  { chave: "prod", nome: "Em produção", dica: "Quando terminar, cole o link e entregue.", cor: "var(--teal)", status: ["Em produção"] },
  { chave: "aprov", nome: "Aguardando aprovação", dica: "Entregue. Agora é com o dono.", cor: "var(--ok)", status: ["Entregue"] },
  { chave: "ajuste", nome: "Ajustes pedidos", dica: "Voltou para você com o que mudar.", cor: "var(--bad)", status: ["Ajustes"] },
];

// cor fixa por cliente, para reconhecer de relance
const tagDe = (id: string) => "tg" + ([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 5);

function rotuloPrazo(i: Item): { txt: string; cls: string } {
  const hoje = hojeSP(), p = prazoDe(i), a = alerta(i);
  if (i.status === "Entregue") return { txt: i.entregue_em ? "entregue " + fmt(new Date(i.entregue_em)) : "entregue", cls: "pz-ok" };
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
  const verbo = i.status === "Ajustes" ? "refazer" : "arte";
  if (a === "ATRASADO") return { txt: "atrasada · era " + fmt(p), cls: "pz-bad" };
  if (iso(p) === iso(hoje)) return { txt: verbo + " HOJE", cls: "pz-warn" };
  if (iso(p) === iso(amanha)) return { txt: verbo + " até AMANHÃ", cls: "pz-warn" };
  if (a === "VENCE EM BREVE" || a === "AJUSTES") return { txt: verbo + " até " + fmtw(p), cls: "pz-gold" };
  return { txt: verbo + " até " + fmtw(p), cls: "" };
}

export default function Minhas({ d }: { d: Dados }) {
  const [filtro, setFiltro] = useState<string>("");
  const [entregar, setEntregar] = useState<Item | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const { run } = useBusy();

  const minhas = d.itens.filter(i => i.responsavel_id === d.me.id && i.tipo !== "Prazo do cliente");
  const mesAtual = iso(hojeSP()).slice(0, 7);
  // tudo que ainda está em andamento (de qualquer mês) + o que foi entregue e espera aprovação
  const ativas = ordenar(minhas.filter(i => !["Aprovado", "Postado"].includes(i.status)));
  const clientes = [...new Set(ativas.map(i => i.cliente_id))].map(id => ({ id, nome: d.cliente(id)?.nome || "—", n: ativas.filter(i => i.cliente_id === id).length }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const vis = filtro ? ativas.filter(i => i.cliente_id === filtro) : ativas;

  const doMes = minhas.filter(i => noMes(i, mesAtual));
  const prontas = doMes.filter(i => ["Entregue", "Aprovado", "Postado"].includes(i.status) && i.link).length;
  const atrasadas = ativas.filter(i => alerta(i) === "ATRASADO").length;
  const p = placar(doMes);

  const comecar = async (i: Item) => {
    const ok = await run(() => supabase.from("itens").update({ status: "Em produção" }).eq("id", i.id) as any);
    if (ok) { d.aviso("Foi para Em produção"); d.recarregar(); }
  };

  return (
    <>
      <Head eb={"olá, " + d.me.nome.split(" ")[0]} t="Minhas demandas"
        sub="Cada arte anda da esquerda para a direita. Seu trabalho termina quando ela chega em Aguardando aprovação."
        right={clientes.length > 1 ? (
          <div className="kfiltro" role="group" aria-label="Filtrar por cliente">
            <button type="button" aria-pressed={!filtro} onClick={() => setFiltro("")}>Todos · {ativas.length}</button>
            {clientes.map(c => <button type="button" key={c.id} aria-pressed={filtro === c.id} onClick={() => setFiltro(c.id)}>{c.nome} · {c.n}</button>)}
          </div>
        ) : undefined} />

      <div className="kresumo">
        <span><b>{prontas} de {doMes.length}</b> artes de {mesAtual === d.mes ? "este mês" : "o mês"} entregues</span>
        <div className="kbar" aria-hidden="true"><div style={{ width: (doMes.length ? Math.round(prontas / doMes.length * 100) : 0) + "%" }} /></div>
        {atrasadas > 0 && <span className="pz-bad"><b>{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</b></span>}
        <span className="muted">pontualidade: <b>{p.pct === null ? "—" : p.pct + "%"}</b></span>
      </div>

      {minhas.length === 0
        ? <div className="panel empty">Nenhuma demanda com você ainda. Quando o dono lançar os posts do mês, eles aparecem aqui.</div>
        : (
          <div className="kanban">
            {COLUNAS.map(col => {
              const cards = vis.filter(i => col.status.includes(i.status));
              return (
                <section className="kcol" key={col.chave} aria-label={col.nome}>
                  <h2><span><i style={{ background: col.cor }} />{col.nome}</span><small>{cards.length}</small></h2>
                  <p className="kdica">{col.dica}</p>
                  {cards.length === 0 && <div className="kvazio">Nada aqui</div>}
                  {cards.map(i => {
                    const c = d.cliente(i.cliente_id), pz = rotuloPrazo(i), exp = aberto === i.id;
                    return (
                      <article className={"kcard " + (pz.cls ? "k" + pz.cls : "")} key={i.id}>
                        <div className="ktop">
                          <span className={"ktag " + tagDe(i.cliente_id)}>{c?.nome}</span>
                          <span className={"kprazo " + pz.cls}>{pz.txt}</span>
                        </div>
                        <button type="button" className="ktema" aria-expanded={exp} onClick={() => setAberto(exp ? null : i.id)}>{i.tema}</button>
                        {exp && (
                          <div className="kbrief">
                            <div><b>{i.tipo}</b> · post {fmtw(dt(i.data_post))}</div>
                            {i.briefing && <div>{i.briefing}</div>}
                            {i.link && <a href={i.link} target="_blank" rel="noopener noreferrer">abrir a arte entregue</a>}
                          </div>
                        )}
                        <div className="kfoot">
                          <span>post {fmtw(dt(i.data_post))}</span>
                          {i.status === "A fazer" && <span className="kbtns">
                            <button type="button" className="kja" onClick={() => setEntregar(i)}>já terminei</button>
                            <button type="button" className="btn sm" onClick={() => comecar(i)}>Comecei</button>
                          </span>}
                          {i.status === "Em produção" && <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Entregar</button>}
                          {i.status === "Ajustes" && <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Reenviar</button>}
                          {i.status === "Entregue" && (i.link
                            ? <a className="btn sm" href={i.link} target="_blank" rel="noopener noreferrer">Ver arte</a>
                            : <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Colar link</button>)}
                        </div>
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      <Modal open={!!entregar} onClose={() => setEntregar(null)}>
        {entregar && <EntregaForm d={d} i={entregar} fechar={() => setEntregar(null)} />}
      </Modal>
    </>
  );
}
