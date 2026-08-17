import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def final_cleanup(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Remove all spaces before closing > inside a tag that I might have added
    # e.g. title="Sign Out" >  becomes title="Sign Out">
    content = re.sub(r'([a-zA-Z0-9"\'])\s+>', r'\1>', content)
    
    # 2. Fix the most broken ones where a > was inserted mid-tag
    # <ConfirmButton [attrs] > [attrs] >
    # We already tried this, let's try to be even more specific to the current state
    
    # 3. Restore () =>
    content = content.replace('() = ', '() => ')

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    final_cleanup(f)
