import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_jsx_v3(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The most common damage seems to be tags closing early or having extra space/>
    # Let's try to match <ConfirmButton ... > and if there's text after that looks like it should be INSIDE, fix it.
    
    # Pattern: <ConfirmButton [attrs] >\n [props] >
    # This matches the corrupted state in AdminDashboard
    
    # Let's try to find tags that are broken into two: <ConfirmButton > and then some attributes on the next line.
    
    def fix_match(m):
        tag_start = m.group(1) # <ConfirmButton
        attributes = m.group(2) # [attributes]
        return tag_start + attributes + ' >'

    # This is a bit aggressive but matches what happened:
    # <ConfirmButton [attrs] > [newline] [attrs] >
    content = re.sub(r'(<ConfirmButton\s+[^>]*?)\s*>\s*([^<]*?)\s*>', r'\1 \2 >', content)
    
    # Clean up double spaces
    content = content.replace('  >', ' >')
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    repair_jsx_v3(f)
