import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Item, TIPOS, STATUS, alerta, dt, fmtw, prazoDe, ehPrazoCliente, temArte, areaDe, veTipo } from "../regras";
import { EntregaForm, EntregaVer } from "./entrega";
export { EntregaForm };
import { Chip, Modal, useBusy } from "../ui";

const ENTREGUE = new Set(["Entregue", "Aprovado", "Postado"]);

export function TabelaProducao({ d, its, comResp, onEditar }: { d: Dados; its: Item[]; comResp: boolean; onEditar?: (i: Item) => void }) {
  const [entregar, setEntregar] = useState<Item | null>(null);
  const [ver, setVer] = useState<Item | null>(null);
  const { run } = useBusy();

  const mudar = async (i: Item, patch: Partial<Item>, msg: string) => {
    const ok = await run(async () => {
      const r = await supabase.from("itens").update(patch).eq("id", i.id);
      if (r.error) { d.aviso(r.error.message.includes("permissão") || r.error.message.includes("Somente") ? r.error.message : "Não deu certo: " + r.error.message); }
      return r;
    });
    if (ok) { d.aviso(msg); d.recarregar(); }
  };

  if (!its.length) return <div className="panel empty">Nenhum post neste filtro.</div>;

  return (
    <>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Cliente</th><th>Post</th>{comResp && <th>Responsável</th>}<th>Data do post</th><th>Prazo da arte</th><th>Status</th><th>Arte</th><th>Alerta</th><th>Ação</th>
          </tr></thead>
          <tbody>
            {its.map(i => {
              const a = alerta(i); const c = d.cliente(i.cliente_id);
              const quem = ehPrazoCliente(i) ? "Cliente" : (d.pessoa(i.responsavel_id)?.nome || "Sem responsável");
              const meu = !d.ehDono;
              return (
                <tr key={i.id}>
                  <td><span className="cli">{c?.nome}</span></td>
                  <td>{i.tema}<div className="muted">{i.tipo}{i.briefing ? " · " + i.briefing.slice(0, 60) + (i.briefing.length > 60 ? "…" : "") : ""}</div></td>
                  {comResp && <td>{quem}</td>}
                  <td className="dt">{fmtw(dt(i.data_post))}</td>
                  <td className="dt">{fmtw(prazoDe(i))}</td>
                  <td>{i.status}</td>
                  <td>{temArte(i) ? <button type="button" className="linkbtn" onClick={() => setVer(i)}>{i.n_arquivos ? `ver ${i.n_arquivos} arquivo${i.n_arquivos > 1 ? "s" : ""}` : "ver arte"}</button> : <span className="muted">—</span>}</td>
                  <td><Chip a={a} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {ehPrazoCliente(i) ? (d.ehDono && onEditar ? <button type="button" className="btn sm" onClick={() => onEditar(i)}>Editar</button> : null) : meu ? (
                      <>
                        {(!ENTREGUE.has(i.status) || !temArte(i)) && <button type="button" className="btn pri sm" onClick={() => setEntregar(i)}>{i.status === "Ajustes" ? "Reenviar" : "Entregar"}</button>}
                        {ENTREGUE.has(i.status) && temArte(i) && <span className="muted">{i.status === "Entregue" ? "aguardando aprovação" : i.status}</span>}
                      </>
                    ) : (
                      <>
                        {i.status === "Entregue" && temArte(i) && <><button type="button" className="btn sm" onClick={() => setVer(i)}>Ver entrega</button>{" "}<button type="button" className="btn gold sm" onClick={() => mudar(i, { status: "Aprovado" }, "Arte aprovada")}>Aprovar</button>{" "}
                          <button type="button" className="btn sm" onClick={() => mudar(i, { status: "Ajustes" }, "Ajuste pedido. A pessoa vê na tela dela.")}>Pedir ajuste</button>{" "}</>}
                        {i.status === "Aprovado" && <><button type="button" className="btn sm" onClick={() => mudar(i, { status: "Postado" }, "Marcado como postado")}>Postado</button>{" "}</>}
                        {onEditar && <button type="button" className="btn sm" onClick={() => onEditar(i)}>Editar</button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal open={!!entregar} onClose={() => setEntregar(null)}>
        {entregar && <EntregaForm d={d} i={entregar} fechar={() => setEntregar(null)} />}
      </Modal>
      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)}
          aprovar={d.ehDono && ver.status === "Entregue" ? () => { const x = ver; setVer(null); mudar(x, { status: "Aprovado" }, "Arte aprovada"); } : undefined}
          ajuste={d.ehDono && ver.status === "Entregue" ? () => { const x = ver; setVer(null); mudar(x, { status: "Ajustes" }, "Ajuste pedido. A pessoa vê na tela dela."); } : undefined} />}
      </Modal>
    </>
  );
}

export function ItemForm({ d, item, fechar }: { d: Dados; item: Partial<Item> | null; fechar: () => void }) {
  const novo = !item?.id;
  const func = !d.ehDono; // funcionário: só clientes dele; cria, apaga e muda nome/data
  const [f, setF] = useState<Partial<Item>>(() => ({ tipo: !d.ehDono && areaDe(d.me.funcao) === "video" ? "Reels" : "Estático", status: "A fazer", data_post: d.mes + "-01", ...item, ...(func && !item?.id ? { responsavel_id: d.me.id } : {}) }));
  const { busy, err, run } = useBusy();
  const set = (k: keyof Item, v: any) => setF(x => ({ ...x, [k]: v }));
  const escolherCliente = (id: string) => setF(x => ({ ...x, cliente_id: id, responsavel_id: func ? d.me.id : (x.responsavel_id || d.cliente(id)?.responsavel_id || null) }));
  const clientesForm = d.clientes.filter(c => c.ativo && (!func || c.responsavel_id === d.me.id));
  // funcionário exclui os posts dele nos clientes dele, em qualquer fase (até aprovado)
  const podeApagar = !func || (item?.tipo !== "Prazo do cliente" && d.cliente(item?.cliente_id || "")?.responsavel_id === d.me.id);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados: any = func && !novo ? { tema: f.tema, data_post: f.data_post, tipo: f.tipo, briefing: f.briefing || null } : func ? { cliente_id: f.cliente_id, tema: f.tema, tipo: f.tipo, data_post: f.data_post, responsavel_id: d.me.id, briefing: f.briefing || null, status: "A fazer" } : { cliente_id: f.cliente_id, tema: f.tema, tipo: f.tipo, data_post: f.data_post, responsavel_id: f.tipo === "Prazo do cliente" ? null : (f.responsavel_id || null), briefing: f.briefing || null, objetivo: f.objetivo || null, status: f.status, link: f.link || null };
    const ok = await run(() => (novo ? supabase.from("itens").insert(dados) : supabase.from("itens").update(dados).eq("id", item!.id)) as any);
    if (ok) { fechar(); d.aviso(novo ? "Post criado" : "Post atualizado"); d.recarregar(); }
  };
  const apagar = async () => {
    if (!item?.id) return;
    const ok = await run(async () => {
      const fs = await supabase.from("entrega_arquivos").select("caminho,miniatura").eq("item_id", item.id!);
      const caminhos = ((fs.data || []) as { caminho: string; miniatura: string | null }[]).flatMap(a => [a.caminho, ...(a.miniatura ? [a.miniatura] : [])]);
      const r = await supabase.from("itens").delete().eq("id", item.id!).select("id");
      if (!r.error && !(r.data || []).length) return { error: { message: "Você não pode excluir este post (só posts seus, de clientes seus)." } };
      // depois de excluir, tira os arquivos do armazenamento (a cópia no Google Drive continua).
      // O que sobrar, a limpeza automática do dono apaga.
      if (!r.error && caminhos.length) await supabase.storage.from("entregas").remove(caminhos).catch(() => null);
      return r;
    });
    if (ok) { fechar(); d.aviso("Post excluído"); d.recarregar(); }
  };
  const [confirmar, setConfirmar] = useState(false);
  const equipe = d.pessoas.filter(p => p.ativo);

  return (
    <form className="form" onSubmit={salvar}>
      <h2>{novo ? "Novo post" : "Editar post"}</h2>
      <label htmlFor="it-cli">Cliente
        <select id="it-cli" required disabled={func && !novo} value={f.cliente_id || ""} onChange={e => escolherCliente(e.target.value)}>
          <option value="" disabled>Escolha o cliente</option>
          {clientesForm.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label htmlFor="it-tema">Tema do post<input id="it-tema" required value={f.tema || ""} onChange={e => set("tema", e.target.value)} placeholder="Ex.: Black Friday: ofertas da semana" /></label>
      <div className="row2">
        <label htmlFor="it-tipo">Tipo<select id="it-tipo" value={f.tipo} onChange={e => set("tipo", e.target.value)}>{TIPOS.filter(t => !func || (t !== "Prazo do cliente" && (veTipo(areaDe(d.me.funcao), t) || t === f.tipo))).map(t => <option key={t}>{t}</option>)}</select></label>
        <label htmlFor="it-data">Data do post<input id="it-data" type="date" required value={f.data_post || ""} onChange={e => set("data_post", e.target.value)} /></label>
      </div>
      {!func && f.data_post && f.tipo !== "Prazo do cliente" && !["Entregue", "Aprovado", "Postado"].includes(f.status || "") && (() => {
        const pz = prazoDe({ ...(f as Item) }), hojeD = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) + "T12:00:00");
        const passou = pz < hojeD;
        return <p className={"pz-aviso" + (passou ? " pz-bad" : "")} style={{ margin: 0, fontSize: 13 }}>
          Prazo da arte: <b>{fmtw(pz)}</b> (3 dias úteis antes do post).{passou && " Esse prazo já passou, então o post vai aparecer como atrasado. Para não ficar atrasado, escolha uma data mais para frente ou entregue a arte."}
        </p>;
      })()}
      {!func && f.tipo !== "Prazo do cliente" && (
        <div className="row2">
          <label htmlFor="it-resp">Responsável<select id="it-resp" value={f.responsavel_id || ""} onChange={e => set("responsavel_id", e.target.value || null)}>
            <option value="">Sem responsável</option>{equipe.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></label>
          <label htmlFor="it-status">Status<select id="it-status" value={f.status} onChange={e => set("status", e.target.value)}>{STATUS.map(s => <option key={s}>{s}</option>)}</select></label>
        </div>
      )}
      <label htmlFor="it-brief">Briefing para quem vai produzir<textarea id="it-brief" value={f.briefing || ""} onChange={e => set("briefing", e.target.value)} placeholder="O que mostrar, referências, o que confirmar com o cliente" /></label>
      {err && <div className="err">{err}</div>}
      <div className="acts">
        {func && !novo && <p className="muted" style={{ margin: 0, fontSize: 13, flexBasis: "100%" }}>Você pode mudar o nome, a data, o tipo e o briefing. O responsável fica com o dono.</p>}
        {!novo && podeApagar && (confirmar
          ? <button type="button" className="btn danger" onClick={apagar} disabled={busy}>Confirmar exclusão</button>
          : <button type="button" className="btn danger" onClick={() => setConfirmar(true)}>Excluir</button>)}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="submit" className="btn pri" disabled={busy}>Salvar</button>
      </div>
    </form>
  );
}
