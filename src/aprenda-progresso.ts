// Progresso das lições e boas-vindas, guardado no navegador de cada pessoa.
// Se o navegador bloquear o armazenamento, tudo continua funcionando (só não lembra).
const EVT = "agemax-aprenda";

function ler(chave: string): string | null { try { return localStorage.getItem(chave); } catch { return null; } }
function gravar(chave: string, v: string) { try { localStorage.setItem(chave, v); } catch { /* sem armazenamento */ } }

export function licoesVistas(pessoaId: string): string[] {
  try { return JSON.parse(ler("agemax-aprenda-" + pessoaId) || "[]"); } catch { return []; }
}
export function marcarLicao(pessoaId: string, id: string) {
  const v = licoesVistas(pessoaId);
  if (!v.includes(id)) { v.push(id); gravar("agemax-aprenda-" + pessoaId, JSON.stringify(v)); window.dispatchEvent(new Event(EVT)); }
}
export function viuBoasVindas(pessoaId: string): boolean { return ler("agemax-bv-" + pessoaId) === "1"; }
export function marcarBoasVindas(pessoaId: string) { gravar("agemax-bv-" + pessoaId, "1"); }
export const EVENTO_APRENDA = EVT;
