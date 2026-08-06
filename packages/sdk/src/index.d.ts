import type { InjectionKey } from 'vue';

export type BopliImage = {
    url: string;
    alt: string | null;
    width: number | null;
    height: number | null;
};

export type BopliSite = {
    name: string;
    handle: string;
    tagline?: string | null;
    description?: string | null;
    socialLinks?: Array<{ label: string; url: string }>;
    canonicalUrl: string;
};

export type BopliPage<TFields extends Record<string, unknown> = Record<string, unknown>> = {
    title: string;
    path: string;
    fields: TFields;
    seoTitle: string | null;
    seoDescription: string | null;
};

export type BopliTerm = { name: string; slug: string };

export type BopliPublicEntry<TFields extends Record<string, unknown> = Record<string, unknown>> = {
    title: string;
    slug: string;
    url: string | null;
    publishedAt: string | null;
    terms: Record<string, BopliTerm[]>;
} & TFields;

export type BopliPageProps<
    TSlots extends Record<string, BopliPublicEntry[]> = Record<string, BopliPublicEntry[]>,
    TFields extends Record<string, unknown> = Record<string, unknown>,
> = {
    site: BopliSite;
    page: BopliPage<TFields>;
    slots: TSlots;
    preview?: boolean;
};

export type BopliEntryProps<
    TEntry extends BopliPublicEntry = BopliPublicEntry & {
        canonicalPath: string;
        seoTitle: string;
        seoDescription: unknown;
    },
> = {
    site: BopliSite;
    entry: TEntry;
    preview?: boolean;
};

export type BopliNavigation = {
    visit(url: string): void;
};

export type BopliThemeMountPayload = {
    element: HTMLElement;
    template: string;
    props: Record<string, unknown>;
    navigation: BopliNavigation;
};

export type BopliThemeSession = {
    update(payload: { template: string; props: Record<string, unknown> }): void;
    unmount(): void;
};

export type BopliThemeModule = {
    runtimeApiVersion: number;
    mount(payload: BopliThemeMountPayload): BopliThemeSession;
};

export const BOPLI_NAVIGATION_KEY: InjectionKey<BopliNavigation>;
export function useBopliNavigation(): BopliNavigation;
