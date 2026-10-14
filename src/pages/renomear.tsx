import { FormEvent, useState } from "react";
import { useBusy } from "../ui";

// Formulário simples para o funcionário trocar só o nome (do post ou do cliente)
export function Renomear({ titulo, rotulo, atual, salvar, fechar }: { titulo: string; rotulo: string; atual: string; salvar: (novo: string) => Promise<{ error: any }>; fechar: () => void }) {
  const [v, setV] = useState(atual);
  const { busy, err, run } = useBusy();
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const novo = v.trim();
    if (!novo || novo === atual) { fechar(); return; }
    const ok = await run(() => salvar(novo));
    if (ok) fechar();
  };
  return (
    <form className="form" onSubmit={enviar}>
      <h2>{titulo}</h2>
      <label htmlFor="ren-nome">{rotulo}<input id="ren-nome" required autoFocus value={v} onChange={e => setV(e.target.value)} /></label>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Você pode trocar só o nome. Data, responsável e briefing continuam com o dono.</p>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" className="btn pri" disabled={busy}>Salvar</button></div>
    </form>
  );
}
