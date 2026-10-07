import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import type { Dados } from "../App";
import { Cliente } from "../regras";
import { Head, Modal, useBusy } from "../ui";

export default function Clientes({ d }: { d: Dados }) {
  const [ed, setEd] = useState<Partial<Cliente> | null>(null);
  const [aberto, setAberto] = useState(false);
  const abrir = (c: Partial<Cliente> | null) => { setEd(c); setAberto(true); };
  const ativos = d.clientes.filter(c => c.ativo);
  return (
    <>
      <Head eb="base de clientes" t={`${ativos.length} clientes`} sub="A mesma base que o squad usa para planejar."
        right={<button type="button" className="btn gold" onClick={() => abrir({ ativo: true })}>+ Novo cliente</button>} />
      <div className="cards">
        {d.clientes.map(c => (
          <article className="ccard" key={c.id} style={c.ativo ? undefined : { opacity: .55 }}>
            <div className="lg">{c.logo ? <img src={c.logo} alt={"Logo " + c.nome} /> : <span>{c.nome.split(" ").slice(0, 2).join(" ")}</span>}</div>
            <h3>{c.nome}</h3>
            <dl className="kv">
              <dt>Responsável</dt><dd>{d.pessoa(c.responsavel_id)?.nome || <b style={{ color: "var(--warn)" }}>sem responsável</b>}</dd>
              <dt>Nicho</dt><dd>{c.nicho || "—"}</dd><dt>Cidade</dt><dd>{c.cidade || "a confirmar"}</dd><dt>Instagram</dt><dd>{c.instagram || "—"}</dd>
            </dl>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {!c.logo && <span className="chip c-warn">SEM LOGO</span>}{!c.cidade && <span className="chip c-mute">SEM CIDADE</span>}
              {c.regra && <span className="chip c-info" title={c.regra}>REGRA ESPECIAL</span>}{!c.ativo && <span className="chip c-mute">INATIVO</span>}
            </div>
            <button type="button" className="btn sm" onClick={() => abrir(c)}>Editar</button>
          </article>
        ))}
      </div>
      <Modal open={aberto} onClose={() => setAberto(false)}>
        <ClienteForm key={ed?.id || "novo"} d={d} c={ed} fechar={() => setAberto(false)} />
      </Modal>
    </>
  );
}

// Reduz a imagem para no máximo 800px (mantendo a transparência do PNG) antes de enviar
async function prepararLogo(arq: File): Promise<Blob> {
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
    const esc = Math.min(1, 800 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok, erro) => cv.toBlob(b => b ? ok(b) : erro(new Error("Não consegui ler a imagem.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

function ClienteForm({ d, c, fechar }: { d: Dados; c: Partial<Cliente> | null; fechar: () => void }) {
  const [f, setF] = useState<Partial<Cliente>>(c || {});
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(c?.logo || null);
  const [tirarLogo, setTirarLogo] = useState(false);
  const { busy, err, setErr, run } = useBusy();
  const set = (k: keyof Cliente, v: any) => setF(x => ({ ...x, [k]: v }));

  const escolher = (arq: File | undefined) => {
    setErr(null);
    if (!arq) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(arq.type)) { setErr("Envie a logo em PNG, JPG ou WEBP. PNG com fundo transparente fica melhor."); return; }
    if (arq.size > 5 * 1024 * 1024) { setErr("A imagem passa de 5 MB. Exporte numa resolução menor."); return; }
    setArquivo(arq); setTirarLogo(false); setPrevia(URL.createObjectURL(arq));
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const dados: any = { nome: f.nome, instagram: f.instagram || null, nicho: f.nicho || null, segmento: f.segmento || null, cidade: f.cidade || null, regra: f.regra || null, responsavel_id: f.responsavel_id || null, ativo: f.ativo !== false };
    if (tirarLogo) dados.logo = null;
    const ok = await run(async () => {
      const r = c?.id
        ? await supabase.from("clientes").update(dados).eq("id", c.id).select("id").single()
        : await supabase.from("clientes").insert(dados).select("id").single();
      if (r.error || !arquivo) return r;
      const id = (r.data as any).id;
      const caminho = `${id}-${Date.now()}.png`;
      const up = await supabase.storage.from("logos").upload(caminho, await prepararLogo(arquivo), { contentType: "image/png", upsert: true });
      if (up.error) return up;
      const pub = supabase.storage.from("logos").getPublicUrl(caminho).data.publicUrl;
      return await supabase.from("clientes").update({ logo: pub }).eq("id", id);
    });
    if (ok) { fechar(); d.aviso(arquivo ? "Cliente e logo salvos" : "Cliente salvo"); d.recarregar(); }
  };
  return (
    <form className="form" onSubmit={salvar}>
      <h2>{c?.id ? "Editar cliente" : "Novo cliente"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 14, alignItems: "center" }}>
        <div className="ccard" style={{ padding: 0, border: 0 }}>
          <div className="lg">{previa && !tirarLogo ? <img src={previa} alt="Prévia da logo" /> : <span style={{ fontSize: 13 }}>sem logo</span>}</div>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="cl-logo" style={{ margin: 0 }}>Logo (PNG com fundo transparente)
            <input id="cl-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => escolher(e.target.files?.[0])} />
          </label>
          {(previa && !tirarLogo) && <button type="button" className="btn sm danger" style={{ justifySelf: "start" }} onClick={() => { setTirarLogo(true); setArquivo(null); }}>Remover logo</button>}
        </div>
      </div>
      <label htmlFor="cl-nome">Nome<input id="cl-nome" required value={f.nome || ""} onChange={e => set("nome", e.target.value)} /></label>
      <div className="row2">
        <label htmlFor="cl-resp">Responsável<select id="cl-resp" value={f.responsavel_id || ""} onChange={e => set("responsavel_id", e.target.value)}>
          <option value="">Sem responsável</option>{d.pessoas.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select></label>
        <label htmlFor="cl-ig">Instagram<input id="cl-ig" value={f.instagram || ""} onChange={e => set("instagram", e.target.value)} placeholder="@perfil" /></label>
      </div>
      <div className="row2">
        <label htmlFor="cl-nicho">Nicho<input id="cl-nicho" value={f.nicho || ""} onChange={e => set("nicho", e.target.value)} /></label>
        <label htmlFor="cl-cid">Cidade<input id="cl-cid" value={f.cidade || ""} onChange={e => set("cidade", e.target.value)} /></label>
      </div>
      <label htmlFor="cl-regra">Regra especial<input id="cl-regra" value={f.regra || ""} onChange={e => set("regra", e.target.value)} placeholder="Ex.: evitar conteúdo político" /></label>
      <label htmlFor="cl-ativo" style={{ display: "flex", gap: 8, alignItems: "center" }}><input id="cl-ativo" type="checkbox" checked={f.ativo !== false} onChange={e => set("ativo", e.target.checked)} /> Cliente ativo</label>
      {err && <div className="err">{err}</div>}
      <div className="acts"><button type="button" className="btn" onClick={fechar}>Cancelar</button><button type="submit" className="btn pri" disabled={busy}>Salvar</button></div>
    </form>
  );
}
