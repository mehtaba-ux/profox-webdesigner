import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def repair_jsx_v4(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # The issue is likely that lines like:
    # <ConfirmButton onClick={() => setActiveTab('pages')} noConfirm>
    # became:
    # <button>
    # because I replaced the WHOLE tag start if it matched ConfirmButton?
    # No, I used s/<ConfirmButton/<button/g which should preserve props.
    
    # Wait, looking at PagesManager:
    # 580:                             <button>
    # This means everything AFTER <ConfirmButton was deleted on that line?
    
    # Let's fix the common corrupted JSX arrows:
    content = content.replace('() =>>', '() =>')
    content = content.replace(') =>>', ') =>')
    
    # Let's see if I have <button> instead of <button onClick=...
    # If a line is just '<button>' and was previously '<ConfirmButton onClick=... noConfirm>'
    # it means my regex was VERY wrong.
    
    # Let's try to restore basic functionality by fixing obvious syntax errors first.
    # Pattern: onClick={() => ... } >
    content = re.sub(r'onClick={(\(\s*.*?\s*\)\s*=>\s*.*?)\s*}>\s*>', r'onClick={\1}>', content)

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    repair_jsx_v4(f)
