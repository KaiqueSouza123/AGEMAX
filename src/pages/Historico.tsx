import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Head } from "../ui";

type Reg = {
  id: number; quando: string; pessoa_id: string | null; tabela: string; acao: "criou" | "alterou" | "excluiu";
  registro_id: string | null; cliente_id: string | null; titulo: string | null; campos: string[] | null; antes: any; depois: any;
};
type Linha = Reg & { n: number };

const AREAS: [string, string, string[]][] = [
  ["", "Tudo", []],
  ["posts", "Posts", ["itens"]],
  ["arquivos", "Arquivos", ["entrega_arquivos"]],
  ["clientes", "Clientes", ["clientes"]],
  ["links", "Links", ["links"]],
  ["equipe", "Equipe", ["pessoas"]],
  ["radar", "Radar", ["radar_ideias", "radar_semanas"]],
];
const PERIODOS: [string, string, number][] = [["7", "7 dias", 7], ["30", "30 dias", 30], ["90", "90 dias", 90]];

const dm = (s: any) => { if (!s) return "—"; const t = String(s); return t.length >= 10 ? `${t.slice(8, 10)}/${t.slice(5, 7)}` : t; };
const hora = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const diaSP = (s: string | Date) => new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const tagDe = (id: string | null) => id ? "tg" + ([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 5) : "tg-ag";

const NOME_CAMPO: Record<string, string> = {
  tema: "o nome", data_post: "a data", status: "o status", responsavel_id: "o responsável", link: "o link", briefing: "o briefing",
  objetivo: "o objetivo", tipo: "o tipo", cliente_id: "o cliente", entregue_em: "a data de entrega", nome: "o nome", instagram: "o Instagram",
  nicho: "o nicho", segmento: "o segmento", cidade: "a cidade", regra: "a regra", logo: "a logo", ativo: "a situação",
  titulo: "o nome", url: "o endereço", obs: "a observação", email: "o e-mail", papel: "o papel", funcao: "a função", whatsapp: "o WhatsApp",
  estado: "a situação", publicado_em: "a publicação", em_alta: "os assuntos em alta", inicio: "a semana", removido_em: "o arquivo",
};

export default function Historico({ d }: { d: Dados }) {
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [erro, setErro] = useState(false);
  const [periodo, setPeriodo] = useState("7");
  const [quem, setQuem] = useState("");
  const [cli, setCli] = useState("");
  const [area, setArea] = useState("");
  const [abertos, setAbertos] = useState<number[]>([]);

  const carregar = useCallback(async () => {
    const dias = PERIODOS.find(p => p[0] === periodo)![2];
    const desde = new Date(Date.now() - dias * 864e5).toISOString();
    const r = await supabase.from("historico").select("*").gte("quando", desde).order("quando", { ascending: false }).limit(1000);
    if (r.error) setErro(true); else { setErro(false); setRegs(r.data as Reg[]); }
  }, [periodo]);
  useEffect(() => {
    carregar();
    const ch = supabase.channel("historico").on("postgres_changes", { event: "INSERT", schema: "public", table: "historico" }, () => carregar()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  const nomeP = (id: string | null | undefined) => (id && d.pessoa(id)?.nome?.trim()) || (id ? "alguém" : "ninguém");
  const nomeC = (id: string | null | undefined) => (id && d.cliente(id)?.nome) || "—";

  // filtra e junta criações/exclusões em massa (mesma pessoa, mesmo minuto)
  const linhas = useMemo(() => {
    const tabs = AREAS.find(a => a[0] === area)![2];
    const f = (regs || []).filter(r => (!quem || (quem === "sistema" ? !r.pessoa_id : r.pessoa_id === quem)) && (!cli || r.cliente_id === cli) && (!tabs.length || tabs.includes(r.tabela)));
    const out: Linha[] = [];
    for (const r of f) {
      const ult = out[out.length - 1];
      if (ult && r.acao !== "alterou" && ult.acao === r.acao && ult.tabela === r.tabela && ult.pessoa_id === r.pessoa_id && ult.quando.slice(0, 16) === r.quando.slice(0, 16)) { ult.n++; continue; }
      out.push({ ...r, n: 1 });
    }
    return out;
  }, [regs, quem, cli, area]);

  const quemAparece = useMemo(() => [...new Set((regs || []).map(r => r.pessoa_id || "sistema"))], [regs]);

  const frase = (r: Linha): ReactNode => {
    const t = <b>“{r.titulo || "sem nome"}”</b>;
    if (r.n > 1) {
      const nomes: Record<string, string> = { itens: "posts", radar_ideias: "ideias do Radar", entrega_arquivos: "arquivos", links: "links", clientes: "clientes", pessoas: "pessoas" };
      return <>{r.acao === "criou" ? "adicionou" : "excluiu"} <b>{r.n} {nomes[r.tabela] || "registros"}</b></>;
    }
    const a = r.antes || {}, n = r.depois || {};
    switch (r.tabela) {
      case "itens":
        if (r.acao === "criou") return <>criou o post {t} para {dm(n.data_post)}</>;
        if (r.acao === "excluiu") return <>excluiu o post {t} de {dm(a.data_post)}</>;
        return <>no post {t}: {mudancas(r)}</>;
      case "entrega_arquivos":
        if (r.acao === "criou") return <>enviou um arquivo em {t}</>;
        if (r.acao === "excluiu") return <>tirou um arquivo de {t}</>;
        if (r.campos?.includes("removido_em")) return <>arquivo {t} apagado na limpeza automática</>;
        return <>mexeu no arquivo {t}</>;
      case "clientes":
        if (r.acao === "criou") return <>cadastrou o cliente {t}</>;
        if (r.acao === "excluiu") return <>excluiu o cliente {t}</>;
        return <>no cliente {t}: {mudancas(r)}</>;
      case "pessoas":
        if (r.acao === "criou") return <>cadastrou {t} na equipe</>;
        if (r.acao === "excluiu") return <>tirou {t} da equipe</>;
        return <>em {t} (equipe): {mudancas(r)}</>;
      case "links":
        if (r.acao === "criou") return <>adicionou o link {t}</>;
        if (r.acao === "excluiu") return <>excluiu o link {t}</>;
        return <>no link {t}: {mudancas(r)}</>;
      case "radar_ideias":
        if (r.acao === "alterou" && r.campos?.includes("estado")) {
          const e = n.estado;
          return <>{e === "usada" ? "usou a ideia" : e === "guardada" ? "guardou a ideia" : e === "descartada" ? "descartou a ideia" : "voltou a ideia"} {t} do Radar</>;
        }
        if (r.acao === "criou") return <>adicionou a ideia {t} ao Radar</>;
        if (r.acao === "excluiu") return <>excluiu a ideia {t} do Radar</>;
        return <>na ideia {t}: {mudancas(r)}</>;
      case "radar_semanas":
        if (r.acao === "alterou" && r.campos?.includes("publicado_em")) return <>{n.publicado_em ? "publicou" : "tirou do ar"} o Radar da {t}</>;
        return <>{r.acao} o Radar da {t}</>;
    }
    return <>{r.acao} {t}</>;
  };

  const mudancas = (r: Linha): ReactNode => {
    const a = r.antes || {}, n = r.depois || {};
    const partes = (r.campos || []).filter(c => !(c === "entregue_em" && r.campos!.includes("status"))).map(c => {
      switch (c) {
        case "tema": case "nome": case "titulo": return <>trocou o nome de “{a[c]}” para <b>“{n[c]}”</b></>;
        case "data_post": return <>mudou a data de {dm(a[c])} para <b>{dm(n[c])}</b></>;
        case "status": return <>mudou o status de {a[c]} para <b>{n[c]}</b></>;
        case "estado": return <>mudou de {a[c]} para <b>{n[c]}</b></>;
        case "responsavel_id": return <>passou de {nomeP(a[c])} para <b>{nomeP(n[c])}</b></>;
        case "cliente_id": return <>trocou o cliente de {nomeC(a[c])} para <b>{nomeC(n[c])}</b></>;
        case "ativo": return n[c] ? <><b>reativou</b></> : <><b>desativou</b></>;
        case "link": return n[c] ? (a[c] ? <>trocou o link</> : <>colocou o link</>) : <>tirou o link</>;
        case "tipo": return <>mudou o tipo de {a[c]} para <b>{n[c]}</b></>;
        default: return <>alterou {NOME_CAMPO[c] || c}</>;
      }
    });
    return partes.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>);
  };

  // detalhe: antes → depois de cada campo
  const detalhe = (r: Linha) => {
    const fmt = (c: string, v: any) => v === null || v === undefined || v === "" ? "(vazio)" : c.endsWith("_id") && c !== "registro_id" ? (c === "cliente_id" ? nomeC(v) : nomeP(v)) : typeof v === "object" ? JSON.stringify(v) : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? new Date(String(v).length > 10 ? String(v) : String(v) + "T12:00:00").toLocaleString("pt-BR", String(v).length > 10 ? { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" } : { dateStyle: "short" }) : v === true ? "sim" : v === false ? "não" : String(v);
    if (r.acao === "alterou") return (r.campos || []).map(c => <div key={c}><span className="hs-k">{NOME_CAMPO[c]?.replace(/^(o|a|os|as) /, "") || c}</span><span className="hs-a">{fmt(c, r.antes?.[c])}</span> → <span className="hs-d">{fmt(c, r.depois?.[c])}</span></div>);
    const obj = r.acao === "criou" ? r.depois : r.antes;
    return Object.entries(obj || {}).filter(([k, v]) => v !== null && v !== "" && !["id", "created_at", "updated_at", "criado_em", "atualizado_em", "criado_por", "atualizado_por", "n_arquivos", "user_id", "caminho"].includes(k))
      .map(([k, v]) => <div key={k}><span className="hs-k">{NOME_CAMPO[k]?.replace(/^(o|a|os|as) /, "") || k}</span><span>{fmt(k, v)}</span></div>);
  };

  const hoje = diaSP(new Date()), ontem = diaSP(new Date(Date.now() - 864e5));
  const rotDia = (k: string) => k === hoje ? "Hoje" : k === ontem ? "Ontem" : new Date(k + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const porDia: [string, Linha[]][] = [];
  for (const l of linhas) { const k = diaSP(l.quando); const g = porDia[porDia.length - 1]; if (g && g[0] === k) g[1].push(l); else porDia.push([k, [l]]); }

  if (!d.ehDono) return <><Head eb="histórico" t="Histórico" /><div className="panel empty">Só o dono vê o histórico.</div></>;
  if (erro) return <><Head eb="histórico" t="Histórico de alterações" /><div className="panel empty">O histórico ainda não foi liberado no banco. Rode a atualização no Supabase.</div></>;

  return (
    <>
      <Head eb="histórico" t="Histórico de alterações" sub="Tudo que a equipe cria, muda ou apaga no sistema: quem fez, quando e o que mudou. Só você vê esta página." />
      <div className="hs-filtros">
        <div className="kfiltro" role="group" aria-label="Período">{PERIODOS.map(([k, l]) => <button type="button" key={k} aria-pressed={periodo === k} onClick={() => setPeriodo(k)}>{l}</button>)}</div>
        <select aria-label="Quem" value={quem} onChange={e => setQuem(e.target.value)}>
          <option value="">Todas as pessoas</option>
          {quemAparece.map(id => <option key={id} value={id}>{id === "sistema" ? "Sistema (automático)" : nomeP(id)}</option>)}
        </select>
        <select aria-label="Cliente" value={cli} onChange={e => setCli(e.target.value)}>
          <option value="">Todos os clientes</option>
          {d.clientes.filter(c => c.ativo).sort((a, b) => a.nome.localeCompare(b.nome)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select aria-label="O que" value={area} onChange={e => setArea(e.target.value)}>{AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>

      {regs === null ? <div className="panel empty">Carregando…</div>
        : linhas.length === 0 ? <div className="panel empty">Nenhuma alteração nesse período{quem || cli || area ? " com esses filtros" : ""}.</div>
        : porDia.map(([dia, ls]) => (
          <section className="hs-dia" key={dia} aria-label={rotDia(dia)}>
            <h2>{rotDia(dia)} <small>{ls.length}</small></h2>
            <ol className="hs-lista">
              {ls.map(l => {
                const ab = abertos.includes(l.id), nome = l.pessoa_id ? nomeP(l.pessoa_id) : "Sistema";
                return (
                  <li key={l.id} className={"hs-it hs-" + l.acao}>
                    <span className="hs-h">{hora(l.quando)}</span>
                    <span className="who-av hs-av" aria-hidden="true">{nome.slice(0, 1).toUpperCase()}</span>
                    <div className="hs-txt">
                      <div><b>{nome}</b> {frase(l)}</div>
                      <div className="hs-meta">
                        {l.cliente_id && l.n === 1 && <span className={"ktag " + tagDe(l.cliente_id)}>{nomeC(l.cliente_id)}</span>}
                        {l.n === 1 && <button type="button" className="linkbtn" aria-expanded={ab} onClick={() => setAbertos(x => ab ? x.filter(i => i !== l.id) : [...x, l.id])}>{ab ? "esconder detalhes" : "ver detalhes"}</button>}
                      </div>
                      {ab && <div className="hs-det">{detalhe(l)}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      {regs && regs.length >= 1000 && <p className="muted">Mostrando as 1000 alterações mais recentes. Use os filtros ou um período menor.</p>}
    </>
  );
}
