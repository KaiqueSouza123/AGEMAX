import { useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, temArte, alerta, ordenar, placar, noMes, hojeSP, iso, dt, fmt, fmtw, prazoDe, areaDe, veTipo } from "../regras";
import { Head, Modal, useBusy } from "../ui";
import { EntregaForm, EntregaVer } from "./entrega";
import { Renomear } from "./renomear";
import { ItemForm } from "./tabela";

type Col = { chave: string; nome: string; dica: string; cor: string; status: string[] };
const COLUNAS: Col[] = [
  { chave: "fazer", nome: "A fazer", dica: "Prazo da arte mais perto primeiro. Terminou? Clique em Entregar.", cor: "var(--mute)", status: ["A fazer", "Em produção"] },
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
  // atraso só aparece para o dono: aqui mostramos apenas a data do post
  if (a === "ATRASADO") return { txt: "post " + fmtw(dt(i.data_post)), cls: "" };
  if (iso(p) === iso(hoje)) return { txt: verbo + " HOJE", cls: "pz-warn" };
  if (iso(p) === iso(amanha)) return { txt: verbo + " até AMANHÃ", cls: "pz-warn" };
  if (a === "VENCE EM BREVE" || a === "AJUSTES") return { txt: verbo + " até " + fmtw(p), cls: "pz-gold" };
  return { txt: verbo + " até " + fmtw(p), cls: "" };
}

export default function Minhas({ d }: { d: Dados }) {
  const [filtro, setFiltro] = useState<string>("");
  const [tipoF, setTipoF] = useState<string>("");
  const [entregar, setEntregar] = useState<Item | null>(null);
  const [ver, setVer] = useState<Item | null>(null);
  const [renomear, setRenomear] = useState<Item | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Item> | null>(null);
  const meusClientes = d.clientes.filter(c => c.ativo && c.responsavel_id === d.me.id);
  const { run } = useBusy();

  // só os tipos da função da pessoa (designer: sem vídeo · videomaker: sem imagem)
  const area = areaDe(d.me.funcao);
  const minhas = d.itens.filter(i => i.responsavel_id === d.me.id && i.tipo !== "Prazo do cliente" && veTipo(area, i.tipo));
  const mesAtual = iso(hojeSP()).slice(0, 7);
  // tudo que ainda está em andamento (de qualquer mês) + o que foi entregue e espera aprovação
  const ativas = ordenar(minhas.filter(i => !["Aprovado", "Postado"].includes(i.status)));
  // todos os clientes da pessoa aparecem, mesmo os que estão em dia (sem nada pendente)
  const idsCli = new Set([...ativas.map(i => i.cliente_id), ...d.clientes.filter(c => c.ativo && c.responsavel_id === d.me.id).map(c => c.id)]);
  const clientes = [...idsCli].map(id => ({ id, nome: d.cliente(id)?.nome || "—", n: ativas.filter(i => i.cliente_id === id).length }))
    .sort((a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0) || a.nome.localeCompare(b.nome));
  const doCli = filtro ? ativas.filter(i => i.cliente_id === filtro) : ativas;
  const tipos = [...new Set(doCli.map(i => i.tipo))].sort().map(t => ({ t, n: doCli.filter(i => i.tipo === t).length }));
  const tipoA = tipos.some(x => x.t === tipoF) ? tipoF : "";
  const vis = tipoA ? doCli.filter(i => i.tipo === tipoA) : doCli;

  const doMes = minhas.filter(i => noMes(i, mesAtual));
  const prontas = doMes.filter(i => ["Entregue", "Aprovado", "Postado"].includes(i.status) && temArte(i)).length;
  const p = placar(doMes);


  return (
    <>
      <Head eb={"olá, " + d.me.nome.split(" ")[0]} t="Minhas demandas"
        sub="Cada arte anda da esquerda para a direita. Seu trabalho termina quando ela chega em Aguardando aprovação."
        right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          {meusClientes.length > 0 && <button type="button" className="btn pri sm" onClick={() => setForm({ cliente_id: filtro && meusClientes.some(c => c.id === filtro) ? filtro : meusClientes[0].id, data_post: iso(hojeSP()), responsavel_id: d.me.id })}>+ Novo post</button>}
          {clientes.length > 1 && (
          <div className="kfiltro" role="group" aria-label="Filtrar por cliente">
            <button type="button" aria-pressed={!filtro} onClick={() => setFiltro("")}>Todos · {ativas.length}</button>
            {clientes.map(c => <button type="button" key={c.id} aria-pressed={filtro === c.id} className={c.n ? "" : "em-dia"} title={c.n ? "" : "Tudo entregue e aprovado neste cliente"} onClick={() => setFiltro(c.id)}>{c.nome} · {c.n}</button>)}
          </div>)}
        </div>} />

      {tipos.length > 1 && (
        <div className="kfiltro ktipos" role="group" aria-label="Filtrar por tipo de post">
          <span className="muted">Tipo:</span>
          <button type="button" aria-pressed={!tipoA} onClick={() => setTipoF("")}>Todos</button>
          {tipos.map(x => <button type="button" key={x.t} aria-pressed={tipoA === x.t} onClick={() => setTipoF(tipoA === x.t ? "" : x.t)}>{x.t} · {x.n}</button>)}
        </div>
      )}
      <div className="kresumo">
        <span><b>{prontas} de {doMes.length}</b> artes de {mesAtual === d.mes ? "este mês" : "o mês"} entregues</span>
        <div className="kbar" aria-hidden="true"><div style={{ width: (doMes.length ? Math.round(prontas / doMes.length * 100) : 0) + "%" }} /></div>
        <span className="muted">pontualidade: <b>{p.pct === null ? "—" : p.pct + "%"}</b></span>
      </div>

      {minhas.length === 0
        ? <div className="panel empty">Nenhuma demanda com você ainda. Quando o dono lançar os posts do mês, eles aparecem aqui.</div>
        : (
          <>
          {filtro && !clientes.find(c => c.id === filtro)?.n && (
            <div className="panel empty" style={{ marginBottom: 12 }}>
              <b>Tudo em dia com {d.cliente(filtro)?.nome}.</b> {(() => { const n = minhas.filter(i => i.cliente_id === filtro && noMes(i, mesAtual) && ["Aprovado", "Postado"].includes(i.status)).length; return n ? `${n} post${n > 1 ? "s" : ""} deste mês já aprovado${n > 1 ? "s" : ""}. ` : ""; })()}O cliente continua com você: quando houver post novo, ele aparece aqui.
            </div>
          )}
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
                            {temArte(i) && <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setVer(i)}>ver o que foi entregue</button>}
                            {c?.responsavel_id === d.me.id
                              ? <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setForm(i)}>Editar nome, data, tipo ou excluir</button>
                              : <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => setRenomear(i)}>Trocar o nome do post</button>}
                          </div>
                        )}
                        <div className="kfoot">
                          <span>post {fmtw(dt(i.data_post))}</span>
                          {(i.status === "A fazer" || i.status === "Em produção") && <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Entregar</button>}
                          {i.status === "Ajustes" && <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Reenviar</button>}
                          {i.status === "Entregue" && (temArte(i)
                            ? <span className="kbtns"><button type="button" className="kja" onClick={() => setEntregar(i)}>trocar arquivos</button><button type="button" className="btn sm" onClick={() => setVer(i)}>Ver arte</button></span>
                            : <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>Entregar</button>)}
                        </div>
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
          </>
        )}
      <Modal open={!!entregar} onClose={() => setEntregar(null)}>
        {entregar && <EntregaForm d={d} i={entregar} fechar={() => setEntregar(null)} />}
      </Modal>
      <Modal open={!!renomear} onClose={() => setRenomear(null)}>
        {renomear && <Renomear titulo="Trocar o nome do post" rotulo="Nome do post" atual={renomear.tema} fechar={() => setRenomear(null)}
          salvar={async novo => { const r = await supabase.from("itens").update({ tema: novo }).eq("id", renomear.id); if (!r.error) { d.aviso("Nome do post atualizado"); d.recarregar(); } return r; }} />}
      </Modal>
      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && <ItemForm key={form.id || "novo"} d={d} item={form} fechar={() => setForm(null)} />}
      </Modal>
      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)} />}
      </Modal>
    </>
  );
}
