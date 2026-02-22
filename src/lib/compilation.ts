export type ExcerptType = "book" | "chapter";

export type ExcerptMetadata = {
  type?: ExcerptType;
  num?: string;
};

export type AITranslator = 879 | 890 | 893 | 895;

export type AITranslation = {
  text?: string;
  translator?: AITranslator;
  lastUpdatedAt?: number;
};

export type IndexedExcerpt = {
  from: number;
  to: number;
  nass: string;
  meta?: ExcerptMetadata;
  id: string;
};

export type Excerpt = IndexedExcerpt & AITranslation;

export type Heading = Pick<Excerpt, "nass" | "from" | "id"> & {
  parent?: string;
} & AITranslation;

export type PostProcessingApp = {
  id: string;
  timestamp?: number;
  version: string;
};

export type ForeignId = {
  id: string;
  volume: number;
};

export type Collection = {
  fid?: ForeignId[];
  id: string;
  library?: number;
  title: string;
};

export type Compilation = {
  collection?: Collection;
  contractVersion: string;
  createdAt: number;
  excerpts: Excerpt[];
  footnotes: Excerpt[];
  headings: Heading[];
  lastUpdatedAt: number;
  options: Record<string, unknown>;
  postProcessingApps: PostProcessingApp[];
  promptForTranslation?: string;
  promptId?: string;
};
