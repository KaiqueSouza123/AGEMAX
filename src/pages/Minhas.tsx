import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, temArte, alerta, ordenar, placar, noMes, hojeSP, iso, dt, fmt, fmtw, prazoDe, areaDe, veTipo } from "../regras";
import { Head, MesNav, Modal, useBusy } from "../ui";
import { ArtesExtras } from "./extras";
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

const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const ROT: Record<string, string> = { "Estático": "FEED", "Carrossel": "CARROSSEL", "Reels": "REELS", "Vídeo": "VÍDEO", "Stories": "STORY" };
// fase de cada post no calendário do funcionário
const FASE: Record<string, { t: string; c: string }> = {
  "A fazer": { t: "Entregar", c: "f-fazer" }, "Em produção": { t: "Entregar", c: "f-fazer" },
  "Ajustes": { t: "Ajustar", c: "f-ajuste" }, "Entregue": { t: "Em aprovação", c: "f-aguarda" },
  "Aprovado": { t: "Aprovado", c: "f-ok" }, "Postado": { t: "Postado", c: "f-ok" },
};
const lerVista = () => { try { return localStorage.getItem("minhas-vista") === "lista" ? "lista" : "cal"; } catch { return "cal"; } };

export default function Minhas({ d }: { d: Dados }) {
  const [vista, setVista] = useState<"cal" | "lista">(lerVista);
  useEffect(() => { try { localStorage.setItem("minhas-vista", vista); } catch { /* sem armazenamento */ } }, [vista]);
  const [acao, setAcao] = useState<Item | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvoDia, setAlvoDia] = useState<string | null>(null);
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
        sub={vista === "cal" ? "Seu mês no calendário. Clique em Entregar no post, ou arraste o post para outro dia." : "Cada arte anda da esquerda para a direita. Seu trabalho termina quando ela chega em Aguardando aprovação."}
        right={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
          <div className="kfiltro mvista" role="group" aria-label="Como ver">
            <button type="button" aria-pressed={vista === "cal"} onClick={() => setVista("cal")}>Calendário</button>
            <button type="button" aria-pressed={vista === "lista"} onClick={() => setVista("lista")}>Lista</button>
          </div>
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
          {vista === "lista" && filtro && !clientes.find(c => c.id === filtro)?.n && (
            <div className="panel empty" style={{ marginBottom: 12 }}>
              <b>Tudo em dia com {d.cliente(filtro)?.nome}.</b> {(() => { const n = minhas.filter(i => i.cliente_id === filtro && noMes(i, mesAtual) && ["Aprovado", "Postado"].includes(i.status)).length; return n ? `${n} post${n > 1 ? "s" : ""} deste mês já aprovado${n > 1 ? "s" : ""}. ` : ""; })()}O cliente continua com você: quando houver post novo, ele aparece aqui.
            </div>
          )}
          {vista === "cal" ? (() => {
            const doMesCal = minhas.filter(i => noMes(i, d.mes) && (!filtro || i.cliente_id === filtro) && (!tipoA || i.tipo === tipoA));
            const [a, m] = d.mes.split("-").map(Number);
            const nd = new Date(a, m, 0).getDate(), off = new Date(a, m - 1, 1, 12).getDay();
            const semanas = Math.ceil((off + nd) / 7);
            const hojeIso = iso(hojeSP());
            const podeMover = (i: Item) => d.cliente(i.cliente_id)?.responsavel_id === d.me.id;
            const mover = async (id: number, dia: string) => {
              const it = d.itens.find(x => x.id === id);
              if (!it || it.data_post === dia) return;
              if (!podeMover(it)) { d.aviso("Só dá para mudar a data dos posts dos clientes que são seus."); return; }
              const r = await supabase.from("itens").update({ data_post: dia }).eq("id", it.id);
              if (r.error) { d.aviso("Não deu certo: " + r.error.message); return; }
              d.aviso(`Post movido para ${dia.slice(8)}/${dia.slice(5, 7)}`);
              d.recarregar();
            };
            // "+ Novo post" nos dias vazios: no cliente filtrado (se for seu) ou no seu primeiro cliente
            const cliNovo = filtro ? (meusClientes.some(c => c.id === filtro) ? filtro : "") : meusClientes[0]?.id || "";
            const cel = [];
            for (let k = 0; k < semanas * 7; k++) {
              const dn = k - off + 1;
              if (dn < 1 || dn > nd) { cel.push(<div className="mc-d fora" key={k} aria-hidden="true" />); continue; }
              const dia = `${d.mes}-${String(dn).padStart(2, "0")}`;
              const ps = doMesCal.filter(i => i.data_post === dia);
              cel.push(
                <div key={k} className={"mc-d" + (ps.length ? "" : " vazio") + (dia === hojeIso ? " hoje" : "") + (alvoDia === dia ? " alvo" : "")}
                  onDragOver={e => { if (arrastando === null) return; e.preventDefault(); if (alvoDia !== dia) setAlvoDia(dia); }}
                  onDragLeave={() => setAlvoDia(x => (x === dia ? null : x))}
                  onDrop={e => { e.preventDefault(); setAlvoDia(null); setArrastando(null); const id = Number(e.dataTransfer.getData("text/plain")); if (id) mover(id, dia); }}>
                  <span className="mc-n"><em>{DIAS[k % 7].toLowerCase()}</em>{dn}</span>
                  {!ps.length && cliNovo && (
                    <button type="button" className="mc-novo" onClick={() => setForm({ cliente_id: cliNovo, data_post: dia, responsavel_id: d.me.id, tipo: area === "video" ? "Reels" : "Estático" })}
                      aria-label={`Novo post no dia ${dn}`}>+ Novo post</button>
                  )}
                  {ps.map(i => {
                    const f = FASE[i.status] || FASE["A fazer"];
                    const clique = () => (["A fazer", "Em produção", "Ajustes"].includes(i.status) ? setEntregar(i) : temArte(i) ? setVer(i) : setAcao(i));
                    return (
                      <div key={i.id} className={"mc-t" + (arrastando === i.id ? " drag" : "") + (podeMover(i) ? " movel" : "")} draggable={podeMover(i)}
                        onDragStart={e => { e.dataTransfer.setData("text/plain", String(i.id)); e.dataTransfer.effectAllowed = "move"; setArrastando(i.id); }}
                        onDragEnd={() => { setArrastando(null); setAlvoDia(null); }}
                        title={podeMover(i) ? "Segure e arraste para outro dia" : undefined}>
                        <button type="button" className="mc-corpo" onClick={() => setAcao(i)}>
                          <b>{ROT[i.tipo] || i.tipo.toUpperCase()}</b>
                          <small>{i.tema}</small>
                          {!filtro && <i>{d.cliente(i.cliente_id)?.nome}</i>}
                        </button>
                        <button type="button" className={"mc-pill " + f.c} onClick={clique}>{f.t}</button>
                      </div>
                    );
                  })}
                </div>
              );
            }
            const cliExtra = filtro || (clientes.length === 1 ? clientes[0].id : "");
            return (
              <div className="mc-wrap">
                <div className="mc">
                  <div className="mc-top"><MesNav mes={d.mes} setMes={d.setMes} /><span className="muted">{doMesCal.length} post(s){filtro ? " de " + d.cliente(filtro)?.nome : ""}</span></div>
                  <div className="mc-grid">{DIAS.map(x => <div className="mc-h" key={x}>{x}</div>)}{cel}</div>
                  {doMesCal.length === 0 && <div className="kvazio" style={{ marginTop: 10 }}>Nenhum post seu neste mês{filtro ? " para este cliente" : ""}.</div>}
                </div>
                <aside className="mc-lado">
                  {cliExtra ? <ArtesExtras d={d} clienteId={cliExtra} />
                    : <section className="ax"><div className="ax-top"><h2>Artes extras</h2></div><p className="muted ax-dica">Escolha um cliente lá em cima para ver e anexar as artes fixas dele (Story bom dia, boa semana, dia chuvoso…).</p></section>}
                </aside>
              </div>
            );
          })() : (
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
          )}
          </>
        )}
      <Modal open={!!acao} onClose={() => setAcao(null)}>
        {acao && (() => {
          const f = FASE[acao.status] || FASE["A fazer"], c = d.cliente(acao.cliente_id);
          const aFazer = ["A fazer", "Em produção", "Ajustes"].includes(acao.status), fechado = ["Aprovado", "Postado"].includes(acao.status);
          return (
            <div className="form cal-acao">
              <div>
                <span className={"mc-pill " + f.c} style={{ display: "inline-block" }}>{f.t}</span>
                <h2 style={{ marginTop: 8 }}>{acao.tema}</h2>
                <p className="muted" style={{ margin: 0 }}>{c?.nome} · {acao.tipo} · post {fmtw(dt(acao.data_post))}{aFazer ? " · " + rotuloPrazo(acao).txt : ""}</p>
              </div>
              {acao.briefing && <div className="cal-brief"><b>Briefing</b><p>{acao.briefing}</p></div>}
              <div className="acts" style={{ flexWrap: "wrap" }}>
                {c?.responsavel_id === d.me.id
                  ? <button type="button" className="btn" onClick={() => { setForm(acao); setAcao(null); }}>Editar nome, data ou tipo</button>
                  : <button type="button" className="btn" onClick={() => { setRenomear(acao); setAcao(null); }}>Trocar o nome</button>}
                {temArte(acao) && <button type="button" className="btn" onClick={() => { setVer(acao); setAcao(null); }}>Ver entrega</button>}
                {!fechado && <button type="button" className="btn gold" onClick={() => { setEntregar(acao); setAcao(null); }}>{acao.status === "Ajustes" ? "Reenviar arte" : aFazer ? "Entregar arte" : "Trocar arquivos"}</button>}
              </div>
            </div>
          );
        })()}
      </Modal>
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
