import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_jsx_tags_v2(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Pattern 1: <ConfirmButton >\n  onClick
    # We want to remove that > if it's immediately followed by more props
    content = re.sub(r'(<ConfirmButton\s*)>\s*(\n\s*)(onClick|className|title|disabled|type)', r'\1\2\3', content)

    # Pattern 2: Multi-line tags that might be missing their closing >
    # This is harder, but we can look for tags that start and don't end
    # Actually, let's fix the specific damage I saw
    
    # Let's find all <ConfirmButton that are followed by props but don't have a > on the same line
    # or have a > in the wrong place.
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    repair_jsx_tags_v2(f)
