import type { PublicationAdapter, PublicationSource } from "@reflowpress/core";
export {
  EpubInspectionError,
  inspectEpub,
  type EpubInspection,
  type EpubInspectionErrorCode,
  type EpubInspectionLimits,
  type EpubManifestItem,
  type EpubMetadata,
  type EpubSpineItem,
} from "./inspect.js";

export interface EpubSource extends PublicationSource {
  readonly mediaType: "application/epub+zip";
}

/** Contract for the future EPUB 2 and EPUB 3 publication adapter. */
export interface EpubPublicationAdapter extends PublicationAdapter<EpubSource> {
  readonly id: "epub";
}
