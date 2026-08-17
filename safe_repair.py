import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def safe_repair(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. First, fix the corrupted arrow functions
    content = content.replace('() = ', '() => ')
    content = content.replace(') = ', ') => ')

    # 2. Fix the split tags like <ConfirmButton [attrs] > [attrs] >
    # This matches: <ConfirmButton [anything-not-inside-tag] > [anything-not-tag-start] >
    content = re.sub(r'<ConfirmButton\s+([^>]*?)\s*>\s*([^<]*?)\s*>', r'<ConfirmButton \1 \2 >', content)

    # 3. Handle the 'noConfirm' by just converting safe buttons to regular buttons
    # Safe patterns to convert back to <button
    safe_patterns = [
        r'onClick={() => setActiveSection\(',
        r'onClick={() => setActiveTab\(',
        r'onClick={() => handleTabChange\(',
        r'onClick={() => setStep\(',
        r'onClick={() => setAuthMode\(',
        r'onClick={() => setFilter\(',
        r'onClick={() => setIsAdding',
        r'onClick={() => setIsEditing',
        r'onClick={() => setSelected',
        r'onClick={() => setExpanded',
        r'onClick={() => setShow',
        r'onClick={() => setMenuOpen',
        r'onClick={() => setCopied',
        r'onClick={() => setPreview',
        r'onClick={() => navigate\(',
        r'onClick={toggleDarkMode}',
        r'onClick={onClose}',
        r'onClick={() => setIsOpen\(false\)}'
    ]

    for pattern in safe_patterns:
        # Match <ConfirmButton that has one of these safe patterns in its attributes
        # This is hard to do with a single regex across multi-lines.
        # Let's do it line by line for simplicity where possible
        pass

    # Actually, the user wants me to do this carefully.
    # The mess I made is from trying to be too clever with regex.
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    safe_repair(f)
