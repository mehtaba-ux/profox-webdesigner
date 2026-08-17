import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_v5(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Fix the most common corrupted patterns
    # pattern: onClick={() => ... } >
    content = re.sub(r'(onClick={.*?})\s*>\s*>', r'\1>', content)
    
    # 2. Fix empty button tags that lost their props
    # This is harder without knowing what was there. 
    # But I can look for lines that just have <button> and try to see if they make sense.
    
    # Actually, let's fix the specific ones from lint
    # src/components/admin/PortfolioManager.tsx(448,85): error TS1109: Expression expected.
    # I'll replace any remaining arrow function corruption
    content = content.replace('() =>>', '() =>')
    content = content.replace(') =>>', ') =>')
    content = content.replace('()  =>', '() =>')
    content = content.replace(')  =>', ') =>')
    
    # Fix the }}> >
    content = content.replace('}}> >', '}}>')
    content = content.replace('}} >', '}}>')
    content = content.replace('"} >', '">')
    
    # Restore the arrows if they were broken into () = >
    content = content.replace('() = >', '() =>')
    content = content.replace(') = >', ') =>')

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    repair_v5(f)
