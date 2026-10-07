import { useState } from "react";
import type { Dados } from "../App";
import { Item, alerta, noMes, ordenar, mesLabel } from "../regras";
import { Head, MesNav, Modal } from "../ui";
import { ItemForm, TabelaProducao } from "./tabela";

const ALERTAS = ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES", "VENCE EM BREVE", "AGUARDA APROVAÇÃO", "NO PRAZO", "OK"];

export default function Producao({ d }: { d: Dados }) {
  const [resp, setResp] = useState("");
  const [cli, setCli] = useState("");
  const [al, setAl] = useState("");
  const [editar, setEditar] = useState<Partial<Item> | null>(null);
  const [aberto, setAberto] = useState(false);

  let its = d.itens.filter(i => noMes(i, d.mes));
  its = its.filter(i => (!resp || (resp === "cliente" ? i.tipo === "Prazo do cliente" : resp === "sem" ? !i.responsavel_id && i.tipo !== "Prazo do cliente" : i.responsavel_id === resp))
    && (!cli || i.cliente_id === cli) && (!al || alerta(i) === al));
  its = ordenar(its);
  const abrir = (i: Partial<Item> | null) => { setEditar(i); setAberto(true); };

  return (
    <>
      <Head eb={"produção · " + mesLabel(d.mes)} t="Planilha de produção" sub="Cada post é uma linha. A equipe entrega aqui com o link da arte, e você aprova aqui."
        right={<div className="filters"><MesNav mes={d.mes} setMes={d.setMes} /><button type="button" className="btn gold" onClick={() => abrir(null)}>+ Novo post</button></div>} />
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
      <p className="muted">Prazo da arte = 3 dias úteis antes do post (fins de semana e feriados não contam). Entrega sem link não conta como entregue.</p>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <ItemForm key={editar?.id || "novo"} d={d} item={editar} fechar={() => setAberto(false)} />
      </Modal>
    </>
  );
}
