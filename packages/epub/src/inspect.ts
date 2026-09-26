import { stat } from "node:fs/promises";
import path from "node:path";
import {
  DOMParser,
  type Document,
  type Element,
  type Node,
} from "@xmldom/xmldom";
import * as yauzl from "yauzl";

const DEFAULT_LIMITS: EpubInspectionLimits = {
  maxArchiveBytes: 128 * 1024 * 1024,
  maxEntries: 20_000,
  maxMetadataDocumentBytes: 4 * 1024 * 1024,
};
const CONTAINER_PATH = "META-INF/container.xml";
const OPF_MEDIA_TYPE = "application/oebps-package+xml";
const DC_NAMESPACE = "http://purl.org/dc/elements/1.1/";
const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  CRC32_TABLE[index] = value >>> 0;
}

export type EpubInspectionErrorCode =
  | "INVALID_EPUB_ARCHIVE"
  | "CONTAINER_XML_NOT_FOUND"
  | "INVALID_CONTAINER_XML"
  | "PACKAGE_DOCUMENT_NOT_FOUND"
  | "INVALID_PACKAGE_DOCUMENT"
  | "MANIFEST_REFERENCE_NOT_FOUND";

export class EpubInspectionError extends Error {
  constructor(
    readonly code: EpubInspectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EpubInspectionError";
  }
}

export interface EpubInspectionLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxMetadataDocumentBytes: number;
}

export interface EpubMetadata {
  readonly title?: string;
  readonly language?: string;
  readonly identifier?: string;
  readonly creator: readonly string[];
}

export interface EpubManifestItem {
  readonly id: string;
  readonly href: string;
  readonly mediaType: string;
  readonly properties: readonly string[];
}

export interface EpubSpineItem {
  readonly idref: string;
  readonly linear: boolean;
}

export interface EpubInspection {
  readonly packagePath: string;
  readonly metadata: EpubMetadata;
  readonly manifest: readonly EpubManifestItem[];
  readonly spine: readonly EpubSpineItem[];
}

/** Inspect EPUB container/package structure without extracting publication files. */
export async function inspectEpub(
  sourcePath: string,
  overrides: Partial<EpubInspectionLimits> = {},
): Promise<EpubInspection> {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  validateLimits(limits);

  const source = await stat(sourcePath);
  if (!source.isFile() || source.size > limits.maxArchiveBytes) {
    throw new EpubInspectionError(
      "INVALID_EPUB_ARCHIVE",
      "The EPUB archive is not a regular file or exceeds the configured size limit.",
    );
  }

  let archive: yauzl.ZipFile;
  try {
    archive = await yauzl.openPromise(sourcePath, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch (cause) {
    throw new EpubInspectionError(
      "INVALID_EPUB_ARCHIVE",
      "The input is not a readable ZIP archive.",
      { cause },
    );
  }

  try {
    if (archive.entryCount > limits.maxEntries) {
      throw archiveError("The EPUB archive contains too many entries.");
    }

    const entries = new Map<string, yauzl.Entry>();
    try {
      for await (const entry of archive.eachEntry()) {
        validateArchiveEntryName(entry.fileName);
        if (entries.has(entry.fileName)) {
          throw archiveError(
            `The EPUB archive contains a duplicate entry: ${entry.fileName}`,
          );
        }
        entries.set(entry.fileName, entry);
      }
    } catch (cause) {
      if (cause instanceof EpubInspectionError) throw cause;
      throw new EpubInspectionError(
        "INVALID_EPUB_ARCHIVE",
        "The EPUB archive contains unreadable or unsafe entries.",
        { cause },
      );
    }

    const containerEntry = entries.get(CONTAINER_PATH);
    if (containerEntry === undefined) {
      throw new EpubInspectionError(
        "CONTAINER_XML_NOT_FOUND",
        `The EPUB archive does not contain ${CONTAINER_PATH}.`,
      );
    }

    const containerText = await readXmlEntry(
      archive,
      containerEntry,
      limits.maxMetadataDocumentBytes,
      "INVALID_CONTAINER_XML",
    );
    const container = parseXml(containerText, "INVALID_CONTAINER_XML");
    const packagePath = readPackagePath(container);
    const packageEntry = entries.get(packagePath);
    if (packageEntry === undefined) {
      throw new EpubInspectionError(
        "PACKAGE_DOCUMENT_NOT_FOUND",
        `The package document ${packagePath} referenced by container.xml is missing.`,
      );
    }

    const packageText = await readXmlEntry(
      archive,
      packageEntry,
      limits.maxMetadataDocumentBytes,
      "INVALID_PACKAGE_DOCUMENT",
    );
    const packageDocument = parseXml(packageText, "INVALID_PACKAGE_DOCUMENT");
    return readPackageDocument(packageDocument, packagePath, entries);
  } finally {
    archive.close();
  }
}

function validateLimits(limits: EpubInspectionLimits) {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
}

function archiveError(message: string) {
  return new EpubInspectionError("INVALID_EPUB_ARCHIVE", message);
}

function validateArchiveEntryName(name: string) {
  if (
    name.length === 0 ||
    name.length > 4096 ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name)
  ) {
    throw archiveError("The EPUB archive contains an unsafe entry path.");
  }

  const segments = name.split("/");
  const pathSegments = name.endsWith("/") ? segments.slice(0, -1) : segments;
  if (
    pathSegments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw archiveError("The EPUB archive contains an unsafe entry path.");
  }
}

async function readXmlEntry(
  archive: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number,
  errorCode: "INVALID_CONTAINER_XML" | "INVALID_PACKAGE_DOCUMENT",
) {
  if (
    entry.uncompressedSize > maxBytes ||
    entry.isEncrypted() ||
    !entry.canDecodeFileData()
  ) {
    throw new EpubInspectionError(
      errorCode,
      "The metadata XML entry cannot be read within limits.",
    );
  }

  try {
    const stream = await archive.openReadStreamPromise(entry);
    const chunks: Buffer[] = [];
    let size = 0;
    let checksum = 0xffffffff;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) {
        stream.destroy();
        throw new EpubInspectionError(
          errorCode,
          "The metadata XML entry exceeds the configured size limit.",
        );
      }
      for (const byte of bytes) {
        const tableIndex = (checksum ^ byte) & 0xff;
        checksum = (CRC32_TABLE[tableIndex] ?? 0) ^ (checksum >>> 8);
      }
      chunks.push(bytes);
    }
    if (size !== entry.uncompressedSize) {
      throw new EpubInspectionError(
        errorCode,
        "The metadata XML entry has an inconsistent size.",
      );
    }
    if ((checksum ^ 0xffffffff) >>> 0 !== entry.crc32) {
      throw new EpubInspectionError(
        errorCode,
        "The metadata XML entry does not match its ZIP CRC.",
      );
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch (cause) {
    if (cause instanceof EpubInspectionError) throw cause;
    throw new EpubInspectionError(
      errorCode,
      "The metadata XML entry is not readable UTF-8 XML.",
      {
        cause,
      },
    );
  }
}

function parseXml(
  source: string,
  code: "INVALID_CONTAINER_XML" | "INVALID_PACKAGE_DOCUMENT",
) {
  // DTDs are not required by EPUB metadata files. Reject them before parsing so
  // the XML library never needs to process internal entities or external IDs.
  if (containsDoctype(source)) {
    throw new EpubInspectionError(
      code,
      "Document type declarations are not supported.",
    );
  }

  const errors: string[] = [];
  let document: Document;
  try {
    document = new DOMParser({
      onError: (level, message) => {
        if (level === "error" || level === "fatalError") errors.push(message);
      },
    }).parseFromString(source, "application/xml");
  } catch (cause) {
    throw new EpubInspectionError(code, "The XML document is malformed.", {
      cause,
    });
  }

  if (errors.length > 0 || document.documentElement === null) {
    throw new EpubInspectionError(code, "The XML document is malformed.");
  }
  return document;
}

function readPackagePath(document: Document) {
  const root = document.documentElement;
  if (root === null || root.localName !== "container") {
    throw new EpubInspectionError(
      "INVALID_CONTAINER_XML",
      "The container XML root must be container.",
    );
  }

  const rootfiles = firstDirectChild(root, "rootfiles");
  const rootfile =
    rootfiles === undefined
      ? undefined
      : directChildren(rootfiles, "rootfile")[0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (
    fullPath === null ||
    fullPath === undefined ||
    fullPath.trim().length === 0
  ) {
    throw new EpubInspectionError(
      "INVALID_CONTAINER_XML",
      "The container XML must reference a package document with full-path.",
    );
  }
  if (rootfile?.getAttribute("media-type") !== OPF_MEDIA_TYPE) {
    throw new EpubInspectionError(
      "INVALID_CONTAINER_XML",
      `The container XML rootfile media-type must be ${OPF_MEDIA_TYPE}.`,
    );
  }

  try {
    return resolveArchiveReference("", fullPath);
  } catch (cause) {
    throw new EpubInspectionError(
      "INVALID_CONTAINER_XML",
      "The container XML package path is invalid or escapes the archive.",
      { cause },
    );
  }
}

function readPackageDocument(
  document: Document,
  packagePath: string,
  entries: ReadonlyMap<string, yauzl.Entry>,
): EpubInspection {
  const root = document.documentElement;
  if (root === null || root.localName !== "package") {
    throw packageError("The package document root must be package.");
  }

  const metadataElement = firstDirectChild(root, "metadata");
  const manifestElement = firstDirectChild(root, "manifest");
  const spineElement = firstDirectChild(root, "spine");
  if (
    metadataElement === undefined ||
    manifestElement === undefined ||
    spineElement === undefined
  ) {
    throw packageError(
      "The package document must contain metadata, manifest, and spine elements.",
    );
  }

  const manifest: EpubManifestItem[] = [];
  const ids = new Map<string, EpubManifestItem>();
  for (const item of directChildren(manifestElement, "item")) {
    const id = requiredAttribute(item, "id", "Manifest items require an id.");
    const href = requiredAttribute(
      item,
      "href",
      `Manifest item ${id} requires an href.`,
    );
    const mediaType = requiredAttribute(
      item,
      "media-type",
      `Manifest item ${id} requires a media-type.`,
    );
    if (ids.has(id))
      throw packageError(`The manifest contains duplicate id ${id}.`);

    let resolvedHref: string;
    try {
      resolvedHref = resolveArchiveReference(
        path.posix.dirname(packagePath),
        href,
      );
    } catch (cause) {
      throw new EpubInspectionError(
        "INVALID_PACKAGE_DOCUMENT",
        `Manifest item ${id} has an invalid href or escapes the archive.`,
        { cause },
      );
    }
    if (!entries.has(resolvedHref)) {
      throw new EpubInspectionError(
        "MANIFEST_REFERENCE_NOT_FOUND",
        `Manifest item ${id} references missing archive entry ${resolvedHref}.`,
      );
    }

    const result: EpubManifestItem = {
      id,
      href,
      mediaType,
      properties: (item.getAttribute("properties") ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    };
    manifest.push(result);
    ids.set(id, result);
  }

  if (manifest.length === 0)
    throw packageError("The package manifest must contain at least one item.");

  const spine: EpubSpineItem[] = directChildren(spineElement, "itemref").map(
    (itemref) => {
      const idref = requiredAttribute(
        itemref,
        "idref",
        "Spine itemrefs require an idref.",
      );
      if (!ids.has(idref))
        throw packageError(
          `Spine itemref ${idref} does not match a manifest item.`,
        );
      const linear = itemref.getAttribute("linear");
      if (linear !== null && linear !== "yes" && linear !== "no") {
        throw packageError(
          `Spine itemref ${idref} has an invalid linear value.`,
        );
      }
      return { idref, linear: linear !== "no" };
    },
  );
  if (spine.length === 0)
    throw packageError("The package spine must contain at least one itemref.");

  return {
    packagePath,
    metadata: readMetadata(metadataElement),
    manifest,
    spine,
  };
}

function readMetadata(metadata: Element): EpubMetadata {
  const value = (localName: string) =>
    directChildren(metadata, localName)
      .find((element) => element.namespaceURI === DC_NAMESPACE)
      ?.textContent?.trim();
  const title = value("title");
  const language = value("language");
  const identifier = value("identifier");
  const creator = directChildren(metadata, "creator")
    .filter((element) => element.namespaceURI === DC_NAMESPACE)
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);

  return {
    ...(title ? { title } : {}),
    ...(language ? { language } : {}),
    ...(identifier ? { identifier } : {}),
    creator,
  };
}

function resolveArchiveReference(baseDirectory: string, rawReference: string) {
  const reference = rawReference.split(/[?#]/, 1)[0] ?? "";
  if (
    reference.length === 0 ||
    reference.includes("\\") ||
    reference.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)
  ) {
    throw new Error("Reference must be a relative archive path.");
  }

  const decoded = decodeURIComponent(reference);
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.startsWith("/") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(decoded)
  ) {
    throw new Error("Reference contains an unsafe path.");
  }

  const resolved = path.posix.normalize(
    path.posix.join(baseDirectory, decoded),
  );
  if (
    resolved === "." ||
    resolved === ".." ||
    resolved.startsWith("../") ||
    path.posix.isAbsolute(resolved)
  ) {
    throw new Error("Reference escapes the archive.");
  }
  return resolved;
}

function containsDoctype(source: string) {
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source.startsWith("<!--", index)) {
      const end = source.indexOf("-->", index + 4);
      if (end === -1) return false;
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", index)) {
      const end = source.indexOf("?>", index + 2);
      if (end === -1) return false;
      index = end + 2;
      continue;
    }
    return (
      source.startsWith("<!DOCTYPE", index) &&
      /\s/.test(source[index + 9] ?? "")
    );
  }

  return false;
}

function firstDirectChild(parent: Element, localName: string) {
  return directChildren(parent, localName)[0];
}

function directChildren(parent: Element, localName: string) {
  const children: Element[] = [];
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child: Node | null = parent.childNodes.item(index);
    if (child?.nodeType === 1 && (child as Element).localName === localName) {
      children.push(child as Element);
    }
  }
  return children;
}

function requiredAttribute(element: Element, name: string, message: string) {
  const value = element.getAttribute(name)?.trim();
  if (!value) throw packageError(message);
  return value;
}

function packageError(message: string) {
  return new EpubInspectionError("INVALID_PACKAGE_DOCUMENT", message);
}
