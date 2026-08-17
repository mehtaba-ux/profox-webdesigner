import { BlogPost, BlogCategory } from '../types';
import { supabase } from './supabase';
import { howToChooseWebDesignCompanyPost } from '../data/howToChoosePost';
import { defaultWebsiteCostPost } from '../data/defaultPost';
import { signsWebsiteNeedsRedesignPost } from '../data/redesignPost';
import { wordpressVsCustomWebsitePost } from '../data/wordpressVsCustomPost';
import { formatR2ImageUrl } from './r2Media';

const BLOG_STORAGE_KEY = 'profox_blog_posts_store_v2';
const BLOG_CATEGORIES_KEY = 'profox_blog_categories_store_v2';

export const defaultBlogPosts: BlogPost[] = [
  howToChooseWebDesignCompanyPost,
  defaultWebsiteCostPost,
  wordpressVsCustomWebsitePost,
  signsWebsiteNeedsRedesignPost,
];

export const defaultBlogCategories: BlogCategory[] = [
  { id: 'cat-1', name: 'Web Design & Pricing', slug: 'web-design-pricing', description: 'Guides and cost analysis for website design projects' },
  { id: 'cat-2', name: 'Strategic Insights', slug: 'strategic-insights', description: 'Industry insights and vendor selection strategies' },
  { id: 'cat-3', name: 'SEO & Performance', slug: 'seo-performance', description: 'Search ranking, conversion optimization, and core web vitals' },
  { id: 'cat-4', name: 'Case Studies', slug: 'case-studies', description: 'Detailed breakdowns of client outcomes and system transformations' },
];

/**
 * Reads locally stored blog posts from localStorage
 */
export function getLocalStoredPosts(): BlogPost[] {
  try {
    const raw = localStorage.getItem(BLOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to parse locally stored blog posts:', err);
    return [];
  }
}

/**
 * Saves blog posts array to localStorage
 */
export function saveLocalStoredPosts(posts: BlogPost[]): void {
  try {
    localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(posts));
  } catch (err) {
    console.error('Failed to save blog posts to localStorage:', err);
  }
}

/**
 * Reads locally stored categories
 */
export function getLocalStoredCategories(): BlogCategory[] {
  try {
    const raw = localStorage.getItem(BLOG_CATEGORIES_KEY);
    if (!raw) return defaultBlogCategories;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultBlogCategories;
  } catch {
    return defaultBlogCategories;
  }
}

/**
 * Saves categories to localStorage
 */
export function saveLocalStoredCategories(categories: BlogCategory[]): void {
  try {
    localStorage.setItem(BLOG_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (err) {
    console.error('Failed to save categories to localStorage:', err);
  }
}

/**
 * Fetch all blog posts from Supabase with resilient fallback to local storage and defaults.
 */
export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const localPosts = getLocalStoredPosts();
  let dbPosts: BlogPost[] = [];

  try {
    const { data: postsData, error } = await supabase
      .from('posts')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && Array.isArray(postsData) && postsData.length > 0) {
      dbPosts = postsData.map((post: any) => {
        const seoData = post.seo || {};
        return {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content || '',
          excerpt: post.excerpt || '',
          featuredImage: formatR2ImageUrl(post.cover_image || post.featured_image || ''),
          category: post.category || 'Insights',
          tags: post.tags || [],
          status: post.status || 'published',
          author: seoData._author || post.author || { name: 'Mehtab Ansari' },
          highlights: seoData._highlights || post.highlights || [],
          faq: seoData._faq || post.faq || [],
          seo: {
            metaTitle: seoData.metaTitle || '',
            metaDescription: seoData.metaDescription || '',
            focusKeyword: seoData.focusKeyword || '',
            canonicalUrl: seoData.canonicalUrl || '',
            ogTitle: seoData.ogTitle || '',
            ogDescription: seoData.ogDescription || '',
            ogImage: seoData.ogImage || '',
            noIndex: seoData.noIndex || false,
            schemaType: seoData.schemaType || 'Article',
          },
          createdAt: post.created_at || post.updated_at || new Date().toISOString(),
          updatedAt: post.updated_at || new Date().toISOString(),
          publishedAt: post.published_at,
        } as BlogPost;
      });
    }
  } catch (err) {
    console.warn('Database fetch for posts failed, using local store:', err);
  }

  // Merge Priority: Local overrides > Database posts > Default seed posts
  const postMap = new Map<string, BlogPost>();

  // 1. Seed defaults first
  for (const dp of defaultBlogPosts) {
    postMap.set(dp.slug, dp);
  }

  // 2. Overlay DB posts
  for (const dbp of dbPosts) {
    postMap.set(dbp.slug, dbp);
  }

  // 3. Overlay Local posts (latest edits from user)
  for (const lp of localPosts) {
    postMap.set(lp.slug, lp);
  }

  const result = Array.from(postMap.values());
  // Sort by updatedAt or publishedAt descending
  result.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  
  return result;
}

/**
 * Fetch a single post by slug
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  const allPosts = await getAllBlogPosts();
  const found = allPosts.find((p) => p.slug === slug || p.id === slug);
  if (found) return found;

  // Fallback check
  if (slug === 'how-to-choose-a-web-design-company') return howToChooseWebDesignCompanyPost;
  if (slug === 'how-much-does-a-website-cost') return defaultWebsiteCostPost;
  if (slug === 'wordpress-vs-custom-website') return wordpressVsCustomWebsitePost;

  return null;
}

/**
 * Saves or updates a blog post across localStorage and Supabase.
 */
export async function saveBlogPost(post: Partial<BlogPost> & { title: string }): Promise<{ success: boolean; post: BlogPost; error?: any }> {
  const now = new Date().toISOString();
  const slug = post.slug || post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = post.id || `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const finalPost: BlogPost = {
    id,
    title: post.title,
    slug,
    content: post.content || '',
    excerpt: post.excerpt || '',
    featuredImage: formatR2ImageUrl(post.featuredImage || ''),
    category: post.category || 'Web Design & Pricing',
    tags: post.tags || [],
    status: post.status || 'published',
    author: post.author || { name: 'Mehtab Ansari', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200' },
    highlights: post.highlights || [],
    faq: post.faq || [],
    seo: post.seo || {
      metaTitle: post.title,
      metaDescription: post.excerpt || '',
      focusKeyword: '',
      canonicalUrl: '',
      ogTitle: post.title,
      ogDescription: post.excerpt || '',
      ogImage: post.featuredImage || '',
      noIndex: false,
      schemaType: 'Article',
    },
    createdAt: post.createdAt || now,
    updatedAt: now,
    publishedAt: post.status === 'published' ? (post.publishedAt || now) : undefined,
  };

  // 1. Immediately persist to LocalStorage
  try {
    const existing = getLocalStoredPosts();
    const existingIndex = existing.findIndex((p) => p.id === finalPost.id || p.slug === finalPost.slug);
    if (existingIndex >= 0) {
      existing[existingIndex] = finalPost;
    } else {
      existing.unshift(finalPost);
    }
    saveLocalStoredPosts(existing);
  } catch (localErr) {
    console.error('Failed to save post locally:', localErr);
  }

  // 2. Attempt Supabase background sync
  try {
    const dbData: any = {
      title: finalPost.title,
      slug: finalPost.slug,
      content: finalPost.content,
      excerpt: finalPost.excerpt,
      cover_image: finalPost.featuredImage,
      category: finalPost.category,
      tags: finalPost.tags,
      status: finalPost.status,
      author_id: 'admin',
      seo: {
        ...finalPost.seo,
        _author: finalPost.author,
        _highlights: finalPost.highlights,
        _faq: finalPost.faq,
      },
      updated_at: now,
      published_at: finalPost.publishedAt || null,
    };

    // Try upsert by slug first
    const { error: upsertErr } = await supabase
      .from('posts')
      .upsert(dbData, { onConflict: 'slug' });

    if (upsertErr) {
      console.warn('Supabase upsert by slug returned error (fallback to local success):', upsertErr);
    }
  } catch (dbErr) {
    console.warn('Supabase sync warning (data safely preserved locally):', dbErr);
  }

  return { success: true, post: finalPost };
}

/**
 * Deletes a blog post
 */
export async function deleteBlogPost(idOrSlug: string): Promise<boolean> {
  try {
    const existing = getLocalStoredPosts();
    const filtered = existing.filter((p) => p.id !== idOrSlug && p.slug !== idOrSlug);
    saveLocalStoredPosts(filtered);
  } catch (err) {
    console.error('Local delete failed:', err);
  }

  try {
    await supabase.from('posts').delete().eq('slug', idOrSlug);
  } catch (err) {
    console.warn('Supabase delete failed:', err);
  }

  return true;
}

/**
 * Bulk delete blog posts
 */
export async function bulkDeleteBlogPosts(idsOrSlugs: string[]): Promise<boolean> {
  try {
    const existing = getLocalStoredPosts();
    const filtered = existing.filter((p) => !idsOrSlugs.includes(p.id) && !idsOrSlugs.includes(p.slug));
    saveLocalStoredPosts(filtered);
  } catch (err) {
    console.error('Local bulk delete failed:', err);
  }

  try {
    await supabase.from('posts').delete().in('slug', idsOrSlugs);
  } catch (err) {
    console.warn('Supabase bulk delete failed:', err);
  }

  return true;
}
