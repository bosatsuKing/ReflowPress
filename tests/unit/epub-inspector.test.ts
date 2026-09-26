import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EpubInspectionError,
  inspectEpub,
} from "../../packages/epub/src/index.js";

interface ZipEntry {
  readonly name: string;
  readonly contents: string;
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("inspectEpub", () => {
  it("returns package metadata, manifest entries, spine order, and package path", async () => {
    const path = await createEpub([
      { name: "mimetype", contents: "application/epub+zip" },
      {
        name: "META-INF/container.xml",
        contents:
          '<!-- <!DOCTYPE is plain comment text, not a declaration. --><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
      {
        name: "OPS/book.opf",
        contents: `<?xml version="1.0"?>
          <package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0">
            <metadata><dc:title>Example &amp; Book</dc:title><dc:language>ja</dc:language><dc:identifier>urn:test:book</dc:identifier><dc:creator>Author</dc:creator></metadata>
            <manifest>
              <item id="chapter-1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml" properties="nav scripted"/>
              <item id="style" href="styles/book.css" media-type="text/css"/>
            </manifest>
            <spine><itemref idref="chapter-1"/><itemref idref="style" linear="no"/></spine>
          </package>`,
      },
      { name: "OPS/text/chapter 1.xhtml", contents: "<html/>" },
      { name: "OPS/styles/book.css", contents: "body {}" },
    ]);

    await expect(inspectEpub(path)).resolves.toEqual({
      packagePath: "OPS/book.opf",
      metadata: {
        title: "Example & Book",
        language: "ja",
        identifier: "urn:test:book",
        creator: ["Author"],
      },
      manifest: [
        {
          id: "chapter-1",
          href: "text/chapter%201.xhtml",
          mediaType: "application/xhtml+xml",
          properties: ["nav", "scripted"],
        },
        {
          id: "style",
          href: "styles/book.css",
          mediaType: "text/css",
          properties: [],
        },
      ],
      spine: [
        { idref: "chapter-1", linear: true },
        { idref: "style", linear: false },
      ],
    });
  });

  it("classifies a broken ZIP archive", async () => {
    const path = await createFile(Buffer.from("not a ZIP archive"));

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_EPUB_ARCHIVE",
    });
  });

  it("classifies a missing container document", async () => {
    const path = await createEpub([
      { name: "mimetype", contents: "application/epub+zip" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "CONTAINER_XML_NOT_FOUND",
    });
  });

  it("rejects archives above the configured byte limit", async () => {
    const path = await createEpub([
      { name: "mimetype", contents: "application/epub+zip" },
    ]);

    await expect(
      inspectEpub(path, { maxArchiveBytes: 8 }),
    ).rejects.toMatchObject({
      code: "INVALID_EPUB_ARCHIVE",
    });
  });

  it("rejects archives above the configured entry count", async () => {
    const path = await createEpub([
      { name: "first", contents: "1" },
      { name: "second", contents: "2" },
    ]);

    await expect(inspectEpub(path, { maxEntries: 1 })).rejects.toMatchObject({
      code: "INVALID_EPUB_ARCHIVE",
    });
  });

  it("rejects container XML above the configured metadata limit", async () => {
    const path = await createEpub([
      { name: "META-INF/container.xml", contents: "<container/>" },
    ]);

    await expect(
      inspectEpub(path, { maxMetadataDocumentBytes: 8 }),
    ).rejects.toMatchObject({ code: "INVALID_CONTAINER_XML" });
  });

  it("classifies malformed container XML", async () => {
    const path = await createEpub([
      { name: "META-INF/container.xml", contents: "<container><rootfiles>" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_CONTAINER_XML",
    });
  });

  it("rejects metadata ZIP entries whose contents fail the ZIP CRC", async () => {
    const contents = createZip([
      {
        name: "META-INF/container.xml",
        contents:
          '<!--x--><container><rootfiles><rootfile full-path="missing.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
    ]);
    const dataOffset = 30 + Buffer.byteLength("META-INF/container.xml", "utf8");
    contents[dataOffset + 4] = "y".charCodeAt(0);
    const path = await createFile(contents);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_CONTAINER_XML",
    });
  });

  it("classifies a missing package document", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<container><rootfiles><rootfile full-path="OPS/missing.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "PACKAGE_DOCUMENT_NOT_FOUND",
    });
  });

  it("classifies malformed package XML", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
      { name: "book.opf", contents: "<package><metadata>" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_PACKAGE_DOCUMENT",
    });
  });

  it("classifies missing manifest resources", async () => {
    const path = await createValidContainerAndPackage(
      '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="text/missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    );

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "MANIFEST_REFERENCE_NOT_FOUND",
    });
  });

  it("rejects a manifest reference that escapes the package directory", async () => {
    const path = await createValidContainerAndPackage(
      '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="../../outside.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    );

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_PACKAGE_DOCUMENT",
    });
  });

  it("rejects an absolute manifest reference", async () => {
    const path = await createValidContainerAndPackage(
      '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="/outside.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    );

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_PACKAGE_DOCUMENT",
    });
  });

  it("rejects a package path that escapes the archive root", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<container><rootfiles><rootfile full-path="../../outside.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_CONTAINER_XML",
    });
  });

  it("leaves absent optional metadata undefined instead of empty", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
      {
        name: "book.opf",
        contents:
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      },
      { name: "chapter.xhtml", contents: "<html/>" },
    ]);

    const result = await inspectEpub(path);
    expect(result.metadata).toEqual({ creator: [] });
    expect(result.metadata.title).toBeUndefined();
    expect(result.metadata.language).toBeUndefined();
    expect(result.metadata.identifier).toBeUndefined();
  });

  it("rejects a package document with an empty spine", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      },
      {
        name: "book.opf",
        contents:
          '<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine/></package>',
      },
      { name: "chapter.xhtml", contents: "<html/>" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_PACKAGE_DOCUMENT",
    });
  });

  it("rejects XML that declares a document type", async () => {
    const path = await createEpub([
      {
        name: "META-INF/container.xml",
        contents:
          '<!DOCTYPE container SYSTEM "https://example.invalid/external.dtd"><container/>',
      },
    ]);

    await expect(inspectEpub(path)).rejects.toBeInstanceOf(EpubInspectionError);
    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_CONTAINER_XML",
    });
  });

  it("rejects unsafe archive entry paths", async () => {
    const path = await createEpub([
      { name: "../outside.txt", contents: "outside" },
      { name: "META-INF/container.xml", contents: "<container/>" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_EPUB_ARCHIVE",
    });
  });

  it("rejects an absolute archive entry path", async () => {
    const path = await createEpub([
      { name: "C:/outside.txt", contents: "outside" },
      { name: "META-INF/container.xml", contents: "<container/>" },
    ]);

    await expect(inspectEpub(path)).rejects.toMatchObject({
      code: "INVALID_EPUB_ARCHIVE",
    });
  });
});

async function createValidContainerAndPackage(packageDocument: string) {
  return createEpub([
    {
      name: "META-INF/container.xml",
      contents:
        '<container><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    { name: "OPS/book.opf", contents: packageDocument },
  ]);
}

async function createEpub(entries: readonly ZipEntry[]) {
  return createFile(createZip(entries));
}

async function createFile(contents: Uint8Array) {
  const directory = await mkdtemp(join(tmpdir(), "reflowpress-epub-test-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixture.epub");
  await writeFile(path, contents);
  return path;
}

function createZip(entries: readonly ZipEntry[]) {
  const localFiles: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const contents = Buffer.from(entry.contents, "utf8");
    const checksum = crc32(contents);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x800, 6);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contents.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localFiles.push(localHeader, name, contents);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x800, 8);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contents.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralDirectory.push(centralHeader, name);
    localOffset += localHeader.length + name.length + contents.length;
  }

  const directoryContents = Buffer.concat(centralDirectory);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(directoryContents.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);

  return Buffer.concat([...localFiles, directoryContents, endRecord]);
}

function crc32(contents: Buffer) {
  let checksum = 0xffffffff;

  for (const byte of contents) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }

  return (checksum ^ 0xffffffff) >>> 0;
}
