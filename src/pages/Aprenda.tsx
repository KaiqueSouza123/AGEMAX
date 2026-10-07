import type React from "react";
import { useEffect, useState } from "react";
import type { Dados } from "../App";
import { Head } from "../ui";
import { EVENTO_APRENDA, licoesVistas, marcarLicao } from "../aprenda-progresso";

/* ---------- mini-telas usadas nas lições ---------- */
const MCard = ({ tag = "Adricom", tg = "tg0", titulo, prazo, pc = "", botao, pri, foco, extra }: { tag?: string; tg?: string; titulo: string; prazo?: string; pc?: string; botao?: string; pri?: boolean; foco?: boolean; extra?: React.ReactNode }) => (
  <div className="mv-card">
    <div className="mv-row"><span className={"ktag " + tg}>{tag}</span>{prazo && <span className={"kprazo " + pc}>{prazo}</span>}</div>
    <b>{titulo}</b>
    {extra}
    {botao && <span className={"mv-btn" + (pri ? " pri" : "") + (foco ? " foco" : "")}>{botao}</span>}
  </div>
);
const MLink = () => (
  <div className="mv-stack">
    <span className="mv-mute">No Drive ou no Canva: Compartilhar › Copiar link</span>
    <span className="mv-input">https://drive.google.com/…</span>
    <span className="ktag tg0" style={{ alignSelf: "flex-start" }}>Link copiado</span>
  </div>
);
const MArquivos = () => (
  <div className="mv-stack" style={{ justifyItems: "stretch" }}>
    <span className="mv-drop">Arraste ou escolha o arquivo</span>
    <div className="mv-thumbs"><span className="t1">PNG ✓</span><span className="t2">MP4 ✓</span><span className="t3">ou link</span></div>
  </div>
);
const MVer = () => (
  <div className="mv-card">
    <div className="mv-thumbs"><span className="t1" style={{ height: 54 }}>prévia</span><span className="t2" style={{ height: 54 }}>▶ vídeo</span></div>
    <div className="mv-row"><span className="mv-mute">2 arquivos</span><span className="mv-btn foco">Baixar os 2</span></div>
  </div>
);
const MEntrega = () => (
  <div className="mv-card">
    <b>Entregar arte</b>
    <span className="mv-input foco">https://drive.google.com/…</span>
    <span className="mv-btn pri">Entregar</span>
  </div>
);
const MCols = ({ foco }: { foco?: number }) => (
  <div className="mv-cols">
    {[["A fazer", "var(--mute)", 4], ["Em produção", "var(--teal)", 1], ["Aguardando", "var(--ok)", 1], ["Ajustes", "var(--bad)", 1]].map(([n, c, q], k) => (
      <div key={k} className={"mv-col" + (foco === k ? " foco" : "")}><span><i style={{ background: c as string }} />{n}</span>{Array.from({ length: q as number }).map((_, j) => <em key={j} />)}</div>
    ))}
  </div>
);
const MChips = () => (
  <div className="mv-stack">
    <span className="kprazo">arte até ter 13/10</span>
    <span className="kprazo pz-gold">arte até qui 08/10</span>
    <span className="kprazo pz-warn">arte até AMANHÃ</span>
    <span className="kprazo pz-warn">arte HOJE</span>
    <span className="kprazo pz-bad">atrasada · era 06/10</span>
  </div>
);
const MNav = ({ itens, ativo, badge }: { itens: string[]; ativo: number; badge?: number }) => (
  <div className="mv-nav">{itens.map((t, k) => <span key={k} className={k === ativo ? "on" : ""}>{t}{badge === k && <i>3</i>}</span>)}</div>
);
const MCal = () => (
  <div className="mv-cal">
    {Array.from({ length: 14 }).map((_, k) => (
      <span key={k} className={k === 9 ? "alvo" : ""}>{k === 2 && <em>post</em>}{k === 9 && <em className="drag">post</em>}</span>
    ))}
  </div>
);
const MBotoes = ({ itens, foco }: { itens: string[]; foco: number }) => (
  <div className="mv-card"><b>Dia do Professor</b><span className="mv-mute">entregue · aguardando você</span>
    <div className="mv-row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>{itens.map((t, k) => <span key={k} className={"mv-btn" + (k === 0 ? " pri" : "") + (k === foco ? " foco" : "")}>{t}</span>)}</div>
  </div>
);
const MForm = ({ campos, foco }: { campos: string[]; foco: number }) => (
  <div className="mv-card">{campos.map((c, k) => <div key={k} className="mv-field"><span className="mv-mute">{c}</span><span className={"mv-input" + (k === foco ? " foco" : "")}>&nbsp;</span></div>)}</div>
);
const MKpis = () => (
  <div className="mv-kpis"><span><b>92%</b>pontualidade</span><span className="bad"><b>2</b>atrasadas</span><span><b>5</b>p/ aprovar</span></div>
);
const MMsg = () => (
  <div className="mv-msg">Bom dia, Douglas! Suas demandas de hoje:<br />🟠 <b>Adricom</b> · prazo é hoje<br />🟡 <b>Sand</b> · prazo qui 08/10</div>
);

const MIdeia = ({ usada, foco }: { usada?: boolean; foco?: boolean }) => (
  <div className="mv-card">
    <div className="mv-row"><span className="rd-fmt">REELS</span>{usada ? <span className="rd-ok">✓ NO POST DE 26/10</span> : <span className="beta">beta</span>}</div>
    <b>O notebook do Dia das Crianças</b>
    <span className="mv-mute">Gancho: “Antes de dar o notebook pro seu filho…”</span>
    {!usada && <span className={"mv-btn pri" + (foco ? " foco" : "")}>Usar no post de 26/10</span>}
  </div>
);

/* ---------- conteúdo ---------- */
type Passo = { v: React.ReactNode; t: React.ReactNode };
type Licao = { id: string; beta?: boolean; titulo: string; sub: string; min: number; intro: string; passos: Passo[]; dica?: React.ReactNode; praticar?: [string, string] };

const FUNC: Licao[] = [
  { id: "f1", titulo: "O que é a plataforma", sub: "Pra que serve e quem vê o quê", min: 1,
    intro: "É onde ficam todas as artes que estão com você, com o prazo de cada uma e o lugar de entregar. Substitui a planilha de produção.",
    passos: [
      { v: <MNav itens={["Minhas demandas", "Calendários", "Meu desempenho", "Meus avisos", "Aprenda"]} ativo={0} />, t: <>No menu ficam suas 5 áreas. Você vai passar quase todo o tempo em <b>Minhas demandas</b>.</> },
      { v: <MCard titulo="Assistência técnica" prazo="arte até ter 13/10" botao="Comecei" />, t: <>Cada post do calendário do cliente vira um <b>cartão</b> para você produzir.</> },
      { v: <MKpis />, t: <>Só <b>você e os donos</b> veem o seu quadro. Tudo atualiza sozinho, sem precisar recarregar a página.</> },
    ], praticar: ["minhas", "Abrir Minhas demandas"] },
  { id: "f2", titulo: "Seu quadro de demandas", sub: "As 4 colunas e o caminho da arte", min: 1,
    intro: "Cada arte anda da esquerda para a direita. Seu trabalho termina quando ela chega em Aguardando aprovação.",
    passos: [
      { v: <MCols foco={0} />, t: <><b>A fazer</b>: o que ainda não começou, com o prazo mais perto em cima.</> },
      { v: <MCols foco={1} />, t: <><b>Em produção</b>: o que você está fazendo agora.</> },
      { v: <MCols foco={2} />, t: <><b>Aguardando aprovação</b>: você entregou, agora é com o dono. Se ele pedir mudança, a arte vai para <b>Ajustes</b>.</> },
    ], dica: <>Clique no nome do post para ver o <b>briefing</b>. Com mais de um cliente, use os botões do topo para filtrar.</>, praticar: ["minhas", "Ver meu quadro"] },
  { id: "f3", titulo: "Como entregar uma arte", sub: "Arquivo ou link, e Entregar", min: 1,
    intro: "Agora dá para enviar o próprio arquivo, sem precisar de link. A entrega conta quando tem arquivo ou link.",
    passos: [
      { v: <MCard titulo="Assistência técnica" botao="Comecei" foco />, t: <>Abriu a arte para fazer? Clique em <b>Comecei</b>. Ela vai para Em produção.</> },
      { v: <MArquivos />, t: <>Terminou? Clique em <b>Entregar</b> e anexe a <b>imagem ou o vídeo</b> (até 50 MB cada) ou cole o <b>link</b> do Drive/Canva. Pode usar os dois. No celular, escolha da galeria ou da câmera.</> },
      { v: <MEntrega />, t: <>Espere o envio terminar e clique em <b>Entregar</b>. A arte vai para Aguardando aprovação e o dono baixa direto da plataforma.</> },
    ], dica: <>Vídeo com mais de 50 MB? Envie pelo <b>link do Drive</b>. Terminou sem ter clicado em Comecei? Use <b>já terminei</b> no cartão.</>, praticar: ["minhas", "Entregar uma arte"] },
  { id: "f4", titulo: "Prazos e cores", sub: "Dourado, HOJE e atrasada", min: 1,
    intro: "O prazo que importa para você é o da arte, não o dia do post.",
    passos: [
      { v: <MCard titulo="SSD: o upgrade" prazo="arte até qua 14/10" extra={<span className="mv-mute">post seg 19/10</span>} />, t: <>O prazo da arte é <b>3 dias úteis antes do post</b>. Sábado, domingo e feriado não contam.</> },
      { v: <MChips />, t: <>Cinza: tranquilo. <b>Dourado</b>: está chegando. <b>AMANHÃ</b> e <b>HOJE</b>: prioridade. <b>Vermelho</b>: atrasou.</> },
      { v: <MCard titulo="Dia do Professor" prazo="atrasada · era 06/10" pc="pz-bad" botao="Entregar" pri />, t: <>Atrasou? Entregue mesmo assim e avise o dono. A pontualidade do mês conta quantas saíram no prazo.</> },
    ] },
  { id: "f5", titulo: "Quando pedem ajuste", sub: "Refazer e reenviar", min: 1,
    intro: "Se o dono pedir mudança, a arte volta para você na coluna Ajustes pedidos.",
    passos: [
      { v: <MCols foco={3} />, t: <>A arte aparece em <b>Ajustes pedidos</b>, com o prazo para refazer.</> },
      { v: <MArquivos />, t: <>Faça a mudança e anexe o <b>arquivo novo</b> (ou o link). Os arquivos anteriores aparecem na lista e você pode remover os que não valem mais.</> },
      { v: <MCard tag="Sand" tg="tg3" titulo="Reboco sem trinca" prazo="refazer até sex 16/10" pc="pz-gold" botao="Reenviar" pri foco />, t: <>Clique em <b>Reenviar</b>. Ela volta para Aguardando aprovação.</> },
    ] },
  { id: "f6", titulo: "Calendários e desempenho", sub: "Seus clientes e sua pontualidade", min: 1,
    intro: "Além do quadro, você tem três telas de apoio.",
    passos: [
      { v: <MCal />, t: <><b>Calendários</b>: o mês de cada cliente seu, no mesmo formato que o cliente recebe.</> },
      { v: <MKpis />, t: <><b>Meu desempenho</b>: quantas artes você entregou no prazo no mês.</> },
      { v: <MMsg />, t: <><b>Meus avisos</b>: o resumo do dia, igual ao que chega no WhatsApp.</> },
    ], praticar: ["calendarios", "Abrir Calendários"] },
  { id: "f7", beta: true, titulo: "Radar da Semana", sub: "Ideias de posts para seus clientes", min: 1,
    intro: "Toda semana o dono publica ideias de posts pensadas para cada cliente seu. Esta parte está em fase beta: pode mudar e as ideias podem ter erros.",
    passos: [
      { v: <MNav itens={["Minhas demandas", "Radar da Semana  beta", "Calendários"]} ativo={1} badge={1} />, t: <>O número no menu mostra quantas <b>ideias novas</b> chegaram para você.</> },
      { v: <MIdeia foco />, t: <>Cada ideia traz o formato, por que funciona e um gancho. Clique em <b>Usar no post</b> e ela vira o tema do post “Trend da semana”, com o briefing junto.</> },
      { v: <MIdeia usada />, t: <>Não serviu? Use <b>Guardar</b> para depois ou <b>Não serve</b>. O post com a ideia aparece no seu quadro com o prazo de sempre.</> },
    ], dica: <>Por ser <b>beta</b>, as ideias são geradas por IA: confira datas e fatos antes de produzir e avise o dono se algo estiver estranho.</>, praticar: ["radar", "Abrir o Radar"] },
];

const DONO: Licao[] = [
  { id: "d1", titulo: "Visão geral do dono", sub: "Painel e o número vermelho", min: 1,
    intro: "O dono vê a produção inteira: todos os clientes, todos os funcionários e todos os prazos.",
    passos: [
      { v: <MKpis />, t: <>O <b>Painel</b> mostra a pontualidade do mês, o que está atrasado e o que espera sua aprovação.</> },
      { v: <MNav itens={["Painel", "Produção", "Calendários", "Clientes", "Equipe", "WhatsApp"]} ativo={1} badge={1} />, t: <>O <b>número vermelho</b> no menu conta as artes atrasadas ou entregues sem link.</> },
      { v: <MCols />, t: <>Cada funcionário vê só o quadro dele. Tudo que você muda aparece na hora para quem produz.</> },
    ], praticar: ["painel", "Abrir o Painel"] },
  { id: "d2", titulo: "Lançar os posts do mês", sub: "Novo post e responsável", min: 1,
    intro: "Os posts do calendário do cliente viram tarefas da equipe.",
    passos: [
      { v: <MForm campos={["Cliente", "Tema do post", "Data do post", "Responsável"]} foco={0} />, t: <>Em <b>Produção</b>, clique em <b>+ Novo post</b>. Ao escolher o cliente, o responsável dele já vem preenchido.</> },
      { v: <MCal />, t: <>Ou em <b>Calendários › Editar</b>, clique em <b>+ post</b> no dia certo.</> },
      { v: <MCard titulo="Assistência técnica" prazo="arte até ter 13/10" />, t: <>O <b>prazo da arte</b> é calculado sozinho: 3 dias úteis antes do post, pulando feriados.</> },
    ], praticar: ["producao", "Abrir Produção"] },
  { id: "d3", titulo: "Aprovar ou pedir ajuste", sub: "O que fazer com cada entrega", min: 1,
    intro: "Quando alguém entrega, a arte aparece no topo da Produção, em Aguardando sua aprovação.",
    passos: [
      { v: <MVer />, t: <>Clique na entrega para ver a <b>prévia</b> da imagem e do vídeo. Use <b>Baixar</b> em cada arquivo ou <b>Baixar os 2</b>. Se veio link, ele aparece embaixo.</> },
      { v: <MBotoes itens={["Aprovar", "Pedir ajuste"]} foco={0} />, t: <>Tudo certo? Clique em <b>Aprovar</b>. Depois de publicar no Instagram, marque <b>Postado</b>.</> },
      { v: <MBotoes itens={["Aprovar", "Pedir ajuste"]} foco={1} />, t: <>Precisa mudar algo? <b>Pedir ajuste</b> devolve a arte para a coluna Ajustes de quem fez. Combine o que mudar pelo WhatsApp.</> },
    ], dica: <>Para não lotar o espaço, os arquivos de posts já aprovados são apagados sozinhos no fim do mês (os de mais de 30 dias) ou quando o espaço está perto do limite, começando pelos mais antigos. O registro da entrega continua. Baixe o que quiser guardar.</>, praticar: ["producao", "Ver entregas"] },
  { id: "d4", titulo: "Editar o calendário", sub: "Mudar, mover e criar posts", min: 1,
    intro: "O calendário do site é o mesmo que a equipe vê. Editou, eles veem na hora.",
    passos: [
      { v: <MCal />, t: <>Em <b>Calendários</b>, escolha o cliente e clique em <b>Editar</b>.</> },
      { v: <MCard titulo="Dia do Professor" prazo="post qua 14/10" extra={<span className="mv-mute">Douglas</span>} />, t: <>Clique num post para mudar tema, data, responsável ou briefing, ou excluir.</> },
      { v: <MCal />, t: <>No computador, <b>arraste</b> o post para outro dia. O prazo da arte se ajusta sozinho.</> },
    ], dica: <>Os PNGs enviados ao cliente não mudam sozinhos. Mudou bastante? Gere o calendário de novo.</>, praticar: ["calendarios", "Abrir Calendários"] },
  { id: "d5", titulo: "Clientes e equipe", sub: "Cadastros, logos e acessos", min: 1,
    intro: "A base de clientes e a equipe ficam aqui, e são as mesmas que o squad usa.",
    passos: [
      { v: <MForm campos={["Nome", "E-mail", "Função"]} foco={1} />, t: <>Em <b>Equipe</b>, cadastre a pessoa com o e-mail dela. Depois ela entra no site em <b>Primeiro acesso</b> e cria a senha.</> },
      { v: <MForm campos={["Logo (PNG)", "Responsável", "Cidade"]} foco={1} />, t: <>Em <b>Clientes › Editar</b>, troque o responsável: os posts ainda não entregues vão junto para a pessoa nova.</> },
      { v: <MForm campos={["Logo (PNG)", "Responsável", "Cidade"]} foco={0} />, t: <>Suba a <b>logo em PNG</b> com fundo transparente. Ela aparece no calendário do cliente.</> },
    ], praticar: ["equipe", "Abrir Equipe"] },
  { id: "d6", titulo: "Cobranças pelo WhatsApp", sub: "Mensagens prontas", min: 1,
    intro: "A plataforma escreve as cobranças por você.",
    passos: [
      { v: <MMsg />, t: <>Na aba <b>WhatsApp</b>, cada funcionário tem a mensagem do dia com o que está atrasado ou vencendo.</> },
      { v: <MKpis />, t: <>Também tem um resumo da equipe para os donos.</> },
      { v: <MNav itens={["Copiar", "Abrir WhatsApp"]} ativo={0} />, t: <>Por enquanto você copia e manda. O envio automático vem na próxima etapa.</> },
    ], praticar: ["whatsapp", "Abrir WhatsApp"] },
  { id: "d7", beta: true, titulo: "Radar da Semana", sub: "Gerar, revisar e publicar ideias", min: 1,
    intro: "O radar entrega ideias de posts por cliente para quem produz. Está em fase beta: use, revise com atenção e conte o que funcionou.",
    passos: [
      { v: <MMsg />, t: <>Toda semana, peça ao Claude <b>“faz o radar da semana”</b>. Ele pesquisa datas e trends, cria ideias por cliente e coloca aqui como <b>rascunho</b>.</> },
      { v: <MForm campos={["Formato", "Ideia", "Por que funciona", "Gancho"]} foco={1} />, t: <>Em <b>Radar da Semana</b>, revise cliente por cliente: edite, remova ou adicione ideias suas.</> },
      { v: <MBotoes itens={["Publicar para a equipe", "Voltar para rascunho"]} foco={0} />, t: <>Clique em <b>Publicar</b>. Cada funcionário vê só as dos clientes dele e você acompanha quem viu e quem usou.</> },
    ], dica: <>Fase <b>beta</b>: as ideias são geradas por IA a partir da internet. Confira datas e fatos antes de publicar.</>, praticar: ["radar", "Abrir o Radar"] },
];

const FAQ_FUNC = [
  ["Qual é o meu prazo?", "O prazo da arte é 3 dias úteis antes do post ir ao ar. Fim de semana e feriado não contam."],
  ["Enviei o arquivo errado. E agora?", "Antes de entregar, é só remover na lista. Depois de entregue, peça ao dono para devolver em ajuste e reenvie o certo."],
  ["Meu vídeo não sobe.", "O limite é 50 MB por arquivo. Para vídeos maiores, salve no Drive e entregue pelo link."],
  ["Não aparece nenhuma arte para mim.", "Os posts do mês ainda não foram lançados ou o cliente não está com você. Fale com o dono."],
  ["Quem vê as minhas entregas?", "Você e os donos da Agemax. Os outros funcionários não veem o seu quadro."],
];
const FAQ_DONO = [
  ["O funcionário não vê os posts.", "Confira se os posts estão no nome dele (Produção ou Calendários › Editar). Trocar o responsável do cliente leva junto os posts em aberto."],
  ["Como dar acesso a alguém novo?", "Cadastre o e-mail em Equipe. A pessoa entra no site, clica em Primeiro acesso e cria a senha."],
  ["Posso apagar um post?", "Sim: Calendários › Editar ou Produção › Editar, e depois Excluir."],
  ["Os arquivos ficam guardados para sempre?", "Não. Arquivos de posts aprovados são apagados sozinhos no fim do mês (os de mais de 30 dias) ou quando o espaço está perto do limite. Baixe o que quiser guardar."],
  ["Por que a pontualidade mudou?", "Ela conta as artes do mês entregues até o prazo. Atrasadas e sem link baixam o número."],
];

export default function Aprenda({ d }: { d: Dados }) {
  const licoes = d.ehDono ? DONO : FUNC;
  const faq = d.ehDono ? FAQ_DONO : FAQ_FUNC;
  const [vistas, setVistas] = useState<string[]>(() => licoesVistas(d.me.id));
  useEffect(() => {
    const at = () => setVistas(licoesVistas(d.me.id));
    window.addEventListener(EVENTO_APRENDA, at); return () => window.removeEventListener(EVENTO_APRENDA, at);
  }, [d.me.id]);
  const [idx, setIdx] = useState(() => { const k = licoes.findIndex(l => !licoesVistas(d.me.id).includes(l.id)); return k < 0 ? 0 : k; });
  const l = licoes[idx];
  const feitas = licoes.filter(x => vistas.includes(x.id)).length;

  const proxima = () => {
    marcarLicao(d.me.id, l.id);
    if (idx < licoes.length - 1) { setIdx(idx + 1); window.scrollTo(0, 0); } else d.aviso("Pronto! Você viu todas as lições.");
  };

  return (
    <>
      <Head eb="aprenda" t={d.ehDono ? "Como usar como dono" : "Como funciona a plataforma"}
        sub={`${licoes.length} lições curtas, uns ${licoes.reduce((s, x) => s + x.min, 0)} minutos no total. Volte aqui sempre que tiver dúvida.`}
        right={<div className="ap-prog"><div><span>Seu progresso</span><b>{feitas} de {licoes.length}</b></div><div className="kbar"><div style={{ width: Math.round(feitas / licoes.length * 100) + "%" }} /></div></div>} />

      <div className="ap">
        <ol className="ap-lista" aria-label="Lições">
          {licoes.map((x, k) => {
            const ok = vistas.includes(x.id);
            return (
              <li key={x.id}>
                <button type="button" aria-current={k === idx ? "step" : undefined} className={ok ? "ok" : ""} onClick={() => setIdx(k)}>
                  <span className="ap-num" aria-hidden="true">{ok ? "✓" : k + 1}</span>
                  <span><b>{x.titulo}{x.beta && <> <span className="beta">beta</span></>}</b><small>{x.sub}</small></span>
                  {ok && <span className="sr-only">(vista)</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <article className="ap-licao" aria-labelledby="ap-t">
          <div>
            <div className="ap-eb">LIÇÃO {idx + 1} · {l.min} MINUTO{l.min > 1 ? "S" : ""}</div>
            <h2 id="ap-t">{l.titulo}{l.beta && <> <span className="beta grande">beta</span></>}</h2>
            <p>{l.intro}</p>
          </div>
          <div className="ap-passos">
            {l.passos.map((p, k) => (
              <div key={k} className="ap-passo">
                <div className="ap-vis" aria-hidden="true">{p.v}</div>
                <div className="ap-txt"><b>{k + 1}</b><span>{p.t}</span></div>
              </div>
            ))}
          </div>
          {l.dica && <div className="ap-dica"><b>Dica</b><span>{l.dica}</span></div>}
          <div className="ap-acts">
            {idx > 0 ? <button type="button" className="linkbtn" onClick={() => setIdx(idx - 1)}>‹ Lição {idx}: {licoes[idx - 1].titulo}</button> : <span />}
            <div>
              {l.praticar && <button type="button" className="btn" onClick={() => { marcarLicao(d.me.id, l.id); d.ir(l.praticar![0]); }}>{l.praticar[1]}</button>}
              <button type="button" className="btn gold" onClick={proxima}>{idx < licoes.length - 1 ? "Entendi, próxima lição" : "Concluir"}</button>
            </div>
          </div>
        </article>
      </div>

      <section className="ap-faq" aria-labelledby="ap-faq">
        <h2 id="ap-faq">Dúvidas comuns</h2>
        <div>{faq.map(([p, r]) => <details key={p}><summary>{p}</summary><p>{r}</p></details>)}</div>
      </section>
    </>
  );
}
