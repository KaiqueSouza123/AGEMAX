import { useMemo, useState } from "react";
import type { Dados } from "../App";
import { Item, alerta, noMes, ordenar, mesLabel, temArte, dt, fmtw, prazoDe, iso, hojeSP, uteisEntre, ehPrazoCliente } from "../regras";
import { supabase } from "../supabase";
import { EntregaVer } from "./entrega";
import { Head, MesNav, Modal } from "../ui";
import { ItemForm } from "./tabela";

type Sit = "" | "voce" | "atrasados" | "breve" | "andamento" | "aprovados";
const SITS: [Sit, string][] = [["", "Todas"], ["voce", "Precisa de você"], ["atrasados", "Atrasados"], ["breve", "Vence hoje ou em breve"], ["andamento", "A fazer e em produção"], ["aprovados", "Aprovados e postados"]];
type Agrupar = "prazo" | "pessoa" | "cliente";
type Grupo = { id: string; titulo: string; quando?: string; tom: "bad" | "gold" | "info" | "teal" | "mute" | "ok"; its: Item[]; fechado?: boolean };

const AV = ["tg0", "tg1", "tg2", "tg3", "tg4"];

function sitDe(i: Item): Sit {
  const a = alerta(i);
  if (a === "AGUARDA APROVAÇÃO") return "voce";
  if (a === "ATRASADO" || a === "SEM LINK") return "atrasados";
  if (a === "VENCE HOJE" || a === "VENCE EM BREVE" || a === "AJUSTES") return "breve";
  if (a === "OK") return "aprovados";
  return "andamento";
}

function quando(p: Date, hoje: Date) {
  if (iso(p) === iso(hoje)) return "hoje";
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
  if (iso(p) === iso(amanha)) return "amanhã";
  const n = uteisEntre(hoje, p);
  return n > 0 ? `em ${n} dias úteis` : "";
}

export default function Producao({ d }: { d: Dados }) {
  const [resp, setResp] = useState("");
  const [cli, setCli] = useState("");
  const [sit, setSit] = useState<Sit>("");
  const [busca, setBusca] = useState("");
  const [agrupar, setAgrupar] = useState<Agrupar>("prazo");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [filtros, setFiltros] = useState(false);
  const [editar, setEditar] = useState<Partial<Item> | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ver, setVer] = useState<Item | null>(null);
  const hoje = hojeSP();

  const aguardando = ordenar(d.itens.filter(i => i.status === "Entregue" && temArte(i)));
  const mudar = async (i: Item, status: string, msg: string) => {
    setVer(null);
    const r = await supabase.from("itens").update({ status }).eq("id", i.id);
    if (r.error) d.aviso("Não deu certo: " + r.error.message); else { d.aviso(msg); d.recarregar(); }
  };
  const abrir = (i: Partial<Item> | null) => { setEditar(i); setAberto(true); };

  const doMes = d.itens.filter(i => noMes(i, d.mes));
  const conta = (s: Sit) => doMes.filter(i => sitDe(i) === s).length;
  const nAtras = conta("atrasados"), nBreve = conta("breve"), nAprov = conta("aprovados");

  const q = busca.trim().toLowerCase();
  const its = ordenar(doMes.filter(i => (!resp || (resp === "cliente" ? ehPrazoCliente(i) : resp === "sem" ? !i.responsavel_id && !ehPrazoCliente(i) : i.responsavel_id === resp))
    && (!cli || i.cliente_id === cli) && (!sit || sitDe(i) === sit)
    && (!q || i.tema.toLowerCase().includes(q) || (d.cliente(i.cliente_id)?.nome || "").toLowerCase().includes(q))));

  const grupos: Grupo[] = useMemo(() => {
    if (agrupar === "prazo") {
      const fixos: Record<string, Grupo> = {
        atr: { id: "atr", titulo: "Atrasados", quando: "o prazo da arte já passou", tom: "bad", its: [] },
        voce: { id: "voce", titulo: "Aguardando sua aprovação", tom: "info", its: [] },
        ok: { id: "ok", titulo: "Aprovados e postados", tom: "ok", its: [], fechado: true },
      };
      const datas: Record<string, Grupo> = {};
      its.forEach(i => {
        const s = sitDe(i);
        if (s === "atrasados") return fixos.atr.its.push(i);
        if (s === "voce") return fixos.voce.its.push(i);
        if (s === "aprovados") return fixos.ok.its.push(i);
        const p = prazoDe(i), k = iso(p);
        if (!datas[k]) {
          const w = quando(p, hoje);
          datas[k] = { id: k, titulo: (ehPrazoCliente(i) ? "Prazo até " : "Arte até ") + fmtw(p), quando: w, tom: w === "hoje" || w === "amanhã" ? "gold" : "teal", its: [] };
        }
        datas[k].its.push(i);
      });
      const ord = Object.keys(datas).sort().map(k => datas[k]);
      ord.forEach((g, n) => { if (n > 1) g.fechado = true; });
      return [fixos.atr, ...ord, fixos.voce, fixos.ok].filter(g => g.its.length);
    }
    const mapa: Record<string, Grupo> = {};
    its.forEach(i => {
      const k = agrupar === "pessoa" ? (ehPrazoCliente(i) ? "cliente" : i.responsavel_id || "sem") : i.cliente_id;
      const nome = agrupar === "pessoa" ? (k === "cliente" ? "Prazos de clientes" : k === "sem" ? "Sem responsável" : d.pessoa(k)?.nome || "—") : d.cliente(k)?.nome || "—";
      if (!mapa[k]) mapa[k] = { id: k, titulo: nome, tom: "mute", its: [], fechado: true };
      mapa[k].its.push(i);
    });
    const lista = Object.values(mapa).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    lista.forEach(g => {
      const atr = g.its.filter(i => sitDe(i) === "atrasados").length, brv = g.its.filter(i => sitDe(i) === "breve").length;
      g.quando = [atr && `${atr} atrasado${atr > 1 ? "s" : ""}`, brv && `${brv} vence${brv > 1 ? "m" : ""} em breve`].filter(Boolean).join(" · ");
      g.tom = atr ? "bad" : brv ? "gold" : "mute";
    });
    return lista;
  }, [its, agrupar, d]);

  const estaAberto = (g: Grupo) => abertos[agrupar + g.id] ?? !g.fechado;
  const alternar = (g: Grupo) => setAbertos(x => ({ ...x, [agrupar + g.id]: !estaAberto(g) }));
  const pessoas = d.pessoas.filter(p => p.ativo);
  const corDe = (id: string | null) => AV[Math.max(0, pessoas.findIndex(p => p.id === id)) % AV.length];
  const nFiltros = (resp ? 1 : 0) + (cli ? 1 : 0) + (sit ? 1 : 0);
  const limpar = () => { setResp(""); setCli(""); setSit(""); };
  const resumoGrupo = (g: Grupo) => {
    if (agrupar !== "prazo") return `${g.its.length} post${g.its.length > 1 ? "s" : ""}`;
    const por: Record<string, number> = {};
    g.its.forEach(i => { const n = ehPrazoCliente(i) ? "Cliente" : d.pessoa(i.responsavel_id)?.nome || "Sem responsável"; por[n] = (por[n] || 0) + 1; });
    return Object.entries(por).map(([n, c]) => `${n} ${c}`).join(" · ");
  };

  return (
    <div className="pd">
      <Head eb={"produção · " + mesLabel(d.mes)} t="Produção da equipe"
        right={<div className="filters"><MesNav mes={d.mes} setMes={d.setMes} /><button type="button" className="btn gold pd-novo" onClick={() => abrir(null)}>+ Novo post</button></div>} />

      <section className="pd-resumo" aria-label="Resumo do mês">
        {aguardando.length > 0 ? (
          <div className="pd-voce">
            <div className="pd-voce-t">
              <span className="pd-eb">Precisa de você</span>
              <b>{aguardando.length} entrega{aguardando.length > 1 ? "s" : ""} para aprovar</b>
              <div className="pd-voce-lista">
                {aguardando.map(i => (
                  <button type="button" key={i.id} onClick={() => setVer(i)}>
                    <b>{i.tema}</b><small>{d.cliente(i.cliente_id)?.nome} · {d.pessoa(i.responsavel_id)?.nome || "—"} · {i.n_arquivos ? `${i.n_arquivos} arquivo${i.n_arquivos > 1 ? "s" : ""}` : "só link"}{i.entregue_em ? " · " + fmtw(dt(i.entregue_em)) : ""}</small>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn gold pd-revisar" onClick={() => setVer(aguardando[0])}>Revisar</button>
          </div>
        ) : (
          <div className="pd-voce pd-voce-ok"><div className="pd-voce-t"><span className="pd-eb">Precisa de você</span><b>Nada para aprovar agora</b><small className="muted">Quando a equipe entregar, aparece aqui.</small></div></div>
        )}
        <button type="button" className={"pd-kpi" + (sit === "breve" ? " on" : "")} aria-pressed={sit === "breve"} onClick={() => setSit(sit === "breve" ? "" : "breve")}>
          <span className="pd-eb pd-c-gold">Vence hoje ou em breve</span><b>{nBreve}</b><small>prazo da arte em até 2 dias úteis</small>
        </button>
        <button type="button" className={"pd-kpi" + (sit === "atrasados" ? " on" : "")} aria-pressed={sit === "atrasados"} onClick={() => setSit(sit === "atrasados" ? "" : "atrasados")}>
          <span className="pd-eb pd-c-bad">Atrasados</span><b>{nAtras}</b><small>prazo passou ou entregue sem arte</small>
        </button>
        <button type="button" className={"pd-kpi" + (sit === "aprovados" ? " on" : "")} aria-pressed={sit === "aprovados"} onClick={() => setSit(sit === "aprovados" ? "" : "aprovados")}>
          <span className="pd-eb pd-c-ok">No mês</span><b>{doMes.length} <span>posts</span></b><small>{nAprov} aprovado{nAprov === 1 ? "" : "s"} ou postado{nAprov === 1 ? "" : "s"}</small>
        </button>
      </section>

      <div className="pd-barra">
        <div className="pd-seg" role="tablist" aria-label="Agrupar por">
          {([["prazo", "Por prazo da arte"], ["pessoa", "Por pessoa"], ["cliente", "Por cliente"]] as [Agrupar, string][]).map(([k, n]) => (
            <button type="button" role="tab" key={k} aria-selected={agrupar === k} onClick={() => setAgrupar(k)}>{n}</button>
          ))}
        </div>
        <div className="pd-busca-l">
          <label className="pd-busca">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
            <input type="search" placeholder="Buscar cliente ou post" aria-label="Buscar cliente ou post" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
          <div className="pd-sel">
            <select aria-label="Pessoa" value={resp} onChange={e => setResp(e.target.value)}>
              <option value="">Pessoa: todas</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              <option value="sem">Sem responsável</option><option value="cliente">Prazos de clientes</option>
            </select>
            <select aria-label="Cliente" value={cli} onChange={e => setCli(e.target.value)}>
              <option value="">Cliente: todos</option>{d.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select aria-label="Situação" value={sit} onChange={e => setSit(e.target.value as Sit)}>
              {SITS.map(([k, n]) => <option key={k} value={k}>{k ? n : "Situação: todas"}</option>)}
            </select>
          </div>
          <button type="button" className="btn pd-filtrar" onClick={() => setFiltros(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Filtros{nFiltros ? ` · ${nFiltros}` : ""}
          </button>
        </div>
      </div>
      {nFiltros > 0 && <div className="pd-ativos"><span className="muted">{its.length} de {doMes.length} posts</span><button type="button" className="linkbtn" onClick={limpar}>Limpar filtros</button></div>}

      {grupos.length === 0 && <div className="panel empty">Nenhum post neste filtro.</div>}
      <div className="pd-grupos">
        {grupos.map(g => {
          const ab = estaAberto(g);
          return (
            <section key={agrupar + g.id} className={"pd-g t-" + g.tom}>
              <h2>
                <button type="button" aria-expanded={ab} onClick={() => alternar(g)}>
                  <span className="pd-dot" aria-hidden="true" />
                  <span className="pd-gt">{g.titulo}</span>
                  {g.quando && <span className="pd-gq">{g.quando}</span>}
                  <span className="pd-gr">{resumoGrupo(g)}</span>
                  <svg className="pd-seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
              </h2>
              {ab && (
                <div className="pd-linhas">
                  <div className="pd-cab" aria-hidden="true"><span>Cliente</span><span>Post</span><span>Responsável</span><span>No ar em</span><span>Etapa</span><span /></div>
                  {g.its.map(i => {
                    const pc = ehPrazoCliente(i); const p = d.pessoa(i.responsavel_id);
                    const s = sitDe(i);
                    return (
                      <article key={i.id} className={"pd-l" + (s === "atrasados" ? " atr" : "")}>
                        <b className="pd-cli">{d.cliente(i.cliente_id)?.nome}</b>
                        <div className="pd-post"><b>{i.tema}</b><small>{i.tipo}{i.briefing ? " · " + i.briefing.slice(0, 70) + (i.briefing.length > 70 ? "…" : "") : ""}</small></div>
                        <span className="pd-quem">
                          <span className={"pd-av " + (pc ? "cli" : corDe(i.responsavel_id))} aria-hidden="true">{pc ? "C" : (p?.nome || "?").slice(0, 1)}</span>
                          {pc ? "Cliente" : p?.nome || "Sem responsável"}
                        </span>
                        <span className="pd-data"><span className="pd-rot">no ar </span>{fmtw(dt(i.data_post))}</span>
                        <span className={"pd-et e-" + s}>{s === "atrasados" ? (alerta(i) === "SEM LINK" ? "Sem arte" : "Atrasado") : i.status}</span>
                        <span className="pd-acao">
                          {!pc && i.status === "Entregue" && temArte(i) && <button type="button" className="btn gold sm" onClick={() => setVer(i)}>Ver entrega</button>}
                          {!pc && i.status === "Aprovado" && <button type="button" className="btn sm" onClick={() => mudar(i, "Postado", "Marcado como postado")}>Postado</button>}
                          {!pc && (i.status === "Postado") && temArte(i) && <button type="button" className="linkbtn" onClick={() => setVer(i)}>ver arte</button>}
                          <button type="button" className="pd-edit" aria-label={"Editar " + i.tema} onClick={() => abrir(i)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>
                          </button>
                        </span>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="muted">Prazo da arte = 3 dias úteis antes do post (fins de semana e feriados não contam). Entrega sem arquivo e sem link não conta como entregue.</p>

      <button type="button" className="pd-fab" onClick={() => abrir(null)}>+ Novo post</button>

      <Modal open={filtros} onClose={() => setFiltros(false)}>
        {filtros && (
          <div className="form pf">
            <span className="ent-pega" aria-hidden="true" />
            <div className="pf-top"><h2>Filtrar posts</h2><button type="button" className="linkbtn" onClick={limpar}>Limpar</button></div>
            <fieldset><legend>Situação</legend><div className="pf-chips">
              {SITS.map(([k, n]) => <button type="button" key={k} aria-pressed={sit === k} onClick={() => setSit(k)}>{n}</button>)}
            </div></fieldset>
            <fieldset><legend>Pessoa</legend><div className="pf-chips">
              <button type="button" aria-pressed={!resp} onClick={() => setResp("")}>Toda a equipe</button>
              {pessoas.map(p => <button type="button" key={p.id} aria-pressed={resp === p.id} onClick={() => setResp(p.id)}>{p.nome}</button>)}
              <button type="button" aria-pressed={resp === "sem"} onClick={() => setResp("sem")}>Sem responsável</button>
              <button type="button" aria-pressed={resp === "cliente"} onClick={() => setResp("cliente")}>Prazos de clientes</button>
            </div></fieldset>
            <label htmlFor="pf-cli">Cliente
              <select id="pf-cli" value={cli} onChange={e => setCli(e.target.value)}>
                <option value="">Todos os clientes</option>{d.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <button type="button" className="btn gold pf-ok" onClick={() => setFiltros(false)}>Mostrar {its.length} post{its.length === 1 ? "" : "s"}</button>
          </div>
        )}
      </Modal>
      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)}
          aprovar={ver.status === "Entregue" ? () => mudar(ver, "Aprovado", "Arte aprovada") : undefined}
          ajuste={ver.status === "Entregue" ? () => mudar(ver, "Ajustes", "Ajuste pedido. A pessoa vê na tela dela.") : undefined} />}
      </Modal>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <ItemForm key={editar?.id || "novo"} d={d} item={editar} fechar={() => setAberto(false)} />
      </Modal>
    </div>
  );
}
