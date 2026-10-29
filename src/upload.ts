// Envio de arquivos "retomável" (TUS): o arquivo sobe em partes e, se a internet oscilar,
// continua de onde parou em vez de falhar. Bem mais firme que o envio comum para artes pesadas.
import { Upload } from "tus-js-client";
import { SUPA_KEY, SUPA_URL, supabase } from "./supabase";

const ENDPOINT = `${SUPA_URL}/storage/v1/upload/resumable`;

// envio comum (um pedaço só), usado como reserva se o retomável falhar
function envioSimples(bucket: string, caminho: string, arq: File | Blob, tipo: string, token: string, progresso?: (p: number) => void): Promise<void> {
  return new Promise((ok, erro) => {
    const x = new XMLHttpRequest();
    x.open("POST", `${SUPA_URL}/storage/v1/object/${bucket}/${caminho}`);
    x.setRequestHeader("Authorization", "Bearer " + token);
    x.setRequestHeader("apikey", SUPA_KEY);
    x.setRequestHeader("x-upsert", "false");
    x.setRequestHeader("Content-Type", tipo || "application/octet-stream");
    x.timeout = 180_000;
    x.upload.onprogress = e => { if (e.lengthComputable) progresso?.(e.loaded / e.total); };
    x.onload = () => x.status < 300 || /already exists|duplicate/i.test(x.responseText || "") ? ok() : erro(new Error(x.status === 413 ? "Arquivo maior que 50 MB." : "Não consegui enviar (" + x.status + ")."));
    x.onerror = () => erro(new Error("Sem conexão. Tente de novo."));
    x.ontimeout = () => erro(new Error("O envio demorou demais. Tente de novo."));
    x.send(arq);
  });
}

export async function enviarArquivo(bucket: string, caminho: string, arq: File | Blob, tipo: string, progresso?: (p: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre de novo.");
  try { await retomavel(bucket, caminho, arq, tipo, token, progresso); return; }
  catch (e: any) { if (/50 MB|já foi enviado/.test(e?.message || "")) throw e; }
  // reserva: envio comum, até 3 tentativas
  let ultimo: any = null;
  for (let k = 0; k < 3; k++) {
    try { await envioSimples(bucket, caminho, arq, tipo, token, progresso); return; }
    catch (e: any) { ultimo = e; if (/50 MB/.test(e?.message || "")) break; await new Promise(r => setTimeout(r, 1500 * (k + 1))); }
  }
  throw ultimo || new Error("Não consegui enviar. Tente de novo.");
}

function retomavel(bucket: string, caminho: string, arq: File | Blob, tipo: string, token: string, progresso?: (p: number) => void): Promise<void> {
  return new Promise<void>((ok, erro) => {
    let parado: ReturnType<typeof setTimeout> | null = null;
    const vigiar = () => { if (parado) clearTimeout(parado); parado = setTimeout(() => { up.abort(); erro(new Error("A internet travou no envio. Tente de novo.")); }, 120_000); };
    const up = new Upload(arq, {
      endpoint: ENDPOINT,
      retryDelays: [0, 1500, 3000, 6000, 10000, 15000],
      headers: { authorization: `Bearer ${token}`, apikey: SUPA_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false, // cada envio tem caminho novo: não reaproveita envio antigo
      metadata: { bucketName: bucket, objectName: caminho, contentType: tipo || "application/octet-stream", cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024, // o Supabase exige partes de 6 MB
      onProgress: (env, total) => { vigiar(); progresso?.(total ? env / total : 0); },
      onSuccess: () => { if (parado) clearTimeout(parado); ok(); },
      onError: e => {
        if (parado) clearTimeout(parado);
        const msg = String((e as any)?.originalResponse?.getBody?.() || e?.message || "");
        // o arquivo já chegou numa tentativa anterior (só pode ser nosso: o caminho é único)
        if (/already exists|duplicate|409/i.test(msg)) { ok(); return; }
        erro(new Error(/maximum|too large|413/i.test(msg) ? "Arquivo maior que 50 MB." : /already exists|409/i.test(msg) ? "Esse arquivo já foi enviado." : "Não consegui enviar. Confira a internet e tente de novo."));
      },
    });
    vigiar();
    up.start();
  });
}
