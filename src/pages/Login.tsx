import { FormEvent, useState } from "react";
import { supabase } from "../supabase";
import { useBusy } from "../ui";

export function NovaSenha({ pronto }: { pronto: () => void }) {
  const [senha, setSenha] = useState("");
  const { busy, err, run } = useBusy();
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => supabase.auth.updateUser({ password: senha }) as any);
    if (ok) pronto();
  };
  return (
    <div className="login">
      <form className="lbox" onSubmit={enviar}>
        <img src="/agemax-horizontal.png" alt="Agemax" />
        <div><h1>Nova senha</h1><p className="sub">Escolha a senha que você vai usar para entrar.</p></div>
        <label htmlFor="ns-senha">Nova senha<input id="ns-senha" type="password" required minLength={6} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} /></label>
        {err && <div className="err">{err}</div>}
        <button type="submit" className="btn gold" disabled={busy}>Salvar e entrar</button>
      </form>
    </div>
  );
}

export default function Login() {
  const [modo, setModo] = useState<"entrar" | "criar" | "esqueci">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, err, setErr, run } = useBusy();
  const volta = location.origin;

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (modo === "entrar") {
      await run(() => supabase.auth.signInWithPassword({ email, password: senha }));
    } else if (modo === "criar") {
      const ok = await run(() => supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: volta } }));
      if (ok) setMsg("Acesso criado. Abra o e-mail que enviamos e clique no link para confirmar.");
    } else {
      const ok = await run(() => supabase.auth.resetPasswordForEmail(email, { redirectTo: volta }));
      if (ok) setMsg("Se este e-mail tem acesso, enviamos um link para criar uma nova senha.");
    }
  };
  const trocar = (m: typeof modo) => { setModo(m); setErr(null); setMsg(null); };

  return (
    <div className="login">
      <form className="lbox" onSubmit={enviar}>
        <img src="/agemax-horizontal.png" alt="Agemax" />
        <div>
          <h1>{modo === "entrar" ? "Plataforma Agemax" : modo === "criar" ? "Criar meu acesso" : "Recuperar senha"}</h1>
          <p className="sub">{modo === "criar" ? "Use o e-mail que o dono cadastrou para você na equipe." : "Produção, calendários e equipe num lugar só."}</p>
        </div>
        <label htmlFor="lg-email">E-mail<input id="lg-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@agemax.com.br" /></label>
        {modo !== "esqueci" && (
          <label htmlFor="lg-senha">Senha<input id="lg-senha" type="password" required minLength={6} autoComplete={modo === "criar" ? "new-password" : "current-password"} value={senha} onChange={e => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" /></label>
        )}
        {err && <div className="err">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? "Aguarde…" : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar acesso" : "Enviar link"}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          {modo !== "entrar" && <button type="button" className="linkbtn" onClick={() => trocar("entrar")}>Já tenho acesso</button>}
          {modo !== "criar" && <button type="button" className="linkbtn" onClick={() => trocar("criar")}>Primeiro acesso</button>}
          {modo !== "esqueci" && <button type="button" className="linkbtn" onClick={() => trocar("esqueci")}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}
