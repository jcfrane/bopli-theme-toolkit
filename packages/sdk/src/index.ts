import {
    inject,
    onScopeDispose,
    onServerPrefetch,
    shallowRef,
    type InjectionKey,
    type Ref,
} from 'vue';

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
    owner: {
        name: string;
        profileImage: BopliImage | null;
    } | null;
};

export type BopliPage<TFields extends Record<string, unknown> = Record<string, unknown>> = {
    title: string;
    path: string;
    fields: TFields;
    seoTitle: string | null;
    seoDescription: string | null;
};

export type BopliTerm = { name: string; slug: string };

export type BopliThemeSettingValue = string | boolean | BopliImage | null;
export type BopliThemeSettings = Record<string, BopliThemeSettingValue>;

export type BopliPublicEntry<TFields extends Record<string, unknown> = Record<string, unknown>> = {
    title: string;
    slug: string;
    url: string | null;
    publishedAt: string | null;
    terms: Record<string, BopliTerm[]>;
} & TFields;

export type BopliQueriedEntry<
    TFields extends Record<string, unknown> = Record<string, unknown>,
> = BopliPublicEntry & {
    fields: TFields;
};

export type BopliPageProps<
    TFields extends Record<string, unknown> = Record<string, unknown>,
> = {
    site: BopliSite;
    page: BopliPage<TFields>;
    settings: BopliThemeSettings;
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
    settings: BopliThemeSettings;
    preview?: boolean;
};

export type BopliBlogTerm = { name: string; slug: string };

export type BopliBlogPostSummary = {
    title: string | null;
    slug: string | null;
    url: string | null;
    excerpt: string | null;
    publishedAt: string | null;
    readingTimeMinutes: number;
    coverImage: BopliImage | null;
    categories: BopliBlogTerm[];
    tags: BopliBlogTerm[];
};

export type BopliBlogIndexProps = {
    site: BopliSite;
    settings: BopliThemeSettings;
    blog: { path: '/blog'; title: string; seoTitle: string | null; seoDescription: string | null };
    posts: {
        data: BopliBlogPostSummary[];
        currentPage: number;
        lastPage: number;
        perPage: number;
        total: number;
        previousUrl: string | null;
        nextUrl: string | null;
    };
    filters: { q: string; category: string; tag: string };
    categories: Array<BopliBlogTerm & { parentSlug: string | null }>;
    tags: BopliBlogTerm[];
};

export type BopliBlogPostProps = {
    site: BopliSite;
    settings: BopliThemeSettings;
    post: BopliBlogPostSummary & {
        body: string;
        canonicalPath: string | null;
        seoTitle: string | null;
        seoDescription: string | null;
        previous: BopliBlogPostSummary | null;
        next: BopliBlogPostSummary | null;
    };
    preview?: boolean;
};

export type BopliNavigation = {
    visit(url: string): void;
};

export type BopliContentSource =
    | 'pages'
    | 'blog.posts'
    | 'blog.categories'
    | 'blog.tags'
    | 'content.entries'
    | 'content.taxonomies'
    | 'content.terms'
    | (string & {});

export type BopliContentQuery = {
    source: BopliContentSource;
    model?: string;
    taxonomy?: string;
    fields?: string[];
    filter?: Record<string, string | number | boolean>;
    sort?: string;
    limit?: number;
    page?: number;
};

export type BopliContentMeta = {
    currentPage: number;
    lastPage: number;
    perPage: number;
    total: number;
};

export type BopliContentLinks = {
    previous: string | null;
    next: string | null;
};

export type BopliContentResponse<T> = {
    data: T[];
    meta: BopliContentMeta;
    links: BopliContentLinks;
};

export type BopliContentClient = {
    query<T>(query: BopliContentQuery, options?: { signal?: AbortSignal }): Promise<BopliContentResponse<T>>;
};

export type BopliQueryState<T> = {
    data: Readonly<Ref<T[]>>;
    meta: Readonly<Ref<BopliContentMeta | null>>;
    links: Readonly<Ref<BopliContentLinks | null>>;
    loading: Readonly<Ref<boolean>>;
    error: Readonly<Ref<Error | null>>;
    refresh(): Promise<void>;
};

export type BopliThemeMountPayload = {
    element: HTMLElement;
    template: string;
    props: Record<string, unknown>;
    navigation: BopliNavigation;
    content: BopliContentClient;
};

export type BopliThemeSession = {
    update(payload: { template: string; props: Record<string, unknown> }): void;
    unmount(): void;
};

export type BopliThemeModule = {
    runtimeApiVersion: number;
    mount(payload: BopliThemeMountPayload): BopliThemeSession;
};

export type BopliThemeServerRenderPayload = {
    template: string;
    props: Record<string, unknown>;
    content: BopliContentClient;
};

export type BopliThemeServerModule = {
    runtimeApiVersion: number;
    render(payload: BopliThemeServerRenderPayload): Promise<string>;
};

export const BOPLI_NAVIGATION_KEY: InjectionKey<BopliNavigation> = Symbol.for(
    'bopli.theme.navigation',
) as InjectionKey<BopliNavigation>;

export const BOPLI_CONTENT_KEY: InjectionKey<BopliContentClient> = Symbol.for(
    'bopli.theme.content',
) as InjectionKey<BopliContentClient>;

export function useBopliNavigation(): BopliNavigation {
    const navigation = inject(BOPLI_NAVIGATION_KEY);

    if (!navigation) {
        throw new Error('Bopli theme navigation is only available inside the theme runtime.');
    }

    return navigation;
}

export function useBopliContent(): BopliContentClient {
    const content = inject(BOPLI_CONTENT_KEY);

    if (!content) {
        throw new Error('Bopli theme content is only available inside the theme runtime.');
    }

    return content;
}

export function useBopliQuery<T = Record<string, unknown>>(query: BopliContentQuery): BopliQueryState<T> {
    const content = useBopliContent();
    const data = shallowRef<T[]>([]);
    const meta = shallowRef<BopliContentMeta | null>(null);
    const links = shallowRef<BopliContentLinks | null>(null);
    const loading = shallowRef(true);
    const error = shallowRef<Error | null>(null);
    let controller: AbortController | null = null;

    const refresh = async (): Promise<void> => {
        controller?.abort();
        const requestController = new AbortController();
        controller = requestController;
        loading.value = true;
        error.value = null;

        try {
            const response = await content.query<T>(query, { signal: requestController.signal });
            data.value = response.data;
            meta.value = response.meta;
            links.value = response.links;
        } catch (reason) {
            if (requestController.signal.aborted) return;
            error.value = reason instanceof Error ? reason : new Error('Bopli content query failed.');
        } finally {
            if (!requestController.signal.aborted) loading.value = false;
        }
    };

    const initial = refresh();
    onServerPrefetch(() => initial);
    onScopeDispose(() => controller?.abort());

    return {
        data,
        meta,
        links,
        loading,
        error,
        refresh,
    };
}
