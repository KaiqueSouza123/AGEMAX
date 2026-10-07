import type { Dados } from "../App";
import { Pessoa, alerta, dt, fmt, fmtw, hojeSP, ordenar, placar, prazoDe } from "../regras";
import { Head } from "../ui";

function msgPessoa(d: Dados, p: Pessoa): string | null {
  const its = ordenar(d.itens.filter(i => i.responsavel_id === p.id && ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES", "VENCE EM BREVE"].includes(alerta(i))));
  if (!its.length) return null;
  const linha = (i: any) => {
    const a = alerta(i); const ic = a === "ATRASADO" ? "🔴" : a === "SEM LINK" ? "🔗" : a === "VENCE HOJE" || a === "AJUSTES" ? "🟠" : "🟡";
    const txt = a === "ATRASADO" ? `atrasada desde ${fmt(prazoDe(i))}` : a === "SEM LINK" ? "entregue sem o link da arte" : a === "VENCE HOJE" ? "prazo é hoje" : a === "AJUSTES" ? "ajuste pedido pelo dono" : `prazo ${fmtw(prazoDe(i))}`;
    return `${ic} *${d.cliente(i.cliente_id)?.nome}* · ${i.tema}\n   ${txt}`;
  };
  return `Bom dia, ${p.nome.split(" ")[0]}! Suas demandas de hoje:\n\n${its.slice(0, 6).map(linha).join("\n")}${its.length > 6 ? `\n…e mais ${its.length - 6}` : ""}\n\nTerminou? Entregue na plataforma com o link da arte. Se algo está travando, responde aqui.`;
}
function msgDono(d: Dados): string {
  const lin = d.pessoas.filter(p => p.ativo && p.papel === "funcionario").map(p => { const s = placar(d.itens.filter(i => i.responsavel_id === p.id)); return `• ${p.nome}: ${s.atrasados} atrasada(s), ${s.hoje} hoje, ${s.semlink} sem link`; });
  const cli = d.itens.filter(i => i.tipo === "Prazo do cliente" && !["NO PRAZO", "OK"].includes(alerta(i)));
  return `Resumo da produção · ${fmtw(hojeSP())}\n\n${lin.join("\n")}${cli.length ? `\n\nPrazos de clientes:\n${cli.map(i => `• ${d.cliente(i.cliente_id)?.nome}: ${i.tema} (${fmt(dt(i.data_post))})`).join("\n")}` : ""}\n\nPainel completo na plataforma.`;
}

export default function WhatsApp({ d }: { d: Dados }) {
  const pessoas = d.ehDono ? d.pessoas.filter(p => p.ativo && p.papel === "funcionario") : [d.me];
  return (
    <>
      <Head eb="whatsapp" t={d.ehDono ? "Cobranças e avisos" : "Meus avisos"}
        sub={d.ehDono ? "Prévia do que vai sair do número da Agemax às 8h, em dias úteis. As mensagens mudam sozinhas conforme a produção." : "O que você vai receber no WhatsApp às 8h, em dias úteis."} />
      <div className="note">O envio automático pelo WhatsApp entra na próxima etapa (servidor com Evolution + n8n). Por enquanto esta tela mostra a prévia.</div>
      <div className="phones">
        {d.ehDono && <div className="phone"><div className="ph"><div className="av">A</div><div>Agemax Avisos<small>para os donos</small></div></div><div className="chat"><div className="bubble">{msgDono(d)}<span className="tm">08:01</span></div></div></div>}
        {pessoas.map(p => { const m = msgPessoa(d, p); return (
          <div className={"phone" + (m ? "" : " offline")} key={p.id}>
            <div className="ph"><div className="av">A</div><div>Agemax Avisos<small>para {p.nome} · {p.whatsapp || "WhatsApp a cadastrar"}</small></div></div>
            <div className="chat"><div className="bubble">{m || "Sem pendências hoje: ninguém recebe mensagem quando está tudo em dia."}<span className="tm">{m ? "08:00" : "—"}</span></div></div>
          </div>
        ); })}
      </div>
    </>
  );
}
