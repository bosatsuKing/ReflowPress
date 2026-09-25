export interface PublicationMetadata {
  readonly title?: string;
  readonly language?: string;
}

export interface PublicationSection {
  readonly id: string;
  readonly href: string;
  readonly mediaType: string;
  readonly markup: string;
}

export interface PublicationResource {
  readonly href: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

/** Format-neutral content produced by a publication adapter. */
export interface NormalizedPublication {
  readonly metadata: PublicationMetadata;
  readonly readingOrder: readonly PublicationSection[];
  readonly resources: readonly PublicationResource[];
}

export interface PublicationSource {
  readonly path: string;
  readonly mediaType: string;
}

/** Converts a supported source file into the shared publication model. */
export interface PublicationAdapter<
  Source extends PublicationSource = PublicationSource,
> {
  readonly id: string;
  canRead(source: Source): boolean;
  read(source: Source): Promise<NormalizedPublication>;
}

export interface PdfDocument {
  readonly bytes: Uint8Array;
  readonly mediaType: "application/pdf";
}

export interface RenderOptions {
  readonly pageSize?: "A4" | "Letter";
}

/** Converts normalized publication content into PDF bytes. */
export interface Renderer {
  readonly id: string;
  render(
    publication: NormalizedPublication,
    options?: RenderOptions,
  ): Promise<PdfDocument>;
}
