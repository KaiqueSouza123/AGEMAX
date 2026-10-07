import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Pessoa, noMes, placar } from "../regras";
import { Head, Modal, useBusy } from "../ui";

export default function Equipe({ d }: { d: Dados }) {
  const [ed, setEd] = useState<Partial<Pessoa> | null>(null);
  const [aberto, setAberto] = useState(false);
  const abrir = (p: Partial<Pessoa> | null) => { setEd(p); setAberto(true); };
  return (
    <>
      <Head eb="equipe" t="Pessoas e acessos" sub="Cadastre o e-mail de cada pessoa. Ela entra pela primeira vez em “Primeiro acesso”, com esse mesmo e-mail."
        right={<button type="button" className="btn gold" onClick={() => abrir({ papel: "funcionario", ativo: true })}>+ Nova pessoa</button>} />
      <div className="tablewrap"><table>
        <thead><tr><th>Pessoa</th><th>Perfil</th><th>E-mail</th><th>WhatsApp</th><th>Acesso</th><th className="num">Clientes</th><th>Pontualidade no mês</th><th></th></tr></thead>
        <tbody>{d.pessoas.map(p => {
          const s = placar(d.itens.filter(i => i.responsavel_id === p.id && noMes(i, d.mes)));
          return (
            <tr key={p.id} style={p.ativo ? undefined : { opacity: .55 }}>
              <td><span className="cli">{p.nome}</span><div className="muted">{p.funcao}</div></td>
              <td><span className={"chip " + (p.papel === "dono" ? "c-gold" : "c-mute")}>{p.papel === "dono" ? "DONO" : "FUNCIONÁRIO"}</span></td>
              <td>{p.email || <span className="muted">a cadastrar</span>}</td>
              <td className="dt">{p.whatsapp || <span className="muted">a cadastrar</span>}</td>
              <td>{p.user_id ? <span className="chip c-ok">ATIVO</span> : p.email ? <span className="chip c-info">AGUARDANDO 1º ACESSO</span> : <span className="chip c-warn">SEM E-MAIL</span>}</td>
              <td className="num">{d.clientes.filter(c => c.responsavel_id === p.id && c.ativo).length}</td>
              <td><b>{s.pct === null ? "—" : s.pct + "%"}</b></td>
              <td><button type="button" className="btn sm" onClick={() => abrir(p)}>Editar</button></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <PessoaForm key={ed?.id || "nova"} d={d} p={ed} fechar={() => setAberto(false)} />
      </Modal>
    </>
  );
}

function PessoaForm({ d, p, fechar }: { d: Dados; p: Partial<Pessoa> | null; fechar: () => void }) {
  const [f, setF] = useState<Partial<Pessoa>>(p || {});
  const { busy, err, run } = useBusy();
  const set = (k: keyof Pessoa, v: any) => setF(x => ({ ...x, [k]: v }));
  const eu = p?.id === d.me.id;
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados: any = { nome: f.nome, email: f.email ? f.email.trim().toLowerCase() : null, funcao: f.funcao || null, whatsapp: f.whatsapp || null, papel: f.papel || "funcionario", ativo: f.ativo !== false };
    if (eu) { dados.papel = "dono"; dados.ativo = true; }
    const ok = await run(() => (p?.id ? supabase.from("pessoas").update(dados).eq("id", p.id) : supabase.from("pessoas").insert(dados)) as any);
    if (ok) { fechar(); d.aviso("Pessoa salva"); d.recarregar(); }
  };
  return (
    <form className="form" onSubmit={salvar}>
      <h2>{p?.id ? "Editar pessoa" : "Nova pessoa"}</h2>
      <div className="row2">
        <label htmlFor="pe-nome">Nome<input id="pe-nome" required value={f.nome || ""} onChange={e => set("nome", e.target.value)} /></label>
        <label htmlFor="pe-funcao">Função<input id="pe-funcao" value={f.funcao || ""} onChange={e => set("funcao", e.target.value)} placeholder="Designer, videomaker…" /></label>
      </div>
      <label htmlFor="pe-email">E-mail (é o login da pessoa)<input id="pe-email" type="email" value={f.email || ""} onChange={e => set("email", e.target.value)} disabled={!!p?.user_id} /></label>
      {p?.user_id && <p className="muted" style={{ margin: 0 }}>O e-mail não muda depois que a pessoa já criou o acesso.</p>}
      <div className="row2">
        <label htmlFor="pe-whats">WhatsApp<input id="pe-whats" value={f.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="(48) 9 0000-0000" /></label>
        <label htmlFor="pe-papel">Perfil<select id="pe-papel" value={f.papel || "funcionario"} onChange={e => set("papel", e.target.value)} disabled={eu}>
          <option value="funcionario">Funcionário</option><option value="dono">Dono (acesso total)</option>
        </select></label>
      </div>
      {!eu && <label htmlFor="pe-ativo" style={{ display: "flex", gap: 8, alignItems: "center" }}><input id="pe-ativo" type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} /> Pessoa ativa (desmarque para bloquear o acesso)</label>}
      {err && <div className="err">{err}</div>}
      <div className="acts"><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" className="btn pri" disabled={busy}>Salvar</button></div>
    </form>
  );
}
