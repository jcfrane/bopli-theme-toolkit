import type {
    ContentFieldType,
    JsonObject,
    ThemeDefinition,
    ThemeSetting,
    ThemeTemplate,
} from './types.js';

export type PreviewTemplateFixture = {
    handle: string;
    name: string;
    kind: ThemeTemplate['kind'];
    props: JsonObject;
};

export type PreviewFixture = {
    theme: { handle: string; name: string };
    settings: Record<string, string | boolean | JsonObject | null>;
    settingDefinitions: ThemeDefinition['settings'];
    templates: PreviewTemplateFixture[];
    content: Record<string, JsonObject[]>;
};

type StarterModel = JsonObject & {
    handle: string;
    fields: JsonObject[];
    publicRoute?: JsonObject;
};

const PREVIEW_DATE = '2026-01-15T09:00:00.000Z';
const PREVIEW_IMAGE = {
    url: `data:image/svg+xml,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><rect width="1200" height="675" fill="#e2e8f0"/><text x="600" y="338" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="sans-serif" font-size="52">Bopli preview</text></svg>',
    )}`,
    alt: 'Bopli theme preview placeholder',
    width: 1200,
    height: 675,
};

export function previewFixtureFor(theme: ThemeDefinition): PreviewFixture {
    const settings = Object.fromEntries(
        Object.entries(theme.settings).map(([handle, setting]) => [
            handle,
            previewSettingDefault(setting),
        ]),
    );
    const site = previewSite(theme);
    const models = starterModels(theme);
    const entries = starterEntries(theme, models);
    const pages = starterPages(theme);
    const blogPosts = previewBlogPosts(entries);
    const templates = Object.entries(theme.templates).map(([handle, template]) => ({
        handle,
        name: template.name,
        kind: template.kind,
        props: templateProps(handle, template, theme, site, settings, models, entries, pages, blogPosts),
    }));

    return {
        theme: { handle: theme.handle, name: theme.name },
        settings,
        settingDefinitions: theme.settings,
        templates,
        content: {
            pages,
            'blog.posts': blogPosts,
            'blog.categories': [{ name: 'Announcements', slug: 'announcements' }],
            'blog.tags': [{ name: 'Getting started', slug: 'getting-started' }],
            'content.entries': entries,
            'content.taxonomies': [],
            'content.terms': [],
        },
    };
}

function previewSettingDefault(setting: ThemeSetting): string | boolean | JsonObject | null {
    if (setting.type !== 'image') return setting.default;

    return setting.default === null ? null : PREVIEW_IMAGE;
}

function previewSite(theme: ThemeDefinition): JsonObject {
    return {
        name: theme.name,
        handle: theme.handle,
        tagline: 'A local preview of your Bopli theme.',
        description: theme.description ?? `Starter content for ${theme.name}.`,
        socialLinks: [],
        canonicalUrl: 'http://localhost/',
        owner: { name: theme.author ?? 'Theme author', profileImage: null },
    };
}

function starterModels(theme: ThemeDefinition): Map<string, StarterModel> {
    return new Map(
        (theme.starter?.contentModels ?? []).flatMap((value) => {
            const handle = typeof value.handle === 'string' ? value.handle : null;
            if (!handle) return [];

            return [[handle, value as StarterModel]];
        }),
    );
}

function starterPages(theme: ThemeDefinition): JsonObject[] {
    return (theme.starter?.pages ?? []).map((page) => ({
        title: stringValue(page.title, 'Preview page'),
        path: stringValue(page.path, '/'),
        fields: objectValue(page.data),
        seoTitle: nullableString(page.seoTitle),
        seoDescription: nullableString(page.seoDescription),
        __template: stringValue(page.template, ''),
    }));
}

function starterEntries(
    theme: ThemeDefinition,
    models: Map<string, StarterModel>,
): JsonObject[] {
    return (theme.starter?.entries ?? []).map((entry, index) => {
        const modelHandle = stringValue(entry.model, 'content');
        const model = models.get(modelHandle);
        const slug = stringValue(entry.slug, `preview-entry-${index + 1}`);
        const fields = objectValue(entry.data);

        return {
            title: stringValue(entry.title, `Preview entry ${index + 1}`),
            slug,
            url: routeFor(model?.publicRoute, slug),
            publishedAt: PREVIEW_DATE,
            terms: {},
            fields,
            __model: modelHandle,
        };
    });
}

function previewBlogPosts(entries: JsonObject[]): JsonObject[] {
    const source = entries.length > 0 ? entries : [{ title: 'Welcome', slug: 'welcome' }];

    return source.map((entry, index) => ({
        title: stringValue(entry.title, `Preview post ${index + 1}`),
        slug: stringValue(entry.slug, `preview-post-${index + 1}`),
        url: `/blog/${stringValue(entry.slug, `preview-post-${index + 1}`)}`,
        excerpt: firstText(objectValue(entry.fields)) ?? 'A sample post rendered by the standalone preview.',
        publishedAt: PREVIEW_DATE,
        readingTimeMinutes: 3,
        coverImage: PREVIEW_IMAGE,
        categories: [{ name: 'Announcements', slug: 'announcements' }],
        tags: [{ name: 'Getting started', slug: 'getting-started' }],
    }));
}

function templateProps(
    handle: string,
    template: ThemeTemplate,
    theme: ThemeDefinition,
    site: JsonObject,
    settings: Record<string, string | boolean | JsonObject | null>,
    models: Map<string, StarterModel>,
    entries: JsonObject[],
    pages: JsonObject[],
    blogPosts: JsonObject[],
): JsonObject {
    const shared = { site, settings, preview: true };

    if (template.kind === 'page') {
        const page = pages.find((candidate) => candidate.__template === handle) ?? {
            title: template.name,
            path: handle === 'home' ? '/' : `/${handle}`,
            fields: { body: `Preview content for the ${template.name} template.` },
            seoTitle: null,
            seoDescription: null,
        };

        return { ...shared, page: publicValue(page) };
    }

    if (template.kind === 'entry') {
        return {
            ...shared,
            entry: previewEntry(handle, template, models, entries),
        };
    }

    if (template.kind === 'blog_index') {
        return {
            ...shared,
            blog: {
                path: '/blog',
                title: 'Blog',
                seoTitle: `${theme.name} Blog`,
                seoDescription: 'Blog content rendered by the standalone preview.',
            },
            posts: paginatedProps(blogPosts),
            filters: { q: '', category: '', tag: '' },
            categories: [
                { name: 'Announcements', slug: 'announcements', parentSlug: null },
            ],
            tags: [{ name: 'Getting started', slug: 'getting-started' }],
        };
    }

    const post = blogPosts[0] ?? {};
    return {
        ...shared,
        post: {
            ...post,
            body: '<p>This is sample blog content rendered by the standalone preview.</p>',
            canonicalPath: stringValue(post.url, '/blog/welcome'),
            seoTitle: nullableString(post.title),
            seoDescription: nullableString(post.excerpt),
            previous: null,
            next: blogPosts[1] ?? null,
        },
    };
}

function previewEntry(
    handle: string,
    template: ThemeTemplate,
    models: Map<string, StarterModel>,
    entries: JsonObject[],
): JsonObject {
    const route = [...models.values()].find(
        (model) => model.publicRoute?.template === handle,
    )?.publicRoute;
    const modelHandle = [...models.values()].find(
        (model) => model.publicRoute?.template === handle,
    )?.handle;
    const starter =
        entries.find((entry) => entry.__model === modelHandle) ?? entries[0] ?? {};
    const starterFields = objectValue(starter.fields);
    const fieldMap = objectValue(route?.fieldMap);
    const fields = Object.fromEntries(
        Object.entries(template.fields ?? {}).map(([fieldHandle, field]) => {
            const source = typeof fieldMap[fieldHandle] === 'string' ? fieldMap[fieldHandle] : fieldHandle;
            return [
                fieldHandle,
                starterFields[source] ?? previewFieldValue(field.type, field.name),
            ];
        }),
    );
    const slug = stringValue(starter.slug, `${handle}-preview`);

    return {
        title: stringValue(starter.title, template.name),
        slug,
        url: stringValue(starter.url, `/${slug}`),
        canonicalPath: stringValue(starter.url, `/${slug}`),
        publishedAt: PREVIEW_DATE,
        terms: {},
        seoTitle: null,
        seoDescription: null,
        ...fields,
    };
}

function previewFieldValue(type: ContentFieldType, name: string): unknown {
    if (type === 'number') return 42;
    if (type === 'boolean') return true;
    if (type === 'date_time') return PREVIEW_DATE;
    if (type === 'image') return PREVIEW_IMAGE;
    if (type === 'json') return {};
    if (type === 'relationship') return [];
    if (type === 'rich_text') return `<p>Preview value for ${name}.</p>`;
    if (type === 'slug') return 'preview-value';

    return `Preview value for ${name}.`;
}

function paginatedProps(data: JsonObject[]): JsonObject {
    return {
        data,
        currentPage: 1,
        lastPage: 1,
        perPage: Math.max(data.length, 1),
        total: data.length,
        previousUrl: null,
        nextUrl: null,
    };
}

function routeFor(route: JsonObject | undefined, slug: string): string {
    return typeof route?.path === 'string' ? route.path.replace('{slug}', slug) : `/${slug}`;
}

function firstText(value: JsonObject): string | null {
    const text = Object.values(value).find((item) => typeof item === 'string');

    return typeof text === 'string' ? text.replace(/<[^>]+>/g, '').slice(0, 240) : null;
}

function publicValue(value: JsonObject): JsonObject {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('__')));
}

function objectValue(value: unknown): JsonObject {
    return value && !Array.isArray(value) && typeof value === 'object'
        ? (value as JsonObject)
        : {};
}

function stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
