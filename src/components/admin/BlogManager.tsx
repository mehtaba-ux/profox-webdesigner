import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Eye, 
  Check, 
  X, 
  Clock, 
  FileText, 
  Tag, 
  ChevronRight,
  Save,
  Globe,
  Settings,
  Image as ImageIcon,
  Layout,
  BarChart,
  User,
  ArrowLeft,
  Calendar,
  Share2,
  MessageSquare,
  CopyPlus
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from './ConfirmDialog';
import { useConfirm } from './useConfirm';
import { BlogPost, BlogCategory, SEOConfig } from '../../types';
import ImageUploader from './ImageUploader';
import AdvancedArticleEditor from './AdvancedArticleEditor';

export default function BlogManager() {
  const { confirmState, confirm: confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');

  const [searchParams, setSearchParams] = useSearchParams();

  // Category management state
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catError, setCatError] = useState('');
  const [catSubmitting, setCatSubmitting] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const fetchCategories = async () => {
    try {
      const { data: catsData, error: catsError } = await supabase
        .from('blog_categories')
        .select('*')
        .order('name', { ascending: true });
      
      if (catsError) throw catsError;
      setCategories(catsData || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleNameChange = (val: string) => {
    setCatName(val);
    if (!catEditingId && !isSlugManuallyEdited) {
      setCatSlug(generateSlug(val));
    }
  };

  const handleSlugChange = (val: string) => {
    setCatSlug(generateSlug(val));
    setIsSlugManuallyEdited(true);
  };

  const handleCreateOrUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError('');
    if (!catName.trim()) {
      setCatError('Category name is required');
      return;
    }
    const finalSlug = catSlug.trim() || generateSlug(catName);
    if (!finalSlug) {
      setCatError('Category slug is invalid');
      return;
    }

    setCatSubmitting(true);
    try {
      if (catEditingId) {
        // Update existing category
        const { error } = await supabase
          .from('blog_categories')
          .update({
            name: catName.trim(),
            slug: finalSlug,
            description: catDesc.trim()
          })
          .eq('id', catEditingId);

        if (error) throw error;
      } else {
        // Create new category
        const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
        const { error } = await supabase
          .from('blog_categories')
          .insert({
            id: newId,
            name: catName.trim(),
            slug: finalSlug,
            description: catDesc.trim()
          });

        if (error) throw error;
      }

      // Reset form
      setCatName('');
      setCatSlug('');
      setCatDesc('');
      setCatEditingId(null);
      setIsSlugManuallyEdited(false);
      await fetchCategories();
    } catch (err: any) {
      console.error('Error saving category:', err);
      setCatError(err.message || 'Failed to save category. Make sure the slug is unique.');
    } finally {
      setCatSubmitting(false);
    }
  };

  const handleEditCategory = (cat: BlogCategory) => {
    setCatEditingId(cat.id);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatDesc(cat.description || '');
    setCatError('');
    setIsSlugManuallyEdited(true);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (await confirmAction('Delete Category', `Are you sure you want to delete the category "${name}"? Posts in this category will be reset to "Uncategorized".`)) {
      try {
        const { error } = await supabase
          .from('blog_categories')
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Reset post categories
        const { error: postError } = await supabase
          .from('posts')
          .update({ category: 'Uncategorized' })
          .eq('category', name);

        if (postError) {
          console.warn('Error updating posts categories after deletion:', postError);
        }

        await fetchCategories();
        // Refresh posts to show updated categories
        const { data: postsData } = await supabase
          .from('posts')
          .select('*')
          .order('updated_at', { ascending: false });
        if (postsData) {
          const mappedPosts = postsData.map(post => {
            const seoData = post.seo || {};
            return {
              id: post.id,
              title: post.title,
              slug: post.slug,
              content: post.content,
              excerpt: post.excerpt,
              featuredImage: post.cover_image || post.featured_image || '',
              category: post.category,
              tags: post.tags || [],
              status: post.status,
              author: seoData._author || post.author || { name: 'Admin' },
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
                schemaType: seoData.schemaType || 'Article'
              },
              createdAt: post.updated_at,
              updatedAt: post.updated_at,
              publishedAt: post.published_at
            };
          }) as BlogPost[];
          setPosts(mappedPosts);
        }
      } catch (err: any) {
        console.error('Error deleting category:', err);
        alert(err.message || 'Failed to delete category.');
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && posts.length > 0) {
      const postToEdit = posts.find(p => p.id === editId);
      if (postToEdit) {
        handleEdit(postToEdit);
      }
    }
  }, [searchParams, posts]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (postsError) throw postsError;

      // Map snake_case from DB to camelCase for UI
      const mappedPosts = (postsData || []).map(post => {
        const seoData = post.seo || {};
        return {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt,
          featuredImage: post.cover_image || post.featured_image || '',
          category: post.category,
          tags: post.tags || [],
          status: post.status,
          author: seoData._author || post.author || { name: 'Admin' },
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
            schemaType: seoData.schemaType || 'Article'
          },
          createdAt: post.updated_at,
          updatedAt: post.updated_at,
          publishedAt: post.published_at
        };
      }) as BlogPost[];

      setPosts(mappedPosts);

      // Fetch categories
      await fetchCategories();
    } catch (err) {
      console.error('Error fetching blog data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    const newPost: BlogPost = {
      id: '',
      title: '',
      slug: '',
      content: '',
      excerpt: '',
      featuredImage: '',
      category: 'Uncategorized',
      tags: [],
      status: 'draft',
      author: {
        name: 'Admin',
      },
      seo: {
        metaTitle: '',
        metaDescription: '',
        focusKeyword: '',
        canonicalUrl: '',
        ogTitle: '',
        ogDescription: '',
        ogImage: '',
        noIndex: false,
        schemaType: 'Article'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      highlights: [],
      faq: []
    };
    setEditingPost(newPost);
    setView('editor');
  };

  const handleEdit = (post: BlogPost) => {
    setEditingPost({ ...post });
    setView('editor');
  };

  const handleDuplicate = async (post: BlogPost) => {
    const baseSlug = `${post.slug || generateSlug(post.title)}-copy`;
    let duplicateSlug = baseSlug;
    let suffix = 2;
    while (posts.some(existingPost => existingPost.slug === duplicateSlug)) duplicateSlug = `${baseSlug}-${suffix++}`;

    const now = new Date().toISOString();
    const duplicateTitle = `${post.title} (Copy)`;
    const duplicatePost: BlogPost = {
      ...post,
      id: '',
      title: duplicateTitle,
      slug: duplicateSlug,
      status: 'draft',
      tags: [...(post.tags || [])],
      author: { ...post.author },
      highlights: [...(post.highlights || [])],
      faq: (post.faq || []).map(item => ({ ...item })),
      seo: {
        ...post.seo,
        metaTitle: post.seo?.metaTitle ? `${post.seo.metaTitle} (Copy)` : duplicateTitle,
        canonicalUrl: '',
        noIndex: true,
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          title: duplicatePost.title,
          slug: duplicatePost.slug,
          content: duplicatePost.content,
          excerpt: duplicatePost.excerpt,
          cover_image: duplicatePost.featuredImage,
          category: duplicatePost.category,
          tags: duplicatePost.tags,
          status: 'draft',
          author_id: 'admin',
          seo: {
            ...duplicatePost.seo,
            _author: duplicatePost.author,
            _highlights: duplicatePost.highlights,
            _faq: duplicatePost.faq,
          },
          updated_at: now,
          published_at: null,
        })
        .select()
        .single();

      if (error) throw error;
      const savedDuplicate = { ...duplicatePost, id: data.id, createdAt: data.updated_at || now, updatedAt: data.updated_at || now };
      setPosts(currentPosts => [savedDuplicate, ...currentPosts]);
      setEditingPost(savedDuplicate);
      setView('editor');
      setSearchParams({ tab: 'blog', edit: data.id });
    } catch (error) {
      console.error('Error duplicating post:', error);
      alert('The post could not be duplicated. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction('Delete Post', 'Are you sure you want to delete this post?'))) return;
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      setPosts(posts.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  const handleSave = async () => {
    if (!editingPost) return;
    
    // Auto-generate slug if empty
    if (!editingPost.slug && editingPost.title) {
      editingPost.slug = editingPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    try {
      const now = new Date().toISOString();
      const dbData = {
        title: editingPost.title,
        slug: editingPost.slug,
        content: editingPost.content,
        excerpt: editingPost.excerpt,
        cover_image: editingPost.featuredImage,
        category: editingPost.category,
        tags: editingPost.tags,
        status: editingPost.status,
        author_id: 'admin',
        seo: {
          ...editingPost.seo,
          _author: editingPost.author,
          _highlights: editingPost.highlights,
          _faq: editingPost.faq
        },
        updated_at: now,
        published_at: editingPost.status === 'published' ? (editingPost.publishedAt || now) : null
      };

      if (editingPost.id) {
        const { error } = await supabase
          .from('posts')
          .update(dbData)
          .eq('id', editingPost.id);
        if (error) throw error;
        alert('Post updated successfully!');
      } else {
        const { data, error } = await supabase
          .from('posts')
          .insert(dbData)
          .select()
          .single();
        if (error) throw error;
        alert('Post created successfully!');
        if (data) {
          setEditingPost({
            ...editingPost,
            id: data.id,
            createdAt: data.updated_at,
            updatedAt: data.updated_at
          });
          // Stay in editor for new post so they can see the "View Live" link
          return;
        }
      }
      
      await fetchData();
      setView('list');
      setEditingPost(null);
      setSearchParams({ tab: 'blog' });
    } catch (err) {
      console.error('Error saving post:', err);
      alert('Error saving post. Please check console.');
    }
  };

  const addHighlight = () => {
    if (!editingPost) return;
    setEditingPost({
      ...editingPost,
      highlights: [...(editingPost.highlights || []), '']
    });
  };

  const updateHighlight = (index: number, value: string) => {
    if (!editingPost) return;
    const newHighlights = [...(editingPost.highlights || [])];
    newHighlights[index] = value;
    setEditingPost({ ...editingPost, highlights: newHighlights });
  };

  const removeHighlight = (index: number) => {
    if (!editingPost) return;
    setEditingPost({
      ...editingPost,
      highlights: (editingPost.highlights || []).filter((_, i) => i !== index)
    });
  };

  const addFAQ = () => {
    if (!editingPost) return;
    setEditingPost({
      ...editingPost,
      faq: [...(editingPost.faq || []), { question: '', answer: '' }]
    });
  };

  const updateFAQ = (index: number, updates: Partial<{ question: string; answer: string }>) => {
    if (!editingPost) return;
    const newFaq = [...(editingPost.faq || [])];
    newFaq[index] = { ...newFaq[index], ...updates };
    setEditingPost({ ...editingPost, faq: newFaq });
  };

  const removeFAQ = (index: number) => {
    if (!editingPost) return;
    setEditingPost({
      ...editingPost,
      faq: (editingPost.faq || []).filter((_, i) => i !== index)
    });
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         post.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
    return matchesSearch && matchesStatus;
  });


  const handleSeedPost = async () => {
    try {
      const isConfirmed = await confirmAction("Publish Demo Post", "Publish the 'Website Cost Guide' post?");
      if (!isConfirmed) return;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        alert("You must be logged in.");
        return;
      }
      
      const contentHtml = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How much does a small business website cost?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "In 2026, a professionally built small business website typically ranges from $1,500 to $10,000+ depending on whether you use a freelancer or an agency. ProFox offers professional website design starting at $599."
    }
  }, {
    "@type": "Question",
    "name": "How much does a website cost per month?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "If you use a DIY builder, expect to pay $10–$50 per month. If you have a custom or WordPress site, your monthly costs for hosting and professional maintenance usually range from $50 to $500+ depending on the level of technical support required."
    }
  }, {
    "@type": "Question",
    "name": "How much does a WordPress website cost?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "A basic self-managed WordPress site can cost $100–$300 to set up initially. However, a custom, professionally developed WordPress site built for lead generation typically costs between $1,500 and $8,000."
    }
  }, {
    "@type": "Question",
    "name": "Is it worth paying someone to build a website?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Yes, if your website is critical for credibility, lead generation, or sales. A professional developer ensures the site is fast, secure, optimized for Google (SEO), and designed to convert visitors into paying customers."
    }
  }, {
    "@type": "Question",
    "name": "Can I get a professional website for $600?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Yes, depending on the scope. A streamlined, 3-to-5 page local business website built using an efficient CMS can be offered around this price. ProFox currently provides professional Website Design & Development starting from $599."
    }
  }]
}
</script>

<p>Ask five web designers how much a website costs and you may get five completely different answers:</p>
<p class="text-2xl font-bold text-slate-800 my-6 pl-4 border-l-4 border-indigo-500">$200. $2,000. $10,000. $30,000.</p>
<p>None of those numbers is automatically wrong. The problem is that “How much does a website cost?” is incomplete until you know what kind of website is being built, who is building it, what it needs to do, and what is included after launch.</p>
<p>Current 2026 pricing guides illustrate just how wide the market is. For example, professional freelancer-built WordPress websites average roughly <strong>$2,000–$8,000</strong>, while small-business agency projects sit at approximately <strong>$10,000–$35,000</strong>. At the same time, DIY website builders offer solutions starting at <strong>$15 per month</strong>.</p>
<p>That enormous difference is exactly why choosing a website based on price alone is dangerous.</p>

<div class="bg-slate-50 p-6 rounded-xl border border-slate-200 my-8">
  <h3 class="text-lg font-bold text-slate-900 mt-0 mb-4">Table of Contents</h3>
  <ul class="space-y-2 m-0 p-0 list-none">
    <li><a href="#tldr" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">⏱️ TL;DR: Quick Answer for 2026</a></li>
    <li><a href="#the-4-ways" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">The 4 Ways to Build a Small Business Website</a></li>
    <li><a href="#major-factors" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">What Actually Determines Website Cost?</a></li>
    <li><a href="#after-launch" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">What Does a Website Cost After Launch?</a></li>
    <li><a href="#compare-quotes" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">How to Compare Website Quotes Properly</a></li>
    <li><a href="#profox-pricing" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">What Does ProFox Charge in 2026?</a></li>
    <li><a href="#faq" class="text-indigo-600 hover:text-indigo-700 font-medium text-sm no-underline hover:underline">Frequently Asked Questions (FAQ)</a></li>
  </ul>
</div>

<p>This guide breaks the cost down properly so you can understand:</p>
<ul class="mb-8">
  <li>What different budgets actually buy</li>
  <li>What makes one website cost more than another</li>
  <li>Which hidden costs continue after launch</li>
  <li>When a professional website makes sense</li>
  <li>And how to compare two website quotes fairly</li>
</ul>
<p>The objective is not to convince you that expensive automatically means better. It doesn't. The objective is to help you understand what you are actually paying for.</p>

<figure class="my-10 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
  <img src="/website_cost_spectrum.webp" alt="Table comparing the cost of different website builders and custom web design in 2026" class="w-full h-auto object-cover m-0" />
  <figcaption class="text-center text-sm text-slate-500 py-3 bg-slate-50 m-0 border-t border-slate-200">Website Cost Spectrum: DIY to Custom Application</figcaption>
</figure>

<h2 id="tldr" class="scroll-mt-24">⏱️ TL;DR: Quick Answer for 2026</h2>
<p>A website can cost anywhere from a low monthly DIY subscription to tens of thousands of dollars for a professionally designed, custom-built business platform.</p>
<p>Here is a look at average upfront costs based on the approach:</p>

<div class="overflow-x-auto my-8 rounded-xl border border-slate-200 shadow-sm">
  <table class="min-w-full divide-y divide-slate-200 m-0">
    <thead class="bg-slate-50">
      <tr>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Website Approach</th>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Typical 2026 Market Range</th>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Best For</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100 bg-white">
      <tr>
        <td class="py-4 px-6"><strong>DIY Website Builder</strong></td>
        <td class="py-4 px-6 text-slate-600"><strong>$10 – $50</strong> / month</td>
        <td class="py-4 px-6 text-slate-600">Hobbyists, early-stage startups, zero-budget validation</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="py-4 px-6"><strong>Self-Managed WordPress</strong></td>
        <td class="py-4 px-6 text-slate-600"><strong>$100 – $300</strong> upfront + ongoing</td>
        <td class="py-4 px-6 text-slate-600">DIYers with technical patience</td>
      </tr>
      <tr>
        <td class="py-4 px-6"><strong>Professional Freelancer</strong></td>
        <td class="py-4 px-6 text-slate-600"><strong>$1,500 – $8,000+</strong></td>
        <td class="py-4 px-6 text-slate-600">Small service businesses needing solid design and basic SEO</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="py-4 px-6"><strong>Professional Agency</strong></td>
        <td class="py-4 px-6 text-slate-600"><strong>$5,000 – $35,000+</strong></td>
        <td class="py-4 px-6 text-slate-600">Established businesses needing strategy, branding, and scale</td>
      </tr>
      <tr>
        <td class="py-4 px-6"><strong>Custom Web Application</strong></td>
        <td class="py-4 px-6 text-slate-600"><strong>$25,000 – $100,000+</strong></td>
        <td class="py-4 px-6 text-slate-600">SaaS platforms, complex portals, custom business systems</td>
      </tr>
    </tbody>
  </table>
</div>
<p class="text-sm text-slate-500 italic">Note: These are broad market guides, not fixed industry prices.</p>
<p>The useful question therefore isn't: "What does a website cost?" It's: "What kind of website does my business need, and what should that solution reasonably cost?"</p>

<div class="bg-indigo-50 border-l-4 border-indigo-600 p-6 my-8 rounded-r-xl">
  <p class="text-indigo-900 font-medium m-0 mb-4"><strong>Need a precise number right now?</strong> Tell us what you're trying to build, and we'll give you a clear, fixed quote.</p>
  <a href="/contact-us" class="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors no-underline">
    Get a Free Website Quote
  </a>
</div>

<h2 id="the-4-ways" class="scroll-mt-24">The 4 Ways to Build a Small Business Website (And What They Cost)</h2>
<p>For most small businesses, there are four realistic ways to get online. Understanding which category you belong in will make pricing much easier to evaluate.</p>

<h3>1. DIY Website Builder Cost</h3>
<p><strong>Typical cost:</strong> Roughly <strong>$10–$50+ per month</strong></p>
<p>Platforms in this category (like Wix or Squarespace) commonly bundle hosting, templates, drag-and-drop editing, basic security, and support into a monthly fee.</p>
<p><strong>What people forget about DIY:</strong> The subscription isn't the whole cost. Your time has value too. You still have to write the copy, optimize the SEO, test mobile devices, and maintain the content. DIY reduces financial cost by moving the workload onto you.</p>

<h3>2. WordPress Website Cost</h3>
<p><strong>Typical cost:</strong> From <strong>$100</strong> (DIY) to thousands (Professional)</p>
<p>WordPress powers over 40% of the internet, but it's difficult to place into one pricing category. You can install a free theme, or you can commission a completely custom WordPress website with custom plugins and WooCommerce integrations. The platform only tells you what it's built with, not what you're building.</p>

<h3>3. Freelancer or Independent Web Professional Cost</h3>
<p><strong>Typical cost:</strong> Approximately <strong>$1,500–$8,000+</strong></p>
<p>Hiring an independent professional gives you direct communication, lower overhead, and specialist expertise. However, the word freelancer tells you almost nothing about quality. You could be hiring a beginner learning WordPress, or a senior full-stack developer. <em>Pro-tip: Always evaluate their portfolio and ask who handles design, SEO, and copywriting.</em></p>

<h3>4. Web Design Agency Cost</h3>
<p><strong>Typical cost:</strong> Approximately <strong>$5,000–$35,000+</strong></p>
<p>Agencies generally have higher costs because you receive a team (strategist, project manager, UI/UX designer, developer, SEO specialist, QA tester). You're paying for discovery, research, and stakeholder coordination. For a large organization, this is valuable. For a five-page local roofer, it’s overkill.</p>

<p class="text-lg font-medium text-slate-700 my-6 pl-4 border-l-4 border-slate-300">
  Looking for high-quality agency results without the inflated overhead? Check out <a href="/pricing" class="text-indigo-600 hover:underline">ProFox's transparent website pricing</a>.
</p>

<h2 id="major-factors" class="scroll-mt-24">What Actually Determines Website Cost? (The 7 Major Factors)</h2>
<p>Why does one website cost $500 while another costs $15,000? Here are the primary variables that change the price tag.</p>

<h3>1. Strategy & Research</h3>
<p>Some projects begin with: "Here is a template, pick a color." Others begin with deep competitor analysis, conversion planning, and user journey mapping. The more pre-design strategy involved, the higher the cost.</p>

<h3>2. Custom UI/UX vs. Templates</h3>
<p>A template gives you a foundation. Custom UI/UX design solves specific user journey problems. Don't pay for custom design merely because "custom" sounds premium—pay for it when your brand needs strong differentiation and high conversions.</p>

<h3>3. Copywriting (The Hidden Expense)</h3>
<p>A website needs more than code; someone needs to decide what it says. If a quote is cheap, ask: <em>Is professional copywriting included?</em> Often, it isn't, and you'll have to pay a writer separately.</p>

<h3>4. Search Engine Optimization (SEO)</h3>
<p>"SEO included" can mean almost anything. A $500 site might just install an SEO plugin. A $5,000 site should include search-intent mapping, URL architecture, schema markup, technical optimization, and internal linking strategies built into the code.</p>

<h3>5. Functionality & Integrations</h3>
<p>This is often the largest cost variable. A standard contact form is cheap. A lead qualification form that sends data into a CRM, assigns a sales rep, triggers an email sequence, and creates an internal notification requires deep API integrations and logic.</p>
<p>At ProFox, we build <em>From Site to System</em>, ensuring your website actually talks to your accounting, CRM, and email software.</p>

<h3>6. E-Commerce Capabilities</h3>
<p>Selling online adds massive complexity: payment gateways, inventory tracking, tax calculations, shipping logic, customer portals, and ironclad security. An e-commerce site will always cost significantly more than a standard service site.</p>

<h3>7. Performance & Accessibility (WCAG Compliance)</h3>
<p>Modern websites must pass Google's Core Web Vitals (speed) and adhere to ADA/WCAG accessibility guidelines. Testing across devices, compressing code, and ensuring accessibility requires expert QA hours.</p>

<figure class="my-10 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
  <img src="/website_hidden_costs.webp" alt="Iceberg Visual representing visible price vs total cost including hosting, maintenance, and SEO" class="w-full h-auto object-cover m-0" />
  <figcaption class="text-center text-sm text-slate-500 py-3 bg-slate-50 m-0 border-t border-slate-200">The Hidden Costs of Web Design (Visible Price vs. Total Cost)</figcaption>
</figure>

<h2 id="after-launch" class="scroll-mt-24">What Does a Website Cost After Launch? (Ongoing Fees)</h2>
<p>This is the section many agencies hide. The initial build is usually not the last website expense. Potential ongoing website costs include:</p>
<ul class="space-y-3">
  <li><strong>Domain Name:</strong> <strong>$10–$20/year</strong> (unless purchasing a premium domain).</li>
  <li><strong>Web Hosting:</strong> <strong>$5–$250+/month</strong> depending on traffic, speed, and server resources.</li>
  <li><strong>Premium Software/Plugins:</strong> <strong>$50–$500+/year</strong> for specialized tool licenses.</li>
  <li><strong>Website Maintenance Cost:</strong> <strong>$50–$500+/month</strong>. This covers crucial security patches, CMS updates, backups, uptime monitoring, and bug fixes.</li>
</ul>
<p class="font-medium text-slate-800">Never buy a website without knowing exactly who owns the domain, hosting, and code.</p>

<h2 id="compare-quotes" class="scroll-mt-24">How to Compare Website Quotes Properly</h2>
<p>Do not compare only the total at the bottom of the proposal. Create a comparison table:</p>

<div class="overflow-x-auto my-8 rounded-xl border border-slate-200 shadow-sm">
  <table class="min-w-full divide-y divide-slate-200 m-0">
    <thead class="bg-slate-50">
      <tr>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Deliverable</th>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Quote A ($500)</th>
        <th class="text-left font-bold py-4 px-6 text-slate-900">Quote B ($2,500)</th>
        <th class="text-left font-bold py-4 px-6 text-slate-900 text-indigo-700">Quote C ($12,000)</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-100 bg-white">
      <tr>
        <td class="py-4 px-6 font-medium">Strategy Included?</td>
        <td class="py-4 px-6 text-slate-500">No</td>
        <td class="py-4 px-6 text-slate-500">Basic</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Comprehensive</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="py-4 px-6 font-medium">Custom Design?</td>
        <td class="py-4 px-6 text-slate-500">Template</td>
        <td class="py-4 px-6 text-slate-500">Custom UI</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Custom UI/UX</td>
      </tr>
      <tr>
        <td class="py-4 px-6 font-medium">Copywriting?</td>
        <td class="py-4 px-6 text-slate-500">You Write It</td>
        <td class="py-4 px-6 text-slate-500">Guided Assistance</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Professional Writer</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="py-4 px-6 font-medium">On-Page SEO?</td>
        <td class="py-4 px-6 text-slate-500">Basic Plugin</td>
        <td class="py-4 px-6 text-slate-500">Architecture Built</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Full Strategy</td>
      </tr>
      <tr>
        <td class="py-4 px-6 font-medium">Integrations (CRM)?</td>
        <td class="py-4 px-6 text-slate-500">None</td>
        <td class="py-4 px-6 text-slate-500">Zapier Setup</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Custom API</td>
      </tr>
      <tr class="bg-slate-50/50">
        <td class="py-4 px-6 font-medium">Mobile Speed Opt?</td>
        <td class="py-4 px-6 text-slate-500">Basic</td>
        <td class="py-4 px-6 text-slate-500">Advanced</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Core Web Vitals</td>
      </tr>
      <tr>
        <td class="py-4 px-6 font-medium">Post-Launch Support?</td>
        <td class="py-4 px-6 text-slate-500">7 Days</td>
        <td class="py-4 px-6 text-slate-500">30 Days</td>
        <td class="py-4 px-6 text-indigo-700 font-medium">Ongoing Retainer</td>
      </tr>
    </tbody>
  </table>
</div>

<p>Suddenly, three supposedly comparable quotes look completely different. Buy what the business actually needs.</p>

<h3>5 Questions to Ask Before Hiring a Web Designer</h3>
<ol class="space-y-2 mb-8">
  <li><strong>What exactly is included in the price?</strong> (Ask for an itemized scope).</li>
  <li><strong>Who owns the website and the domain?</strong> (Ensure your contract clearly states you have 100% ownership upon final payment).</li>
  <li><strong>What SEO work is actually being done?</strong> (Get specifics beyond "installing a plugin").</li>
  <li><strong>How many design revisions are included?</strong> (Know the limits so you aren't hit with hourly overage fees).</li>
  <li><strong>What happens after launch?</strong> (Ask about maintenance, bug fixes, and training).</li>
</ol>

<h2 id="profox-pricing" class="scroll-mt-24">What Does ProFox Charge for a Website in 2026?</h2>
<p>Transparency matters. We don't hide our pricing behind vague contact forms. Here is what ProFox currently charges for expert digital solutions:</p>
<ul class="space-y-2 mb-6">
  <li><a href="/pricing" class="text-indigo-600 font-bold hover:underline">ProFox Launch</a>: Starting from <strong>$599</strong> (one-time)</li>
  <li><a href="/pricing" class="text-indigo-600 font-bold hover:underline">ProFox Growth</a>: Starting from <strong>$2,379</strong> (one-time)</li>
  <li><a href="/pricing" class="text-indigo-600 font-bold hover:underline">ProFox Scale</a>: Starting from <strong>$5,799+</strong> (one-time)</li>
  <li><a href="/pricing" class="text-indigo-600 font-bold hover:underline">Custom Digital Experience</a>: <strong>Custom quote</strong></li>
  <li><strong>ProFox Care (Technical Support):</strong> Starting from <strong>$99 / month</strong></li>
</ul>
<p><em>Final project pricing depends on requirements, functionality, and scope.</em></p>
<p>Why are our starting prices lower than agency benchmarks? Because price is influenced by overhead. We use efficient, modern development workflows, reusable systems, and a lean operating model to deliver agency-quality results at a small-business price point.</p>

<h2>Website Cost vs. Website Value: The Bottom Line</h2>
<p>Imagine two scenarios: Website A costs $500. It produces zero inquiries. Website B costs $3,000. It consistently generates qualified leads every week.</p>
<p>Which one was expensive? The $500 site was a total loss. The $3,000 site is a revenue-generating asset.</p>
<p>A good website shouldn't merely exist online. It should make your business easier to understand, easier to trust, and easier to choose. And when necessary, it should connect the systems behind the experience as well. From site to system.</p>

<div class="bg-slate-900 text-white rounded-2xl p-8 my-10 text-center">
  <h3 class="text-2xl font-bold text-white mt-0 mb-4">Ready to Understand What Your Website Should Cost?</h3>
  <p class="text-slate-300 mb-6 max-w-2xl mx-auto">You shouldn't have to commit to a project before understanding what you actually need. ProFox offers a free, zero-obligation 20-minute strategy call. Tell us your goals, and we'll give you a transparent, fixed quote.</p>
  <div class="flex flex-col sm:flex-row gap-4 justify-center">
    <a href="/contact-us" class="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-slate-900 bg-white hover:bg-slate-50 transition-colors no-underline">
      👉 Book Your Free Strategy Call Today
    </a>
    <a href="/pricing" class="inline-flex items-center justify-center px-6 py-3 border border-slate-700 text-base font-medium rounded-lg text-white hover:bg-slate-800 transition-colors no-underline">
      Explore Web Design Services
    </a>
  </div>
</div>

<h2 id="faq" class="scroll-mt-24 pt-8 border-t border-slate-200">Frequently Asked Questions (FAQ)</h2>
<div class="space-y-6 mt-6">
  <div>
    <h3 class="text-lg font-bold text-slate-900 mt-0 mb-2">How much does a small business website cost?</h3>
    <p class="m-0 text-slate-600">In 2026, a professionally built small business website typically ranges from $1,500 to $10,000+ depending on whether you use a freelancer or an agency. ProFox offers small business website design starting at $599.</p>
  </div>
  <div>
    <h3 class="text-lg font-bold text-slate-900 mt-0 mb-2">How much does a website cost per month?</h3>
    <p class="m-0 text-slate-600">If you use a DIY builder, expect to pay $10–$50 per month. If you have a custom or WordPress site, your monthly costs for hosting and professional maintenance usually range from $50 to $500+ depending on the level of technical support required. ProFox Care starts at $99 per month.</p>
  </div>
  <div>
    <h3 class="text-lg font-bold text-slate-900 mt-0 mb-2">How much does a WordPress website cost?</h3>
    <p class="m-0 text-slate-600">A basic self-managed WordPress site can cost $100–$300 to set up initially (for themes and hosting). However, a custom, professionally developed WordPress site built for lead generation typically costs between $1,500 and $8,000.</p>
  </div>
  <div>
    <h3 class="text-lg font-bold text-slate-900 mt-0 mb-2">Is it worth paying someone to build a website?</h3>
    <p class="m-0 text-slate-600">Yes, if your website is critical for credibility, lead generation, or sales. A professional developer ensures the site is fast, secure, optimized for Google (SEO), and designed to convert visitors into paying customers.</p>
  </div>
  <div>
    <h3 class="text-lg font-bold text-slate-900 mt-0 mb-2">Can I get a professional website for $600?</h3>
    <p class="m-0 text-slate-600">Yes, depending on the scope. A streamlined, 3-to-5 page local business website built using an efficient CMS can be offered around this price. ProFox currently provides professional Website Design & Development starting from $599.</p>
  </div>
</div>
`;

      const postData = {
        title: "How Much Does a Website Cost in 2026? An Honest Small Business Pricing Guide",
        slug: "how-much-does-a-website-cost",
        excerpt: "How much does a website cost in 2026? Compare DIY, freelancer, agency, and custom website pricing, hidden fees, and see what your business should actually budget.",
        content: contentHtml,
        category: "Pricing & Guides",
        status: "published",
        author_id: 'admin',
        cover_image: "/website_cost_guide_cover.webp",
        tags: ["Pricing", "Web Design", "Small Business", "SEO"],
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        seo: {
          title: "How Much Does a Website Cost in 2026? Small Business Pricing Guide",
          description: "How much does a website cost in 2026? Compare DIY, freelancer, agency, and custom website pricing, hidden fees, and see what your business should actually budget.",
          _author: { name: "Mehtab Ansari" }
        }
      };

      const { error } = await supabase.from('posts').upsert(postData, { onConflict: 'slug' });
      
      if (error) {
        console.error(error);
        alert("Error publishing: " + error.message);
      } else {
        alert("✅ Success! The Website Cost Guide is now live. Please refresh the page if it doesn't appear.");
        fetchData();
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while seeding. " + ((err as any).message || ''));
    }
  };

  if (view === 'editor' && editingPost) {
    return (
      <PostEditor 
        post={editingPost} 
        categories={categories}
        setPost={setEditingPost} 
        onSave={handleSave} 
        onCancel={() => { 
          setView('list'); 
          setEditingPost(null); 
          setSearchParams({ tab: 'blog' });
        }}
        addHighlight={addHighlight}
        updateHighlight={updateHighlight}
        removeHighlight={removeHighlight}
        addFAQ={addFAQ}
        updateFAQ={updateFAQ}
        removeFAQ={removeFAQ}
        onRefreshCategories={fetchCategories}
      />
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#000080]" />
            Blog Posts
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage your website's articles and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSeedPost} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-sm">
      <Check className="w-5 h-5" />
      Publish Demo Post
    </button>
    <button 
            onClick={() => setShowCategoriesModal(true)}
            className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all"
          >
            <Tag className="w-4 h-4 text-[#000080]" />
            Manage Categories
          </button>
          <button 
            onClick={handleCreateNew}
            className="bg-[#000080] hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#000080]/20"
          >
            <Plus className="w-5 h-5" />
            Add New Post
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-900 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] w-80"
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <span>{filteredPosts.length} posts found</span>
        </div>
      </div>

      {/* Posts List */}
      <div className="bg-slate-50 rounded-2xl border border-slate-900 shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#000080]"></div>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p>No posts found matching your criteria</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-900 bg-white/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredPosts.map((post) => (
                <tr key={post.id} className="hover:bg-white/30 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      {post.featuredImage ? (
                        <img src={post.featuredImage} className="w-12 h-12 rounded-lg object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-white flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-slate-700" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-[#000080] transition-colors">{post.title}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-1">/{post.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
                      {post.category}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      post.status === 'published' 
                        ? 'bg-[#000080]/10 text-[#000080] border border-[#000080]/20' 
                        : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${post.status === 'published' ? 'bg-[#000066]' : 'bg-yellow-400'}`} />
                      {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-700">{new Date(post.updatedAt).toLocaleDateString()}</span>
                      <span className="text-[10px] text-slate-500">{new Date(post.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a 
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-500 hover:text-[#000080] hover:bg-[#000066]/10 rounded-lg transition-all"
                        title="View Live"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <button 
                        onClick={() => handleEdit(post)}
                        className="p-2 text-slate-500 hover:text-[#000080] hover:bg-[#000066]/10 rounded-lg transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(post)}
                        className="p-2 text-slate-500 hover:text-[#000080] hover:bg-[#000066]/10 rounded-lg transition-all"
                        title="Duplicate as draft"
                        aria-label={`Duplicate ${post.title} as a draft`}
                      >
                        <CopyPlus className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(post.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Categories Modal */}
      {showCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#000080]" />
                <h2 className="text-lg font-bold text-slate-900">Manage Blog Categories</h2>
              </div>
              <button 
                onClick={() => {
                  setShowCategoriesModal(false);
                  setCatEditingId(null);
                  setCatName('');
                  setCatSlug('');
                  setCatDesc('');
                  setCatError('');
                  setIsSlugManuallyEdited(false);
                }}
                className="text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid md:grid-cols-5 gap-6">
              {/* Left Column: Form */}
              <div className="md:col-span-2 bg-slate-50/40 p-5 rounded-xl border border-slate-200/60 h-fit space-y-4">
                <h3 className="text-sm font-bold text-slate-900">
                  {catEditingId ? 'Edit Category' : 'Add New Category'}
                </h3>
                <form onSubmit={handleCreateOrUpdateCategory} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Category Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Technology, Wellness"
                      value={catName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">URL Slug</label>
                    <input 
                      type="text"
                      placeholder="e.g. technology"
                      value={catSlug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
                    <textarea 
                      placeholder="Optional short description..."
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      rows={3}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] resize-none"
                    />
                  </div>

                  {catError && (
                    <p className="text-xs text-red-400 bg-red-400/10 p-2.5 rounded-lg border border-red-500/20">{catError}</p>
                  )}

                  <div className="flex gap-2 pt-2">
                    {catEditingId && (
                      <button 
                        type="button"
                        onClick={() => {
                          setCatEditingId(null);
                          setCatName('');
                          setCatSlug('');
                          setCatDesc('');
                          setCatError('');
                          setIsSlugManuallyEdited(false);
                        }}
                        className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-700 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      type="submit"
                      disabled={catSubmitting}
                      className="flex-1 px-4 py-2.5 bg-[#000080] hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      {catSubmitting ? 'Saving...' : (catEditingId ? 'Update' : 'Add Category')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: List of Categories */}
              <div className="md:col-span-3 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Existing Categories</h3>
                  <span className="text-[11px] text-slate-500">{categories.length} Total</span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/20 max-h-[45vh] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white/40 text-slate-500 font-bold">
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Slug</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      <tr className="hover:bg-white/10 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-700">Uncategorized</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Default category</p>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono">uncategorized</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-[10px] text-slate-600 italic px-2">System</span>
                        </td>
                      </tr>
                      {categories.map((cat) => (
                        <tr key={cat.id} className="hover:bg-white/20 transition-colors group animate-in fade-in duration-100">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-900">{cat.name}</p>
                            {cat.description && (
                              <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[180px]">{cat.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono">{cat.slug}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => handleEditCategory(cat)}
                                className="p-1.5 text-slate-500 hover:text-[#000080] hover:bg-[#000066]/10 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50/20 flex justify-end">
              <button 
                onClick={() => {
                  setShowCategoriesModal(false);
                  setCatEditingId(null);
                  setCatName('');
                  setCatSlug('');
                  setCatDesc('');
                  setCatError('');
                  setIsSlugManuallyEdited(false);
                }}
                className="px-5 py-2.5 bg-slate-850 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}

interface PostEditorProps {
  post: BlogPost;
  categories: BlogCategory[];
  setPost: (post: BlogPost) => void;
  onSave: () => void;
  onCancel: () => void;
  addHighlight: () => void;
  updateHighlight: (index: number, value: string) => void;
  removeHighlight: (index: number) => void;
  addFAQ: () => void;
  updateFAQ: (index: number, updates: Partial<{ question: string; answer: string }>) => void;
  removeFAQ: (index: number) => void;
  onRefreshCategories: () => Promise<void>;
}

function PostEditor({ 
  post, 
  categories, 
  setPost, 
  onSave, 
  onCancel,
  addHighlight,
  updateHighlight,
  removeHighlight,
  addFAQ,
  updateFAQ,
  removeFAQ,
  onRefreshCategories
}: PostEditorProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'settings' | 'enhanced'>('content');
  const [showPreview, setShowPreview] = useState(false);

  // Quick Add Category State
  const [showQuickAddCategory, setShowQuickAddCategory] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatError, setQuickCatError] = useState('');
  const [quickCatSubmitting, setQuickCatSubmitting] = useState(false);

  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const handleQuickAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickCatError('');
    if (!quickCatName.trim()) {
      setQuickCatError('Name is required');
      return;
    }
    const slug = generateSlug(quickCatName);
    setQuickCatSubmitting(true);
    try {
      const newId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const { error } = await supabase
        .from('blog_categories')
        .insert({
          id: newId,
          name: quickCatName.trim(),
          slug,
          description: 'Quick added category'
        });

      if (error) throw error;

      // Reset quick add form
      setQuickCatName('');
      setShowQuickAddCategory(false);
      
      // Refresh the categories list in parent
      await onRefreshCategories();
      
      // Auto-select this newly created category for the post
      setPost({ ...post, category: quickCatName.trim() });
    } catch (err: any) {
      console.error('Error quick-adding category:', err);
      setQuickCatError(err.message || 'Failed to add category. Make sure the slug/name is unique.');
    } finally {
      setQuickCatSubmitting(false);
    }
  };

  const updateSEO = (updates: Partial<SEOConfig>) => {
    setPost({
      ...post,
      seo: { ...post.seo, ...updates }
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Editor Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 bg-slate-50 border-b border-slate-900 shadow-lg">
        <div className="flex items-center gap-6">
          <button 
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="h-8 w-px bg-white" />
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {post.id ? 'Edit Post' : 'New Post'}
              <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${
                post.status === 'published' ? 'bg-[#000080]/10 text-[#000080]' : 'bg-yellow-500/10 text-yellow-400'
              }`}>
                {post.status}
              </span>
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {post.id && (
            <a 
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-bold text-[#000080] hover:text-[#000080] hover:bg-[#000080]/10 rounded-xl transition-all flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View {post.status === 'published' ? 'Live' : 'Preview'}
            </a>
          )}
          <button 
            onClick={() => setShowPreview(true)}
            className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-900 hover:bg-white rounded-xl transition-all flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <select
            value={post.status}
            onChange={(e) => setPost({ ...post, status: e.target.value as any })}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button 
            onClick={onSave}
            className="bg-[#000080] hover:bg-emerald-700 text-white px-8 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#000080]/20"
          >
            <Save className="w-4 h-4" />
            {post.id ? 'Update Post' : 'Publish Post'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
          <div className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white/95 backdrop-blur text-slate-900 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <span className="bg-[#000080] text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">Preview Mode</span>
              <h3 className="text-sm font-bold truncate max-w-md">{post.title || 'Untitled Post'}</h3>
            </div>
            <button 
              onClick={() => setShowPreview(false)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all"
            >
              <X className="w-4 h-4" />
              Close Preview
            </button>
          </div>

          <div className="min-h-screen pb-20 bg-white">
            {/* Premium Hero Section */}
            <section className="relative min-h-[50vh] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 z-0">
                <img 
                  src={post.featuredImage} 
                  className="w-full h-full object-cover" 
                  alt={post.title}
                />
                <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[2px]" />
              </div>
              
              <div className="max-w-4xl mx-auto px-6 relative z-10 text-center text-slate-900">
                <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
                  <span className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold uppercase tracking-widest">
                    {post.category}
                  </span>
                </div>

                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-8 leading-[1.1] tracking-tight">
                  {post.title || 'Untitled Post'}
                </h1>

                <div className="flex items-center justify-center gap-4 text-sm font-bold text-slate-500 uppercase tracking-widest">
                  <span>Created on: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
              </div>
            </section>

            <main className="max-w-4xl mx-auto px-6 py-20">
              {/* Highlights Section */}
              {post.highlights && post.highlights.length > 0 && (
                <section className="mb-16 bg-slate-50 border border-slate-100 rounded-[32px] p-8 md:p-12">
                  <h2 className="text-2xl font-bold text-slate-900 mb-8">Key Highlights</h2>
                  <ul className="grid grid-cols-1 gap-6">
                    {post.highlights.map((highlight, i) => (
                      <li key={i} className="flex gap-4 items-start">
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-[#000080] shrink-0" />
                        <p className="text-slate-700 leading-relaxed font-medium">{highlight}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <article 
                className="prose prose-slate prose-lg max-w-none 
                  prose-headings:text-slate-900 prose-headings:font-bold prose-headings:scroll-mt-32
                  prose-p:text-slate-600 prose-p:leading-relaxed prose-p:mb-8
                  prose-a:text-[#000080] prose-a:font-bold prose-a:no-underline
                  prose-img:rounded-3xl prose-img:shadow-2xl prose-img:my-16"
                dangerouslySetInnerHTML={{ __html: post.content || '<p class="text-slate-500 italic text-center">No content yet...</p>' }}
              />

              {/* FAQ Section */}
              {post.faq && post.faq.length > 0 && (
                <section className="mt-24 pt-24 border-t border-slate-100">
                  <h2 className="text-3xl font-bold text-slate-900 mb-12">Frequently Asked Questions</h2>
                  <div className="space-y-4 text-slate-950">
                    {post.faq.map((item, index) => (
                      <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                        <h3 className="font-bold text-lg text-slate-900 mb-4">{item.question}</h3>
                        <p className="text-slate-600 text-lg">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </main>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main Editor Area */}
        <div className="flex-1 overflow-y-auto p-12 bg-slate-50/50">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Title Input */}
            <input 
              type="text"
              placeholder="Add title"
              value={post.title}
              onChange={(e) => setPost({ ...post, title: e.target.value })}
              className="w-full bg-transparent border-none text-4xl font-bold text-slate-900 placeholder-slate-800 focus:outline-none"
            />

            {/* Editor Tabs */}
            <div className="flex border-b border-slate-900 mb-8">
              {[
                { id: 'content', label: 'Content', icon: FileText },
                { id: 'enhanced', label: 'Highlights & FAQ', icon: Layout },
                { id: 'seo', label: 'SEO Settings', icon: Globe },
                { id: 'settings', label: 'Post Settings', icon: Settings }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${
                    activeTab === tab.id 
                      ? 'text-[#000080] border-[#000080]' 
                      : 'text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'content' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Post Excerpt</label>
                  <textarea 
                    value={post.excerpt}
                    onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
                    placeholder="Brief summary of the article for listings..."
                    rows={3}
                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080]"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3"><label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Advanced Article Content</label><span className="text-xs text-slate-500">Headings, links, lists, quotes, tables, images and HTML source</span></div>
                  <AdvancedArticleEditor value={post.content} onChange={(content) => setPost({ ...post, content })} />
                </div>
              </div>
            )}

            {activeTab === 'enhanced' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                {/* Highlights */}
                <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Check className="w-5 h-5 text-[#000080]" />
                      Key Highlights
                    </h3>
                    <button 
                      onClick={addHighlight}
                      className="text-xs font-bold text-[#000080] hover:text-[#000080] flex items-center gap-1 uppercase tracking-widest"
                    >
                      <Plus className="w-4 h-4" /> Add Highlight
                    </button>
                  </div>
                  <div className="space-y-3">
                    {post.highlights?.map((highlight, index) => (
                      <div key={index} className="flex gap-2">
                        <input 
                          type="text"
                          value={highlight}
                          onChange={(e) => updateHighlight(index, e.target.value)}
                          placeholder="Enter a key highlight..."
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
                        />
                        <button 
                          onClick={() => removeHighlight(index)}
                          className="p-3 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FAQ */}
                <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-[#000080]" />
                      Frequently Asked Questions
                    </h3>
                    <button 
                      onClick={addFAQ}
                      className="text-xs font-bold text-[#000080] hover:text-[#000080] flex items-center gap-1 uppercase tracking-widest"
                    >
                      <Plus className="w-4 h-4" /> Add FAQ Item
                    </button>
                  </div>
                  <div className="space-y-6">
                    {post.faq?.map((item, index) => (
                      <div key={index} className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 relative group">
                        <button 
                          onClick={() => removeFAQ(index)}
                          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Question</label>
                          <input 
                            type="text"
                            value={item.question}
                            onChange={(e) => updateFAQ(index, { question: e.target.value })}
                            placeholder="e.g., What are the key benefits?"
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:border-[#000080]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Answer</label>
                          <textarea 
                            value={item.answer}
                            onChange={(e) => updateFAQ(index, { answer: e.target.value })}
                            placeholder="Detailed answer..."
                            rows={3}
                            className="w-full bg-white border border-slate-200 rounded-xl p-4 text-slate-900 focus:outline-none focus:border-[#000080]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'seo' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Search className="w-5 h-5 text-[#000080]" />
                    Google Search Preview
                  </h3>
                  <div className="bg-white rounded-xl p-6 shadow-2xl">
                    <p className="text-[#1a0dab] text-xl font-medium mb-1 truncate">
                      {post.seo.metaTitle || post.title || 'Post Title Preview'}
                    </p>
                    <p className="text-[#006621] text-sm mb-2 truncate">
                      profoxwebdesigner.com › blog › {post.slug || 'your-post-slug'}
                    </p>
                    <p className="text-[#4d5156] text-sm line-clamp-2">
                      {post.seo.metaDescription || post.excerpt || 'Add a meta description to see how this post will look in search results. A good description increases click-through rate.'}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">SEO Title</label>
                    <input 
                      type="text"
                      value={post.seo.metaTitle}
                      onChange={(e) => updateSEO({ metaTitle: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Focus Keyword</label>
                    <input 
                      type="text"
                      value={post.seo.focusKeyword}
                      onChange={(e) => updateSEO({ focusKeyword: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Meta Description</label>
                  <textarea 
                    value={post.seo.metaDescription}
                    onChange={(e) => updateSEO({ metaDescription: e.target.value })}
                    rows={4}
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-slate-900 focus:outline-none focus:border-[#000080]"
                  />
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-500">Recommended: 150-160 characters</span>
                    <span className={`text-[10px] ${post.seo.metaDescription.length > 160 ? 'text-red-500' : 'text-slate-500'}`}>
                      {post.seo.metaDescription.length} characters
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">URL Slug</label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 text-sm font-mono">/blog/</span>
                      <input 
                        type="text"
                        value={post.slug}
                        onChange={(e) => setPost({ ...post, slug: e.target.value })}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#000080] font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Category</label>
                      <button 
                        type="button"
                        onClick={() => setShowQuickAddCategory(!showQuickAddCategory)}
                        className="text-xs text-[#000080] hover:text-[#000066] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Quick Add
                      </button>
                    </div>

                    {showQuickAddCategory && (
                      <div className="p-4 bg-white/50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="Category name"
                            value={quickCatName}
                            onChange={(e) => setQuickCatName(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
                          />
                          <button 
                            type="button"
                            onClick={handleQuickAddCategorySubmit}
                            disabled={quickCatSubmitting}
                            className="bg-[#000080] hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            {quickCatSubmitting ? 'Adding...' : 'Add'}
                          </button>
                        </div>
                        {quickCatError && (
                          <p className="text-[10px] text-red-400 font-medium">{quickCatError}</p>
                        )}
                      </div>
                    )}

                    <select 
                      value={post.category}
                      onChange={(e) => setPost({ ...post, category: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
                    >
                      <option value="Uncategorized">Uncategorized</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Author</label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text"
                        value={post.author.name}
                        onChange={(e) => setPost({ ...post, author: { ...post.author, name: e.target.value } })}
                        className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <ImageUploader 
                    label="Featured Image"
                    value={post.featuredImage}
                    onChange={(url) => setPost({ ...post, featuredImage: url })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Quick Sidebar Info */}
        <div className="w-80 border-l border-slate-900 p-8 space-y-8 bg-slate-50/80 backdrop-blur-xl">
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Publish Status</h4>
            <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200">
              <div className={`w-3 h-3 rounded-full animate-pulse ${post.status === 'published' ? 'bg-[#000080]' : 'bg-yellow-500'}`} />
              <span className="text-sm text-slate-900 font-bold">{post.status === 'published' ? 'Live on Site' : 'Draft Mode'}</span>
            </div>
            {post.status === 'published' && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                Published on {new Date(post.publishedAt || post.createdAt).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Quick Stats</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-4 bg-white rounded-2xl border border-slate-200">
                <p className="text-[10px] text-slate-500 mb-1">Words</p>
                <p className="text-lg font-bold text-slate-900">{post.content.split(/\s+/).filter(x => x).length}</p>
              </div>
              <div className="p-4 bg-white rounded-2xl border border-slate-200">
                <p className="text-[10px] text-slate-500 mb-1">Reading Time</p>
                <p className="text-lg font-bold text-slate-900">{Math.ceil(post.content.split(/\s+/).length / 200)}m</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
