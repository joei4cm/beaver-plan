const pending = new Map<string, Promise<void>>();

/** Idempotent script loader for vendor map SDKs. */
export function loadScript(src: string, id: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("no_document"));
  }
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "1") return Promise.resolve();
  const cached = pending.get(id);
  if (cached) return cached;

  const promise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.id = id;
    script.async = true;
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`script_load_failed:${id}`));
    if (!existing) document.head.appendChild(script);
  });
  pending.set(id, promise);
  return promise;
}
