import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { fileProblem, MAX_FILE_BYTES, uploadAttachment } from "@/lib/files";
import { AttachmentPicker } from "./AttachmentPicker";
import { AttachmentList } from "./AttachmentList";
import { useAttachments } from "./useAttachments";
import { SaveOffline } from "@/components/SaveOffline";
import { TutorLanguagePicker } from "@/components/tutor/TutorLanguage";
import { RoleShell } from "@/components/RoleShell";
import type { LessonDetail } from "@/lib/student";
import type { MeResponse } from "@/lib/types";
import { AuthProvider } from "@/lib/auth";
import { RequireAuth } from "@/components/RouteGuards";
import { clearSavedLessons, listSavedLessons, offlineIdentity, saveLessonOffline, setOfflineOwner } from "@/lib/offline";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

const png = (name = "working.png", size = 64) => new File([new Uint8Array(size)], name, { type: "image/png" });

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

function Picker() {
  const attachments = useAttachments("student");
  return (
    <>
      <AttachmentPicker attachments={attachments} />
      <output data-testid="ids">{attachments.ids.join(",")}</output>
    </>
  );
}

const chooseFiles = (files: File[]) =>
  fireEvent.change(screen.getByLabelText(/attach a photo or pdf/i), { target: { files } });

beforeEach(() => {
  mockApi.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
});

afterEach(() => vi.unstubAllGlobals());

describe("fileProblem", () => {
  const cases: [string, () => File, RegExp][] = [
    ["an SVG", () => new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }), /isn't a PNG, JPEG, WebP or PDF/],
    ["an empty image", () => new File([], "empty.png", { type: "image/png" }), /is empty/],
    ["a PDF over 10 MB", () => new File([new Uint8Array(MAX_FILE_BYTES + 1)], "big.pdf", { type: "application/pdf" }), /larger than 10 MB/],
  ];
  it.each(cases)("explains why %s can't be attached", (_label, make, message) => {
    expect(fileProblem(make())).toMatch(message);
  });

  it("accepts a file exactly at the size limit", () => {
    expect(fileProblem(new File([new Uint8Array(MAX_FILE_BYTES)], "ok.pdf", { type: "application/pdf" }))).toBeNull();
  });
});

describe("uploadAttachment", () => {
  it("sends the raw file with its type and an encoded name", async () => {
    mockApi.mockResolvedValue({ id: "a1", filename: "my work.png", contentType: "image/png", size: 64 });
    const file = png("my work.png");

    await uploadAttachment(file, "teacher");

    expect(mockApi).toHaveBeenCalledWith("/api/v1/teacher/attachments?filename=my%20work.png", {
      method: "POST", body: file, headers: { "Content-Type": "image/png" },
    });
  });
});

describe("AttachmentPicker", () => {
  it("uploads a chosen image and makes its id available to the message", async () => {
    mockApi.mockResolvedValue({ id: "a1", filename: "working.png", contentType: "image/png", size: 64 });
    withClient(<Picker />);

    chooseFiles([png()]);

    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a1"));
    expect(screen.getByRole("button", { name: "Remove working.png" })).toBeInTheDocument();
  });

  it("refuses an unsupported file with a message and never uploads it", async () => {
    withClient(<Picker />);

    chooseFiles([new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]);

    expect(await screen.findByRole("alert")).toHaveTextContent("notes.docx isn't a PNG, JPEG, WebP or PDF.");
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("keeps at most four files", async () => {
    mockApi.mockImplementation(async (path: string) => ({ id: path, filename: "f.png", contentType: "image/png", size: 64 }));
    withClient(<Picker />);

    chooseFiles([1, 2, 3, 4, 5].map((n) => png(`p${n}.png`)));

    expect(await screen.findByRole("alert")).toHaveTextContent("You can attach up to 4 files.");
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(4);
  });

  it("lets a failed file be retried, and doesn't count it toward the limit", async () => {
    mockApi.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "a9", filename: "w.png", contentType: "image/png", size: 64 });
    withClient(<Picker />);
    chooseFiles([png("w.png")]);
    await screen.findByText(/couldn't upload/);
    chooseFiles([png("1.png"), png("2.png"), png("3.png"), png("4.png")]);

    await waitFor(() => expect(screen.queryByText(/up to 4 files/)).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Try uploading w.png again" }));
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a9"));
  });

  it("cancels an upload when the file is removed", async () => {
    let signal: AbortSignal | undefined;
    mockApi.mockImplementation((_path, init) => {
      signal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    });
    withClient(<Picker />);
    chooseFiles([png("slow.png")]);
    await userEvent.click(await screen.findByRole("button", { name: "Remove slow.png" }));

    expect(signal?.aborted).toBe(true);
  });

  it("removes a file before sending", async () => {
    mockApi.mockResolvedValue({ id: "a1", filename: "working.png", contentType: "image/png", size: 64 });
    withClient(<Picker />);
    chooseFiles([png()]);
    await waitFor(() => expect(screen.getByTestId("ids")).toHaveTextContent("a1"));

    await userEvent.click(screen.getByRole("button", { name: "Remove working.png" }));

    expect(screen.getByTestId("ids")).toHaveTextContent("");
  });
});

describe("AttachmentList", () => {
  it("opens images full size and downloads PDFs", () => {
    render(<AttachmentList role="student" attachments={[
      { id: "i1", filename: "sketch.png", contentType: "image/png", size: 2048 },
      { id: "p1", filename: "notes.pdf", contentType: "application/pdf", size: 4096 },
    ]} />);

    expect(screen.getByRole("link", { name: /open sketch.png full size/i })).toHaveAttribute("href", "/api/v1/student/attachments/i1");
    expect(screen.getByRole("link", { name: /notes.pdf/ })).toHaveAttribute("download", "notes.pdf");
  });
});

describe("TutorLanguagePicker", () => {
  it("saves the chosen reply language", async () => {
    const prefs = { tutorLanguage: "en", languages: [{ code: "en", name: "English" }, { code: "hinglish", name: "Hinglish" }] };
    mockApi.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === "PUT" ? { ...prefs, tutorLanguage: "hinglish" } : prefs);
    withClient(<TutorLanguagePicker enabled />);

    await userEvent.selectOptions(await screen.findByLabelText("Reply language"), "hinglish");

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/api/v1/student/preferences", {
      method: "PUT", body: JSON.stringify({ tutorLanguage: "hinglish" }),
    }));
  });
});

/** An in-memory Cache Storage: enough of the API for saved lessons. */
function fakeCacheStorage() {
  const stores = new Map<string, Map<string, string>>();
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      put: async (key: string, response: Response) => { store.set(key, await response.text()); },
      match: async (key: string) => (store.has(key) ? new Response(store.get(key)) : undefined),
      delete: async (key: string) => store.delete(key),
      keys: async () => [...store.keys()],
    };
  };
  return {
    stores,
    storage: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
  };
}

const person = (id: string) => ({
  admin: { id, name: id, email: `${id}@ashf.example.edu`, type: "student", status: "active", institutionId: "i1" },
  roles: [], permissions: [], scope: "student",
}) as MeResponse;
const lesson = (id: string) =>
  ({ id, title: `Lesson ${id}`, minutes: 8, course: { code: "PHY101", title: "Physics 101" } }) as LessonDetail;

describe("saved lessons belong to one person", () => {
  let fake: ReturnType<typeof fakeCacheStorage>;
  beforeEach(() => {
    fake = fakeCacheStorage();
    vi.stubGlobal("caches", fake.storage);
  });

  it("saves a lesson under its API address, in the student's own cache", async () => {
    await setOfflineOwner(person("ingrid"));
    render(<SaveOffline lesson={lesson("l1")} />);

    const button = await screen.findByRole("button", { name: "Save for offline" });
    await userEvent.click(button);

    expect(fake.stores.get("edubot-saved-lessons-v2:ingrid")?.has("/api/v1/student/lessons/l1")).toBe(true);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved on this device");
  });

  it("deletes another person's saved lessons when someone else signs in", async () => {
    await setOfflineOwner(person("ingrid"));
    await saveLessonOffline(lesson("l1"));

    await setOfflineOwner(person("kwame"));

    expect(fake.stores.has("edubot-saved-lessons-v2:ingrid")).toBe(false);
    expect(await listSavedLessons()).toEqual([]);
  });

  it("keeps the identity only while there are saved lessons, and forgets everything on sign-out", async () => {
    await setOfflineOwner(person("ingrid"));
    expect(await offlineIdentity()).toBeNull();
    await saveLessonOffline(lesson("l1"));
    expect((await offlineIdentity())?.admin.id).toBe("ingrid");

    await clearSavedLessons();

    expect(await offlineIdentity()).toBeNull();
    expect([...fake.stores.keys()].some((name) => name.startsWith("edubot-saved-lessons"))).toBe(false);
  });

  it("skips a damaged saved entry instead of failing the list", async () => {
    await setOfflineOwner(person("ingrid"));
    await saveLessonOffline(lesson("l1"));
    fake.stores.get("edubot-saved-lessons-v2:ingrid")?.set("/api/v1/student/lessons/broken", "{not json");

    expect((await listSavedLessons()).map((l) => l.id)).toEqual(["l1"]);
  });

  it("opens offline from a cold start, but only into saved lessons", async () => {
    await setOfflineOwner(person("ingrid"));
    await saveLessonOffline(lesson("l1"));
    mockApi.mockRejectedValue(new TypeError("Failed to fetch"));
    window.history.pushState({}, "", "/s/learn");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/s/learn"]}>
            <Routes>
              <Route element={<RequireAuth />}>
                <Route path="/s/learn" element={<p>Courses</p>} />
                <Route path="/s/offline" element={<p>Saved lessons page</p>} />
              </Route>
              <Route path="/login" element={<p>Sign in</p>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Saved lessons page")).toBeInTheDocument();
    expect(screen.queryByText("Courses")).toBeNull();
    window.history.pushState({}, "", "/");
  });
});

describe("RoleShell", () => {
  it("groups the student's places into Study and Campus", () => {
    mockApi.mockResolvedValue({});
    withClient(<RoleShell role="student" />);

    const study = screen.getByRole("group", { name: "Study" });
    expect(study).toHaveTextContent(/Today.*Learn.*Practice.*Doubts.*Progress/);
    expect(screen.getByRole("group", { name: "Campus" })).toHaveTextContent(/Schedule.*Fees/);
  });
});
