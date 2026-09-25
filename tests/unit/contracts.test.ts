import { describe, expect, it } from "vitest";
import type {
  NormalizedPublication,
  PdfDocument,
  Renderer,
} from "../../packages/core/src/index.js";
import type { EpubPublicationAdapter } from "../../packages/epub/src/index.js";

const publication: NormalizedPublication = {
  metadata: { title: "A sample publication", language: "en" },
  readingOrder: [
    {
      id: "chapter-1",
      href: "chapter-1.xhtml",
      mediaType: "application/xhtml+xml",
      markup: "<h1>Chapter 1</h1>",
    },
  ],
  resources: [],
};

describe("publication pipeline contracts", () => {
  it("represents a normalized publication independently of its source format", () => {
    expect(publication.readingOrder[0]?.mediaType).toBe(
      "application/xhtml+xml",
    );
    expect(publication.metadata.title).toBe("A sample publication");
  });

  it("allows an EPUB adapter to implement the shared publication contract", async () => {
    const adapter: EpubPublicationAdapter = {
      id: "epub",
      canRead: (source) => source.mediaType === "application/epub+zip",
      read: async () => publication,
    };

    expect(
      adapter.canRead({
        path: "book.epub",
        mediaType: "application/epub+zip",
      }),
    ).toBe(true);
    await expect(
      adapter.read({
        path: "book.epub",
        mediaType: "application/epub+zip",
      }),
    ).resolves.toBe(publication);
  });

  it("allows a renderer to return PDF bytes through the shared contract", async () => {
    const output: PdfDocument = {
      bytes: new Uint8Array([37, 80, 68, 70]),
      mediaType: "application/pdf",
    };
    const renderer: Renderer = {
      id: "test-renderer",
      render: async () => output,
    };

    await expect(renderer.render(publication)).resolves.toBe(output);
  });
});
