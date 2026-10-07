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

const VIEWS_DONO = [["painel", "Painel"], ["producao", "Produção"], ["radar", "Radar da Semana"], ["calendarios", "Calendários"], ["clientes", "Clientes"], ["equipe", "Equipe"], ["whatsapp", "WhatsApp"], ["aprenda", "Aprenda"]];
const VIEWS_FUNC = [["minhas", "Minhas demandas"], ["radar", "Radar da Semana"], ["calendarios", "Calendários"], ["desempenho", "Meu desempenho"], ["whatsapp", "Meus avisos"], ["aprenda", "Aprenda"]];

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
  const ir = (v: string) => { setView(v); history.replaceState(null, "", "#" + v); window.scrollTo(0, 0); };

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
      <aside className="side">
        <img className="logo" src="/agemax-branca.png" alt="Agemax" />
        <nav className="nav" aria-label="Seções">
          {views.map(([k, l]) => (
            <button type="button" key={k} id={`nav-${k}`} aria-current={atual === k ? "page" : undefined} onClick={() => ir(k)}>
              {l}{(k === "producao" || k === "minhas") && nPend > 0 && <span className="badge">{nPend}</span>}
              {k === "aprenda" && nVistas === 0 && <span className="badge novo">NOVO</span>}
              {k === "radar" && (nRadar > 0 ? <span className="badge novo">{nRadar}</span> : <span className="beta">beta</span>)}
            </button>
          ))}
        </nav>
        <div className="who">
          <span>Conectado como<b>{me.nome} · {ehDono ? "Dono" : (me.funcao || "Funcionário")}</b></span>
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
