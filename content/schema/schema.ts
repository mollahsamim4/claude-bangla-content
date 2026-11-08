import { z, type ZodType } from 'zod';

export const FORMAT_VERSION = 1;

const id = z.string().regex(/^[a-z0-9-]+$/);
const httpsUrl = z.string().url().refine((u) => u.startsWith('https://'), 'must be an https URL');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ImageRef = z.object({
  src: z.string().regex(/^images\/[a-z0-9-]+\.(webp|png|jpg)$/),
  alt: z.string().min(1), // Bengali
  credit: z
    .object({
      source: z.enum(['unsplash', 'pixabay', 'owner']),
      name: z.string().optional(),
      url: z.string().url().optional(),
    })
    .optional(),
});

export const Block = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string().min(1) }),
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }), // `inline code` allowed
  z.object({ type: z.literal('tip'), text: z.string().min(1) }),
  z.object({ type: z.literal('warning'), text: z.string().min(1) }),
  z.object({ type: z.literal('steps'), items: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('image'), image: ImageRef }),
  z.object({ type: z.literal('code'), code: z.string().min(1), language: z.string().optional() }),
  z.object({ type: z.literal('prompt'), text: z.string().min(1) }),
]);

export const QuizQuestion = z
  .object({
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(4),
    answer: z.number().int().min(0),
    explanation: z.string().min(1),
  })
  .refine((q) => q.answer < q.options.length, { message: 'answer out of range' });

export const Lesson = z.object({
  id,
  track: z.enum(['start', 'everyday', 'developer', 'github']),
  order: z.number().int().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  updatedAt: date,
  cover: ImageRef.optional(),
  blocks: z.array(Block).min(1),
  quiz: z.array(QuizQuestion).min(3).max(5),
});

export const PromptItem = z.object({
  id,
  category: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  when: z.string().min(1),
});

export const ErrorItem = z.object({
  id,
  errorText: z.string().min(1),
  appearsIn: z.enum(['claude-app', 'claude-code', 'api']),
  meaning: z.string().min(1),
  fixSteps: z.array(z.string().min(1)).min(1),
  sourceRef: z.string().min(1), // not shown to users
});

export const FeedItem = z.object({
  id,
  source: z.enum(['owner', 'claude-code', 'claude-api', 'help-center']),
  date,
  title: z.string().min(1),
  summary: z.string().min(1),
  originalEn: z.string().optional(),
  url: httpsUrl.optional(),
  image: ImageRef.optional(),
});

export const ComingSoonItem = z.object({
  id,
  title: z.string().min(1),
  description: z.string().min(1),
  expected: z.string().optional(),
  url: httpsUrl.optional(),
});

export const ContentIndex = z.object({
  formatVersion: z.number().int(),
  commit: z.string().regex(/^[0-9a-f]{7,40}$/),
  generatedAt: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      hash: z.string().length(16),
      kind: z.enum(['lesson', 'prompt', 'error', 'feed', 'coming-soon']),
    }),
  ),
});

export type TrackId = 'start' | 'everyday' | 'developer' | 'github';
export type ContentKind = 'lesson' | 'prompt' | 'error' | 'feed' | 'coming-soon';

export const KIND_DIRS: Record<ContentKind, string> = {
  lesson: 'lessons',
  prompt: 'prompts',
  error: 'errors',
  feed: 'feed',
  'coming-soon': 'coming-soon',
};

export const SCHEMA_BY_KIND: Record<ContentKind, ZodType> = {
  lesson: Lesson,
  prompt: PromptItem,
  error: ErrorItem,
  feed: FeedItem,
  'coming-soon': ComingSoonItem,
};

export type ImageRef = z.infer<typeof ImageRef>;
export type Block = z.infer<typeof Block>;
export type QuizQuestion = z.infer<typeof QuizQuestion>;
export type Lesson = z.infer<typeof Lesson>;
export type PromptItem = z.infer<typeof PromptItem>;
export type ErrorItem = z.infer<typeof ErrorItem>;
export type FeedItem = z.infer<typeof FeedItem>;
export type ComingSoonItem = z.infer<typeof ComingSoonItem>;
export type ContentIndex = z.infer<typeof ContentIndex>;
