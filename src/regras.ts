// Regras de prazo e alerta: as mesmas do squad (prazo da arte = 3 dias úteis antes do post).

export type Pessoa = {
  id: string; nome: string; email: string | null; papel: "dono" | "funcionario";
  funcao: string | null; whatsapp: string | null; user_id: string | null; ativo: boolean;
};
export type Cliente = {
  id: string; nome: string; instagram: string | null; nicho: string | null; segmento: string | null;
  cidade: string | null; regra: string | null; logo: string | null; responsavel_id: string | null; ativo: boolean;
};
export type Item = {
  id: number; cliente_id: string; tema: string; tipo: string; data_post: string;
  responsavel_id: string | null; status: string; link: string | null; entregue_em: string | null;
  briefing: string | null; objetivo: string | null;
};

export const STATUS = ["A fazer", "Em produção", "Entregue", "Ajustes", "Aprovado", "Postado"];
export const TIPOS = ["Estático", "Carrossel", "Reels", "Stories", "Vídeo", "Prazo do cliente"];
const ENTREGUE = new Set(["Entregue", "Aprovado", "Postado"]);
const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const dt = (s: string) => new Date(s + "T12:00:00");
export const iso = (d: Date) => {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const fmt = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
export const fmtw = (d: Date) => `${DS[d.getDay()]} ${fmt(d)}`;

export function hojeSP(): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return dt(s);
}

let FER = new Set<string>();
export function setFeriados(datas: string[]) { FER = new Set(datas); }
export const util = (d: Date) => d.getDay() > 0 && d.getDay() < 6 && !FER.has(iso(d));

export function workday(d: Date, n: number): Date {
  const x = new Date(d); const s = n < 0 ? -1 : 1; let k = Math.abs(n);
  while (k) { x.setDate(x.getDate() + s); if (util(x)) k--; }
  return x;
}
export function uteisEntre(a: Date, b: Date): number {
  if (iso(a) === iso(b)) return 0;
  const s = b > a ? 1 : -1; let [x, y] = b > a ? [new Date(a), b] : [new Date(b), a]; let n = 0;
  while (iso(x) < iso(y)) { x.setDate(x.getDate() + 1); if (util(x)) n++; }
  return s * n;
}

export const ehPrazoCliente = (i: Item) => i.tipo === "Prazo do cliente";
export function prazoDe(i: Item): Date { return ehPrazoCliente(i) ? dt(i.data_post) : workday(dt(i.data_post), -3); }

export type Alerta = "OK" | "ATRASADO" | "SEM LINK" | "VENCE HOJE" | "VENCE EM BREVE" | "AGUARDA APROVAÇÃO" | "AJUSTES" | "NO PRAZO";
export function alerta(i: Item, hoje = hojeSP()): Alerta {
  const p = prazoDe(i);
  if (ehPrazoCliente(i)) return hoje > p ? "ATRASADO" : iso(hoje) === iso(p) ? "VENCE HOJE" : uteisEntre(hoje, p) <= 2 ? "VENCE EM BREVE" : "NO PRAZO";
  if (ENTREGUE.has(i.status) && !i.link) return "SEM LINK";
  if (i.status === "Aprovado" || i.status === "Postado") return "OK";
  if (i.status === "Entregue") return "AGUARDA APROVAÇÃO";
  if (iso(hoje) > iso(p)) return "ATRASADO";
  if (i.status === "Ajustes") return "AJUSTES";
  if (iso(hoje) === iso(p)) return "VENCE HOJE";
  if (uteisEntre(hoje, p) <= 2) return "VENCE EM BREVE";
  return "NO PRAZO";
}
export const ORDEM: Record<string, number> = { "ATRASADO": 0, "SEM LINK": 1, "VENCE HOJE": 2, "AJUSTES": 3, "VENCE EM BREVE": 4, "AGUARDA APROVAÇÃO": 5, "NO PRAZO": 6, "OK": 7 };
export const CHIP: Record<string, string> = { "OK": "c-ok", "ATRASADO": "c-bad", "SEM LINK": "c-bad", "VENCE HOJE": "c-warn", "AJUSTES": "c-warn", "VENCE EM BREVE": "c-gold", "AGUARDA APROVAÇÃO": "c-info", "NO PRAZO": "c-mute" };
export function ordenar(its: Item[]): Item[] {
  return [...its].sort((a, b) => (ORDEM[alerta(a)] - ORDEM[alerta(b)]) || (prazoDe(a).getTime() - prazoDe(b).getTime()));
}

// Pontualidade: conta só o que já passou do prazo ou já foi entregue
export function pontual(i: Item, hoje = hojeSP()): "prazo" | "atraso" | "pendente" | null {
  if (ehPrazoCliente(i)) return null;
  const p = prazoDe(i);
  if (ENTREGUE.has(i.status) && i.link && i.entregue_em) return i.entregue_em <= iso(p) ? "prazo" : "atraso";
  if (iso(hoje) > iso(p)) return "pendente";
  return null;
}
export function placar(its: Item[]) {
  const c = { prazo: 0, atraso: 0, pendente: 0 };
  its.forEach(i => { const r = pontual(i); if (r) c[r]++; });
  const tot = c.prazo + c.atraso + c.pendente;
  const al = its.map(i => alerta(i));
  const n = (a: string) => al.filter(x => x === a).length;
  return { ...c, tot, pct: tot ? Math.round(100 * c.prazo / tot) : null, atrasados: n("ATRASADO"), hoje: n("VENCE HOJE"), breve: n("VENCE EM BREVE"), semlink: n("SEM LINK"), n: its.length };
}

export function noMes(i: Item, mes: string) { return i.data_post.slice(0, 7) === mes; }
export function mesLabel(mes: string) { const [a, m] = mes.split("-"); return `${MESES[+m - 1]} de ${a}`; }
