import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholder = (val: string) =>
  !val ||
  val.includes('YOUR_SUPABASE') ||
  val.includes('YOUR_') ||
  val.includes('MY_SUPABASE') ||
  val.startsWith('<') ||
  val === 'undefined' ||
  val === 'null';

const isValidUrl = (urlStr: string) => {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isConfigured = Boolean(
  rawUrl && rawKey && !isPlaceholder(rawUrl) && !isPlaceholder(rawKey) && isValidUrl(rawUrl)
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
  const { data: rpcData, error } = await supabase.rpc('upsert_content_item', { p_id: 'feedback_submissions', p_data: data });
  if (!error) return { data: rpcData, error: null };
  return await supabase.from('content').upsert({ id: 'feedback_submissions', data, updated_at: new Date().toISOString() });
};

/**
 * Stored Procedure (RPC) Helper Functions
 * Executes PostgreSQL stored procedures with seamless direct table fallbacks.
 */
export const dbProcedure = {
  // 1. Content Stored Procedures
  async getAllContent() {
    const { data, error } = await supabase.rpc('get_all_content');
    if (!error && data) return { data, error: null };
    return await supabase.from('content').select('*');
  },

  async getContentSections(ids: string[]) {
    if (!ids.length) return { data: [], error: null };
    return await supabase
      .from('content')
      .select('id,data,updated_at')
      .in('id', ids);
  },

  async getContentById(id: string) {
    const { data, error } = await supabase.rpc('get_content_by_id', { p_id: id });
    if (!error && data) return { data: data[0] || null, error: null };
    const res = await supabase.from('content').select('*').eq('id', id).single();
    return res;
  },

  async upsertContentItem(id: string, data: any) {
    const { data: rpcData, error } = await supabase.rpc('upsert_content_item', { p_id: id, p_data: data });
    if (!error) return { data: rpcData, error: null };
    return await supabase.from('content').upsert({ id, data, updated_at: new Date().toISOString() });
  },

  // 2. Posts Stored Procedures
  async getPublishedPosts() {
    const { data, error } = await supabase.rpc('get_published_posts');
    if (!error && data) return { data, error: null };
    return await supabase.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
  },

  async getAllPosts() {
    const { data, error } = await supabase.rpc('get_all_posts');
    if (!error && data) return { data, error: null };
    return await supabase.from('posts').select('*').order('updated_at', { ascending: false });
  },

  async getPostBySlug(slug: string) {
    const { data, error } = await supabase.rpc('get_post_by_slug', { p_slug: slug });
    if (!error && data) return { data: data[0] || null, error: null };
    return await supabase.from('posts').select('*').eq('slug', slug).single();
  },

  // 3. Portfolio Stored Procedures
  async getPublishedPortfolioItems() {
    const { data, error } = await supabase.rpc('get_published_portfolio_items');
    if (!error && data) return { data, error: null };
    return await supabase.from('portfolio_items').select('*').eq('status', 'published').order('created_at', { ascending: false });
  },

  async getAllPortfolioItems() {
    const { data, error } = await supabase.rpc('get_all_portfolio_items');
    if (!error && data) return { data, error: null };
    return await supabase.from('portfolio_items').select('*').order('created_at', { ascending: false });
  },

  async getPortfolioItemBySlug(slug: string) {
    const { data, error } = await supabase.rpc('get_portfolio_item_by_slug', { p_slug: slug });
    if (!error && data) return { data: data[0] || null, error: null };
    return await supabase.from('portfolio_items').select('*').eq('slug', slug).single();
  },

  // 4. Process Steps Stored Procedures
  async getProcessSteps() {
    const { data, error } = await supabase.rpc('get_process_steps');
    if (!error && data) return { data, error: null };
    return await supabase.from('process_steps').select('*').order('order_index', { ascending: true });
  },

  // 5. Pages Stored Procedures
  async getAllPages() {
    const { data, error } = await supabase.rpc('get_all_pages');
    if (!error && data) return { data, error: null };
    return await supabase.from('pages').select('*').order('updated_at', { ascending: false });
  },

  async getPageBySlug(slug: string) {
    const { data, error } = await supabase.rpc('get_page_by_slug', { p_slug: slug });
    if (!error && data) return { data: data[0] || null, error: null };
    return await supabase.from('pages').select('*').eq('slug', slug).single();
  },

  // 6. Media Assets Stored Procedures
  async getMediaAssets() {
    const { data, error } = await supabase.rpc('get_media_assets');
    if (!error && data) return { data, error: null };
    const res = await supabase.from('media').select('*').order('created_at', { ascending: false });
    if (!res.error && res.data) return res;
    const { getStoredMediaAssets } = await import('./mediaStore');
    const local = await getStoredMediaAssets();
    return { data: local, error: null };
  }
};
