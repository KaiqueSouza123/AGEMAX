import { ReactNode, useEffect, useRef, useState } from "react";
import { CHIP } from "./regras";

export function Head({ eb, t, sub, right }: { eb: string; t: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="top" style={{ alignItems: "flex-end" }}>
      <div><div className="eyebrow">{eb}</div><h1>{t}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {right}
    </div>
  );
}

export const Chip = ({ a }: { a: string }) => <span className={`chip ${CHIP[a] || "c-mute"}`}>{a}</span>;

export function MesNav({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  const mover = (n: number) => {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + n, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const [a, m] = mes.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return (
    <div className="monthnav">
      <button type="button" className="btn sm" aria-label="Mês anterior" onClick={() => mover(-1)}>‹</button>
      <b>{nomes[+m - 1]} {a}</b>
      <button type="button" className="btn sm" aria-label="Próximo mês" onClick={() => mover(1)}>›</button>
    </div>
  );
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} onClose={onClose}>{open && children}</dialog>;
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ error: any } | void>) => {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (r && r.error) { setErr(traduz(r.error.message)); return false; }
      return true;
    } catch (e: any) { setErr(traduz(e.message)); return false; }
    finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

export function traduz(m: string): string {
  if (!m) return "Algo deu errado. Tente de novo.";
  if (m.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("Email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("Database error saving new user")) return "Este e-mail não está cadastrado na equipe da Agemax. Peça a um dono para cadastrá-lo.";
  if (m.includes("User already registered")) return "Este e-mail já tem acesso. Use Entrar ou Esqueci a senha.";
  if (m.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("row-level security")) return "Você não tem permissão para esta ação.";
  if (m.includes("duplicate key")) return "Já existe um cadastro com esse nome ou e-mail.";
  return m;
}
