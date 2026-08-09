import type {
    BopliEntryProps,
    BopliPageProps,
    BopliPublicEntry,
} from '@bopli/theme-sdk';

type StarterEntry = BopliPublicEntry<{ body: string }> & {
    canonicalPath: string;
    seoTitle: string;
    seoDescription: string | null;
};

export type StarterPageProps = BopliPageProps<
    Record<string, never[]>,
    { body?: string }
>;

export type StarterEntryProps = BopliEntryProps<StarterEntry>;
