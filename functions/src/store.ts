import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import type { Store } from "./types.js";

/** Local single-process durable store. Write temporary file then atomically replace. */
export class FileStore implements Store {
  private data: Record<string, unknown> = {};
  private ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {
    this.ready = this.load();
  }
  private async load() {
    try {
      this.data = JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  async read<T>(key: string): Promise<T | undefined> {
    await this.ready;
    await this.tail;
    return structuredClone(this.data[key]) as T | undefined;
  }
  async list<T>(prefix: string): Promise<T[]> {
    await this.ready;
    await this.tail;
    return Object.entries(this.data)
      .filter(([k]) => k.startsWith(prefix + "/"))
      .map(([, v]) => structuredClone(v) as T);
  }
  update<T, R>(
    key: string,
    fn: (v: T | undefined) => { value: T | undefined; result: R },
  ): Promise<R> {
    const run = this.tail.then(async () => {
      await this.ready;
      const next = fn(structuredClone(this.data[key]) as T | undefined);
      const draft = { ...this.data };
      if (next.value === undefined) delete draft[key];
      else draft[key] = next.value;
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(draft), "utf8");
      await rename(this.path + ".tmp", this.path);
      this.data = draft;
      return next.result;
    });
    this.tail = run.catch(() => {});
    return run;
  }
}
export class FirestoreStore implements Store {
  async read<T>(key: string) {
    const d = await getFirestore().doc(key).get();
    return d.exists ? (d.data() as T) : undefined;
  }
  async list<T>(prefix: string) {
    return (await getFirestore().collection(prefix).get()).docs.map(
      (d) => d.data() as T,
    );
  }
  async update<T, R>(
    key: string,
    fn: (v: T | undefined) => { value: T | undefined; result: R },
  ): Promise<R> {
    return getFirestore().runTransaction(async (tx) => {
      const ref = getFirestore().doc(key);
      const d = await tx.get(ref);
      const next = fn(d.exists ? (d.data() as T) : undefined);
      if (next.value === undefined) tx.delete(ref);
      else {
        const value = next.value as Record<string, unknown>;
        if (Buffer.byteLength(JSON.stringify(value), "utf8") > 800_000)
          throw new Error(
            "수업 데이터 용량 한도입니다. 내보낸 뒤 새 수업을 생성하세요.",
          );
        tx.set(ref, {
          ...value,
          ...(typeof value.expiresAt === "number"
            ? { expireOn: new Date(value.expiresAt) }
            : {}),
        });
      }
      return next.result;
    });
  }
}
