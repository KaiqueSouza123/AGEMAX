// Gera o "Cronograma de Conteúdos" em PDF no navegador, com os posts como estão agora no sistema.
// Mesmo visual do calendário que o squad gera (render_calendario.py).
import type { Cliente, Item, Pessoa } from "./regras";

const S = 2;
const W = 1600 * S, H = 900 * S;
const GX0 = 90 * S, GY0 = 158 * S, GX1 = 1207 * S;
const HEAD_H = 70 * S, ROW_H = 106 * S, COL_W = (GX1 - GX0) / 7;
const PRIM = "#267F87", DEST = "#E9A93A", CINZA = "#E4E4E8";
const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const PLURAL: Record<string, string> = { "Estático": "ESTÁTICOS", "Carrossel": "CARROSSÉIS", "Reels": "REELS", "Stories": "STORIES", "Vídeo": "VÍDEOS" };

type Bloco = { tipo: string; texto: string; estilo: "normal" | "data" | "prazo" | "reels" };
const VERDE = "#1F9D55"; // reels e vídeos: célula verde
const ehReels = (tipo: string) => /reels|v[ií]deo/i.test(tipo);

export const slug = (s: string) => s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/^-+|-+$/g, "");

// data comemorativa: pinta a célula na cor primária (igual ao calendário do squad)
const DATAS = /^(dia d[aoe]s?\b|dia internacional|dia mundial|dia nacional|feriad|natal|ano novo|r[eé]veillon|p[aá]scoa|carnaval|black friday|halloween|outubro rosa|novembro azul|setembro amarelo|consci[eê]ncia negra|finados|independ[eê]ncia|proclama|tiradentes|corpus|nossa senhora|aniversário d[ae] )/i;
const ehData = (i: Item) => DATAS.test(i.tema.trim()) || /^\s*\d{1,2}\/\d{1,2}\b/.test(i.briefing || "");

function carregar(src: string): Promise<HTMLImageElement | null> {
  return new Promise(ok => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

function quebrar(ctx: CanvasRenderingContext2D, txt: string, max: number): string[] {
  const out: string[] = [];
  for (const par of txt.split("\n")) {
    let linha = "";
    for (const w of par.split(/\s+/).filter(Boolean)) {
      const t = (linha + " " + w).trim();
      if (ctx.measureText(t).width <= max) linha = t; else { if (linha) out.push(linha); linha = w; }
    }
    if (linha) out.push(linha);
  }
  return out;
}

function bloco(ctx: CanvasRenderingContext2D, its: Bloco[], x0: number, y0: number, x1: number, y1: number) {
  const max = x1 - x0 - 22 * S;
  let linhas: [string, string, string, number][] = [];
  let total = 0;
  for (const [tsz, bsz] of [[15, 12], [14, 11], [13, 10], [12, 9], [11, 8]]) {
    const ft = `700 ${tsz * S}px Poppins, sans-serif`, fb = `400 ${bsz * S}px Poppins, sans-serif`;
    linhas = [];
    for (const it of its) {
      const forte = it.estilo !== "normal";
      const tc = forte ? "#FFFFFF" : PRIM, bc = forte ? "#FFFFFF" : "#282828";
      ctx.font = ft; for (const l of quebrar(ctx, it.tipo.toUpperCase(), max)) linhas.push([l, ft, tc, (tsz + 4) * S]);
      linhas.push(["", fb, bc, 2 * S]);
      ctx.font = fb; for (const l of quebrar(ctx, it.texto, max)) linhas.push([l, fb, bc, (bsz + 3) * S]);
      linhas.push(["", fb, bc, 6 * S]);
    }
    linhas.pop();
    total = linhas.reduce((s, l) => s + l[3], 0);
    if (total <= (y1 - y0) - 30 * S) break;
  }
  let y = y0 + 22 * S + ((y1 - y0 - 22 * S) - total) / 2;
  const cx = (x0 + x1) / 2;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const [l, f, c, h] of linhas) { if (l) { ctx.font = f; ctx.fillStyle = c; ctx.fillText(l, cx, y); } y += h; }
}

export async function cronogramaPDF(o: { cliente: Cliente; mes: string; itens: Item[]; responsavel?: Pessoa }) {
  const [ano, m] = o.mes.split("-").map(Number);
  await Promise.all([
    document.fonts.load(`700 40px Poppins`), document.fonts.load(`500 40px Poppins`), document.fonts.load(`400 40px Poppins`),
  ]).catch(() => {});

  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);

  // mês gigante na lateral (marca d'água)
  ctx.save();
  ctx.translate(1300 * S + 150 * S + 10 * S, 170 * S + 350 * S);
  ctx.rotate(Math.PI / 2);
  ctx.font = `${250 * S}px "DejaVu Serif", Georgia, "Times New Roman", serif`;
  ctx.fillStyle = "#C3DCDE"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(MESES[m - 1], 0, 0);
  ctx.restore();

  // logo do cliente (versão para fundo claro) ou o nome
  const c = o.cliente;
  const fontes = [c.logo && c.logo.startsWith("/logos/") ? `/logos-claro/${slug(c.nome)}.png` : null, c.logo].filter(Boolean) as string[];
  let logo: HTMLImageElement | null = null;
  for (const f of fontes) { logo = await carregar(f); if (logo) break; }
  if (logo) {
    const k = Math.min((170 * S) / logo.width, (130 * S) / logo.height);
    const lw = logo.width * k, lh = logo.height * k;
    ctx.drawImage(logo, 90 * S + (170 * S - lw) / 2, 14 * S + (130 * S - lh) / 2, lw, lh);
  } else {
    ctx.font = `700 ${18 * S}px Poppins, sans-serif`; ctx.fillStyle = PRIM; ctx.textAlign = "center"; ctx.textBaseline = "top";
    const ls = quebrar(ctx, c.nome.toUpperCase(), 185 * S).slice(0, 3);
    let y = 78 * S - ls.length * 13 * S;
    for (const l of ls) { ctx.fillText(l, 177 * S, y); y += 26 * S; }
  }

  // título e assinatura
  ctx.font = `700 ${52 * S}px Poppins, sans-serif`; ctx.fillStyle = DEST; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("CRONOGRAMA DE CONTEÚDOS", 712 * S, 88 * S);
  ctx.font = `500 ${22 * S}px Poppins, sans-serif`; ctx.fillStyle = "#141414"; ctx.textAlign = "left";
  ctx.fillText("AGEMAX MARKETING", 1328 * S, 60 * S);
  ctx.strokeStyle = "#78788C"; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.moveTo(1325 * S, 77 * S); ctx.lineTo(W, 77 * S); ctx.stroke();

  // cabeçalho da grade
  ctx.fillStyle = PRIM; ctx.fillRect(GX0, GY0, GX1 - GX0, HEAD_H);
  ctx.font = `700 ${26 * S}px Poppins, sans-serif`; ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  DIAS.forEach((n, k) => ctx.fillText(n, GX0 + COL_W * k + COL_W / 2, GY0 + HEAD_H / 2));

  // posts por dia
  const porDia = new Map<number, Bloco[]>();
  const ordenados = [...o.itens].sort((a, b) => a.data_post.localeCompare(b.data_post) || (a.tipo === "Prazo do cliente" ? 1 : -1));
  for (const i of ordenados) {
    const dia = Number(i.data_post.slice(8, 10));
    const prazo = i.tipo === "Prazo do cliente";
    const b: Bloco = { tipo: prazo ? "PRAZO DO CLIENTE" : i.tipo, texto: i.tema, estilo: prazo ? "prazo" : ehReels(i.tipo) ? "reels" : ehData(i) ? "data" : "normal" };
    porDia.set(dia, [...(porDia.get(dia) || []), b]);
  }

  const nd = new Date(ano, m, 0).getDate(), off = new Date(ano, m - 1, 1).getDay();
  for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) {
    const dia = r * 7 + k - off + 1, valido = dia >= 1 && dia <= nd;
    const x0 = GX0 + COL_W * k, y0 = GY0 + HEAD_H + ROW_H * r, x1 = x0 + COL_W, y1 = y0 + ROW_H;
    const its = valido ? porDia.get(dia) || [] : [];
    const est = new Set(its.map(x => x.estilo));
    const fill = !valido ? CINZA : est.has("prazo") ? DEST : est.has("reels") ? VERDE : est.has("data") ? PRIM : "#FFFFFF";
    ctx.fillStyle = fill; ctx.fillRect(x0, y0, COL_W, ROW_H);
    if (valido) {
      ctx.font = `400 ${17 * S}px Poppins, sans-serif`; ctx.fillStyle = fill === "#FFFFFF" ? "#1E1E1E" : "#FFFFFF";
      ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText(String(dia), x1 - 10 * S, y0 + 10 * S);
      if (its.length) bloco(ctx, its, x0, y0, x1, y1);
    }
  }
  const fundo = GY0 + HEAD_H + ROW_H * 6;
  ctx.strokeStyle = "#AAAAAF"; ctx.lineWidth = S;
  for (let k = 0; k <= 7; k++) { const x = GX0 + COL_W * k; ctx.beginPath(); ctx.moveTo(x, GY0 + HEAD_H); ctx.lineTo(x, fundo); ctx.stroke(); }
  for (let r = 0; r <= 6; r++) { const y = GY0 + HEAD_H + ROW_H * r; ctx.beginPath(); ctx.moveTo(GX0, y); ctx.lineTo(GX1, y); ctx.stroke(); }
  ctx.strokeStyle = "#3C3C3C"; ctx.strokeRect(GX0, GY0, GX1 - GX0, fundo - GY0);

  // rodapé: cliente | quantidades por tipo | Agemax | responsável
  const posts = o.itens.filter(i => i.tipo !== "Prazo do cliente");
  const cont = new Map<string, number>(); posts.forEach(i => cont.set(i.tipo, (cont.get(i.tipo) || 0) + 1));
  const qtd = [...cont].map(([t, n]) => `${n} ${n === 1 ? t.toUpperCase() : PLURAL[t] || t.toUpperCase()}`).join(" + ");
  const rod = [c.nome.toUpperCase(), qtd ? qtd + " MENSAIS" : "", "CALENDÁRIO AGEMAX", o.responsavel ? "DEADLINE DE " + o.responsavel.nome.trim().toUpperCase() : ""].filter(Boolean).join(" | ");
  ctx.font = `700 ${12 * S}px Poppins, sans-serif`; ctx.fillStyle = "#141414"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(rod, GX0, 879 * S);
  const ag = await carregar("/agemax-preta.png");
  if (ag) { const k = Math.min((190 * S) / ag.width, (44 * S) / ag.height); const w = ag.width * k, h = ag.height * k; ctx.drawImage(ag, 1403 * S - w / 2, 868 * S - h / 2, w, h); }

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [1152, 648], compress: true });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, 1152, 648);
  const nome = `Calendario_${c.nome.replace(/\s+/g, "_").replace(/&/g, "e").replace(/\//g, "-")}_${MESES[m - 1]}_${ano}.pdf`;
  pdf.save(nome);
  return nome;
}
