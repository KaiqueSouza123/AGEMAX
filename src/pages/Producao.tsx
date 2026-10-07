import { useState } from "react";
import type { Dados } from "../App";
import { Item, alerta, noMes, ordenar, mesLabel, temArte, dt, fmtw } from "../regras";
import { supabase } from "../supabase";
import { EntregaVer } from "./entrega";
import { Head, MesNav, Modal } from "../ui";
import { ItemForm, TabelaProducao } from "./tabela";

const ALERTAS = ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES", "VENCE EM BREVE", "AGUARDA APROVAÇÃO", "NO PRAZO", "OK"];

export default function Producao({ d }: { d: Dados }) {
  const [resp, setResp] = useState("");
  const [cli, setCli] = useState("");
  const [al, setAl] = useState("");
  const [editar, setEditar] = useState<Partial<Item> | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ver, setVer] = useState<Item | null>(null);
  const aguardando = ordenar(d.itens.filter(i => i.status === "Entregue" && temArte(i)));
  const mudar = async (i: Item, status: string, msg: string) => {
    setVer(null);
    const r = await supabase.from("itens").update({ status }).eq("id", i.id);
    if (r.error) d.aviso("Não deu certo: " + r.error.message); else { d.aviso(msg); d.recarregar(); }
  };

  let its = d.itens.filter(i => noMes(i, d.mes));
  its = its.filter(i => (!resp || (resp === "cliente" ? i.tipo === "Prazo do cliente" : resp === "sem" ? !i.responsavel_id && i.tipo !== "Prazo do cliente" : i.responsavel_id === resp))
    && (!cli || i.cliente_id === cli) && (!al || alerta(i) === al));
  its = ordenar(its);
  const abrir = (i: Partial<Item> | null) => { setEditar(i); setAberto(true); };

  return (
    <>
      <Head eb={"produção · " + mesLabel(d.mes)} t="Planilha de produção" sub="Cada post é uma linha. A equipe entrega aqui com o arquivo ou o link da arte, e você vê, baixa e aprova aqui."
        right={<div className="filters"><MesNav mes={d.mes} setMes={d.setMes} /><button type="button" className="btn gold" onClick={() => abrir(null)}>+ Novo post</button></div>} />
      {aguardando.length > 0 && (
        <section className="aprov" aria-labelledby="aprov-t">
          <h2 id="aprov-t">Aguardando sua aprovação <small>{aguardando.length}</small></h2>
          <div className="aprov-lista">
            {aguardando.map(i => (
              <button type="button" key={i.id} className="aprov-c" onClick={() => setVer(i)}>
                <span className="aprov-ic" aria-hidden="true">{i.n_arquivos ? i.n_arquivos : "↗"}</span>
                <span className="aprov-t"><b>{i.tema}</b><small>{d.cliente(i.cliente_id)?.nome} · {d.pessoa(i.responsavel_id)?.nome || "—"}</small>
                  <small className={alerta(i) === "AGUARDA APROVAÇÃO" ? "" : "bad-t"}>{i.n_arquivos ? `${i.n_arquivos} arquivo${i.n_arquivos > 1 ? "s" : ""}` : "só link"}{i.link && i.n_arquivos ? " + link" : ""} · entregue {i.entregue_em ? fmtw(dt(i.entregue_em)) : ""}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="filters">
        <select aria-label="Responsável" value={resp} onChange={e => setResp(e.target.value)}>
          <option value="">Toda a equipe</option>
          {d.pessoas.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="sem">Sem responsável</option><option value="cliente">Prazos de clientes</option>
        </select>
        <select aria-label="Cliente" value={cli} onChange={e => setCli(e.target.value)}>
          <option value="">Todos os clientes</option>{d.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select aria-label="Situação" value={al} onChange={e => setAl(e.target.value)}>
          <option value="">Qualquer situação</option>{ALERTAS.map(a => <option key={a}>{a}</option>)}
        </select>
        <span className="muted">{its.length} itens</span>
      </div>
      <TabelaProducao d={d} its={its} comResp onEditar={i => abrir(i)} />
      <p className="muted">Prazo da arte = 3 dias úteis antes do post (fins de semana e feriados não contam). Entrega sem arquivo e sem link não conta como entregue.</p>
      <Modal open={!!ver} onClose={() => setVer(null)}>
        {ver && <EntregaVer d={d} i={ver} fechar={() => setVer(null)}
          aprovar={() => mudar(ver, "Aprovado", "Arte aprovada")}
          ajuste={() => mudar(ver, "Ajustes", "Ajuste pedido. A pessoa vê na tela dela.")} />}
      </Modal>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <ItemForm key={editar?.id || "novo"} d={d} item={editar} fechar={() => setAberto(false)} />
      </Modal>
    </>
  );
}
