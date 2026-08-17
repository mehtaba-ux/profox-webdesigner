import os
import re

def repair_specific_files(files):
    for filepath in files:
        if not os.path.exists(filepath):
            continue
        with open(filepath, 'r') as f:
            content = f.read()

        # Fix () =>>
        content = content.replace('() =>>', '() =>')
        content = content.replace(') =>>', ') =>')
        
        # Fix the split tags: <ConfirmButton [anything] > [anything] >
        # We need a non-greedy match that finds a tag that closes too early
        # This is a refined regex: match <ConfirmButton, then some non-> chars, then >\n then more non-< chars then >
        content = re.sub(r'(<ConfirmButton\s+[^>]*?)\s*>\s*([^<]*?)\s*>', r'\1 \2 >', content)

        with open(filepath, 'w') as f:
            f.write(content)

repair_specific_files(['src/components/admin/TemplateManager.tsx', 'src/components/admin/ThemeCustomizerDrawer.tsx', 'src/components/admin/ProcessManager.tsx', 'src/components/admin/SalesChatInbox.tsx', 'src/components/admin/SiteSettingsManager.tsx'])
