export type ProfileTestRole = "student" | "teacher";

export type ProfileTestSession = {
  accessToken: string;
  isAuthenticated: true;
  onboardingCompleted: true;
  user: { id: string; email: string };
  role: ProfileTestRole;
};

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type StoredFile = { body: ArrayBuffer; contentType?: string | null };
type QueryResult = { data: Row | Row[] | null; error: Error | null };
type PersistedState = {
  tables: Tables;
  files: Array<[string, { bytes: number[]; contentType: string | null }]>;
};

export function createProfileTestSession(role: ProfileTestRole): ProfileTestSession {
  if (role !== "student" && role !== "teacher") {
    throw new Error(`Unsupported test profile role: ${role}`);
  }

  return {
    accessToken: `isolated-${role}-session`,
    isAuthenticated: true,
    onboardingCompleted: true,
    user: {
      id: `profile-test-${role}`,
      email: `${role}@profile-test.invalid`,
    },
    role,
  };
}

export function emptyStudentTables(session = createProfileTestSession("student")): Tables {
  return {
    profiles: [{
      user_id: session.user.id,
      full_name: "طالبة تجريبية",
      phone: "0501111111",
      teaching_stage: "المتوسطة",
      notify_before_session: true,
      notify_after_session: true,
      notify_subscription_expiry: false,
    }],
  };
}

export function emptyTeacherTables(session = createProfileTestSession("teacher")): Tables {
  return {
    profiles: [{
      user_id: session.user.id,
      full_name: "الاسم قبل التعديل",
      phone: "0500000000",
      teaching_stage: null,
      notify_before_session: true,
      notify_after_session: false,
      notify_subscription_expiry: true,
    }],
    teacher_profiles: [{
      id: "teacher-profile-test",
      user_id: session.user.id,
      bio: "نبذة قديمة",
      years_experience: 5,
      nationality: "سعودية",
      available_from: "08:00",
      available_to: "16:00",
      bank_name: "بنك الاختبار",
      iban: "SA0000000000000000000000",
      account_holder_name: "معلم الاختبار",
      teaching_stages: ["الابتدائية"],
    }],
    subjects: [
      { id: "subject-math", name: "رياضيات" },
      { id: "subject-science", name: "علوم" },
    ],
    teacher_subjects: [{ teacher_id: "teacher-profile-test", subject_id: "subject-math" }],
    teacher_certificates: [],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export class IsolatedProfileClient {
  readonly tables: Tables;
  readonly files: Map<string, StoredFile>;
  readonly failedInserts = new Set<string>();
  writeCount = 0;
  nextId = 1;
  private readonly persist: (state: PersistedState) => void;

  constructor(
    tables: Tables = {},
    files = new Map<string, StoredFile>(),
    persist: (state: PersistedState) => void = () => {},
  ) {
    this.tables = clone(tables);
    this.files = files;
    this.persist = persist;
  }

  from(table: string): MemoryQuery {
    return new MemoryQuery(this, table);
  }

  readonly storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: ArrayBuffer, options: { contentType?: string } = {}) => {
        if (bucket !== "support-files") return { data: null, error: new Error("Unexpected bucket") };
        this.files.set(path, { body: body.slice(0), contentType: options.contentType });
        this.recordWrite();
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        if (bucket !== "support-files") return { data: null, error: new Error("Unexpected bucket") };
        for (const path of paths) this.files.delete(path);
        this.recordWrite();
        return { data: paths.map((path) => ({ name: path })), error: null };
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        if (!this.files.has(path)) return { data: null, error: new Error("File not found in isolated storage") };
        return {
          data: { signedUrl: `https://isolated-storage.test/${encodeURIComponent(path)}?expires=${expiresIn}` },
          error: null,
        };
      },
    }),
  };

  recordWrite(): void {
    this.writeCount += 1;
    const files = [...this.files.entries()].map(([path, file]) => [
      path,
      { bytes: [...new Uint8Array(file.body)], contentType: file.contentType ?? null },
    ] as [string, { bytes: number[]; contentType: string | null }]);
    this.persist({ tables: clone(this.tables), files });
  }
}

class MemoryQuery implements PromiseLike<QueryResult> {
  private action: "select" | "update" | "delete" | "insert" = "select";
  private filters: Array<[string, unknown]> = [];
  private values: Row = {};
  private readonly client: IsolatedProfileClient;
  private readonly table: string;

  constructor(client: IsolatedProfileClient, table: string) {
    this.client = client;
    this.table = table;
  }

  select(_columns?: string): this { return this; }
  order(_column?: string, _options?: { ascending?: boolean }): this { return this; }
  eq(column: string, value: unknown): this { this.filters.push([column, value]); return this; }
  update(values: Row): this { this.action = "update"; this.values = values; return this; }
  delete(): this { this.action = "delete"; return this; }
  insert(values: Row): this { this.action = "insert"; this.values = values; return this; }

  single(): Promise<QueryResult> {
    return this.execute(true);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(single = false): Promise<QueryResult> {
    const rows = this.client.tables[this.table] ??= [];
    const matches = rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));

    if (this.action === "select") {
      if (single) {
        if (!matches.length) return { data: null, error: new Error(`No ${this.table} fixture row`) };
        return { data: clone(matches[0]), error: null };
      }
      return { data: clone(matches), error: null };
    }

    if (this.action === "update") {
      for (const row of matches) Object.assign(row, clone(this.values));
      this.client.recordWrite();
      return { data: clone(matches), error: null };
    }

    if (this.action === "delete") {
      this.client.tables[this.table] = rows.filter((row) => !matches.includes(row));
      this.client.recordWrite();
      return { data: clone(matches), error: null };
    }

    if (this.client.failedInserts.has(this.table)) {
      return { data: null, error: new Error(`Rejected isolated ${this.table} insert`) };
    }
    const inserted: Row = {
      id: `test-row-${this.client.nextId++}`,
      created_at: "2026-09-28T12:00:00.000Z",
      ...clone(this.values),
    };
    rows.push(inserted);
    this.client.recordWrite();
    return { data: clone(inserted), error: null };
  }
}

export function createPersistentProfileTestClient(session: ProfileTestSession): IsolatedProfileClient {
  if (typeof localStorage === "undefined") {
    throw new Error("The persistent profile test client is only available in a browser.");
  }
  const key = `ajyal.profile-test.v1:${session.role}:${session.user.id}`;
  let saved: PersistedState | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(key) ?? "null") as PersistedState | null;
  } catch {
    localStorage.removeItem(key);
  }
  const tables = saved?.tables ?? (
    session.role === "teacher" ? emptyTeacherTables(session) : emptyStudentTables(session)
  );
  const files = new Map<string, StoredFile>(
    (saved?.files ?? []).map(([path, file]) => [
      path,
      { body: toArrayBuffer(file.bytes), contentType: file.contentType },
    ]),
  );
  return new IsolatedProfileClient(tables, files, (state) => {
    localStorage.setItem(key, JSON.stringify(state));
  });
}