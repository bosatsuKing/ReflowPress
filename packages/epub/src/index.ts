import type { PublicationAdapter, PublicationSource } from "@reflowpress/core";

export interface EpubSource extends PublicationSource {
  readonly mediaType: "application/epub+zip";
}

/** Contract for the future EPUB 2 and EPUB 3 publication adapter. */
export interface EpubPublicationAdapter extends PublicationAdapter<EpubSource> {
  readonly id: "epub";
}
