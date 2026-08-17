import os
import re

admin_dir = 'src/components/admin/'
files = [os.path.join(admin_dir, f) for f in os.listdir(admin_dir) if f.endswith('.tsx')]

def restore_to_buttons(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # This is a very aggressive restoration to standard buttons
    # to fix the syntax mess.
    
    # Replace <ConfirmButton with <button
    # Replace </ConfirmButton> with </button>
    content = content.replace('<ConfirmButton', '<button')
    content = content.replace('</ConfirmButton>', '</button>')
    
    # Remove 'noConfirm' prop if it exists
    content = content.replace(' noConfirm', '')
    
    # Fix corrupted arrow functions (one more time)
    content = re.sub(r'\(.*?\)\s*=\s*>\s*>', r'() =>', content) # Catch various corrupted arrows
    content = content.replace('() =>>', '() =>')
    content = content.replace(') =>>', ') =>')

    with open(filepath, 'w') as f:
        f.write(content)

for f in files:
    restore_to_buttons(f)
