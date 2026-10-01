export type ProfileRole = "student" | "teacher";

export type ProfileFormValues = {
  fullName: string;
  phone: string;
  studentStage: string;
  notifyBefore: boolean;
  notifyAfter: boolean;
  notifyExpiry: boolean;
  bio: string;
  yearsExperience: string;
  nationality: string;
  availableFrom: string;
  availableTo: string;
  bankName: string;
  iban: string;
  accountHolder: string;
  teachingStages: string[];
  selectedSubject: string | null;
};

export type ProfileSubject = { id: string; name: string };
export type ProfileCertificate = Record<string, unknown>;

export type ProfileData = ProfileFormValues & {
  teacherProfileId: string | null;
  subjects: ProfileSubject[];
  certificates: ProfileCertificate[];
};

type QueryResult<T = unknown> = {
  data: T | null;
  error: { message?: string } | null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select: (columns?: string) => QueryBuilder;
  update: (values: Record<string, unknown>) => QueryBuilder;
  delete: () => QueryBuilder;
  insert: (values: Record<string, unknown>) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  single: () => Promise<QueryResult>;
};

export type ProfileDataClient = {
  from: (table: string) => QueryBuilder;
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: ArrayBuffer,
        options?: { contentType?: string; upsert?: boolean },
      ) => Promise<QueryResult>;
      remove: (paths: string[]) => Promise<QueryResult>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
      ) => Promise<QueryResult<{ signedUrl?: string }>>;
    };
  };
};

const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;
const CERTIFICATE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function throwIfError(result: QueryResult, fallback: string): void {
  if (result.error) {
    throw new Error(result.error.message || fallback);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(row: Record<string, unknown>, key: string): string {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

export async function loadProfileData(
  client: ProfileDataClient,
  userId: string,
  role: ProfileRole,
): Promise<ProfileData> {
  const baseResult = await client
    .from("profiles")
    .select("full_name,phone,teaching_stage,notify_before_session,notify_after_session,notify_subscription_expiry")
    .eq("user_id", userId)
    .single();
  throwIfError(baseResult, "Could not load the account profile.");
  const base = record(baseResult.data);

  const data: ProfileData = {
    fullName: text(base, "full_name"),
    phone: text(base, "phone"),
    studentStage: text(base, "teaching_stage"),
    notifyBefore: typeof base.notify_before_session === "boolean" ? base.notify_before_session : true,
    notifyAfter: typeof base.notify_after_session === "boolean" ? base.notify_after_session : true,
    notifyExpiry: typeof base.notify_subscription_expiry === "boolean" ? base.notify_subscription_expiry : true,
    teacherProfileId: null,
    bio: "",
    yearsExperience: "",
    nationality: "",
    availableFrom: "",
    availableTo: "",
    bankName: "",
    iban: "",
    accountHolder: "",
    teachingStages: [],
    selectedSubject: null,
    subjects: [],
    certificates: [],
  };

  if (role === "student") return data;

  const [teacherResult, subjectResult, certificateResult] = await Promise.all([
    client.from("teacher_profiles").select("*").eq("user_id", userId).single(),
    client.from("subjects").select("id,name").order("name"),
    client.from("teacher_certificates").select("*").eq("teacher_id", userId).order("created_at", { ascending: false }),
  ]);
  throwIfError(teacherResult, "Could not load teacher details.");
  throwIfError(subjectResult, "Could not load teaching subjects.");
  throwIfError(certificateResult, "Could not load teacher certificates.");

  const teacher = record(teacherResult.data);
  const teacherProfileId = text(teacher, "id");
  if (!teacherProfileId) {
    throw new Error("Teacher profile not found.");
  }

  data.teacherProfileId = teacherProfileId;
  data.bio = text(teacher, "bio");
  data.yearsExperience = teacher.years_experience == null ? "" : String(teacher.years_experience);
  data.nationality = text(teacher, "nationality");
  data.availableFrom = text(teacher, "available_from");
  data.availableTo = text(teacher, "available_to");
  data.bankName = text(teacher, "bank_name");
  data.iban = text(teacher, "iban");
  data.accountHolder = text(teacher, "account_holder_name");
  data.teachingStages = Array.isArray(teacher.teaching_stages)
    ? teacher.teaching_stages.filter((item): item is string => typeof item === "string")
    : [];
  data.subjects = rows(subjectResult.data).flatMap((subject) => (
    typeof subject.id === "string" && typeof subject.name === "string"
      ? [{ id: subject.id, name: subject.name }]
      : []
  ));
  data.certificates = rows(certificateResult.data);

  const relationResult = await client
    .from("teacher_subjects")
    .select("subject_id")
    .eq("teacher_id", teacherProfileId);
  throwIfError(relationResult, "Could not load the teacher's selected subject.");
  const relation = rows(relationResult.data)[0];
  data.selectedSubject = typeof relation?.subject_id === "string" ? relation.subject_id : null;

  return data;
}

export async function saveProfileData(
  client: ProfileDataClient,
  userId: string,
  role: ProfileRole,
  teacherProfileId: string | null,
  values: ProfileFormValues,
): Promise<void> {
  if (!values.fullName.trim()) throw new Error("Name is required.");
  if (role === "teacher" && !teacherProfileId) throw new Error("Teacher profile not found.");

  const baseResult = await client.from("profiles").update({
    full_name: values.fullName.trim(),
    phone: values.phone.trim(),
    notify_before_session: values.notifyBefore,
    notify_after_session: values.notifyAfter,
    notify_subscription_expiry: values.notifyExpiry,
    ...(role === "student" ? { teaching_stage: values.studentStage || null } : {}),
  }).eq("user_id", userId);
  throwIfError(baseResult, "Could not save the account profile.");

  if (role !== "teacher") return;

  const teacherResult = await client.from("teacher_profiles").update({
    bio: values.bio,
    years_experience: Number(values.yearsExperience) || 0,
    nationality: values.nationality || null,
    available_from: values.availableFrom || null,
    available_to: values.availableTo || null,
    bank_name: values.bankName || null,
    iban: values.iban || null,
    account_holder_name: values.accountHolder || null,
    teaching_stages: values.teachingStages,
  }).eq("id", teacherProfileId).select("id");
  throwIfError(teacherResult, "Could not save teacher details.");

  const deleteResult = await client
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", teacherProfileId);
  throwIfError(deleteResult, "Could not update the teacher's selected subject.");

  if (values.selectedSubject) {
    const insertResult = await client.from("teacher_subjects").insert({
      teacher_id: teacherProfileId,
      subject_id: values.selectedSubject,
    });
    throwIfError(insertResult, "Could not save the teacher's selected subject.");
  }
}

export async function uploadTeacherCertificate(
  client: ProfileDataClient,
  userId: string,
  name: string,
  fileName: string,
  mimeType: string | null | undefined,
  bytes: ArrayBuffer,
  timestamp = Date.now(),
): Promise<ProfileCertificate[]> {
  const normalizedName = name.trim();
  if (!normalizedName || !fileName) throw new Error("Certificate details are incomplete.");
  if (bytes.byteLength > MAX_CERTIFICATE_BYTES) {
    throw new Error("The certificate file must be 10 MB or smaller.");
  }
  if (mimeType && !CERTIFICATE_MIME_TYPES.has(mimeType)) {
    throw new Error("Only PDF, JPG, PNG, and WebP files are supported.");
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const path = `certificates/${userId}/${timestamp}.${extension || "bin"}`;
  const storage = client.storage.from("support-files");
  const existingResult = await client
    .from("teacher_certificates")
    .select("id")
    .eq("file_url", path);
  throwIfError(existingResult, "Could not check the certificate upload status.");
  const existingCertificate = rows(existingResult.data)[0];

  const uploadOptions = { contentType: mimeType ?? undefined };
  let uploadResult = existingCertificate
    ? await storage.upload(path, bytes, { ...uploadOptions, upsert: true })
    : await storage.upload(path, bytes, uploadOptions);
  if (uploadResult.error && !existingCertificate) {
    const overwriteResult = await storage.upload(path, bytes, { ...uploadOptions, upsert: true });
    if (!overwriteResult.error) uploadResult = overwriteResult;
  }
  throwIfError(uploadResult, "Could not upload certificate file.");

  if (existingCertificate) {
    const updateResult = await client
      .from("teacher_certificates")
      .update({ name: normalizedName, file_name: fileName })
      .eq("id", String(existingCertificate.id));
    throwIfError(updateResult, "Could not update certificate details.");
  } else try {
    const insertResult = await client.from("teacher_certificates").insert({
      teacher_id: userId,
      name: normalizedName,
      file_url: path,
      file_name: fileName,
    });
    throwIfError(insertResult, "Could not save certificate details.");
  } catch (error) {
    const cleanup = await storage.remove([path]);
    if (cleanup.error) {
      const reason = cleanup.error.message || "Could not remove the incomplete certificate upload.";
      throw new Error(`${error instanceof Error ? error.message : "Could not save certificate details."} ${reason}`);
    }
    throw error;
  }

  const refreshed = await client
    .from("teacher_certificates")
    .select("*")
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false });
  throwIfError(refreshed, "Could not refresh teacher certificates.");
  return rows(refreshed.data);
}

export function getCertificateStoragePath(fileUrl: string): string | null {
  const match = fileUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/support-files\/(.+?)(?:\?|$)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  return /^https?:\/\//i.test(fileUrl) ? null : fileUrl;
}

export async function getCertificateOpenUrl(
  client: ProfileDataClient | null,
  fileUrl: string,
): Promise<string> {
  const path = getCertificateStoragePath(fileUrl);
  if (!path) return fileUrl;
  if (!client) throw new Error("Certificate storage is unavailable.");

  const result = await client.storage.from("support-files").createSignedUrl(path, 60 * 60);
  throwIfError(result, "Could not prepare a secure certificate link.");
  if (!result.data?.signedUrl) throw new Error("Could not prepare a secure certificate link.");
  return result.data.signedUrl;
}

export async function deleteTeacherCertificate(
  client: ProfileDataClient,
  certificateId: string,
  knownFileUrl?: string,
): Promise<void> {
  let fileUrl: unknown = knownFileUrl;
  if (typeof fileUrl !== "string") {
    const recordResult = await client
      .from("teacher_certificates")
      .select("file_url")
      .eq("id", certificateId)
      .single();
    throwIfError(recordResult, "Could not locate the certificate.");
    fileUrl = record(recordResult.data).file_url;
  }
  const path = typeof fileUrl === "string" ? getCertificateStoragePath(fileUrl) : null;

  if (path) {
    const storageResult = await client.storage.from("support-files").remove([path]);
    throwIfError(storageResult, "Could not remove the certificate file. Its details were kept.");
  }

  const deleteResult = await client
    .from("teacher_certificates")
    .delete()
    .eq("id", certificateId);
  throwIfError(deleteResult, "Could not delete certificate details.");
}