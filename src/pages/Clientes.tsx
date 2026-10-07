import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Cliente } from "../regras";
import { Head, Modal, useBusy } from "../ui";

export default function Clientes({ d }: { d: Dados }) {
  const [ed, setEd] = useState<Partial<Cliente> | null>(null);
  const [aberto, setAberto] = useState(false);
  const abrir = (c: Partial<Cliente> | null) => { setEd(c); setAberto(true); };
  const ativos = d.clientes.filter(c => c.ativo);
  return (
    <>
      <Head eb="base de clientes" t={`${ativos.length} clientes`} sub="A mesma base que o squad usa para planejar."
        right={<button type="button" className="btn gold" onClick={() => abrir({ ativo: true })}>+ Novo cliente</button>} />
      <div className="cards">
        {d.clientes.map(c => (
          <article className="ccard" key={c.id} style={c.ativo ? undefined : { opacity: .55 }}>
            <div className="lg">{c.logo ? <img src={c.logo} alt={"Logo " + c.nome} /> : <span>{c.nome.split(" ").slice(0, 2).join(" ")}</span>}</div>
            <h3>{c.nome}</h3>
            <dl className="kv">
              <dt>Responsável</dt><dd>{d.pessoa(c.responsavel_id)?.nome || <b style={{ color: "var(--warn)" }}>sem responsável</b>}</dd>
              <dt>Nicho</dt><dd>{c.nicho || "—"}</dd><dt>Cidade</dt><dd>{c.cidade || "a confirmar"}</dd><dt>Instagram</dt><dd>{c.instagram || "—"}</dd>
            </dl>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {!c.logo && <span className="chip c-warn">SEM LOGO</span>}{!c.cidade && <span className="chip c-mute">SEM CIDADE</span>}
              {c.regra && <span className="chip c-info" title={c.regra}>REGRA ESPECIAL</span>}{!c.ativo && <span className="chip c-mute">INATIVO</span>}
            </div>
            <button type="button" className="btn sm" onClick={() => abrir(c)}>Editar</button>
          </article>
        ))}
      </div>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <ClienteForm key={ed?.id || "novo"} d={d} c={ed} fechar={() => setAberto(false)} />
      </Modal>
    </>
  );
}

function ClienteForm({ d, c, fechar }: { d: Dados; c: Partial<Cliente> | null; fechar: () => void }) {
  const [f, setF] = useState<Partial<Cliente>>(c || {});
  const { busy, err, run } = useBusy();
  const set = (k: keyof Cliente, v: any) => setF(x => ({ ...x, [k]: v }));
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados: any = { nome: f.nome, instagram: f.instagram || null, nicho: f.nicho || null, segmento: f.segmento || null, cidade: f.cidade || null, regra: f.regra || null, responsavel_id: f.responsavel_id || null, ativo: f.ativo !== false };
    const ok = await run(() => (c?.id ? supabase.from("clientes").update(dados).eq("id", c.id) : supabase.from("clientes").insert(dados)) as any);
    if (ok) { fechar(); d.aviso("Cliente salvo"); d.recarregar(); }
  };
  return (
    <form className="form" onSubmit={salvar}>
      <h2>{c?.id ? "Editar cliente" : "Novo cliente"}</h2>
      <label htmlFor="cl-nome">Nome<input id="cl-nome" required value={f.nome || ""} onChange={e => set("nome", e.target.value)} /></label>
      <div className="row2">
        <label htmlFor="cl-resp">Responsável<select id="cl-resp" value={f.responsavel_id || ""} onChange={e => set("responsavel_id", e.target.value)}>
          <option value="">Sem responsável</option>{d.pessoas.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select></label>
        <label htmlFor="cl-ig">Instagram<input id="cl-ig" value={f.instagram || ""} onChange={e => set("instagram", e.target.value)} placeholder="@perfil" /></label>
      </div>
      <div className="row2">
        <label htmlFor="cl-nicho">Nicho<input id="cl-nicho" value={f.nicho || ""} onChange={e => set("nicho", e.target.value)} /></label>
        <label htmlFor="cl-cid">Cidade<input id="cl-cid" value={f.cidade || ""} onChange={e => set("cidade", e.target.value)} /></label>
      </div>
      <label htmlFor="cl-regra">Regra especial<input id="cl-regra" value={f.regra || ""} onChange={e => set("regra", e.target.value)} placeholder="Ex.: evitar conteúdo político" /></label>
      <label htmlFor="cl-ativo" style={{ display: "flex", gap: 8, alignItems: "center" }}><input id="cl-ativo" type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} /> Cliente ativo</label>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" className="btn pri" disabled={busy}>Salvar</button></div>
    </form>
  );
}
