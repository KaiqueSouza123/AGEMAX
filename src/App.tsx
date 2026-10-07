import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Cliente, Item, Pessoa, RadarIdeia, RadarSemana, alerta, hojeSP, iso, setFeriados, fmtw } from "./regras";
import Login, { NovaSenha } from "./pages/Login";
import Painel from "./pages/Painel";
import Producao from "./pages/Producao";
import Minhas from "./pages/Minhas";
import Desempenho from "./pages/Desempenho";
import Calendarios from "./pages/Calendarios";
import Clientes from "./pages/Clientes";
import Equipe from "./pages/Equipe";
import WhatsApp from "./pages/WhatsApp";
import Aprenda from "./pages/Aprenda";
import Radar from "./pages/Radar";
import BoasVindas from "./pages/BoasVindas";
import { EVENTO_APRENDA, licoesVistas, viuBoasVindas } from "./aprenda-progresso";

export type Dados = {
  me: Pessoa; pessoas: Pessoa[]; clientes: Cliente[]; itens: Item[];
  semanas: RadarSemana[]; ideias: RadarIdeia[];
  mes: string; setMes: (m: string) => void; recarregar: () => Promise<void>;
  aviso: (t: string) => void; ehDono: boolean; ir: (v: string) => void;
  pessoa: (id: string | null) => Pessoa | undefined; cliente: (id: string) => Cliente | undefined;
};

type Grupo = [string, [string, string][]];
const GRUPOS_DONO: Grupo[] = [
  ["Visão geral", [["painel", "Painel"], ["producao", "Produção"]]],
  ["Conteúdo", [["radar", "Radar da Semana"], ["calendarios", "Calendários"]]],
  ["Clientes e equipe", [["clientes", "Clientes"], ["equipe", "Equipe"]]],
  ["Cobrança", [["whatsapp", "WhatsApp"]]],
  ["Ajuda", [["aprenda", "Aprenda"]]],
];
const GRUPOS_FUNC: Grupo[] = [
  ["Trabalho", [["minhas", "Minhas demandas"], ["radar", "Radar da Semana"], ["calendarios", "Calendários"]]],
  ["Meu mês", [["desempenho", "Meu desempenho"], ["whatsapp", "Meus avisos"]]],
  ["Ajuda", [["aprenda", "Aprenda"]]],
];
const ICONES: Record<string, string> = {
  painel: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  producao: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  minhas: "M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v6h-4z",
  radar: "M12 4a8 8 0 1 0 8 8M12 8a4 4 0 1 0 4 4M12 12l7-7",
  calendarios: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  clientes: "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3",
  equipe: "M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  whatsapp: "M4 5h16v11H8l-4 4z",
  desempenho: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  aprenda: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 5v16",
};
const Icone = ({ k }: { k: string }) => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONES[k] || ICONES.painel} /></svg>;
const VIEWS_DONO = GRUPOS_DONO.flatMap(g => g[1]);
const VIEWS_FUNC = GRUPOS_FUNC.flatMap(g => g[1]);

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Pessoa | null>(null);
  const [semCadastro, setSemCadastro] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [semanas, setSemanas] = useState<RadarSemana[]>([]);
  const [ideias, setIdeias] = useState<RadarIdeia[]>([]);
  const [mes, setMes] = useState(iso(hojeSP()).slice(0, 7));
  const [view, setView] = useState<string>(() => location.hash.replace("#", "") || "");
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  // menu do celular: fecha com Esc e trava a rolagem da página enquanto aberto
  useEffect(() => {
    if (!menu) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [menu]);

  const [recuperando, setRecuperando] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === "PASSWORD_RECOVERY") setRecuperando(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregar = useCallback(async () => {
    if (!session) return;
    const [p, c, f, i, rs, ri] = await Promise.all([
      supabase.from("pessoas").select("*").order("nome"),
      supabase.from("clientes").select("*").order("nome"),
      supabase.from("feriados").select("data"),
      supabase.from("itens").select("*").order("data_post"),
      supabase.from("radar_semanas").select("*").order("inicio", { ascending: false }),
      supabase.from("radar_ideias").select("*").order("criado_em"),
    ]);
    setSemanas((rs.data || []) as RadarSemana[]); setIdeias((ri.data || []) as RadarIdeia[]);
    setFeriados((f.data || []).map((x: any) => x.data));
    const lista = (p.data || []) as Pessoa[];
    const eu = lista.find(x => x.user_id === session.user.id) || null;
    setMe(eu); setSemCadastro(!eu);
    setPessoas(lista); setClientes((c.data || []) as Cliente[]); setItens((i.data || []) as Item[]);
  }, [session]);

  useEffect(() => { recarregar(); }, [recarregar]);

  // atualiza sozinho quando alguém muda a produção
  useEffect(() => {
    if (!session) return;
    const ch = supabase.channel("itens").on("postgres_changes", { event: "*", schema: "public", table: "itens" }, () => recarregar())
      .on("postgres_changes", { event: "*", schema: "public", table: "radar_semanas" }, () => recarregar()).subscribe();
    // reforço: ao voltar para a aba e a cada 60s (cobre post trocado de responsável ou excluído)
    const volta = () => { if (document.visibilityState === "visible") recarregar(); };
    document.addEventListener("visibilitychange", volta);
    const t = setInterval(volta, 60000);
    return () => { supabase.removeChannel(ch); document.removeEventListener("visibilitychange", volta); clearInterval(t); };
  }, [session, recarregar]);

  const aviso = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2600); };
  const ehDono = me?.papel === "dono";
  const views = ehDono ? VIEWS_DONO : VIEWS_FUNC;
  const atual = views.some(v => v[0] === view) ? view : views[0][0];
  const ir = (v: string) => { setMenu(false); setView(v); history.replaceState(null, "", "#" + v); window.scrollTo(0, 0); };

  // aba Aprenda: selo NOVO até a primeira lição e boas-vindas no primeiro acesso
  const [nVistas, setNVistas] = useState(0);
  const [bv, setBv] = useState(false);
  useEffect(() => {
    if (!me) return;
    const at = () => setNVistas(licoesVistas(me.id).length);
    at(); setBv(!viuBoasVindas(me.id));
    window.addEventListener(EVENTO_APRENDA, at); return () => window.removeEventListener(EVENTO_APRENDA, at);
  }, [me?.id]);

  const dados: Dados | null = useMemo(() => me && ({
    me, pessoas, clientes, itens, semanas, ideias, mes, setMes, recarregar, aviso, ehDono, ir,
    pessoa: (id) => pessoas.find(p => p.id === id), cliente: (id) => clientes.find(c => c.id === id),
  }), [me, pessoas, clientes, itens, semanas, ideias, mes, recarregar, ehDono]);

  if (session === undefined) return <div className="loading">Carregando</div>;
  if (!session) return <Login />;
  if (recuperando) return <NovaSenha pronto={() => { setRecuperando(false); history.replaceState(null, "", "/"); }} />;
  if (semCadastro) return (
    <div className="login"><div className="lbox">
      <img src="/agemax-horizontal.png" alt="Agemax" />
      <h1>Acesso não liberado</h1>
      <p className="sub">Sua conta ({session.user.email}) não está ligada a ninguém da equipe. Peça a um dono para cadastrar este e-mail na aba Equipe.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
    </div></div>
  );
  if (!dados) return <div className="loading">Carregando</div>;

  const nPend = ehDono
    ? itens.filter(i => ["ATRASADO", "SEM LINK"].includes(alerta(i))).length
    : itens.filter(i => i.responsavel_id === me.id && ["ATRASADO", "SEM LINK", "VENCE HOJE", "AJUSTES"].includes(alerta(i))).length;

  // ideias novas do radar publicado mais recente (para o funcionário)
  const ultimo = semanas.find(s => s.publicado_em);
  const nRadar = ehDono || !ultimo ? 0 : ideias.filter(x => x.semana_id === ultimo.id && !x.visto_em && x.estado === "nova").length;

  const Pagina = { painel: Painel, producao: Producao, minhas: Minhas, desempenho: Desempenho, calendarios: Calendarios, clientes: Clientes, equipe: Equipe, whatsapp: WhatsApp, aprenda: Aprenda, radar: Radar }[atual];

  return (
    <div className="app">
      <header className="mtop">
        <button type="button" className="mtop-menu" aria-label="Abrir menu" aria-expanded={menu} aria-controls="menu-lateral" onClick={() => setMenu(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          {(nPend > 0 || nRadar > 0) && <span className="mtop-dot" aria-hidden="true" />}
        </button>
        <b className="mtop-t">{views.find(v => v[0] === atual)?.[1]}</b>
        <img className="mtop-logo" src="/agemax-branca.png" alt="Agemax" />
      </header>
      {menu && <button type="button" className="side-fundo" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
      <aside className={"side" + (menu ? " aberto" : "")} id="menu-lateral">
        <div className="side-head">
          <img className="logo" src="/agemax-branca.png" alt="Agemax" />
          <button type="button" className="side-x" aria-label="Fechar menu" onClick={() => setMenu(false)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="nav" aria-label="Seções">
          {(ehDono ? GRUPOS_DONO : GRUPOS_FUNC).map(([g, itens]) => (
            <div className="nav-g" key={g}>
              <span className="nav-gt">{g}</span>
              {itens.map(([k, l]) => (
                <button type="button" key={k} id={`nav-${k}`} aria-current={atual === k ? "page" : undefined} onClick={() => ir(k)}>
                  <Icone k={k} /><span className="nav-l">{l}</span>
                  {(k === "producao" || k === "minhas") && nPend > 0 && <span className="badge">{nPend}</span>}
                  {k === "aprenda" && nVistas === 0 && <span className="badge novo">NOVO</span>}
                  {k === "radar" && (nRadar > 0 ? <span className="badge novo">{nRadar}</span> : <span className="beta">beta</span>)}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="who">
          <span className="who-av" aria-hidden="true">{me.nome.slice(0, 1).toUpperCase()}</span>
          <span className="who-t">Conectado como<b>{me.nome} · {ehDono ? "Dono" : (me.funcao || "Funcionário")}</b></span>
          <button type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </aside>
      <main className="main view" key={atual}>
        <div className="top"><span className="today">hoje: {fmtw(hojeSP())}</span></div>
        <Pagina d={dados} />
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <BoasVindas aberto={bv} d={dados} fechar={() => setBv(false)} />
    </div>
  );
}
