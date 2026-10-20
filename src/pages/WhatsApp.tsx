import type { Dados } from "../App";
import { Pessoa, alerta, dt, fmt, fmtw, hojeSP, ordenar, placar, prazoDe, areaDe, veTipo } from "../regras";
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Head } from "../ui";

function msgPessoa(d: Dados, p: Pessoa): string | null {
  const its = ordenar(d.itens.filter(i => i.responsavel_id === p.id && veTipo(areaDe(p.funcao), i.tipo) && ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES", "VENCE EM BREVE"].includes(alerta(i))));
  if (!its.length) return null;
  const linha = (i: any) => {
    const a = alerta(i); const ic = a === "ATRASADO" ? "🟠" : a === "SEM LINK" ? "🔗" : a === "VENCE HOJE" || a === "AJUSTES" ? "🟠" : "🟡";
    const txt = a === "ATRASADO" ? `post ${fmtw(dt(i.data_post))} · entregue assim que puder` : a === "SEM LINK" ? "entregue sem o link da arte" : a === "VENCE HOJE" ? "prazo é hoje" : a === "AJUSTES" ? "ajuste pedido pelo dono" : `prazo ${fmtw(prazoDe(i))}`;
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
      {d.ehDono && <Robo />}
      <div className="note">Os lembretes diários abaixo ainda são uma prévia. O que já é automático: cada entrega da equipe chega no grupo dos donos pelo robô.</div>
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

function Robo() {
  const [st, setSt] = useState<{ estado: string; grupo?: string; em?: string } | null>(null);
  const [fila, setFila] = useState<number | null>(null);
  useEffect(() => {
    const ler = async () => {
      const m = await supabase.from("manutencao").select("valor,em").eq("chave", "robo_whatsapp").maybeSingle();
      if (m.data) { try { setSt({ ...JSON.parse(m.data.valor || "{}"), em: m.data.em }); } catch { setSt({ estado: "?", em: m.data.em }); } } else setSt({ estado: "nunca" });
      const f = await supabase.from("avisos_whatsapp").select("id", { count: "exact", head: true }).is("enviado_em", null);
      setFila(f.error ? null : f.count ?? 0);
    };
    ler(); const t = setInterval(ler, 30000); return () => clearInterval(t);
  }, []);
  if (!st) return null;
  const min = st.em ? Math.round((Date.now() - new Date(st.em).getTime()) / 60000) : null;
  const ligado = st.estado === "ok" && min !== null && min <= 7;
  const txt = st.estado === "nunca" ? "Ainda não foi ligado. Abra o INICIAR.bat no seu computador."
    : ligado ? `Ligado · mandando no grupo "${st.grupo}" · visto há ${min < 1 ? "menos de 1" : min} min`
    : st.estado === "sem_grupo" ? "Ligado, mas não achou o grupo. Confira o nome no config.txt."
    : st.estado === "desconectado" ? "O WhatsApp foi desconectado. Abra o robô e leia o QR Code de novo."
    : `Desligado · última vez há ${min !== null ? (min < 120 ? min + " min" : Math.round(min / 60) + " h") : "—"}. O computador com o robô precisa estar ligado.`;
  return (
    <div className={"panel robo " + (ligado ? "on" : "off")}>
      <span className="robo-dot" aria-hidden="true" />
      <div><b>Robô das entregas</b><div className="muted">{txt}</div>
        {fila !== null && fila > 0 && <div className="muted">{fila} entrega{fila > 1 ? "s" : ""} esperando para ir ao grupo{ligado ? "" : " (vão quando o robô ligar)"}.</div>}</div>
    </div>
  );
}
