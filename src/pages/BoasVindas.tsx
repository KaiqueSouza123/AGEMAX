import type { Dados } from "../App";
import { Modal } from "../ui";
import { marcarBoasVindas } from "../aprenda-progresso";

export default function BoasVindas({ aberto, d, fechar }: { aberto: boolean; d: Dados; fechar: () => void }) {
  const sair = () => { marcarBoasVindas(d.me.id); fechar(); };
  const itens = d.ehDono
    ? [["tg0", "Painel", "mostra quem está entregando e o que está atrasado."], ["tg2", "Produção e Calendários", "é onde você lança e edita os posts da equipe."], ["tg3", "Aprovar", "é ver, baixar e aprovar o que a equipe entrega."]]
    : [["tg0", "Seu quadro", "mostra cada arte e em que etapa ela está."], ["tg2", "O prazo da arte", "é 3 dias úteis antes do post."], ["tg3", "Entregar", "é anexar a imagem ou o vídeo (ou colar o link)."]];
  return (
    <Modal open={aberto} onClose={sair}>
      <div className="bv">
        <div className="bv-marca" aria-hidden="true">AGEMAX</div>
        <div>
          <h2>Bem-vindo(a), {d.me.nome.split(" ")[0]}!</h2>
          <p className="muted">{d.ehDono ? "Aqui você acompanha e organiza toda a produção da Agemax." : "Aqui ficam as artes que estão com você, os prazos de cada uma e o lugar de entregar."}</p>
        </div>
        <ul>{itens.map(([tg, b, t]) => <li key={b}><span className={"bv-ic " + tg} aria-hidden="true" /><span><b>{b}</b> {t}</span></li>)}</ul>
        <div className="bv-acts">
          <button type="button" className="btn gold" onClick={() => { sair(); d.ir("aprenda"); }}>Fazer o tour de 5 minutos</button>
          <button type="button" className="linkbtn" onClick={sair}>Pular, vou explorar sozinho</button>
        </div>
        <p className="muted bv-nota">Dá pra rever tudo depois na aba <b>Aprenda</b>, no menu.</p>
      </div>
    </Modal>
  );
}
