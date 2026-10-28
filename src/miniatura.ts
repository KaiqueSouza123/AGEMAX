// Miniaturas leves das artes (≈30–80 KB). O original pesado vai para o Drive pelo robô
// e sai do sistema na virada do mês; a miniatura fica para sempre (galeria e cronograma).
import { supabase } from "./supabase";

const BUCKET = "entregas";
const LADO = 540; // maior lado da miniatura, em px

const ehVideo = (tipo: string | null | undefined, nome: string) => (tipo || "").startsWith("video") || /\.(mp4|mov|m4v|webm)$/i.test(nome);

function desenhar(src: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  const k = Math.min(1, LADO / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d");
  if (!g) return Promise.resolve(null);
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(b => {
    // navegador sem WebP (Safari antigo) devolve PNG: refaz em JPEG, que é leve
    if (b && b.type === "image/webp") ok(b); else c.toBlob(j => ok(j), "image/jpeg", 0.78);
  }, "image/webp", 0.74));
}

function quadroDoVideo(url: string): Promise<Blob | null> {
  return new Promise(ok => {
    const v = document.createElement("video");
    let feito = false;
    const fim = (b: Blob | null) => { if (feito) return; feito = true; v.removeAttribute("src"); v.load(); ok(b); };
    const t = setTimeout(() => fim(null), 20000);
    v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "auto";
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(1, (v.duration || 2) / 3); } catch { fim(null); } };
    v.onseeked = async () => { clearTimeout(t); try { fim(await desenhar(v, v.videoWidth, v.videoHeight)); } catch { fim(null); } };
    v.onerror = () => { clearTimeout(t); fim(null); };
    v.src = url;
  });
}

async function imagem(blob: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const r = await desenhar(bmp, bmp.width, bmp.height);
    bmp.close?.();
    return r;
  } catch {
    // alguns navegadores não abrem certos formatos com createImageBitmap: tenta com <img>
    const url = URL.createObjectURL(blob);
    try {
      const el = new Image(); el.src = url; await el.decode();
      return await desenhar(el, el.naturalWidth, el.naturalHeight);
    } catch { return null; } finally { URL.revokeObjectURL(url); }
  }
}

/** faz a miniatura de um arquivo local (na hora da entrega) */
export async function miniDeArquivo(f: File): Promise<Blob | null> {
  if (ehVideo(f.type, f.name)) {
    const u = URL.createObjectURL(f);
    try { return await quadroDoVideo(u); } finally { URL.revokeObjectURL(u); }
  }
  return f.type.startsWith("image") ? imagem(f) : null;
}

/** sobe a miniatura e devolve o caminho no armazenamento (ou null se não deu) */
export async function subirMini(pasta: number | string, mini: Blob | null): Promise<string | null> {
  if (!mini) return null;
  const caminho = `${pasta}/mini/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${mini.type === "image/webp" ? "webp" : "jpg"}`;
  const r = await supabase.storage.from(BUCKET).upload(caminho, mini, { contentType: mini.type, upsert: false });
  return r.error ? null : caminho;
}

export async function miniDoUpload(pasta: number | string, f: File): Promise<string | null> {
  try { return await subirMini(pasta, await miniDeArquivo(f)); } catch { return null; }
}

/** dono: cria as miniaturas dos arquivos que já estavam no sistema antes (roda em segundo plano) */
let rodando = false;
export async function gerarMiniaturasQueFaltam(): Promise<number> {
  if (rodando) return 0;
  rodando = true;
  let n = 0;
  try {
    const r = await supabase.from("entrega_arquivos").select("id,item_id,caminho,nome,tipo").is("miniatura", null).is("removido_em", null).limit(300);
    if (r.error) return 0; // banco ainda sem a coluna
    for (const a of (r.data || []) as any[]) {
      let caminho: string | null = null;
      try {
        const s = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 900);
        const u = s.data?.signedUrl;
        if (u) {
          let mini: Blob | null = null;
          if (ehVideo(a.tipo, a.nome)) mini = await quadroDoVideo(u);
          else { const res = await fetch(u); if (res.ok) mini = await imagem(await res.blob()); }
          caminho = await subirMini(a.item_id, mini);
        }
      } catch { caminho = null; }
      // "" = tentou e não deu (formato que o navegador não abre): não tenta de novo
      await supabase.from("entrega_arquivos").update({ miniatura: caminho || "" }).eq("id", a.id);
      if (caminho) n++;
    }
  } finally { rodando = false; }
  return n;
}

/** links assinados das miniaturas (cache de 50 min) */
const cache = new Map<string, { url: string; ate: number }>();
export async function urlsMini(caminhos: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(), faltam: string[] = [];
  const agora = Date.now();
  for (const c of new Set(caminhos.filter(Boolean))) { const x = cache.get(c); if (x && x.ate > agora) out.set(c, x.url); else faltam.push(c); }
  for (let k = 0; k < faltam.length; k += 200) {
    const lote = faltam.slice(k, k + 200);
    const s = await supabase.storage.from(BUCKET).createSignedUrls(lote, 3600);
    for (const x of (s.data || []) as any[]) if (x.signedUrl && x.path) { out.set(x.path, x.signedUrl); cache.set(x.path, { url: x.signedUrl, ate: agora + 50 * 60_000 }); }
  }
  return out;
}
