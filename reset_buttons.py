import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def reset_all_buttons(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Reset all ConfirmButton or button tags to a very simple state to fix syntax
    # This regex matches the tag start and tries to capture attributes, but we must be careful with >
    
    # Let's use a simpler approach: replace the common broken patterns
    content = content.replace('<ConfirmButton', '<button')
    content = content.replace('</ConfirmButton>', '</button>')
    
    # Fix the corrupted > issues
    # Find any <button ... > where it should have been just one tag
    # But specifically look for the cases where I added extra >
    
    # Fix corrupted arrows again
    content = re.sub(r'\(.*?\)\s*=\s*>\s*>', r'() =>', content)
    content = content.replace('() =>>', '() =>')
    content = content.replace(') =>>', ') =>')
    content = content.replace(') = >', ') =>')
    content = content.replace(') => >', ') =>')
    
    # Fix the double closing tags like }}> >
    content = content.replace('}}> >', '}}>')
    content = content.replace('}} >', '}}>')
    content = content.replace('"} >', '">')
    content = content.replace(') >', ')>') # Risky but common in my corrupted files
    
    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    reset_all_buttons(f)
