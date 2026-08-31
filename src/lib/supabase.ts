import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

const isPlaceholder = (val: string) =>
  !val ||
  val.includes('YOUR_SUPABASE') ||
  val.includes('YOUR_') ||
  val.includes('MY_SUPABASE') ||
  val.startsWith('<') ||
  val === 'undefined' ||
  val === 'null';

const legacyJwtRole = (val: string) => {
  try {
    const payload = val.split('.')[1];
    if (!payload) return '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')));
    return String(decoded?.role || '');
  } catch {
    return '';
  }
};

const isValidPublicKey = (val: string) =>
  /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(val) ||
  (/^eyJ[A-Za-z0-9._-]{100,}$/.test(val) && legacyJwtRole(val) === 'anon');

const isValidUrl = (urlStr: string) => {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !isPlaceholder(rawUrl) &&
  !isPlaceholder(rawKey) &&
  isValidUrl(rawUrl) &&
  isValidPublicKey(rawKey)
);

let clientInstance: any = null;

if (isConfigured) {
  try {
    clientInstance = createClient(rawUrl, rawKey);
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
  }
}

const createMockQueryBuilder = (): any => {
  const builder: any = {
    select: () => builder,
    insert: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
    upsert: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
    update: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
    delete: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    single: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
    then: (resolve: any) => resolve({ data: null, error: new Error('Supabase is not configured.') }),
  };
  return builder;
};

const mockSupabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => {},
        },
      },
    }),
    updateUser: async () => ({ data: { user: null }, error: new Error('Supabase is not configured.') }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: null, error: new Error('Supabase is not configured. Please configure Supabase in environment variables.') }),
    signUp: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
    signInWithOAuth: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
  },
  from: () => createMockQueryBuilder(),
  rpc: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
  channel: () => ({
    on: function () { return this; },
    subscribe: function () { return this; },
  }),
  removeChannel: () => {},
};

export const supabase = clientInstance || (mockSupabase as any);
export const isSupabaseConfigured = Boolean(clientInstance);

export const submitPublicFeedback = async (data: any) => {
  return await supabase.rpc('submit_public_feedback', { p_feedback: data });
};

/**
 * Database helper functions. Use direct table reads for canonical tables and
 * RPCs only where the corresponding server function is part of the schema.
 */
export const dbProcedure = {
  // 1. Content Stored Procedures
  async getAllContent() {
    return await supabase.from('content').select('*');
  },

  async getContentSections(ids: string[]) {
    if (!ids.length) return { data: [], error: null };
    return await supabase
      .from('content')
      .select('id,data,updated_at')
      .in('id', ids);
  },

  async getPublicFeedback() {
    return await supabase.rpc('get_public_feedback');
  },

  async getContentById(id: string) {
    return await supabase.from('content').select('*').eq('id', id).maybeSingle();
  },

  async upsertContentItem(id: string, data: any) {
    return await supabase.from('content').upsert({ id, data, updated_at: new Date().toISOString() });
  },

  // 2. Posts Stored Procedures
  async getPublishedPosts() {
    return await supabase.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
  },

  async getAllPosts() {
    return await supabase.from('posts').select('*').order('updated_at', { ascending: false });
  },

  async getPostBySlug(slug: string) {
    return await supabase.from('posts').select('*').eq('slug', slug).maybeSingle();
  },

  // 3. Portfolio Stored Procedures
  async getPublishedPortfolioItems() {
    const { data: row, error } = await supabase
      .from('content')
      .select('data')
      .eq('id', 'portfolio_items')
      .maybeSingle();
    if (error) return { data: null, error };
    const items = Array.isArray(row?.data) ? row.data : [];
    return { data: items.filter((item: any) => item?.status === 'published' || !item?.status), error: null };
  },

  async getAllPortfolioItems() {
    const { data: row, error } = await supabase
      .from('content')
      .select('data')
      .eq('id', 'portfolio_items')
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: Array.isArray(row?.data) ? row.data : [], error: null };
  },

  async getPortfolioItemBySlug(slug: string) {
    const { data, error } = await this.getAllPortfolioItems();
    if (error) return { data: null, error };
    return { data: data?.find((item: any) => item?.slug === slug) || null, error: null };
  },

  // 5. Pages Stored Procedures
  async getAllPages() {
    return await supabase.from('pages').select('*').order('updated_at', { ascending: false });
  },

  async getPageBySlug(slug: string) {
    return await supabase.from('pages').select('*').eq('slug', slug).maybeSingle();
  },

  // 6. Media Assets Stored Procedures
  async getMediaAssets() {
    const res = await supabase.from('media').select('*').order('created_at', { ascending: false });
    if (!res.error && res.data) return res;
    const { getStoredMediaAssets } = await import('./mediaStore');
    const local = await getStoredMediaAssets();
    return { data: local, error: null };
  }
};
