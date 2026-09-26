// Loyiha xotirasi (SOVEREIGN.md) — IPC. Fayl mantiqi CLI bilan umumiy (cli/src/project-memory.mjs);
// u main.mjs orqali uzatiladi (o'rnatilgan ilovada cli/src resources ichida turadi).
// Yo'llar faqat main'da hisoblanadi — renderer ixtiyoriy yo'l bera olmaydi.

const NOTE_MAX = 500;

/**
 * @param {object} p
 * @param {(ch: string, fn: Function) => void} p.handle  tekshirilgan ipcMain.handle
 * @param {() => string|null} p.getWorkspace
 * @param {(path: string) => Promise<string>} p.openPath  electron shell.openPath
 * @param {{ projectInfo: Function, createProjectFile: Function, addProjectNote: Function }} p.pm
 * @param {() => void} p.onChange  fayl o'zgardi — suhbatdagi loyiha xabarini yangilash
 */
export function registerProjectIpc({ handle, getWorkspace, openPath, pm, onChange }) {
  const info = () => {
    const ws = getWorkspace();
    if (!ws) return { exists: false, noFolder: true };
    try {
      return pm.projectInfo(ws);
    } catch {
      return { exists: false, error: "io" };
    }
  };

  handle("project:info", async () => info());

  handle("project:open", async () => {
    const cur = info();
    if (!cur.exists || !cur.path) return { ok: false, error: "missing" };
    const err = await openPath(cur.path);
    return err ? { ok: false, error: "open" } : { ok: true };
  });

  handle("project:create", async () => {
    const ws = getWorkspace();
    if (!ws) return { ok: false, error: "no-folder" };
    const r = pm.createProjectFile(ws);
    if (r.ok && r.created) onChange();
    return { ok: r.ok, created: !!r.created, error: r.error, info: info() };
  });

  handle("project:remember", async (_e, text) => {
    const ws = getWorkspace();
    if (!ws) return { ok: false, error: "no-folder" };
    if (typeof text !== "string") return { ok: false, error: "empty" };
    if (text.length > NOTE_MAX) return { ok: false, error: "too-long" };
    const r = pm.addProjectNote(text, ws);
    if (r.ok) onChange();
    return { ok: r.ok, created: !!r.created, overLimit: !!r.overLimit, error: r.error, info: info() };
  });
}
