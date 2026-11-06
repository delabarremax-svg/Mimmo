// @vitest-environment node
import { it, expect, vi, afterEach } from "vitest";
const mock = vi.hoisted(() => ({
  createWorker: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
}));
vi.mock("tesseract.js", () => ({ createWorker: mock.createWorker }));
import {
  readDocument,
  type DocumentSession,
} from "../src/services/read-document";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("reuses one local OCR worker across a batch and keeps raw text untouched", async () => {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 800, height: 1200, close: vi.fn() }),
  );
  mock.createWorker.mockResolvedValue({
    recognize: mock.recognize,
    terminate: mock.terminate,
  });
  mock.recognize.mockResolvedValue({
    data: { text: "12:34\nSurface habitable 51 m?", confidence: 92 },
  });
  const session: DocumentSession = {};
  for (let i = 0; i < 3; i++)
    expect(
      (
        await readDocument(
          new File(["image"], i + ".png", { type: "image/png" }),
          () => {},
          session,
        )
      )[0].text,
    ).toBe("12:34\nSurface habitable 51 m?");
  expect(mock.createWorker).toHaveBeenCalledTimes(1);
  expect(mock.recognize).toHaveBeenCalledTimes(3);
  expect(mock.terminate).not.toHaveBeenCalled();
  await session.worker?.terminate();
  expect(mock.terminate).toHaveBeenCalledTimes(1);
});
