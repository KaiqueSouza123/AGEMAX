import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Head, Modal, useBusy } from "../ui";

export type Link = { id: number; cliente_id: string | null; titulo: string; url: string; obs: string | null; atualizado_por: string | null; atualizado_em: string };

const dominio = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const ehDrive = (u: string) => /drive\.google|docs\.google/.test(u);
const quando = (s: string) => { const d = new Date(s); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };

export default function Links({ d }: { d: Dados }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soMeus, setSoMeus] = useState(!d.ehDono);
  const [form, setForm] = useState<Partial<Link> | null>(null);
  const [copiado, setCopiado] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    const r = await supabase.from("links").select("*").order("titulo");
    if (r.error) setErro(r.error.message); else { setErro(null); setLinks(r.data as Link[]); }
  }, []);
  useEffect(() => {
    carregar();
    const ch = supabase.channel("links").on("postgres_changes", { event: "*", schema: "public", table: "links" }, () => carregar()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  const copiar = async (l: Link) => { try { await navigator.clipboard.writeText(l.url); setCopiado(l.id); setTimeout(() => setCopiado(x => (x === l.id ? null : x)), 1500); } catch { /* sem permissão */ } };

  const ativos = d.clientes.filter(c => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  const temMeus = ativos.some(c => c.responsavel_id === d.me.id);
  const clis = soMeus && temMeus ? ativos.filter(c => c.responsavel_id === d.me.id) : ativos;
  const q = busca.trim().toLowerCase();
  const casa = (l: Link, nomeCli: string) => !q || [l.titulo, l.url, l.obs || "", nomeCli].some(x => x.toLowerCase().includes(q));
  const grupos = [
    ...clis.map(c => ({ id: c.id as string | null, nome: c.nome, ls: (links || []).filter(l => l.cliente_id === c.id && casa(l, c.nome)) })),
    { id: null, nome: "Agemax (geral)", ls: (links || []).filter(l => !l.cliente_id && casa(l, "agemax geral")) },
  ].filter(g => g.ls.length || !q);
  const total = (links || []).length;

  if (erro) return <><Head eb="links" t="Links dos clientes" /><div className="panel empty">A aba Links ainda não foi liberada no banco. Peça ao dono para rodar a atualização.</div></>;

  return (
    <>
      <Head eb="links" t="Links dos clientes"
        sub="As pastas do Drive e outros links de cada cliente, num lugar só. Todo mundo pode adicionar e corrigir."
        right={<button type="button" className="btn pri" onClick={() => setForm({ cliente_id: soMeus && clis[0] ? clis[0].id : null, titulo: "Pasta do Drive" })}>+ Novo link</button>} />

      <div className="lk-barra">
        <input type="search" aria-label="Buscar link" placeholder="Buscar cliente ou link…" value={busca} onChange={e => setBusca(e.target.value)} />
        {temMeus && <div className="kfiltro" role="group" aria-label="Quais clientes">
          <button type="button" aria-pressed={soMeus} onClick={() => setSoMeus(true)}>Meus clientes</button>
          <button type="button" aria-pressed={!soMeus} onClick={() => setSoMeus(false)}>Todos</button>
        </div>}
        <span className="muted">{total} link{total === 1 ? "" : "s"}</span>
      </div>

      {links === null ? <div className="panel empty">Carregando…</div> : grupos.length === 0 ? <div className="panel empty">Nada encontrado para “{busca}”.</div> : (
        <div className="lk-grid">
          {grupos.map(g => (
            <section className="lk-cli" key={g.id || "geral"} aria-label={g.nome}>
              <header>
                <h2>{g.nome}</h2>
                <button type="button" className="linkbtn" onClick={() => setForm({ cliente_id: g.id, titulo: g.ls.length ? "" : "Pasta do Drive" })}>+ link</button>
              </header>
              {g.ls.length === 0 && <p className="lk-vazio">Sem link ainda.</p>}
              {g.ls.map(l => (
                <div className="lk-item" key={l.id}>
                  <span className={"lk-ic" + (ehDrive(l.url) ? " drive" : "")} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {ehDrive(l.url) ? <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> : <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />}
                    </svg>
                  </span>
                  <div className="lk-txt">
                    <a href={l.url} target="_blank" rel="noopener noreferrer">{l.titulo}</a>
                    <small>{l.obs ? l.obs + " · " : ""}{dominio(l.url)} · {d.pessoa(l.atualizado_por)?.nome?.trim() || "—"} em {quando(l.atualizado_em)}</small>
                  </div>
                  <div className="lk-acts">
                    <button type="button" className="btn sm" onClick={() => copiar(l)} aria-label={"Copiar link " + l.titulo}>{copiado === l.id ? "Copiado" : "Copiar"}</button>
                    <button type="button" className="btn sm" onClick={() => setForm(l)} aria-label={"Editar link " + l.titulo}>Editar</button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)}>
        {form && <LinkForm key={form.id || "novo"} d={d} link={form} clientes={ativos} fechar={() => setForm(null)} depois={carregar} />}
      </Modal>
    </>
  );
}

function LinkForm({ d, link, clientes, fechar, depois }: { d: Dados; link: Partial<Link>; clientes: { id: string; nome: string }[]; fechar: () => void; depois: () => void }) {
  const novo = !link.id;
  const [f, setF] = useState<Partial<Link>>(link);
  const [confirmar, setConfirmar] = useState(false);
  const { busy, err, setErr, run } = useBusy();
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    let url = (f.url || "").trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { setErr("Esse link não parece válido. Cole o endereço completo."); return; }
    const dados = { cliente_id: f.cliente_id || null, titulo: (f.titulo || "").trim(), url, obs: (f.obs || "").trim() || null };
    const ok = await run(() => (novo ? supabase.from("links").insert(dados) : supabase.from("links").update(dados).eq("id", link.id!)) as any);
    if (ok) { fechar(); d.aviso(novo ? "Link adicionado" : "Link atualizado"); depois(); }
  };
  const apagar = async () => {
    if (!confirmar) { setConfirmar(true); return; }
    const ok = await run(() => supabase.from("links").delete().eq("id", link.id!) as any);
    if (ok) { fechar(); d.aviso("Link excluído"); depois(); }
  };
  return (
    <form className="form" onSubmit={salvar}>
      <h2>{novo ? "Novo link" : "Editar link"}</h2>
      <label htmlFor="lk-cli">Cliente<select id="lk-cli" value={f.cliente_id || ""} onChange={e => setF({ ...f, cliente_id: e.target.value || null })}>
        <option value="">Agemax (geral)</option>
        {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select></label>
      <label htmlFor="lk-tit">Nome<input id="lk-tit" required placeholder="Ex.: Pasta do Drive, Fotos do evento" value={f.titulo || ""} onChange={e => setF({ ...f, titulo: e.target.value })} /></label>
      <label htmlFor="lk-url">Link<input id="lk-url" required inputMode="url" placeholder="https://drive.google.com/…" value={f.url || ""} onChange={e => setF({ ...f, url: e.target.value })} /></label>
      <label htmlFor="lk-obs">Observação (opcional)<input id="lk-obs" placeholder="Ex.: logos e fotos de produto" value={f.obs || ""} onChange={e => setF({ ...f, obs: e.target.value })} /></label>
      {err && <div className="err">{err}</div>}
      <div className="acts">
        {!novo && <button type="button" className="btn" style={{ marginRight: "auto", color: "var(--bad)" }} onClick={apagar} disabled={busy}>{confirmar ? "Confirmar exclusão" : "Excluir"}</button>}
        <button type="button" className="btn" onClick={fechar}>Cancelar</button>
        <button type="submit" className="btn pri" disabled={busy}>Salvar</button>
      </div>
    </form>
  );
}
