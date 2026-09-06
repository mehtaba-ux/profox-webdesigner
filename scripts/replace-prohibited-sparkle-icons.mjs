import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const replacementByFile = new Map([
  ['src/components/DynamicSectionRenderer.tsx', 'BadgeCheck'],
  ['src/components/PublicBookingFlow.tsx', 'CalendarCheck'],
  ['src/components/QualifiedContactForm.tsx', 'BadgeCheck'],
  ['src/components/Services.tsx', 'Briefcase'],
  ['src/components/admin/AdminCommissionManager.tsx', 'CircleDollarSign'],
  ['src/components/admin/AdminDashboard.tsx', 'LayoutDashboard'],
  ['src/components/admin/AwardsManager.tsx', 'Trophy'],
  ['src/components/admin/ConfigurationCenterLegacy.tsx', 'Settings'],
  ['src/components/admin/ContactLeadFormAdmin.tsx', 'Contact'],
  ['src/components/admin/ContentDeliveryTaskWorkspace.tsx', 'FileCheck'],
  ['src/components/admin/CustomMenuManager.tsx', 'Menu'],
  ['src/components/admin/ManagementAiAdmin.tsx', 'BrainCircuit'],
  ['src/components/admin/MyCommissions.tsx', 'CircleDollarSign'],
  ['src/components/admin/MyWorkDashboard.tsx', 'Briefcase'],
  ['src/components/admin/NextBestActionCard.tsx', 'Target'],
  ['src/components/admin/OnboardingManagement.tsx', 'UserCheck'],
  ['src/components/admin/PagesManager.tsx', 'FileText'],
  ['src/components/admin/PortfolioManager.tsx', 'Images'],
  ['src/components/admin/ProductivityCommandCenter.tsx', 'Gauge'],
  ['src/components/admin/ProductivityCommandPalette.tsx', 'Command'],
  ['src/components/admin/ProductivityCopilot.tsx', 'Lightbulb'],
  ['src/components/admin/QuotationWorkspaceBase.tsx', 'FileCheck'],
  ['src/components/admin/QuotationWorkspaceEnhancements.tsx', 'BadgeCheck'],
  ['src/components/admin/SalesAccountSetup.tsx', 'UserCheck'],
  ['src/components/admin/SellerTodayDashboard.tsx', 'CalendarCheck'],
  ['src/components/admin/SiteSettingsManager.tsx', 'Settings'],
  ['src/components/admin/TemplateManager.tsx', 'LayoutTemplate'],
  ['src/components/admin/ThemeCustomizerDrawer.tsx', 'Palette'],
  ['src/components/admin/VisualEditable.tsx', 'PencilRuler'],
  ['src/components/admin/crm/CRMLeadWorkspace.tsx', 'BadgeCheck'],
  ['src/components/admin/workspace/WorkspaceFocusStrip.tsx', 'Focus'],
  ['src/data/techStackOptions.ts', 'Cpu'],
  ['src/data.ts', 'BadgeCheck'],
  ['src/pages/AboutUsDetailView.tsx', 'Users'],
  ['src/pages/CareersListView.tsx', 'Briefcase'],
  ['src/pages/ClientOnboardingPage.tsx', 'ClipboardCheck'],
  ['src/pages/ContactUsDetailView.tsx', 'MessageCircle'],
  ['src/pages/ContentWriterJobViewLegacy.tsx', 'FileText'],
  ['src/pages/CustomPageView.tsx', 'FileText'],
  ['src/pages/PortfolioDetailView.tsx', 'Images'],
  ['src/pages/PricingDetailView.tsx', 'CircleDollarSign'],
  ['src/pages/PublicFeedback.tsx', 'MessageSquare'],
  ['src/pages/ServiceDetailView.tsx', 'Briefcase'],
  ['src/pages/TalentPartnerProgramView.tsx', 'Handshake'],
  ['src/pages/UIUXDesignerJobView.tsx', 'Palette'],
]);

const prohibitedToken = /\b(?:Sparkle|Sparkles|WandSparkles)\b/g;
const prohibitedCheck = /\b(?:Sparkle|Sparkles|WandSparkles)\b|✨/u;
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.svg', '.css']);

function normalizeLucideImports(source) {
  return source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"];?/g, (_full, body) => {
    const items = body.split(',').map(item => item.trim()).filter(Boolean);
    const unique = [...new Set(items)];
    if (body.includes('\n')) return `import {\n  ${unique.join(',\n  ')},\n} from 'lucide-react';`;
    return `import { ${unique.join(', ')} } from 'lucide-react';`;
  });
}

const manifest = [];
for (const [file, replacement] of replacementByFile) {
  if (!existsSync(file)) throw new Error(`Expected UI file is missing: ${file}`);
  const before = readFileSync(file, 'utf8');
  let after = before.replace(prohibitedToken, replacement).replaceAll('✨', '');
  after = normalizeLucideImports(after);
  if (after === before) throw new Error(`Mapped file contained no prohibited sparkle usage: ${file}`);
  if (prohibitedCheck.test(after)) throw new Error(`Sparkle cleanup incomplete in ${file}`);
  writeFileSync(file, after, 'utf8');
  manifest.push({ file, replacement });
}

function collectTextFiles(path) {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return textExtensions.has(extname(path).toLowerCase()) ? [path] : [];
  return readdirSync(path).flatMap(entry => collectTextFiles(join(path, entry)));
}

const remaining = collectTextFiles('src').filter(file => prohibitedCheck.test(readFileSync(file, 'utf8')));
if (remaining.length) {
  throw new Error(`Unmapped prohibited sparkle usage remains:\n${remaining.join('\n')}`);
}

writeFileSync('sparkle-cleanup-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Replaced prohibited sparkle icons in ${manifest.length} files.`);
