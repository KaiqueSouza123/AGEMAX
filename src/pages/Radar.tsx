import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, RadarIdeia, RadarSemana, dt, ehTrend, fmt, fmtw, hojeSP, iso, prazoDe } from "../regras";
import { Head, Modal, useBusy } from "../ui";

const FORMATOS = ["Estático", "Carrossel", "Reels", "Stories", "Vídeo"];
const ABERTO = ["A fazer", "Em produção", "Ajustes"];
const tagDe = (id: string) => "tg" + ([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 5);

const semanaLabel = (s: RadarSemana) => {
  const a = dt(s.inicio), b = new Date(a); b.setDate(b.getDate() + 6);
  return `${fmt(a).slice(0, 2)} a ${fmt(b)}`;
};
const quando = (ts: string) => { const x = new Date(ts); return `${fmtw(x)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

export function BetaAviso({ dono }: { dono?: boolean }) {
  return (
    <div className="beta-aviso" role="note">
      <span className="beta">beta</span>
      <span>{dono
        ? <>O Radar da Semana está em <b>fase beta</b>. As ideias são geradas por IA a partir de pesquisa na internet: revise antes de publicar, confira datas e fatos, e conte o que funcionou para a gente ajustar.</>
        : <>O Radar da Semana está em <b>fase beta</b>. As ideias são geradas por IA e revisadas pelo dono, mas podem ter erros: confira datas e fatos antes de produzir. Achou algo estranho? Avise o dono.</>}</span>
    </div>
  );
}

export default function Radar({ d }: { d: Dados }) {
  return d.ehDono ? <RadarDono d={d} /> : <RadarFunc d={d} />;
}

/* ================= funcionário ================= */
function RadarFunc({ d }: { d: Dados }) {
  const publicadas = d.semanas.filter(s => s.publicado_em);
  const [semId, setSemId] = useState(publicadas[0]?.id || "");
  const sem = publicadas.find(s => s.id === semId) || publicadas[0];
  const [verDesc, setVerDesc] = useState(false);
  const [escolher, setEscolher] = useState<RadarIdeia | null>(null);
  const { run } = useBusy();

  const meusCli = d.clientes.filter(c => c.ativo && c.responsavel_id === d.me.id);
  const ideias = sem ? d.ideias.filter(x => x.semana_id === sem.id && meusCli.some(c => c.id === x.cliente_id)) : [];
  const hoje = iso(hojeSP());
  const meusAbertos = d.itens.filter(i => i.responsavel_id === d.me.id && ABERTO.includes(i.status) && i.data_post >= hoje);
  const proxTrend = (cliId: string) => meusAbertos.filter(i => i.cliente_id === cliId && ehTrend(i)).sort((a, b) => a.data_post.localeCompare(b.data_post))[0];
  const trends = meusAbertos.filter(i => ehTrend(i) || d.ideias.some(x => x.item_id === i.id)).sort((a, b) => a.data_post.localeCompare(b.data_post)).slice(0, 8);

  // marca como vistas ao abrir
  const naoVistas = ideias.filter(x => !x.visto_em).map(x => x.id).join(",");
  useEffect(() => {
    if (!naoVistas) return;
    supabase.from("radar_ideias").update({ visto_em: new Date().toISOString() }).in("id", naoVistas.split(",")).then(() => d.recarregar());
  }, [naoVistas]);

  const marcar = async (x: RadarIdeia, estado: RadarIdeia["estado"], msg: string) => {
    const ok = await run(() => supabase.from("radar_ideias").update({ estado }).eq("id", x.id) as any);
    if (ok) { d.aviso(msg); d.recarregar(); }
  };
  const usar = async (x: RadarIdeia, it: Item) => {
    const ok = await run(async () => {
      const r = await supabase.rpc("usar_ideia", { p_ideia: x.id, p_item: it.id });
      if (r.error) d.aviso(r.error.message);
      return r;
    });
    if (ok) { setEscolher(null); d.aviso(`Ideia colocada no post de ${fmt(dt(it.data_post))}. Já está no seu quadro.`); d.recarregar(); }
  };

  const titulo = <span className="titulo-beta">Radar da Semana <span className="beta grande">beta</span></span>;
  if (!sem) return (
    <>
      <Head eb="radar da semana" t="Radar da Semana" sub="Ideias de posts para os seus clientes, toda semana." />
      <BetaAviso />
      <div className="panel empty">Ainda não tem radar publicado. Quando o dono publicar, as ideias dos seus clientes aparecem aqui.</div>
    </>
  );

  return (
    <>
      <div className="top" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">semana de {semanaLabel(sem)} · publicado {quando(sem.publicado_em!)}</div>
          <h1>{titulo}</h1>
          <p className="sub">Ideias escolhidas para os <b>seus {meusCli.length} cliente{meusCli.length === 1 ? "" : "s"}</b>. Use no post “Trend da semana” ou guarde para outro dia.</p>
        </div>
        {publicadas.length > 1 && <select aria-label="Semana" value={sem.id} onChange={e => setSemId(e.target.value)}>{publicadas.map(s => <option key={s.id} value={s.id}>Semana de {semanaLabel(s)}</option>)}</select>}
      </div>
      <BetaAviso />

      {sem.em_alta?.length > 0 && (
        <section className="rd-alta" aria-labelledby="rd-alta">
          <h2 id="rd-alta">Em alta nesta semana</h2>
          <div>{sem.em_alta.map((a, k) => <div key={k} className="rd-alta-c"><span>{a.tipo}</span><b>{a.nome}</b>{a.sub && <small>{a.sub}</small>}</div>)}</div>
        </section>
      )}

      <div className="rd">
        <div className="rd-main">
          {meusCli.length === 0 && <div className="panel empty">Nenhum cliente está com você ainda.</div>}
          {meusCli.map(c => {
            const doCli = ideias.filter(x => x.cliente_id === c.id && (verDesc || x.estado !== "descartada"));
            const alvo = proxTrend(c.id);
            return (
              <section key={c.id} className="rd-cli" aria-label={c.nome}>
                <h2><span className={"ktag " + tagDe(c.id)}>{c.nome}</span>{c.nicho && <small>{c.nicho}</small>}</h2>
                {doCli.length === 0 && <div className="kvazio">Sem ideias para este cliente nesta semana.</div>}
                {doCli.map(x => {
                  const it = x.item_id ? d.itens.find(i => i.id === x.item_id) : undefined;
                  return (
                    <article key={x.id} className={"rd-ideia" + (x.estado === "usada" ? " usada" : "") + (x.estado === "descartada" ? " desc" : "")}>
                      <div className="mv-row">
                        <span className="rd-fmt">{x.formato.toUpperCase()}</span>
                        {x.estado === "usada" && <span className="rd-ok">✓ NO POST DE {it ? fmt(dt(it.data_post)) : "—"}</span>}
                        {x.estado === "guardada" && <span className="rd-guard">GUARDADA</span>}
                      </div>
                      <h3>{x.titulo}</h3>
                      {x.porque && <p><b>Por que funciona:</b> {x.porque}</p>}
                      {x.gancho && <p className="rd-gancho"><b>Gancho:</b> {x.gancho}</p>}
                      {x.estado !== "usada" && (
                        <div className="rd-acts">
                          {x.estado === "descartada"
                            ? <button type="button" className="linkbtn" onClick={() => marcar(x, "nova", "Ideia de volta")}>Desfazer</button>
                            : <button type="button" className="linkbtn" onClick={() => marcar(x, "descartada", "Ideia descartada")}>Não serve</button>}
                          {x.estado !== "descartada" && <button type="button" className="btn" onClick={() => marcar(x, x.estado === "guardada" ? "nova" : "guardada", x.estado === "guardada" ? "Tirada dos guardados" : "Ideia guardada")}>{x.estado === "guardada" ? "Tirar dos guardados" : "Guardar"}</button>}
                          {x.estado !== "descartada" && (alvo
                            ? <><button type="button" className="linkbtn" onClick={() => setEscolher(x)}>outro post</button>
                                <button type="button" className="btn gold" onClick={() => usar(x, alvo)}>Usar no post de {fmt(dt(alvo.data_post))}</button></>
                            : <button type="button" className="btn gold" onClick={() => setEscolher(x)}>Usar num post</button>)}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            );
          })}
          {ideias.some(x => x.estado === "descartada") && <button type="button" className="linkbtn" onClick={() => setVerDesc(v => !v)}>{verDesc ? "Esconder descartadas" : `Ver descartadas (${ideias.filter(x => x.estado === "descartada").length})`}</button>}
        </div>

        <aside className="rd-side" aria-label="Seus posts Trend da semana">
          <div className="rd-box">
            <h2>Seus posts “Trend da semana”</h2>
            {trends.length === 0 && <p className="muted">Nenhum post “Trend da semana” em aberto com você.</p>}
            {trends.map(i => {
              const usada = d.ideias.find(x => x.item_id === i.id);
              return (
                <div key={i.id} className={"rd-slot" + (usada ? " cheio" : "")}>
                  <small>{d.cliente(i.cliente_id)?.nome} · post {fmt(dt(i.data_post))}</small>
                  <b>{usada ? i.tema : "Ainda sem ideia"}</b>
                  <small>{usada ? "escolhida · " : ""}arte até {fmtw(prazoDe(i))}</small>
                </div>
              );
            })}
          </div>
          <div className="ap-dica rd-como"><b>Como funciona</b><span>O dono publica o radar toda semana. Ao clicar em <b>Usar</b>, a ideia vira o tema do post e o briefing vai junto. O post aparece no seu quadro com o prazo de sempre.</span></div>
        </aside>
      </div>

      <Modal open={!!escolher} onClose={() => setEscolher(null)}>
        {escolher && (
          <div className="form">
            <h2>Em qual post usar?</h2>
            <p className="muted" style={{ margin: 0 }}>{escolher.titulo}</p>
            {(() => {
              const op = meusAbertos.filter(i => i.cliente_id === escolher.cliente_id).sort((a, b) => Number(ehTrend(b)) - Number(ehTrend(a)) || a.data_post.localeCompare(b.data_post));
              if (!op.length) return <div className="kvazio">Nenhum post em aberto deste cliente com você. Peça ao dono para criar um, ou guarde a ideia.</div>;
              return <div className="rd-opc">{op.map(i => (
                <button type="button" key={i.id} onClick={() => usar(escolher, i)}>
                  <b>{fmtw(dt(i.data_post))}</b><span>{i.tema}</span>{ehTrend(i) && <small>trend</small>}
                </button>
              ))}</div>;
            })()}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>O tema atual do post é trocado pela ideia.</p>
            <div className="acts"><button type="button" className="btn" onClick={() => setEscolher(null)}>Cancelar</button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ================= dono ================= */
function RadarDono({ d }: { d: Dados }) {
  const [semId, setSemId] = useState(d.semanas[0]?.id || "");
  const sem = d.semanas.find(s => s.id === semId) || d.semanas[0];
  const ativos = d.clientes.filter(c => c.ativo);
  const [cliSel, setCliSel] = useState(ativos[0]?.id || "");
  const [ed, setEd] = useState<Partial<RadarIdeia> | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const { busy, run } = useBusy();

  const ideias = sem ? d.ideias.filter(x => x.semana_id === sem.id) : [];
  const ant = sem ? d.semanas[d.semanas.indexOf(sem) + 1] : undefined;
  const hoje = iso(hojeSP());
  const limite = iso(new Date(hojeSP().getTime() + 35 * 864e5));
  const trendsVazios = d.itens.filter(i => ehTrend(i) && ABERTO.includes(i.status) && i.data_post >= hoje && i.data_post <= limite && !d.ideias.some(x => x.item_id === i.id)).length;

  const linhas = useMemo(() => d.pessoas.filter(p => p.ativo && p.papel === "funcionario").map(p => {
    const cs = ativos.filter(c => c.responsavel_id === p.id).map(c => c.id);
    const xs = ideias.filter(x => cs.includes(x.cliente_id));
    return { p, clientes: cs.length, ideias: xs.length, vistas: xs.filter(x => x.visto_em).length, usadas: xs.filter(x => x.estado === "usada").length };
  }).filter(l => l.clientes > 0), [d.pessoas, ativos, ideias]);
  const semDono = ideias.filter(x => !d.cliente(x.cliente_id)?.responsavel_id).length;

  const publicar = async (sim: boolean) => {
    const ok = await run(() => supabase.from("radar_semanas").update({ publicado_em: sim ? new Date().toISOString() : null }).eq("id", sem!.id) as any);
    if (ok) { setConfirmar(false); d.aviso(sim ? "Radar publicado. A equipe já vê as ideias." : "Radar voltou para rascunho."); d.recarregar(); }
  };
  const remover = async (x: RadarIdeia) => {
    const ok = await run(() => supabase.from("radar_ideias").delete().eq("id", x.id) as any);
    if (ok) { d.aviso("Ideia removida"); d.recarregar(); }
  };

  const titulo = <span className="titulo-beta">Radar da Semana <span className="beta grande">beta</span></span>;
  if (!sem) return (
    <>
      <Head eb="radar da semana" t="Radar da Semana" sub="Ideias de posts por cliente, entregues para quem produz." />
      <BetaAviso dono />
      <div className="panel empty">Nenhum radar ainda. Peça ao Claude: <b>“faz o radar da semana”</b>. Ele pesquisa, cria as ideias por cliente e elas aparecem aqui como rascunho para você revisar e publicar.</div>
    </>
  );

  const doCli = ideias.filter(x => x.cliente_id === cliSel);
  return (
    <>
      <div className="top" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="eyebrow">semana de {semanaLabel(sem)} · {sem.publicado_em ? "publicado " + quando(sem.publicado_em) : "rascunho"}</div>
          <h1>{titulo}</h1>
          <p className="sub">{sem.publicado_em ? "Publicado. Cada funcionário vê só as ideias dos clientes dele." : "Revise as ideias e publique. Cada funcionário recebe só as dos clientes dele."}</p>
        </div>
        <div className="filters">
          {d.semanas.length > 1 && <select aria-label="Semana" value={sem.id} onChange={e => setSemId(e.target.value)}>{d.semanas.map(s => <option key={s.id} value={s.id}>Semana de {semanaLabel(s)}{s.publicado_em ? "" : " (rascunho)"}</option>)}</select>}
          {sem.publicado_em
            ? <button type="button" className="btn" disabled={busy} onClick={() => publicar(false)}>Voltar para rascunho</button>
            : <button type="button" className="btn gold" disabled={busy} onClick={() => setConfirmar(true)}>Publicar para a equipe</button>}
        </div>
      </div>
      <BetaAviso dono />

      <div className="kpis">
        <div className="kpi"><span className="n">{ideias.length}</span><span className="l">ideias para {new Set(ideias.map(x => x.cliente_id)).size} clientes</span></div>
        <div className="kpi"><span className="n">{sem.em_alta?.length || 0}</span><span className="l">datas e trends em alta</span></div>
        <div className="kpi"><span className="n" style={{ color: "var(--ok)" }}>{ideias.filter(x => x.estado === "usada").length}</span><span className="l">usadas nesta semana{ant ? ` · ${d.ideias.filter(x => x.semana_id === ant.id && x.estado === "usada").length} na anterior` : ""}</span></div>
        <div className="kpi warn"><span className="n">{trendsVazios}</span><span className="l">posts “Trend” sem ideia (próx. 5 semanas)</span></div>
      </div>

      {semDono > 0 && <div className="beta-aviso" role="note" style={{ background: "var(--warn-soft)" }}><b>{semDono} ideia{semDono > 1 ? "s" : ""}</b> de clientes sem responsável. Ninguém vai ver até você definir o responsável em Clientes.</div>}

      <div className="rd">
        <section className="panel rd-tab" aria-labelledby="rd-eq">
          <h2 id="rd-eq">Quem recebe o quê</h2>
          <div className="tablewrap" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Funcionário</th><th>Clientes</th><th>Ideias</th><th>Viu</th><th>Usou</th></tr></thead>
              <tbody>{linhas.map(l => (
                <tr key={l.p.id}><td><b>{l.p.nome}</b></td><td>{l.clientes}</td><td>{l.ideias}</td>
                  <td className="muted">{sem.publicado_em ? `${l.vistas} de ${l.ideias}` : "—"}</td>
                  <td>{sem.publicado_em ? `${l.usadas} de ${l.ideias}` : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {sem.em_alta?.length > 0 && <div className="rd-alta" style={{ padding: "4px 16px 16px" }}><h2>Em alta</h2><div>{sem.em_alta.map((a, k) => <div key={k} className="rd-alta-c"><span>{a.tipo}</span><b>{a.nome}</b>{a.sub && <small>{a.sub}</small>}</div>)}</div></div>}
        </section>

        <section className="rd-side rd-box" aria-labelledby="rd-rev">
          <h2 id="rd-rev">Revisar por cliente</h2>
          <select className="rd-sel" aria-label="Cliente" value={cliSel} onChange={e => setCliSel(e.target.value)}>{ativos.map(c => <option key={c.id} value={c.id}>{c.nome} ({ideias.filter(x => x.cliente_id === c.id).length})</option>)}</select>
          {doCli.length === 0 && <div className="kvazio">Sem ideias para este cliente.</div>}
          {doCli.map(x => (
            <div key={x.id} className="rd-rev">
              <div className="mv-row"><span className="rd-fmt">{x.formato.toUpperCase()}</span>{x.estado !== "nova" && <span className="muted" style={{ fontSize: 12 }}>{x.estado}</span>}</div>
              <b>{x.titulo}</b>
              {x.porque && <small>{x.porque}</small>}
              <div className="kbtns"><button type="button" className="linkbtn" onClick={() => setEd(x)}>Editar</button><button type="button" className="linkbtn" style={{ color: "var(--bad)" }} onClick={() => remover(x)}>Remover</button></div>
            </div>
          ))}
          <button type="button" className="linkbtn" onClick={() => setEd({ semana_id: sem.id, cliente_id: cliSel, formato: "Estático" })}>+ Adicionar ideia</button>
        </section>
      </div>

      <div className="ap-dica"><b>De onde vêm as ideias</b><span>Toda semana você pede “faz o radar da semana” para o Claude. Ele pesquisa datas, trends e assuntos em alta, cruza com cada cliente e o radar aparece aqui como rascunho.</span></div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)}>
        <div className="form">
          <h2>Publicar o radar?</h2>
          <p className="muted" style={{ margin: 0 }}>{ideias.length} ideias vão aparecer para a equipe, cada pessoa vendo só as dos clientes dela. Dá para voltar para rascunho depois.</p>
          <div className="acts"><button type="button" className="btn" onClick={() => setConfirmar(false)}>Cancelar</button><button type="button" className="btn gold" disabled={busy} onClick={() => publicar(true)}>Publicar</button></div>
        </div>
      </Modal>
      <Modal open={!!ed} onClose={() => setEd(null)}>
        {ed && <IdeiaForm key={ed.id || "nova"} d={d} x={ed} fechar={() => setEd(null)} />}
      </Modal>
    </>
  );
}

function IdeiaForm({ d, x, fechar }: { d: Dados; x: Partial<RadarIdeia>; fechar: () => void }) {
  const [f, setF] = useState<Partial<RadarIdeia>>(x);
  const { busy, err, run } = useBusy();
  const set = (k: keyof RadarIdeia, v: any) => setF(o => ({ ...o, [k]: v }));
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados = { semana_id: f.semana_id, cliente_id: f.cliente_id, formato: f.formato, titulo: f.titulo, porque: f.porque || null, gancho: f.gancho || null };
    const ok = await run(() => (x.id ? supabase.from("radar_ideias").update(dados).eq("id", x.id) : supabase.from("radar_ideias").insert(dados)) as any);
    if (ok) { fechar(); d.aviso(x.id ? "Ideia atualizada" : "Ideia adicionada"); d.recarregar(); }
  };
  return (
    <form className="form" onSubmit={salvar}>
      <h2>{x.id ? "Editar ideia" : "Nova ideia"}</h2>
      <p className="muted" style={{ margin: 0 }}>{d.cliente(f.cliente_id || "")?.nome}</p>
      <div className="row2">
        <label htmlFor="ri-fmt">Formato<select id="ri-fmt" value={f.formato} onChange={e => set("formato", e.target.value)}>{FORMATOS.map(t => <option key={t}>{t}</option>)}</select></label>
        <span />
      </div>
      <label htmlFor="ri-tit">Ideia (vira o tema do post)<input id="ri-tit" required value={f.titulo || ""} onChange={e => set("titulo", e.target.value)} /></label>
      <label htmlFor="ri-pq">Por que funciona<textarea id="ri-pq" value={f.porque || ""} onChange={e => set("porque", e.target.value)} /></label>
      <label htmlFor="ri-gc">Gancho (primeira frase)<input id="ri-gc" value={f.gancho || ""} onChange={e => set("gancho", e.target.value)} /></label>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" className="btn pri" disabled={busy}>Salvar</button></div>
    </form>
  );
}
